#!/usr/bin/env python3
"""
Kling AI 프록시 + 이미지 호스팅 서버
─────────────────────────────────────────
브라우저 → 이 서버 → (이미지 호스팅 + Kling 프록시) → Kling API

핵심 동작:
  1. POST /img-upload         : base64 이미지를 받아 디스크에 저장, public URL 반환
  2. GET  /imgs/<filename>    : 저장된 이미지를 서빙 (Kling이 fetch함)
  3. POST/GET /v1/...         : Kling API 요청을 그대로 forwarding (CORS 헤더 추가)
  4. GET  /health             : 상태 체크용

실행 방법:
  1) cd "이 파일이 있는 폴더"
  2) python3 kling-proxy.py
  3) 별도 터미널에서 ngrok 실행: ngrok http 3000
  4) ngrok이 출력한 https://xxxx.ngrok-free.app 을 사이트의 Kling 프록시 URL에 입력
"""

import http.server
import http.client
import socketserver
import ssl
import sys
import os
import json
import base64
import uuid
import time
import urllib.parse

PORT = 3000
KLING_HOST = "api-singapore.klingai.com"

# 이미지 저장 폴더
IMG_DIR = "/tmp/kling_proxy_imgs"
os.makedirs(IMG_DIR, exist_ok=True)

# SSL 검증 우회 (macOS Python 호환)
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
    print("[ssl] using certifi CA bundle")
except ImportError:
    SSL_CTX = ssl._create_unverified_context()
    print("[ssl] certifi 없음 — unverified context 사용 (테스트용)")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, ngrok-skip-browser-warning, x-ngrok-skip-browser-warning",
    "Access-Control-Max-Age": "86400",
}


def cleanup_old_images(max_age_seconds=3600):
    """1시간 이상 된 이미지 삭제"""
    now = time.time()
    try:
        for fname in os.listdir(IMG_DIR):
            fpath = os.path.join(IMG_DIR, fname)
            if os.path.isfile(fpath) and now - os.path.getmtime(fpath) > max_age_seconds:
                os.unlink(fpath)
    except Exception:
        pass


