import express from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { listTools, callTool } from './tools.js';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = 'test-api-key-12345';

// Basic auth configuration
const BASIC_AUTH_USERNAME = process.env.BASIC_AUTH_USERNAME || 'mcpuser';
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD || 'mcppass';

// OAuth configuration
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'test-client-id';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || 'test-client-secret';
const OAUTH_TEST_USERNAME = 'testuser';
const OAUTH_TEST_PASSWORD = 'testpass';
const OAUTH_TOKENS = new Map(); // In-memory token storage
const OAUTH_AUTH_CODES = new Map(); // In-memory authorization code storage

// Skip body parsing for /messages - let SSEServerTransport handle it
app.use((req, res, next) => {
  if (req.path === '/messages') {
    return next();
  }
  express.json()(req, res, next);
});

// Custom middleware to handle any charset in urlencoded requests
app.use((req, res, next) => {
  if (req.path === '/messages') {
    return next();
  }
  const contentType = req.headers['content-type'];
  if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
    // Strip charset parameter to avoid body-parser charset validation
    req.headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  next();
});

app.use((req, res, next) => {
  if (req.path === '/messages') {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

// API Key authentication middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
}

// OAuth token authentication middleware
function authenticateOAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7);
  const tokenData = OAUTH_TOKENS.get(token);
  
  if (!tokenData) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (Date.now() > tokenData.expiresAt) {
    OAUTH_TOKENS.delete(token);
    return res.status(401).json({ error: 'Token expired' });
  }
  
  next();
}

// Basic authentication middleware
function authenticateBasic(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  if (username !== BASIC_AUTH_USERNAME || password !== BASIC_AUTH_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  next();
}

// Combined authentication - accepts API key, OAuth token, or Basic auth
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];

  // Try Basic auth
  if (authHeader && authHeader.startsWith('Basic ')) {
    return authenticateBasic(req, res, next);
  }

  // Try OAuth if Bearer token present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateOAuth(req, res, next);
  }

  // Fall back to API key
  return authenticateApiKey(req, res, next);
}

