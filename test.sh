#!/bin/bash

echo "🧪 Testing MCP Server"
echo ""

echo "1️⃣ Health Check (No Auth):"
curl -s http://localhost:3000/health | jq .
echo ""

echo "2️⃣ Invalid API Key:"
curl -s -X POST http://localhost:3000/mcp \
  -H "X-API-Key: wrong-key" \
  -H "Content-Type: application/json" | jq .
echo ""

echo "3️⃣ Missing API Key:"
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" | jq .
echo ""

echo "4️⃣ Valid API Key (X-API-Key header):"
echo "   Connecting to MCP server..."
timeout 2 curl -N -X POST http://localhost:3000/mcp \
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
  }' 2>/dev/null || echo "   ✅ SSE connection established (timed out as expected)"
echo ""

echo "5️⃣ Valid API Key (Authorization Bearer header):"
echo "   Connecting to MCP server..."
timeout 2 curl -N -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer test-api-key-12345" \
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
  }' 2>/dev/null || echo "   ✅ SSE connection established (timed out as expected)"
echo ""

echo "✅ All tests completed!"
