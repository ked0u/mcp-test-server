import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = 'test-api-key-12345';

// OAuth configuration
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'test-client-id';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || 'test-client-secret';
const OAUTH_TOKENS = new Map(); // In-memory token storage

app.use(express.json());

// Custom middleware to handle any charset in urlencoded requests
app.use((req, res, next) => {
  const contentType = req.headers['content-type'];
  if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
    // Strip charset parameter to avoid body-parser charset validation
    req.headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  next();
});

app.use(express.urlencoded({ extended: true }));

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

// Combined authentication - accepts either API key or OAuth token
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];
  
  // Try OAuth first if Bearer token present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateOAuth(req, res, next);
  }
  
  // Fall back to API key
  return authenticateApiKey(req, res, next);
}

// OAuth token endpoint
app.post('/oauth/token', (req, res) => {
  const { grant_type, client_id, client_secret, scope } = req.body;
  
  console.log('OAuth token request:', { grant_type, client_id, scope });
  
  if (grant_type !== 'client_credentials') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  
  if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  
  // Generate token
  const token = 'mcp_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  const expiresIn = 3600; // 1 hour
  const expiresAt = Date.now() + (expiresIn * 1000);
  
  OAUTH_TOKENS.set(token, {
    clientId: client_id,
    scope: scope || '',
    expiresAt
  });
  
  console.log('Token issued:', token);
  
  res.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: scope || ''
  });
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'MCP Test Server is running' });
});

// Create MCP server instance once
const mcpServer = new Server(
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

// Register handlers once
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: 'Echoes back the input',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message to echo',
            },
          },
          required: ['message'],
        },
      },
    ],
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'echo') {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${request.params.arguments.message}`,
        },
      ],
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
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

// MCP SSE endpoint with API key authentication
app.post('/mcp', authenticate, async (req, res) => {
  console.log('MCP connection request received');
  console.log('Headers:', req.headers);
  
  // Set SSE headers immediately so client knows connection is established
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const transport = new SSEServerTransport('/mcp', res);
  await mcpServer.connect(transport);
  console.log('MCP server connected via SSE');
});

app.listen(PORT, () => {
  console.log(`\n🚀 MCP Test Server running on http://localhost:${PORT}`);
  console.log(`\n📋 API Key Configuration:`);
  console.log(`   Server URL: http://localhost:${PORT}/mcp`);
  console.log(`   API Key: ${API_KEY}`);
  console.log(`   Header Name: X-API-Key (or Authorization)`);
  console.log(`\n📋 OAuth 2.0 Configuration:`);
  console.log(`   Server URL: http://localhost:${PORT}/mcp`);
  console.log(`   Token URL: http://localhost:${PORT}/oauth/token`);
  console.log(`   Client ID: ${OAUTH_CLIENT_ID}`);
  console.log(`   Client Secret: ${OAUTH_CLIENT_SECRET}`);
  console.log(`\n✅ Health check: http://localhost:${PORT}/health`);
  console.log(`\n🔑 Test with curl (API Key):`);
  console.log(`   curl -X POST http://localhost:${PORT}/mcp \\`);
  console.log(`     -H "X-API-Key: ${API_KEY}" \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -H "Accept: text/event-stream"`);
  console.log(`\n🔑 Test with curl (OAuth):`);
  console.log(`   # Get token:`);
  console.log(`   curl -X POST http://localhost:${PORT}/oauth/token \\`);
  console.log(`     -H "Content-Type: application/x-www-form-urlencoded" \\`);
  console.log(`     -d "grant_type=client_credentials&client_id=${OAUTH_CLIENT_ID}&client_secret=${OAUTH_CLIENT_SECRET}"`);
});
