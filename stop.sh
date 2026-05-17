#!/bin/bash
# Kling 프록시 + ngrok 종료
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "프록시·ngrok 종료 중..."

# PID 파일에서 종료
for f in "$SCRIPT_DIR/.proxy.pid" "$SCRIPT_DIR/.ngrok.pid"; do
  if [ -f "$f" ]; then
    PID=$(cat "$f")
    if kill -0 "$PID" 2>/dev/null; then
      kill -TERM "$PID" 2>/dev/null && echo "  ✓ PID $PID 종료"
    fi
    rm "$f"
  fi
done

# 포트 3000, ngrok 프로세스 정리
EXISTING=$(lsof -ti:3000 2>/dev/null || true)
[ -n "$EXISTING" ] && kill -9 $EXISTING 2>/dev/null
pkill -f "ngrok http 3000" 2>/dev/null

echo "✓ 종료 완료"
