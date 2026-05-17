#!/bin/bash
# Memorial site — start server + cloudflared tunnel
# Logs: ~/memorial-test/logs/{server,tunnel}.log
# URL is printed to console, copied to clipboard, shown as notification, and saved to logs/url.txt

set -u

DIR="$HOME/memorial-test"
LOG="$DIR/logs"
URL_FILE="$LOG/url.txt"
NODE="/opt/homebrew/bin/node"
CLOUDFLARED="/opt/homebrew/bin/cloudflared"

mkdir -p "$LOG"

# Stop anything already running so we start clean
echo "[start] stopping any running instance first..."
lsof -ti tcp:8765 2>/dev/null | xargs kill 2>/dev/null
pkill -f "cloudflared tunnel --url http://localhost:8765" 2>/dev/null   # quick tunnel (legacy)
pkill -f "cloudflared tunnel run memorial" 2>/dev/null                   # named tunnel
sleep 1

# Start the Node server
echo "[start] launching Node server on port 8765..."
nohup "$NODE" "$DIR/server.js" > "$LOG/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$LOG/server.pid"
sleep 2

# Verify the server is up
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:8765/health | grep -q 200; then
  echo "[start] ERROR: server did not start. See $LOG/server.log"
  osascript -e 'display notification "서버 시작 실패. logs/server.log 확인" with title "메모리얼"'
  exit 1
fi
echo "[start] server is up (pid=$SERVER_PID)"

# Start cloudflared Named Tunnel (영구 URL: memorialai.org)
# config.yml은 ~/.cloudflared/config.yml — Named Tunnel + ingress 정의됨
echo "[start] launching Cloudflare Tunnel (named: memorial)..."
nohup "$CLOUDFLARED" tunnel run memorial > "$LOG/tunnel.log" 2>&1 &
TUNNEL_PID=$!
echo "$TUNNEL_PID" > "$LOG/tunnel.pid"

# Wait briefly for the tunnel to register (up to 20s)
echo "[start] waiting for tunnel to register..."
for i in $(seq 1 20); do
  if grep -q "Registered tunnel connection" "$LOG/tunnel.log" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Permanent URL — no need to scrape from logs
FULL_URL="https://memorialai.org/pet-memorial.html"
echo "$FULL_URL" > "$URL_FILE"

# Copy URL to clipboard
printf '%s' "$FULL_URL" | pbcopy

# macOS notification
osascript -e "display notification \"클립보드에 URL 복사됨. ID: kosiny\" with title \"메모리얼 시작됨\" subtitle \"$FULL_URL\""

# Open the URL in the default browser
open "$FULL_URL"

echo ""
echo "============================================================"
echo "  ✅ 메모리얼 사이트 시작됨"
echo "  URL : $FULL_URL"
echo "  ID  : kosiny"
echo "  PW  : 123456"
echo "  (URL이 클립보드에 복사됐고 브라우저가 자동으로 열립니다)"
echo "============================================================"
echo ""
echo "이 창은 5초 후 자동으로 닫힙니다."
sleep 5