class Handler(http.server.BaseHTTPRequestHandler):
    def _set_cors(self):
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)

    def _get_public_base(self):
        """ngrok 같은 외부 URL이 있으면 그걸 우선 사용"""
        # ngrok 등이 보내주는 헤더로 외부 URL을 자동 감지
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host", f"localhost:{PORT}")
        proto = self.headers.get("X-Forwarded-Proto", "http")
        return f"{proto}://{host}"

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        # 상태 체크
        if self.path in ("/", "/health"):
            self.send_response(200)
            self._set_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "ok": True,
                "target": f"https://{KLING_HOST}",
                "public_base": self._get_public_base(),
                "img_dir": IMG_DIR
            }).encode())
            return

        # 이미지 정적 서빙
        if self.path.startswith("/imgs/"):
            fname = self.path.split("/imgs/", 1)[1].split("?")[0]
            fname = os.path.basename(fname)  # 디렉토리 트래버설 방지
            fpath = os.path.join(IMG_DIR, fname)
            if not os.path.isfile(fpath):
                self.send_response(404)
                self._set_cors()
                self.end_headers()
                self.wfile.write(b"not found")
                return
            ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "jpg"
            mime = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}.get(ext, "application/octet-stream")
            try:
                with open(fpath, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                self.wfile.write(data)
                print(f"[{self.log_date_time_string()}] GET {self.path}  ← 200 ({len(data)} bytes)")
            except Exception as e:
                self.send_response(500)
                self._set_cors()
                self.end_headers()
                self.wfile.write(str(e).encode())
            return

        # 그 외는 Kling으로 forwarding (예: 폴링용 GET 요청)
        self._proxy("GET", b"")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""

        # 이미지 업로드 엔드포인트
        if self.path == "/img-upload":
            try:
                data = json.loads(body)
                b64 = data.get("base64") or data.get("data") or ""
                ext = (data.get("ext") or "jpg").strip(".").lower()
                if not b64:
                    raise ValueError("base64 비어있음")
                # data:image/jpeg;base64,... 형태도 처리
                if "," in b64:
                    b64 = b64.split(",", 1)[1]
                img_bytes = base64.b64decode(b64)
                fname = f"{uuid.uuid4().hex}.{ext}"
                fpath = os.path.join(IMG_DIR, fname)
                with open(fpath, "wb") as f:
                    f.write(img_bytes)
                # 1시간 넘은 이미지 정리 (백그라운드)
                cleanup_old_images()
                pub = f"{self._get_public_base()}/imgs/{fname}"
                self.send_response(200)
                self._set_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"url": pub, "size": len(img_bytes)}).encode())
                print(f"[{self.log_date_time_string()}] POST /img-upload  → {fname} ({len(img_bytes)} bytes) → {pub}")
            except Exception as e:
                self.send_response(400)
                self._set_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
                print(f"  ⚠ /img-upload error: {e}")
            return

        # 그 외는 Kling으로 forwarding
        self._proxy("POST", body)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""
        self._proxy("PUT", body)

    def do_DELETE(self):
        self._proxy("DELETE", b"")

    def _proxy(self, method: str, body: bytes):
        try:
            conn = http.client.HTTPSConnection(KLING_HOST, timeout=60, context=SSL_CTX)
            fwd_headers = {}
            for k in self.headers.keys():
                lk = k.lower()
                if lk in ("authorization", "content-type", "accept"):
                    fwd_headers[k] = self.headers[k]
            # 브라우저 같은 헤더 추가 (Akamai/WAF 통과 도움)
            fwd_headers.setdefault(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            )
            fwd_headers.setdefault("Accept", "application/json, */*;q=0.5")
            fwd_headers.setdefault("Accept-Language", "ko,en-US;q=0.9,en;q=0.8")
            if body:
                fwd_headers["Content-Length"] = str(len(body))

            print(f"[{self.log_date_time_string()}] {method} {self.path}  (body {len(body)}B)")
            conn.request(method, self.path, body=body, headers=fwd_headers)
            resp = conn.getresponse()
            data = resp.read()
            print(f"        ← {resp.status}")
            if resp.status >= 400:
                try:
                    preview = data.decode("utf-8", errors="replace")[:500]
                    print(f"        body: {preview}")
                except Exception:
                    print(f"        body: <{len(data)} bytes binary>")

            self.send_response(resp.status)
            self._set_cors()
            for k, v in resp.getheaders():
                if k.lower() in (
                    "transfer-encoding",
                    "content-encoding",
                    "connection",
                    "access-control-allow-origin",
                    "access-control-allow-methods",
                    "access-control-allow-headers",
                ):
                    continue
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # 클라이언트가 먼저 끊은 경우
            conn.close()
        except Exception as e:
            print(f"  ⚠ proxy error: {e}")
            try:
                self.send_response(502)
                self._set_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "proxy_error", "message": str(e)}).encode())
            except (BrokenPipeError, ConnectionResetError):
                pass

    def log_message(self, format, *args):
        return  # 기본 로깅 끔 (우리가 직접 출력)


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    try:
        with ReusableTCPServer(("0.0.0.0", PORT), Handler) as httpd:
            print()
            print("╔══════════════════════════════════════════════════════════════════╗")
            print(f"║  Kling proxy + image host   http://localhost:{PORT}                   ║")
            print(f"║  Forwarding to              https://{KLING_HOST}     ║")
            print(f"║  Image storage              {IMG_DIR}              ║")
            print("║                                                                  ║")
            print("║  외부 노출 방법:                                                  ║")
            print("║    1) 별도 터미널: ngrok http " + str(PORT) + "                              ║")
            print("║    2) ngrok이 보여주는 https://xxx.ngrok-free.app 을 복사       ║")
            print("║    3) 사이트 [⚙ 설정 → 🤖 AI 설정 → Kling 프록시 URL]에 붙여넣기 ║")
            print("║                                                                  ║")
            print("║  종료: Ctrl + C                                                  ║")
            print("╚══════════════════════════════════════════════════════════════════╝")
            print()
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e) or getattr(e, "errno", None) == 48:
            print(f"\n❌ 포트 {PORT}이 이미 사용 중입니다.")
            print("   다른 프로그램이 이 포트를 쓰고 있어요.")
            print(f"   이 파일의 PORT 값을 3001로 바꾸세요.\n")
        else:
            print(f"❌ 서버 시작 실패: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n프록시 종료")


if __name__ == "__main__":
    main()
