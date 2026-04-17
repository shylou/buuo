#!/bin/bash
# Buuo Gateway Management Script
# Quick start/stop/status commands for Buuo Gateway

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BUUO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$BUUO_DIR/.buuo_gateway.pid"
LOG_FILE="/tmp/buuo_service.log"
CLI="$BUUO_DIR/apps/cli/dist/cli.js"

cd "$BUUO_DIR"

read_pid() {
    if [ -f "$PID_FILE" ]; then
        tr -d '[:space:]' < "$PID_FILE"
    fi
}

# Check if gateway is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(read_pid)
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Start gateway
start_gateway() {
    echo -e "${BLUE}🦐 Starting Buuo Gateway...${NC}"

    is_running && {
        echo -e "${YELLOW}⚠️  Already running${NC}"
        return 0
    }

    # Build
    echo -e "${BLUE}📦 Building...${NC}"
    pnpm --filter '@buuo/provider-claude-code' build
    pnpm --filter '@buuo/channel-lark' build
    pnpm --filter '@buuo/provider-codex' build
    pnpm --filter '@buuo/cli' build

    # Recreate log file to avoid stale bytes from previous runs confusing diagnosis
    rm -f "$LOG_FILE"

    # Forward an explicitly provided proxy into the daemon when needed by the host environment.
    if [ -n "${BUUO_HTTP_PROXY:-}" ]; then
        export HTTP_PROXY="$BUUO_HTTP_PROXY"
        export HTTPS_PROXY="$BUUO_HTTP_PROXY"
        export http_proxy="$BUUO_HTTP_PROXY"
        export https_proxy="$BUUO_HTTP_PROXY"
    fi

    # Start in a detached session so the gateway survives parent shell exit
    setsid nohup node "$CLI" gateway start --daemon </dev/null > "$LOG_FILE" 2>&1 &

    sleep 3

    if is_running; then
        echo -e "${GREEN}✓ Started${NC} (PID: $(read_pid))"
        echo -e "  Log: $LOG_FILE"
    else
        echo -e "${RED}✗ Failed${NC}"
        echo -e "  Check: tail -50 $LOG_FILE"
        return 1
    fi
}

# Stop gateway
stop_gateway() {
    echo -e "${YELLOW}🛑 Stopping...${NC}"

    is_running || {
        echo -e "${YELLOW}⚠️  Not running${NC}"
        [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
        return 0
    }

    local pid
    pid=$(read_pid)
    kill -TERM "$pid" 2>/dev/null || true

    # Wait for graceful shutdown
    for i in {1..10}; do
        ps -p "$pid" > /dev/null 2>&1 || {
            echo -e "${GREEN}✓ Stopped${NC}"
            [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
            return 0
        }
        sleep 1
    done

    # Force kill if needed
    kill -KILL "$pid" 2>/dev/null || true
    [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    echo -e "${GREEN}✓ Stopped (forced)${NC}"
}

# Show status
status_gateway() {
    echo -e "${BLUE}📊 Status${NC}"
    echo "────────────────────────────"

    if is_running; then
        local pid
        pid=$(read_pid)
        echo -e "${GREEN}● Running${NC}"
        echo "  PID: $pid"
        echo "  Uptime: $(ps -o etime= -p $pid | tr -d ' ')"
    else
        [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
        echo -e "${RED}○ Stopped${NC}"
    fi
}

# Show logs
logs_gateway() {
    if [ -f "$LOG_FILE" ]; then
        tail -n 100 -f "$LOG_FILE"
    else
        echo -e "${YELLOW}No log file${NC}"
    fi
}

# Main command handling
case "${1:-start}" in
    start)   start_gateway ;;
    stop)    stop_gateway ;;
    restart) stop_gateway; sleep 1; start_gateway ;;
    status)  status_gateway ;;
    logs)    logs_gateway ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start   - Start gateway"
        echo "  stop    - Stop gateway"
        echo "  restart - Restart gateway"
        echo "  status  - Show status"
        echo "  logs    - Show logs (tail -f)"
        exit 1
        ;;
esac
