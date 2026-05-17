#!/bin/bash
# ────────────────────────────────────────────────────────────────
#  Kling 영상 생성 풀스택 자동 설치 + 실행 스크립트
# ────────────────────────────────────────────────────────────────
#  사용법:
#    1) 터미널 열기 (Cmd+Space → "터미널")
#    2) 다음 한 줄 붙여넣고 엔터:
#       bash "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")/start.sh"
#    또는 그냥 이 파일이 있는 폴더에서:
#       bash start.sh
# ────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║         Kling 영상 생성 풀스택 자동 설치 + 실행            ║${NC}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}작업 폴더:${NC} $SCRIPT_DIR"
echo ""

# ────────────────────────────────────────────────────────────────
# 1. 필수 도구 확인 (Python3, ngrok)
# ────────────────────────────────────────────────────────────────
echo -e "${BOLD}[1/5] 필수 도구 확인${NC}"

# Python 3 확인
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}✗ python3가 설치되어 있지 않습니다.${NC}"
  echo "   macOS는 보통 기본 설치되어 있는데, 없다면 https://python.org 에서 설치하세요."
  exit 1
fi
echo -e "${GREEN}✓ python3 ($(python3 --version 2>&1))${NC}"

# kling-proxy.py 확인
if [ ! -f "$SCRIPT_DIR/kling-proxy.py" ]; then
  echo -e "${RED}✗ kling-proxy.py 파일이 이 폴더에 없습니다.${NC}"
  echo "   현재 폴더: $SCRIPT_DIR"
  exit 1
fi
echo -e "${GREEN}✓ kling-proxy.py 발견${NC}"

echo ""

# ────────────────────────────────────────────────────────────────
# 2. ngrok 설치 확인 / 자동 설치
# ────────────────────────────────────────────────────────────────
echo -e "${BOLD}[2/5] ngrok 설치 확인${NC}"

if command -v ngrok &>/dev/null; then
  echo -e "${GREEN}✓ ngrok 이미 설치됨 ($(ngrok --version 2>&1 | head -1))${NC}"
else
  echo -e "${YELLOW}ngrok이 설치되어 있지 않아요. 설치를 시도합니다...${NC}"

  if command -v brew &>/dev/null; then
    echo "  → Homebrew로 설치 중..."
    brew install ngrok || {
      echo -e "${RED}brew install 실패. 직접 다운로드를 시도합니다.${NC}"
      INSTALL_DIRECT=1
    }
  else
    INSTALL_DIRECT=1
  fi

  if [ "${INSTALL_DIRECT:-0}" = "1" ]; then
    echo "  → ngrok을 직접 다운로드합니다..."
    # Apple Silicon / Intel 자동 감지
    if [ "$(uname -m)" = "arm64" ]; then
      NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-arm64.zip"
    else
      NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-amd64.zip"
    fi
    TMP_ZIP="/tmp/ngrok-download.zip"
    curl -L "$NGROK_URL" -o "$TMP_ZIP"
    unzip -o "$TMP_ZIP" -d "$SCRIPT_DIR" >/dev/null
    rm "$TMP_ZIP"
    chmod +x "$SCRIPT_DIR/ngrok"
    NGROK_BIN="$SCRIPT_DIR/ngrok"
    echo -e "${GREEN}✓ ngrok 설치 완료 ($NGROK_BIN)${NC}"
  fi
fi

# ngrok 실행 경로 결정
if [ -f "$SCRIPT_DIR/ngrok" ]; then
  NGROK_BIN="$SCRIPT_DIR/ngrok"
elif command -v ngrok &>/dev/null; then
  NGROK_BIN="ngrok"
else
  echo -e "${RED}✗ ngrok 설치 실패${NC}"
  exit 1
fi

echo ""

# ────────────────────────────────────────────────────────────────
# 3. ngrok authtoken 확인
# ────────────────────────────────────────────────────────────────
echo -e "${BOLD}[3/5] ngrok 인증 토큰 확인${NC}"

# 토큰 파일 위치 확인
NGROK_CONFIG_DIR="$HOME/Library/Application Support/ngrok"
NGROK_CONFIG_FILE="$NGROK_CONFIG_DIR/ngrok.yml"

# 토큰이 이미 설정됐는지 검사 (간이)
TOKEN_SET=0
if [ -f "$NGROK_CONFIG_FILE" ] && grep -q "authtoken" "$NGROK_CONFIG_FILE" 2>/dev/null; then
  TOKEN_SET=1
  echo -e "${GREEN}✓ authtoken 이미 설정됨${NC}"
fi
# legacy 위치
if [ -f "$HOME/.ngrok2/ngrok.yml" ] && grep -q "authtoken" "$HOME/.ngrok2/ngrok.yml" 2>/dev/null; then
  TOKEN_SET=1
  echo -e "${GREEN}✓ authtoken 이미 설정됨 (legacy)${NC}"
fi

