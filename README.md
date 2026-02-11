# MCP Test Server

A simple MCP server with **API Key** and **OAuth 2.0 Client Credentials** authentication for testing the Appian MCP Connected System plugin.

## Features

- ✅ API Key authentication
- ✅ OAuth 2.0 Client Credentials grant
- ✅ MCP protocol over Server-Sent Events (SSE)
- ✅ Health check endpoint
- ✅ Easy deployment to cloud platforms

## Quick Start (Local)

```bash
cd /Users/ke.dou/repo/mcp-test-server

# Install dependencies (first time only)
npm install

# Start the server
npm start
```

## Configuration

### API Key Authentication
- **Server URL**: `http://localhost:3000/mcp`
- **API Key**: `test-api-key-12345`
- **Header**: `X-API-Key` or `Authorization`

### OAuth 2.0 Authentication
- **Server URL**: `http://localhost:3000/mcp`
- **Token URL**: `http://localhost:3000/oauth/token`
- **Client ID**: `test-client-id` (or set `OAUTH_CLIENT_ID` env var)
- **Client Secret**: `test-client-secret` (or set `OAUTH_CLIENT_SECRET` env var)
- **Grant Type**: `client_credentials`

## Testing

### Test API Key Auth
```bash
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: test-api-key-12345" \
  -H "Content-Type: application/json"
```

### Test OAuth Auth
```bash
# 1. Get access token
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test-client-id&client_secret=test-client-secret"

# 2. Use the token (replace TOKEN with actual token from step 1)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for instructions on deploying to Render.com or other cloud platforms.

## Environment Variables

- `PORT`: Server port (default: 3000)
- `OAUTH_CLIENT_ID`: OAuth client ID (default: test-client-id)
- `OAUTH_CLIENT_SECRET`: OAuth client secret (default: test-client-secret)
  - `X-API-Key: test-api-key-12345`
  - `Authorization: Bearer test-api-key-12345`

## Appian Configuration

When testing in Appian MCP Connected System:

1. **Server URL**: `http://localhost:3000/mcp`
2. **API Key**: `test-api-key-12345`
3. **Header Name**: `X-API-Key`
4. **Header Prefix**: (leave empty)

Or with Authorization header:
1. **Server URL**: `http://localhost:3000/mcp`
2. **API Key**: `test-api-key-12345`
3. **Header Name**: `Authorization`
4. **Header Prefix**: `Bearer`

## Manual Testing

### Health Check (No Auth)
```bash
curl http://localhost:3000/health
```

### Invalid API Key (Should fail)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: wrong-key" \
  -H "Content-Type: application/json"
```

### Valid API Key (Should succeed)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: test-api-key-12345" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

## Features

- ✅ API Key authentication (X-API-Key or Authorization header)
- ✅ SSE transport for MCP protocol
- ✅ Sample tool: `echo` - echoes back input
- ✅ Sample resource: `test://example`
- ✅ Health check endpoint
- ✅ Proper error responses for invalid/missing API keys
