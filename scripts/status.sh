#!/bin/bash
# Memorial site — show current state (URL, processes)

DIR="$HOME/memorial-test"
LOG="$DIR/logs"
URL_FILE="$LOG/url.txt"

echo "============================================================"
echo "  📊 메모리얼 사이트 상태"
echo "============================================================"

SERVER_RUNNING=$(lsof -ti tcp:8765 2>/dev/null)
TUNNEL_RUNNING=$(pgrep -f "cloudflared tunnel --url http://localhost:8765")

if [ -n "$SERVER_RUNNING" ]; then
  echo "  서버    : ✅ 실행 중 (pid=$SERVER_RUNNING, port 8765)"
else
  echo "  서버    : ❌ 정지됨"
fi

if [ -n "$TUNNEL_RUNNING" ]; then
  echo "  터널    : ✅ 실행 중 (pid=$TUNNEL_RUNNING)"
else
  echo "  터널    : ❌ 정지됨"
fi

if [ -f "$URL_FILE" ]; then
  URL=$(cat "$URL_FILE")
  echo ""
  echo "  공개 URL: $URL"
  echo "  ID      : kosiny"
  echo "  PW      : 123456"
  echo ""
  printf '%s' "$URL" | pbcopy
  echo "  (URL이 클립보드에 복사됐어요)"
  osascript -e "display notification \"클립보드에 복사됨\" with title \"메모리얼 URL\" subtitle \"$URL\""
else
  echo ""
  echo "  공개 URL: (사이트가 정지 상태입니다)"
  echo "  '시작.command'를 더블클릭해서 시작하세요."
fi
echo "============================================================"
echo ""
echo "이 창은 8초 후 자동으로 닫힙니다."
sleep 8