if [ "$TOKEN_SET" = "0" ]; then
  echo -e "${YELLOW}ngrok authtoken이 설정되지 않았습니다.${NC}"
  echo ""
  echo -e "${BOLD}다음 3단계를 따라하세요:${NC}"
  echo "  1) 브라우저에서 열기: ${BOLD}https://dashboard.ngrok.com/signup${NC}"
  echo "     (구글/깃허브로 가입 — 무료)"
  echo ""
  echo "  2) 가입 후 ${BOLD}https://dashboard.ngrok.com/get-started/your-authtoken${NC}"
  echo "     화면의 토큰을 ${BOLD}복사${NC}"
  echo ""
  read -p "  3) 여기에 토큰을 붙여넣고 엔터: " TOKEN
  if [ -z "$TOKEN" ]; then
    echo -e "${RED}토큰이 비어있습니다. 다시 실행하세요.${NC}"
    exit 1
  fi
  $NGROK_BIN config add-authtoken "$TOKEN"
  echo -e "${GREEN}✓ authtoken 저장됨${NC}"
fi

echo ""

# ────────────────────────────────────────────────────────────────
# 4. 기존 프로세스 정리 + 프록시 실행 (백그라운드)
# ────────────────────────────────────────────────────────────────
echo -e "${BOLD}[4/5] 프록시 서버 시작${NC}"

# 포트 3000 점유 프로세스 종료
EXISTING=$(lsof -ti:3000 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  echo "  → 포트 3000을 사용 중인 프로세스 종료: $EXISTING"
  kill -9 $EXISTING 2>/dev/null || true
  sleep 1
fi

# 프록시 시작
echo "  → kling-proxy.py 시작 중..."
nohup python3 "$SCRIPT_DIR/kling-proxy.py" > "$SCRIPT_DIR/proxy.log" 2>&1 &
PROXY_PID=$!
echo "  → 프록시 PID: $PROXY_PID (로그: proxy.log)"
sleep 2

# 프록시 살아있는지 확인
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ 프록시 정상 실행 (http://localhost:3000)${NC}"
else
  echo -e "${RED}✗ 프록시 시작 실패. proxy.log 확인:${NC}"
  tail -20 "$SCRIPT_DIR/proxy.log"
  exit 1
fi

echo ""

# ────────────────────────────────────────────────────────────────
# 5. ngrok 실행 (백그라운드) + URL 추출
# ────────────────────────────────────────────────────────────────
echo -e "${BOLD}[5/5] ngrok 터널 시작${NC}"

# 기존 ngrok 프로세스 종료
pkill -f "ngrok http 3000" 2>/dev/null || true
sleep 1

nohup $NGROK_BIN http 3000 --log=stdout > "$SCRIPT_DIR/ngrok.log" 2>&1 &
NGROK_PID=$!
echo "  → ngrok PID: $NGROK_PID (로그: ngrok.log)"
echo "  → URL 받는 중... (최대 15초)"

# 최대 15초간 ngrok URL 추출 시도
NGROK_URL=""
for i in $(seq 1 15); do
  sleep 1
  # ngrok 내부 API에서 URL 가져오기
  URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'] if d.get('tunnels') else '')" 2>/dev/null || true)
  if [[ "$URL" == https://* ]]; then
    NGROK_URL="$URL"
    break
  fi
done

if [ -z "$NGROK_URL" ]; then
  echo -e "${RED}✗ ngrok URL을 받지 못했습니다. ngrok.log 확인:${NC}"
  tail -30 "$SCRIPT_DIR/ngrok.log"
  exit 1
fi

echo -e "${GREEN}✓ ngrok URL: $NGROK_URL${NC}"

# 헬스체크
sleep 2
HEALTH=$(curl -s "$NGROK_URL/health" -H "ngrok-skip-browser-warning: true" 2>&1 || true)
if echo "$HEALTH" | grep -q '"ok": true'; then
  echo -e "${GREEN}✓ 외부에서 프록시 접근 확인됨${NC}"
fi

# URL을 클립보드에 자동 복사 (macOS)
if command -v pbcopy &>/dev/null; then
  echo -n "$NGROK_URL" | pbcopy
  CLIPBOARD_MSG="${GREEN}✓ URL이 클립보드에 복사됐어요. Cmd+V로 사이트에 붙여넣기 하세요.${NC}"
else
  CLIPBOARD_MSG=""
fi

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║                    ✨ 설정 완료! ✨                          ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}외부 URL (사이트 설정에 붙여넣기):${NC}"
echo -e "${YELLOW}${BOLD}  $NGROK_URL${NC}"
echo ""
[ -n "$CLIPBOARD_MSG" ] && echo -e "$CLIPBOARD_MSG"
echo ""
echo -e "${BOLD}다음 단계:${NC}"
echo "  1) Chrome에서 사이트 → ⚙ 설정 → 🤖 AI 설정"
echo "  2) Kling 프록시 URL 칸에 위 URL 붙여넣기 (Cmd+V)"
echo "  3) 🚀 AI 생성 → ↻ 클립부터 다시 → 진짜 강아지 영상 생성!"
echo ""
echo -e "${BOLD}실행 중인 프로세스:${NC}"
echo "  • 프록시 (PID $PROXY_PID): tail -f $SCRIPT_DIR/proxy.log"
echo "  • ngrok  (PID $NGROK_PID): tail -f $SCRIPT_DIR/ngrok.log"
echo ""
echo -e "${BOLD}종료하려면:${NC}"
echo "  bash stop.sh"
echo "  또는:  kill $PROXY_PID $NGROK_PID"
echo ""
echo "URL이 매번 바뀌면 다시 이 스크립트를 실행하시면 됩니다."
echo ""

# PID 저장
echo "$PROXY_PID" > "$SCRIPT_DIR/.proxy.pid"
echo "$NGROK_PID" > "$SCRIPT_DIR/.ngrok.pid"
