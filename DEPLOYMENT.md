# MCP Test Server - Deployment

## Deploy to Render.com

1. **Push to GitHub** (if not already):
   ```bash
   cd /Users/ke.dou/repo/mcp-test-server
   git init
   git add .
   git commit -m "Add OAuth support and deployment config"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Render.com**:
   - Go to https://render.com
   - Sign up/login with GitHub
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Configure:
     - **Name**: `mcp-test-server`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
     - **Plan**: Free
   - Add Environment Variables:
     - `OAUTH_CLIENT_ID`: `your-client-id`
     - `OAUTH_CLIENT_SECRET`: `your-client-secret`
   - Click "Create Web Service"

3. **Get Your URLs**:
   - Server URL: `https://mcp-test-server.onrender.com/mcp`
   - Token URL: `https://mcp-test-server.onrender.com/oauth/token`

## Test Locally First

```bash
npm start

# Test API Key
curl -X POST http://localhost:3000/mcp \
  -H "X-API-Key: test-api-key-12345" \
  -H "Content-Type: application/json"

# Test OAuth
# 1. Get token
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=test-client-id&client_secret=test-client-secret"

# 2. Use token (replace TOKEN with actual token from step 1)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"
```

## Appian Configuration

### API Key Template
- Server URL: `https://mcp-test-server.onrender.com/mcp`
- API Key: `test-api-key-12345`
- Header Name: (leave empty, defaults to Authorization)
- Header Prefix: (leave empty)

### OAuth 2.0 Template
- Server URL: `https://mcp-test-server.onrender.com/mcp`
- Client ID: `test-client-id` (or your custom value)
- Client Secret: `test-client-secret` (or your custom value)
- Token URL: `https://mcp-test-server.onrender.com/oauth/token`
- Scope: (leave empty or add custom scope)
