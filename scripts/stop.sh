#!/bin/bash
# Memorial site — stop server + cloudflared tunnel

DIR="$HOME/memorial-test"
LOG="$DIR/logs"

echo "[stop] killing server (port 8765)..."
lsof -ti tcp:8765 2>/dev/null | xargs kill 2>/dev/null

echo "[stop] killing cloudflared tunnel..."
pkill -f "cloudflared tunnel --url http://localhost:8765" 2>/dev/null   # quick tunnel (legacy)
pkill -f "cloudflared tunnel run memorial" 2>/dev/null                   # named tunnel

# Remove URL file so status knows nothing is running
rm -f "$LOG/url.txt" "$LOG/server.pid" "$LOG/tunnel.pid"

osascript -e 'display notification "서버와 터널이 종료됨" with title "메모리얼 종료됨"' 2>/dev/null

echo ""
echo "============================================================"
echo "  🛑 메모리얼 사이트 종료됨"
echo "============================================================"
echo ""
echo "이 창은 3초 후 자동으로 닫힙니다."
sleep 3