// OAuth authorization endpoint (Authorization Code Grant)
app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, response_type, scope, state } = req.query;
  
  console.log('OAuth authorize request:', { client_id, redirect_uri, response_type, scope, state });
  
  if (!redirect_uri) {
    return res.status(400).send('Missing required parameter: redirect_uri');
  }
  
  if (response_type !== 'code') {
    return res.status(400).send('Invalid response_type. Expected: code');
  }
  
  if (client_id !== OAUTH_CLIENT_ID) {
    return res.status(400).send('Invalid client_id');
  }
  
  // Show simple login form
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>MCP Test Server - Login</title></head>
    <body style="font-family: sans-serif; max-width: 400px; margin: 50px auto; padding: 20px;">
      <h2>MCP Test Server Login</h2>
      <p>Authorize access for client: <strong>${client_id}</strong></p>
      <form method="POST" action="/oauth/authorize">
        <input type="hidden" name="client_id" value="${client_id}">
        <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}">
        <input type="hidden" name="scope" value="${scope || ''}">
        <input type="hidden" name="state" value="${state || ''}">
        <p><label>Username: <input type="text" name="username" value="testuser"></label></p>
        <p><label>Password: <input type="password" name="password" value="testpass"></label></p>
        <p>
          <button type="submit" style="padding: 10px 20px;">Authorize</button>
          <button type="submit" name="cancel" value="true" style="padding: 10px 20px; margin-left: 10px;">Cancel</button>
        </p>
      </form>
    </body>
    </html>
  `);
});

app.post('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, scope, state, username, password, cancel } = req.body;
  
  console.log('OAuth authorize POST:', { client_id, redirect_uri, scope, state, username });
  
  if (!redirect_uri) {
    return res.status(400).send('Missing required parameter: redirect_uri');
  }
  
  // Handle cancel - return access_denied error per RFC 6749 Section 4.1.2.1
  if (cancel) {
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('error_description', 'User denied authorization');
    if (state) redirectUrl.searchParams.set('state', state);
    return res.redirect(redirectUrl.toString());
  }
  
  if (client_id !== OAUTH_CLIENT_ID) {
    return res.status(400).send('Invalid client_id');
  }
  
  if (username !== OAUTH_TEST_USERNAME || password !== OAUTH_TEST_PASSWORD) {
    return res.status(401).send('Invalid credentials');
  }
  
  // Generate authorization code
  const code = 'authcode_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  
  OAUTH_AUTH_CODES.set(code, {
    clientId: client_id,
    redirectUri: redirect_uri,
    scope: scope || '',
    expiresAt: Date.now() + 600000 // 10 minutes
  });
  
  console.log('Authorization code issued:', code);
  
  // Redirect back with code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);
  
  res.redirect(redirectUrl.toString());
});

// OAuth token endpoint
app.post('/oauth/token', (req, res) => {
  const { grant_type, client_id, client_secret, scope, code, redirect_uri } = req.body;
  
  console.log('OAuth token request:', { grant_type, client_id, scope, code });
  
  if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  
  if (grant_type === 'authorization_code') {
    // Authorization Code Grant
    const codeData = OAUTH_AUTH_CODES.get(code);
    
    if (!codeData) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid authorization code' });
    }
    
    if (Date.now() > codeData.expiresAt) {
      OAUTH_AUTH_CODES.delete(code);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code expired' });
    }
    
    // Validate redirect_uri matches the one used in authorization request (RFC 6749 Section 4.1.3)
    if (redirect_uri !== codeData.redirectUri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    }
    
    // Consume the code (one-time use)
    OAUTH_AUTH_CODES.delete(code);
    
    // Generate tokens
    const token = 'mcp_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const refreshToken = 'refresh_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresIn = 3600;
    
    OAUTH_TOKENS.set(token, {
      clientId: client_id,
      scope: codeData.scope,
      refreshToken,
      expiresAt: Date.now() + (expiresIn * 1000)
    });
    
    console.log('Token issued (auth code):', token);
    
    return res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: codeData.scope
    });
  }
  
  if (grant_type === 'client_credentials') {
    // Client Credentials Grant
    const token = 'mcp_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresIn = 3600;
    
    OAUTH_TOKENS.set(token, {
      clientId: client_id,
      scope: scope || '',
      expiresAt: Date.now() + (expiresIn * 1000)
    });
    
    console.log('Token issued (client creds):', token);
    
    return res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: scope || ''
    });
  }
  
  if (grant_type === 'refresh_token') {
    const { refresh_token } = req.body;
    
    // Find token by refresh token
    let foundEntry = null;
    for (const [token, data] of OAUTH_TOKENS.entries()) {
      if (data.refreshToken === refresh_token) {
        foundEntry = { token, data };
        break;
      }
    }
    
    if (!foundEntry) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
    }
    
    // Delete old token
    OAUTH_TOKENS.delete(foundEntry.token);
    
    // Generate new tokens
    const newToken = 'mcp_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const newRefreshToken = 'refresh_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresIn = 3600;
    
    OAUTH_TOKENS.set(newToken, {
      clientId: client_id,
      scope: foundEntry.data.scope,
      refreshToken: newRefreshToken,
      expiresAt: Date.now() + (expiresIn * 1000)
    });
    
    console.log('Token refreshed:', newToken);
    
    return res.json({
      access_token: newToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: foundEntry.data.scope
    });
  }
  
  return res.status(400).json({ error: 'unsupported_grant_type' });
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'MCP Test Server is running' });
});

// Factory function to create MCP server instance per connection
function createMcpServer() {
  const server = new Server(
    {
      name: 'test-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args, _meta } = request.params;
    const context = {
      sessionId: request.params._meta?.sessionId,
      progressToken: _meta?.progressToken,
      server,
    };
    return callTool(name, args, context);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'test://example',
          name: 'Example Resource',
          description: 'A test resource',
          mimeType: 'text/plain',
        },
      ],
    };
  });

  return server;
}

// Store active transports by session ID
const transports = new Map();

// SSE endpoint - client connects here to receive server messages
app.get('/sse', authenticate, async (req, res) => {
  console.log('SSE connection request received');
  
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);
  
  res.on('close', () => {
    transports.delete(transport.sessionId);
    console.log('SSE connection closed:', transport.sessionId);
  });
  
  const server = createMcpServer();
  await server.connect(transport);
  console.log('MCP server connected, session:', transport.sessionId);
});

// NOTE: /mcp GET is handled below by the Streamable HTTP transport's reconnection handler.
// Do NOT add an SSE-based GET /mcp here — it would shadow the Streamable HTTP GET /mcp route.

// Messages endpoint - client POSTs messages here (HTTP+SSE transport)
app.post('/messages', authenticate, async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  
  if (!transport) {
    return res.status(400).json({ error: 'Invalid or missing session ID' });
  }
  
  await transport.handlePostMessage(req, res, req.body);
});

// POST to /sse - for HTTP+SSE transport message handling
app.post('/sse', authenticate, async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  
  if (!transport) {
    return res.status(400).json({ error: 'Invalid or missing session ID' });
  }
  
  await transport.handlePostMessage(req, res, req.body);
});

// Streamable HTTP transport - stores transports by session ID
const streamableTransports = new Map();

// POST /mcp - Streamable HTTP transport (handles both init and messages)
app.post('/mcp', authenticate, async (req, res) => {
  // APPIAN PLUGIN WORKAROUND: Ensure Accept header satisfies SDK validation.
  if (!req.headers['accept']?.includes('text/event-stream')) {
    const accept = 'application/json, text/event-stream';
    req.headers['accept'] = accept;
    const idx = req.rawHeaders.findIndex(h => h.toLowerCase() === 'accept');
    if (idx >= 0) {
      req.rawHeaders[idx + 1] = accept;
    } else {
      req.rawHeaders.push('Accept', accept);
    }
  }

  const sessionId = req.headers['mcp-session-id'];
  
  // Existing session - route to existing transport
  if (sessionId && streamableTransports.has(sessionId)) {
    const transport = streamableTransports.get(sessionId);
    await transport.handleRequest(req, res, req.body);
    return;
  }
  
  // New session - create transport
  // TODO: Remove enableJsonResponse once Appian's MCP client properly handles SSE responses.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });
  
  transport.onclose = () => {
    if (transport.sessionId) {
      streamableTransports.delete(transport.sessionId);
      console.log('Streamable HTTP session closed:', transport.sessionId);
    }
  };
  
  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  // Store after handleRequest so sessionId is set from the initialize response
  if (transport.sessionId) {
    streamableTransports.set(transport.sessionId, transport);
    console.log('Streamable HTTP session created:', transport.sessionId);
  }
});

// GET /mcp - Streamable HTTP transport (for SSE stream reconnection)
app.get('/mcp', authenticate, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (!sessionId || !streamableTransports.has(sessionId)) {
    return res.status(400).json({ error: 'Invalid or missing session ID' });
  }
  
  const transport = streamableTransports.get(sessionId);
  await transport.handleRequest(req, res);
});

// DELETE /mcp - Streamable HTTP transport (session termination)
app.delete('/mcp', authenticate, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (!sessionId || !streamableTransports.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const transport = streamableTransports.get(sessionId);
  await transport.close();
  streamableTransports.delete(sessionId);
  
  res.status(200).json({ message: 'Session terminated' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 MCP Test Server running on http://localhost:${PORT}`);
  console.log(`\n📋 Streamable HTTP Transport (recommended):`);
  console.log(`   URL: http://localhost:${PORT}/mcp`);
  console.log(`\n📋 HTTP+SSE Transport (legacy):`);
  console.log(`   SSE URL: http://localhost:${PORT}/sse`);
  console.log(`\n📋 API Key Authentication:`);
  console.log(`   API Key: ${API_KEY}`);
  console.log(`   Header Name: X-API-Key (or Authorization)`);
  console.log(`\n📋 Basic Authentication:`);
  console.log(`   Username: ${BASIC_AUTH_USERNAME}`);
  console.log(`   Password: ${BASIC_AUTH_PASSWORD}`);
  console.log(`\n📋 OAuth 2.0 Client Credentials:`);
  console.log(`   Token URL: http://localhost:${PORT}/oauth/token`);
  console.log(`   Client ID: ${OAUTH_CLIENT_ID}`);
  console.log(`   Client Secret: ${OAUTH_CLIENT_SECRET}`);
  console.log(`\n📋 OAuth 2.0 Authorization Code:`);
  console.log(`   Auth URL: http://localhost:${PORT}/oauth/authorize`);
  console.log(`   Token URL: http://localhost:${PORT}/oauth/token`);
  console.log(`   Client ID: ${OAUTH_CLIENT_ID}`);
  console.log(`   Client Secret: ${OAUTH_CLIENT_SECRET}`);
  console.log(`   Test credentials: testuser / testpass`);
  console.log(`\n✅ Health check: http://localhost:${PORT}/health`);
});
