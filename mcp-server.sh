#!/bin/bash

PID_FILE="server.pid"
LOG_FILE="server.log"

case "$1" in
  start)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "❌ Server is already running (PID: $PID)"
        exit 1
      fi
    fi
    
    echo "🚀 Starting MCP Test Server..."
    nohup node server.js > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    
    if curl -s http://localhost:3000/health > /dev/null; then
      echo "✅ Server started successfully!"
      echo ""
      cat "$LOG_FILE"
    else
      echo "❌ Server failed to start. Check $LOG_FILE"
      exit 1
    fi
    ;;
    
  stop)
    if [ ! -f "$PID_FILE" ]; then
      echo "❌ Server is not running"
      exit 1
    fi
    
    PID=$(cat "$PID_FILE")
    echo "🛑 Stopping MCP Test Server (PID: $PID)..."
    kill "$PID" 2>/dev/null
    rm -f "$PID_FILE"
    echo "✅ Server stopped"
    ;;
    
  restart)
    $0 stop
    sleep 1
    $0 start
    ;;
    
  status)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "✅ Server is running (PID: $PID)"
        curl -s http://localhost:3000/health
        exit 0
      fi
    fi
    echo "❌ Server is not running"
    exit 1
    ;;
    
  logs)
    tail -f "$LOG_FILE"
    ;;
    
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
