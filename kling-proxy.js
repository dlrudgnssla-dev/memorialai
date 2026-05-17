/**
 * Kling AI 로컬 프록시 서버
 * ──────────────────────────
 * 브라우저는 외부 API에 직접 요청하면 CORS로 막히기 때문에,
 * 이 작은 서버가 중간에서 헤더를 정리해 Kling으로 대신 보내줍니다.
 *
 * 실행 방법:
 *   1) 터미널을 엽니다.
 *   2) 이 파일이 있는 폴더로 이동:   cd "이 파일이 있는 폴더"
 *   3) 다음 명령을 실행:            node kling-proxy.js
 *   4) "Kling proxy running ..." 메시지가 뜨면 성공입니다.
 *   5) 종료하려면 Ctrl + C
 *
 * 그 다음 사이트의 [설정 → AI 설정 → Kling 프록시 URL]에
 *   http://localhost:3000
 * 을 입력하고 저장하세요.
 *
 * 외부 라이브러리는 사용하지 않아 npm install 이 필요 없습니다.
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT = 3000;

// 기본 대상은 싱가포르 리전. 다른 리전을 쓰시면 아래만 바꾸세요.
//   - 글로벌:  api.klingai.com
//   - 싱가포르: api-singapore.klingai.com
const KLING_HOST = 'api-singapore.klingai.com';

const server = http.createServer((req, res) => {
  // ── CORS 헤더 ──
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age',       '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 상태 체크용 루트
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, target: `https://${KLING_HOST}` }));
    return;
  }

  // ── 요청 바디 수집 ──
  let body = Buffer.alloc(0);
  req.on('data', chunk => {
    body = Buffer.concat([body, chunk]);
  });

  req.on('end', () => {
    const targetPath = req.url;

    console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${req.method} ${targetPath}  (body ${body.length}B)`);

    // 헤더 정리: host/origin/referer 제거(Kling이 거부할 수 있어서)
    const fwdHeaders = { ...req.headers };
    delete fwdHeaders.host;
    delete fwdHeaders.origin;
    delete fwdHeaders.referer;
    delete fwdHeaders['content-length'];
    if (body.length) fwdHeaders['content-length'] = body.length;

    const options = {
      hostname: KLING_HOST,
      port: 443,
      path: targetPath,
      method: req.method,
      headers: fwdHeaders
    };

    const proxyReq = https.request(options, proxyRes => {
      console.log(`        ← ${proxyRes.statusCode}`);

      // 원본 헤더에서 CORS 충돌나는 것 제거하고 우리 헤더로 보냄
      const outHeaders = { ...proxyRes.headers };
      delete outHeaders['access-control-allow-origin'];
      delete outHeaders['access-control-allow-methods'];
      delete outHeaders['access-control-allow-headers'];

      outHeaders['access-control-allow-origin'] = '*';

      res.writeHead(proxyRes.statusCode, outHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      console.error('  ⚠ 프록시 에러:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
    });

    if (body.length) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Kling proxy running at  http://localhost:${PORT}              ║`);
  console.log(`║  Forwarding to           https://${KLING_HOST}    ║`);
  console.log('║                                                              ║');
  console.log('║  사이트 [설정 → AI 설정 → Kling 프록시 URL]에                ║');
  console.log('║    http://localhost:' + PORT + '  을 넣고 저장하세요.                ║');
  console.log('║                                                              ║');
  console.log('║  종료: Ctrl + C                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ 포트 ${PORT}이 이미 사용 중입니다.`);
    console.error(`   다른 프로그램이 이 포트를 쓰고 있어요. 종료하시거나 이 파일의 PORT 값을 3001로 바꾸세요.\n`);
  } else {
    console.error('❌ 서버 시작 실패:', err.message);
  }
  process.exit(1);
});
