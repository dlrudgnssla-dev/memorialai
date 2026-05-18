#!/usr/bin/env node
// Local compose server — static files + ffmpeg compose endpoint
//
// Endpoints
//   GET  /*               — static files from this directory
//   POST /compose         — body { clipUrls:[], slots:[], bgmUrl?:'' }
//                            → mp4 stream (concat by slots, -1 = black 1s)
//
// Why: Chrome canvas drawImage(video) writes black on this user's
// environment, so the in-browser compose fails. ffmpeg here is reliable.

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = 8765;
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const app = express();
app.use(express.json({ limit: '500mb' }));

// CORS — broad, since the site might run from file:// or http://
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
  res.set('Accept-Ranges', 'bytes');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Data directories
const DATA_DIR  = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const BACKUP_FILE = path.join(DATA_DIR, 'backup.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// Multi-user authentication
//   - admins (kosiny by default): full read/write of everything
//   - members: each has username/password tied to a memberId;
//              can only see/edit their own data
// users.json schema:
//   { admins: { kosiny: '123456' },
//     members: { alice: { password:'p1', memberId:1, createdAt:... } } }
// ============================================================
function loadUsers(){
  if (!fs.existsSync(USERS_FILE)){
    const initial = { admins: { kosiny: '123456' }, members: {} };
    fs.writeFileSync(USERS_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch(e){ console.error('[users] load failed:', e.message); return { admins:{ kosiny:'123456' }, members:{} }; }
}
function saveUsers(u){ fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
function needAuth(req, res){
  // If a browser is asking for a page (Accept: text/html), redirect them
  // to the styled sign-in screen instead of triggering the native Basic
  // Auth popup. API/AJAX callers still get a clean 401 with the realm.
  const accept = (req && req.headers && req.headers.accept) || '';
  const isHtmlBrowse = req && req.method === 'GET' && accept.includes('text/html');
  if (isHtmlBrowse) {
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, '/go');
  }
  res.set('WWW-Authenticate', 'Basic realm="Pet Memorial Site"');
  res.status(401).end();
}
function timingSafeEqualStr(a, b){
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}
// Public "go" landing page — no auth required.
// Pure-black background with a bright twinkling starfield. Standard
// MEMORIAL wordmark (matches the topbar size), CINEMATIC AI TRIBUTES
// tagline, ID + password inputs. No visible submit button — Enter
// submits. JS validates via /whoami then redirects with creds in URL.
app.get('/go', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MEMORIAL · Sign In</title>
<style>
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:#000;color:#f0e8ff;
    font-family:'Helvetica Neue','Inter','Pretendard',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;padding:40px 24px;position:relative;overflow:hidden}
  /* Starfield canvas — pure black bg, bright twinkles */
  #stars{position:fixed;inset:0;width:100%;height:100%;
    pointer-events:none;z-index:0;display:block}
  .center{position:relative;z-index:2;width:100%;max-width:380px}

  /* Logo — matches the topbar style (small, refined) */
  .logo{display:inline-flex;align-items:center;gap:10px;
    font-weight:600;letter-spacing:0.3em;font-size:13px;
    color:#f0eaff;text-transform:uppercase;
    text-shadow:0 0 16px rgba(180,140,255,0.45);margin-bottom:10px}
  .logo-icon{display:inline-block;font-size:16px;line-height:1;
    filter:drop-shadow(0 0 8px rgba(255,200,255,0.7))
           drop-shadow(0 0 18px rgba(150,100,255,0.4))}

  .tag{color:rgba(220,200,255,0.55);font-weight:300;letter-spacing:0.45em;
    text-transform:uppercase;font-size:11px;margin:0 0 56px}

  .form{display:flex;flex-direction:column;gap:18px}
  .field{position:relative}
  .field label{display:block;text-align:left;
    font-size:10px;letter-spacing:0.35em;font-weight:400;text-transform:uppercase;
    color:rgba(200,190,255,0.5);margin-bottom:8px;padding-left:2px}
  .field input{width:100%;background:transparent;
    border:none;border-bottom:1px solid rgba(180,140,255,0.3);
    color:#fff;padding:12px 4px;font-size:18px;font-weight:300;
    letter-spacing:0.02em;font-family:inherit;
    transition:border-color 0.5s cubic-bezier(0.19,1,0.22,1),
               box-shadow 0.5s cubic-bezier(0.19,1,0.22,1)}
  .field input::placeholder{color:rgba(200,190,255,0.2)}
  .field input:focus{outline:none;
    border-bottom-color:rgba(220,180,255,0.95);
    box-shadow:0 1px 0 rgba(220,180,255,0.5),
               0 16px 40px -16px rgba(180,140,255,0.5)}

  .err{color:#ff8aa8;font-size:12px;letter-spacing:0.1em;
    margin-top:18px;min-height:1em;font-weight:300;
    opacity:0;transition:opacity 0.3s;text-shadow:0 0 12px rgba(255,140,180,0.6)}
  .err.show{opacity:1}
  .err.busy{color:rgba(220,200,255,0.55);text-shadow:none}

  /* Mobile-only sparkle that acts as a tap-to-submit button.
     Brighter than the home touch hint because it's an explicit action. */
  .go-sparkle {
    display: none;
    background: transparent;
    border: none;
    padding: 10px 18px;
    /* Tighter to the form so it doesn't get pushed below the fold or
       hidden behind the keyboard. */
    margin: 4px auto 0;
    color: inherit;
    cursor: pointer;
    flex-direction: column;
    align-items: center;
    -webkit-tap-highlight-color: transparent;
  }
  .go-sparkle-icon {
    font-size: 62px;
    line-height: 1;
    color: rgba(255, 245, 255, 0.95);
    text-shadow:
      0 0 16px rgba(245, 210, 255, 0.95),
      0 0 36px rgba(200, 150, 255, 0.7),
      0 0 80px rgba(180, 140, 255, 0.45);
    animation: goSparklePulse 2.4s ease-in-out infinite;
  }
  @keyframes goSparklePulse {
    0%, 100% { transform: scale(0.95); opacity: 0.75; }
    50%      { transform: scale(1.18); opacity: 1;    }
  }
  .go-sparkle-text {
    margin-top: 12px;
    font-size: 10px;
    letter-spacing: 0.4em;
    color: rgba(235, 220, 255, 0.7);
    text-transform: uppercase;
    animation: goSparkleFade 2.4s ease-in-out infinite;
  }
  @keyframes goSparkleFade {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 1;   }
  }
  @media (max-width: 640px) {
    .go-sparkle { display: inline-flex; }
    /* On mobile keep the form compact so the sparkle stays in view */
    body { padding: 24px 24px 12px; justify-content: flex-start; }
    .tag { margin-bottom: 28px; }
  }

  @media (prefers-reduced-motion: reduce){
    #stars{display:none}
    body{background:#000}
  }
</style></head><body>
<canvas id="stars"></canvas>
<div class="center">
  <div class="logo"><span class="logo-icon">✦</span>MEMORIAL</div>
  <p class="tag">CINEMATIC AI TRIBUTES</p>
  <form class="form" id="loginForm" onsubmit="event.preventDefault();doLogin()">
    <div class="field">
      <label for="u">아이디</label>
      <input id="u" type="text" autocomplete="username"
             autocapitalize="off" autocorrect="off" spellcheck="false"
             autofocus required />
    </div>
    <div class="field">
      <label for="p">비밀번호</label>
      <input id="p" type="password" autocomplete="current-password" required />
    </div>
    <button type="submit" style="display:none" aria-hidden="true"></button>
    <div class="err" id="err"></div>
  </form>
  <!-- Mobile-only: tap-to-enter sparkle (same look as the home touch hint).
       Click acts as Enter / form submit. Hidden on desktop. -->
  <button type="button" class="go-sparkle" id="goSparkle"
          aria-label="로그인" onclick="doLogin()">
    <span class="go-sparkle-icon">✦</span>
    <span class="go-sparkle-text">탭하여 입장</span>
  </button>
</div>
<script>
/* ===== Starfield — pure black with bright twinkling stars +
   slow forward-motion drift (gentle warp). Stars push outward
   from the center proportional to depth, recycle back near
   center when they leave the screen. ===== */
(function(){
  const c = document.getElementById('stars');
  if(!c) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = c.getContext('2d', { alpha: true });
  let stars = [], dpr = Math.min(window.devicePixelRatio||1, 2);
  let cx = 0, cy = 0;
  const FORWARD_SPEED = 0.20;  // base speed (lower = slower drift)
  function resize(){
    dpr = Math.min(window.devicePixelRatio||1, 2);
    c.width = innerWidth*dpr; c.height = innerHeight*dpr;
    c.style.width = innerWidth+'px'; c.style.height = innerHeight+'px';
    cx = innerWidth/2; cy = innerHeight/2;
    seed();
  }
  function newStarNearCenter(s){
    // Reset: spawn near the vanishing point with a random direction
    const angle = Math.random()*Math.PI*2;
    const startDist = 4 + Math.random()*30;
    s.x = cx + Math.cos(angle)*startDist;
    s.y = cy + Math.sin(angle)*startDist;
    s.z = Math.random()*1.7 + 0.15;
    s.tw = Math.random()*Math.PI*2;
  }
  function seed(){
    const count = Math.min(520, Math.floor((innerWidth*innerHeight)/3600));
    stars = Array.from({length:count}, () => ({
      x: Math.random()*innerWidth,
      y: Math.random()*innerHeight,
      z: Math.random()*1.7 + 0.15,
      r: Math.random()*1.9 + 0.4,
      tw: Math.random()*Math.PI*2,
      twS: Math.random()*0.04 + 0.012,
      hue: (() => {
        const r = Math.random();
        if(r < 0.14) return 210 + Math.random()*60;
        if(r < 0.30) return 290 + Math.random()*40;
        if(r < 0.42) return -1; // pure white-hot hero
        return 0;
      })()
    }));
  }
  function frame(){
    ctx.clearRect(0,0,c.width,c.height);
    ctx.save(); ctx.scale(dpr, dpr);
    for(const s of stars){
      // Twinkle phase
      s.tw += s.twS;
      const a = 0.35 + 0.65 * (Math.sin(s.tw)*0.5 + 0.5);

      // Slow forward drift — push outward from the vanishing point.
      // Closer-to-edge stars travel faster (parallax depth cue).
      const dx = s.x - cx, dy = s.y - cy;
      const dist = Math.hypot(dx, dy);
      if(dist > 0.5){
        // Acceleration grows with both distance-from-center AND depth (z)
        const accel = 1 + (dist/220) * s.z;
        s.x += (dx/dist) * FORWARD_SPEED * accel;
        s.y += (dy/dist) * FORWARD_SPEED * accel;
      } else {
        // Star exactly at center → nudge it a hair so it can start drifting
        s.x += (Math.random()-0.5);
        s.y += (Math.random()-0.5);
      }
      // Recycle if it exited the viewport
      if(s.x < -40 || s.x > innerWidth+40 || s.y < -40 || s.y > innerHeight+40){
        newStarNearCenter(s);
      }

      const color = (s.hue === -1) ? 'rgba(255,255,255,'+a+')'
                  : (s.hue === 0)  ? 'rgba(240,230,255,'+(a*0.9)+')'
                                   : 'hsla('+s.hue+',95%,85%,'+a+')';
      const glowR = s.r*5*s.z;
      const grad = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,glowR);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, color.replace(/[\\d.]+\\)$/, (a*0.3).toFixed(2)+')'));
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x,s.y,glowR,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.fillStyle = (s.hue===-1)?'rgba(255,255,255,'+a+')':color;
      ctx.arc(s.x,s.y,s.r*s.z*0.7,0,Math.PI*2); ctx.fill();
      if(s.hue === -1 && s.z > 1.0){
        ctx.save(); ctx.globalCompositeOperation='screen';
        ctx.strokeStyle = 'rgba(255,255,255,'+(a*0.55)+')';
        ctx.lineWidth = 0.6;
        const flare = s.r*7*s.z;
        ctx.beginPath();
        ctx.moveTo(s.x-flare,s.y); ctx.lineTo(s.x+flare,s.y);
        ctx.moveTo(s.x,s.y-flare); ctx.lineTo(s.x,s.y+flare);
        ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
    requestAnimationFrame(frame);
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  requestAnimationFrame(frame);
})();

/* ===== Login flow — cookie-based to avoid the Basic-Auth credential
   cache bug where browsers prefer stale cached creds over URL ones. ===== */
async function doLogin(){
  const u = document.getElementById('u').value.trim();
  const p = document.getElementById('p').value;
  const err = document.getElementById('err');
  err.classList.remove('show','busy');
  if(!u || !p){
    err.textContent = '아이디와 비밀번호를 입력하세요';
    err.classList.add('show');
    return;
  }
  err.textContent = '확인 중…';
  err.classList.add('show','busy');
  try {
    // POST credentials to /login → server sets mm_auth cookie which
    // ALWAYS overrides any cached Basic-Auth header (cookie-first in
    // middleware). No need to hit /__logout__ here — that endpoint
    // returns 401 with WWW-Authenticate which can spuriously trigger
    // the browser's auth prompt during the login flow.
    const r = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p }),
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!r.ok) {
      err.classList.remove('busy');
      err.textContent = '아이디 또는 비밀번호가 올바르지 않습니다';
      err.classList.add('show');
      return;
    }
    const info = await r.json();
    err.textContent = info.role === 'admin'
      ? '관리자 로그인 성공 — 이동 중…'
      : '로그인 성공 — 이동 중…';
    setTimeout(() => { location.href = '/pet-memorial.html'; }, 280);
  } catch (e) {
    err.classList.remove('busy');
    err.textContent = '연결 오류: ' + e.message;
    err.classList.add('show');
  }
}
</script>
</body></html>`);
});

// POST /login — validates credentials and sets a session cookie.
// This bypasses the HTTP Basic Auth credential-cache mess where
// browsers prefer their cached creds over URL-embedded ones.
// The cookie is checked FIRST by the auth middleware below.
app.post('/login', express.json(), (req, res) => {
  const u = req.body?.username || '';
  const p = req.body?.password || '';
  if (!u || !p) return res.status(400).json({ error: 'username/password required' });
  const users = loadUsers();
  let ok = false;
  if (timingSafeEqualStr(users.admins?.[u], p)) ok = true;
  else if (users.members?.[u] && timingSafeEqualStr(users.members[u].password, p)) ok = true;
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  // Cookie value is base64(user:pass) — same format Basic Auth uses.
  // SameSite=Lax so it's sent on top-level navigation; HttpOnly for safety;
  // Secure auto-enabled on HTTPS via the trust-proxy check below.
  const token = Buffer.from(u + ':' + p, 'utf-8').toString('base64');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const secure = (proto === 'https') ? '; Secure' : '';
  res.set('Set-Cookie',
    `mm_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`);
  res.json({ ok: true, role: timingSafeEqualStr(users.admins?.[u], p) ? 'admin' : 'member' });
});

// Logout endpoint — always returns 401 to invalidate the browser's
// cached Basic Auth credentials AND clears the session cookie.
// Bypasses the auth middleware below so it can fire even with valid
// stored credentials.
app.get('/__logout__', (_req, res) => {
  // Clear the session cookie and send the browser straight to the
  // styled /go sign-in screen. Crucially we do NOT emit a
  // WWW-Authenticate header or a 401 status — those would make the
  // browser pop its native Basic Auth dialog, which is what the user
  // saw as "logout 후 로그인 팝업".
  res.set('Set-Cookie', 'mm_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.set('Cache-Control', 'no-store');
  res.redirect(302, '/go');
});

app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/__logout__' ||
      req.path === '/go'     || req.path === '/login') return next();
  // Public image hosting — Replicate (and others) need to fetch these
  // without our cookie. The filenames are random hex so nobody can
  // discover other users' images.
  if (req.method === 'GET' && req.path.startsWith('/img-cache/')) return next();

  let user, pass;

  // 1) PRIMARY: session cookie (set by /login form). Checked FIRST so it
  //    overrides any stale Basic Auth credentials cached in the browser.
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.split(';').map(s => s.trim())
    .find(c => c.startsWith('mm_auth='));
  if (cookieMatch) {
    try {
      const token = cookieMatch.slice('mm_auth='.length);
      const dec = Buffer.from(token, 'base64').toString('utf-8');
      const i = dec.indexOf(':');
      if (i > 0) { user = dec.slice(0, i); pass = dec.slice(i + 1); }
    } catch {}
  }

  // 2) FALLBACK: HTTP Basic Auth header (legacy / direct API access).
  //    BUT: skip this fallback for browser HTML page requests. Browsers
  //    cache Basic Auth credentials forever once typed into the native
  //    popup, and that cache would auto-bypass the styled /go login page
  //    every time the user navigates here — making it look like the
  //    sign-in step "disappeared". For HTML browse requests we ONLY
  //    trust the explicit mm_auth cookie set by the /login form, so a
  //    cleared cookie → /go login screen as intended.
  //    API/AJAX callers (curl, JS fetch with Accept: application/json,
  //    etc.) still get the Basic Auth fallback.
  const accept = req.headers.accept || '';
  const isHtmlBrowse = req.method === 'GET' && accept.includes('text/html');
  if (!user && !isHtmlBrowse) {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Basic\s+(.+)$/);
    if (m) {
      try {
        const dec = Buffer.from(m[1], 'base64').toString('utf-8');
        const i = dec.indexOf(':');
        if (i > 0) { user = dec.slice(0, i); pass = dec.slice(i + 1); }
      } catch {}
    }
  }

  if (!user) return needAuth(req, res);

  const users = loadUsers();
  if (timingSafeEqualStr(users.admins?.[user], pass)){
    req.user = { role: 'admin', username: user, memberId: null };
    return next();
  }
  const mem = users.members?.[user];
  if (mem && timingSafeEqualStr(mem.password, pass)){
    req.user = { role: 'member', username: user, memberId: mem.memberId };
    return next();
  }
  return needAuth(req, res);
});

// Tell the client who they are
app.get('/whoami', (req, res) => res.json(req.user));

// Admin-only user management
app.get('/admin/users', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error:'admin only' });
  const u = loadUsers();
  const list = Object.entries(u.members || {}).map(([username, m]) => ({
    username, memberId: m.memberId, createdAt: m.createdAt || null
  }));
  res.json({ ok: true, list, admins: Object.keys(u.admins || {}) });
});
app.post('/admin/users', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error:'admin only' });
  const { username, password, memberId } = req.body || {};
  if (!username || !password || (memberId !== 0 && !memberId)){
    return res.status(400).json({ error: 'username/password/memberId required' });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username) || username.length > 40){
    return res.status(400).json({ error: 'username must be [A-Za-z0-9_.-], 1-40 chars' });
  }
  const u = loadUsers();
  if (u.admins?.[username]) return res.status(400).json({ error: 'name conflicts with an admin' });
  u.members = u.members || {};
  const existed = !!u.members[username];
  u.members[username] = {
    password: String(password),
    memberId: Number(memberId),
    createdAt: u.members[username]?.createdAt || Date.now()
  };
  saveUsers(u);
  console.log(`[users] ${existed ? 'updated' : 'created'} member account ${username} → memberId=${memberId}`);
  res.json({ ok: true, updated: existed });
});
app.delete('/admin/users/:username', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error:'admin only' });
  const u = loadUsers();
  if (u.members?.[req.params.username]){
    delete u.members[req.params.username];
    saveUsers(u);
    console.log(`[users] deleted member account ${req.params.username}`);
  }
  res.json({ ok: true });
});

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, ffmpeg: FFMPEG, root: ROOT });
});

// ============================================================
// Replicate proxy — browsers can't call api.replicate.com directly
// because of CORS. We forward POST /replicate-proxy/predictions and
// GET  /replicate-proxy/predictions/:id from the authenticated client
// to Replicate using the client-supplied Authorization header (the
// admin's r8_... token). We never read or persist that token here.
// ============================================================
// Generic predictions endpoint (community models — uses `version`)
app.post('/replicate-proxy/predictions', express.json({ limit: '50mb' }), async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !/^Bearer\s+r8_/i.test(auth)) {
    return res.status(400).json({ error: 'Authorization header (Bearer r8_...) missing or invalid' });
  }
  try {
    const r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Prefer': req.headers['prefer'] || 'wait'
      },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    res.status(r.status)
       .set('Content-Type', r.headers.get('content-type') || 'application/json')
       .send(text);
  } catch (e) {
    console.error('[replicate-proxy POST] error:', e.message);
    res.status(502).json({ error: 'upstream fetch failed: ' + e.message });
  }
});

// Official models endpoint — used for Seedance 2.0, Flux, etc.
// POST /replicate-proxy/models/{owner}/{name}/predictions
// Forwards to https://api.replicate.com/v1/models/{owner}/{name}/predictions
app.post('/replicate-proxy/models/:owner/:name/predictions',
  express.json({ limit: '50mb' }),
  async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !/^Bearer\s+r8_/i.test(auth)) {
      return res.status(400).json({ error: 'Authorization header (Bearer r8_...) missing or invalid' });
    }
    const { owner, name } = req.params;
    if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) {
      return res.status(400).json({ error: 'bad owner/name' });
    }
    try {
      const upstream = `https://api.replicate.com/v1/models/${owner}/${name}/predictions`;
      const r = await fetch(upstream, {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json',
          'Prefer': req.headers['prefer'] || 'wait'
        },
        body: JSON.stringify(req.body || {})
      });
      const text = await r.text();
      res.status(r.status)
         .set('Content-Type', r.headers.get('content-type') || 'application/json')
         .send(text);
    } catch (e) {
      console.error('[replicate-proxy model POST] error:', e.message);
      res.status(502).json({ error: 'upstream fetch failed: ' + e.message });
    }
  });

// GET /replicate-proxy/models/{owner}/{name}
// Returns the model object including openapi_schema (input field names + types).
// Used for runtime schema discovery — we don't want to hardcode field names
// because providers like Replicate / fal.ai / WaveSpeed each use different
// names for the same Seedance feature (e.g. "last_image" vs "end_image_url").
app.get('/replicate-proxy/models/:owner/:name', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !/^Bearer\s+r8_/i.test(auth)) {
    return res.status(400).json({ error: 'Authorization header (Bearer r8_...) missing or invalid' });
  }
  const { owner, name } = req.params;
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return res.status(400).json({ error: 'bad owner/name' });
  }
  try {
    const r = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
      headers: { 'Authorization': auth }
    });
    const text = await r.text();
    // Stash the schema to disk for local inspection — helps debug "why isn't
    // last_image being honored?" by exposing strength / guidance parameters.
    // Token is NOT stored. Path is debug-only, not served publicly.
    if (r.ok) {
      try {
        const dbgFile = path.join(DATA_DIR, `_dbg-model-${owner}-${name}.json`);
        fs.writeFileSync(dbgFile, text);
      } catch(_){}
    }
    res.status(r.status)
       .set('Content-Type', r.headers.get('content-type') || 'application/json')
       .send(text);
  } catch (e) {
    console.error('[replicate-proxy model GET] error:', e.message);
    res.status(502).json({ error: 'upstream fetch failed: ' + e.message });
  }
});

app.get('/replicate-proxy/predictions/:id', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !/^Bearer\s+r8_/i.test(auth)) {
    return res.status(400).json({ error: 'Authorization header (Bearer r8_...) missing or invalid' });
  }
  const id = req.params.id;
  if (!/^[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'bad prediction id' });
  try {
    const r = await fetch('https://api.replicate.com/v1/predictions/' + encodeURIComponent(id), {
      headers: { 'Authorization': auth }
    });
    const text = await r.text();
    res.status(r.status)
       .set('Content-Type', r.headers.get('content-type') || 'application/json')
       .send(text);
  } catch (e) {
    console.error('[replicate-proxy GET] error:', e.message);
    res.status(502).json({ error: 'upstream fetch failed: ' + e.message });
  }
});

// ============================================================
// Global theme (admin-managed, all users adopt it).
// Stored in data/theme.json. Anyone authenticated can GET (so the
// member view picks up the latest skin). Only admin can POST.
// ============================================================
const THEME_FILE = path.join(DATA_DIR, 'theme.json');
app.get('/theme', (_req, res) => {
  if (!fs.existsSync(THEME_FILE)) return res.json({ exists: false });
  try {
    const j = JSON.parse(fs.readFileSync(THEME_FILE, 'utf-8'));
    res.json({ exists: true, savedAt: j.savedAt || null, theme: j.theme || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/admin/theme', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  const theme = req.body?.theme;
  if (!theme || typeof theme !== 'object') return res.status(400).json({ error: 'body.theme required' });
  try {
    fs.writeFileSync(THEME_FILE, JSON.stringify({ savedAt: Date.now(), theme }, null, 2));
    console.log('[theme] saved by', req.user.username);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/admin/theme', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  try {
    if (fs.existsSync(THEME_FILE)) fs.unlinkSync(THEME_FILE);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// Onboarding wizard state — server-side per-member so a member can
// log in on a different browser and resume exactly where they left off.
// Stored under data/onb-states/<memberId>.json. Member can only access
// their own; admin can read any.
// ============================================================
const ONB_DIR = path.join(DATA_DIR, 'onb-states');
if (!fs.existsSync(ONB_DIR)) fs.mkdirSync(ONB_DIR, { recursive: true });
function _onbStateFile(mid){ return path.join(ONB_DIR, String(mid) + '.json'); }
function _onbCanAccess(req, mid){
  if (req.user.role === 'admin') return true;
  return req.user.memberId === Number(mid);
}

app.get('/onb-state/:mid', (req, res) => {
  const mid = req.params.mid;
  if (!/^\d+$/.test(mid)) return res.status(400).json({ error: 'bad mid' });
  if (!_onbCanAccess(req, mid)) return res.status(403).json({ error: 'not yours' });
  const file = _onbStateFile(mid);
  if (!fs.existsSync(file)) return res.json({ exists: false });
  try {
    const stat = fs.statSync(file);
    const state = JSON.parse(fs.readFileSync(file, 'utf-8'));
    res.json({ exists: true, savedAt: stat.mtimeMs, state });
  } catch(e){ res.status(500).json({ error: e.message }); }
});
app.post('/onb-state/:mid', (req, res) => {
  const mid = req.params.mid;
  if (!/^\d+$/.test(mid)) return res.status(400).json({ error: 'bad mid' });
  if (!_onbCanAccess(req, mid)) return res.status(403).json({ error: 'not yours' });
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'json body required' });
  try {
    fs.writeFileSync(_onbStateFile(mid), JSON.stringify(req.body));
    console.log(`[onb-state] saved for member ${mid} (step=${req.body.step})`);
    res.json({ ok: true, savedAt: Date.now() });
  } catch(e){ res.status(500).json({ error: e.message }); }
});
app.delete('/onb-state/:mid', (req, res) => {
  const mid = req.params.mid;
  if (!/^\d+$/.test(mid)) return res.status(400).json({ error: 'bad mid' });
  if (!_onbCanAccess(req, mid)) return res.status(403).json({ error: 'not yours' });
  try {
    const file = _onbStateFile(mid);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ ok: true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Helper: safe JSON parse from stored mm_* strings
function safeParse(s, fallback){
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
// Look up target's owner from the latest backup (used by /pipe-backup & /video-backup ownership checks)
function targetMemberId(targetId){
  try {
    const j = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));
    const targets = safeParse(j.data?.mm_targets, []);
    const t = targets.find(x => String(x.id) === String(targetId));
    return t ? t.memberId : null;
  } catch { return null; }
}
// Auto-sync: store all 'mm_*' localStorage keys server-side so site data
// (members, targets, frame/video/bgm metadata, settings, AI keys, prompts)
// survives the Quick Tunnel URL changing on every restart.

app.get('/backup', (req, res) => {
  if (!fs.existsSync(BACKUP_FILE)) return res.json({ exists: false });
  try {
    const txt = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const j = JSON.parse(txt);
    if (req.user.role === 'admin'){
      return res.json({ exists: true, savedAt: j.savedAt || null, data: j.data || {} });
    }
    // Member: return ONLY their own member record + their own targets.
    // mm_settings is shared (prompts, frameData/videoData/bgmData, aiKeys).
    const data = j.data || {};
    const myId = req.user.memberId;
    const myMembers = safeParse(data.mm_members, []).filter(m => m.id === myId);
    const myTargets = safeParse(data.mm_targets, []).filter(t => t.memberId === myId);
    const filtered = {
      mm_members: JSON.stringify(myMembers),
      mm_targets: JSON.stringify(myTargets)
    };
    if (data.mm_settings) filtered.mm_settings = data.mm_settings;
    res.json({ exists: true, savedAt: j.savedAt || null, data: filtered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/backup', (req, res) => {
  const body = req.body || {};
  if (!body.data || typeof body.data !== 'object') {
    return res.status(400).json({ error: 'body.data (object) required' });
  }
  try {
    if (req.user.role === 'admin'){
      const payload = { savedAt: Date.now(), data: body.data };
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(payload, null, 2));
      const keyCount = Object.keys(body.data).length;
      const sizeKB = (fs.statSync(BACKUP_FILE).size / 1024).toFixed(1);
      console.log(`[backup admin] saved ${keyCount} keys (${sizeKB}KB)`);
      return res.json({ ok: true, savedAt: payload.savedAt, keyCount, sizeKB });
    }
    // Member: merge — preserve other members' rows, only touch own.
    // CRITICAL: refuse to wipe a member's data if the payload looks
    // like an uninitialised bootstrap (missing keys or empty arrays
    // while existing data has content). This prevents the data-loss
    // bug where a fresh login overwrites the server with empty arrays.
    const myId = req.user.memberId;
    let existing = { savedAt: 0, data: {} };
    try { existing = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8')); } catch {}
    const exData = existing.data || {};
    const exMembers = safeParse(exData.mm_members, []);
    const exTargets = safeParse(exData.mm_targets, []);
    const hasMembersKey = Object.prototype.hasOwnProperty.call(body.data, 'mm_members');
    const hasTargetsKey = Object.prototype.hasOwnProperty.call(body.data, 'mm_targets');
    const inMembers = hasMembersKey ? safeParse(body.data.mm_members, []) : null;
    const inTargets = hasTargetsKey ? safeParse(body.data.mm_targets, []) : null;
    const existingMyMember  = exMembers.find(m => m.id === myId) || null;
    const existingMyTargets = exTargets.filter(t => t.memberId === myId);

    // --- Members merge ---
    let mergedMembers;
    if (!hasMembersKey) {
      // Key absent → keep server state untouched
      mergedMembers = exMembers;
    } else if (inMembers.length === 0 && existingMyMember) {
      // Sender has no members at all, but we know they exist → bootstrap race, skip
      mergedMembers = exMembers;
      console.warn(`[backup member=${req.user.username}/${myId}] BLOCKED empty mm_members wipe (existing member preserved)`);
    } else if (existingMyMember && !inMembers.find(m => m.id === myId)) {
      // Sender's mm_members lacks their own record but we have one → suspicious
      // (looks like client sent JS-default member array, not real data) → skip
      mergedMembers = exMembers;
      console.warn(`[backup member=${req.user.username}/${myId}] BLOCKED member-self-missing wipe (existing record preserved)`);
    } else {
      const myInMember = inMembers.find(m => m.id === myId);
      mergedMembers = exMembers.filter(m => m.id !== myId);
      if (myInMember) mergedMembers.push(myInMember);
    }

    // --- Targets merge ---
    // We treat ANY push that arrives with zero of the sender's own targets,
    // when the server already has some, as a suspected bootstrap/empty-LS
    // race and refuse to wipe. Members never legitimately push "I have
    // 0 targets" from the same browser that just had some — target deletion
    // pushes only happen alongside a deliberate user action that updates
    // mm_targets to one fewer item, not all-gone.
    let mergedTargets;
    if (!hasTargetsKey) {
      mergedTargets = exTargets;
    } else if (
      // Sender claims zero of their own targets, but server has some →
      // protect. This is the data-loss path: a fresh browser logs in,
      // its local mm_targets is [] before /backup pull lands, and a
      // racing push would otherwise wipe the member's targets.
      inTargets.filter(t => t.memberId === myId).length === 0 &&
      existingMyTargets.length > 0
    ) {
      mergedTargets = exTargets;
      console.warn(`[backup member=${req.user.username}/${myId}] BLOCKED empty-own-targets wipe (existing ${existingMyTargets.length} targets preserved)`);
    } else {
      const myInTargets = inTargets.filter(t => t.memberId === myId);
      mergedTargets = [
        ...exTargets.filter(t => t.memberId !== myId),
        ...myInTargets
      ];
    }

    // mm_settings: members are NOT allowed to overwrite admin-managed settings.
    const finalData = {
      ...exData,
      mm_members: JSON.stringify(mergedMembers),
      mm_targets: JSON.stringify(mergedTargets)
    };
    const payload = { savedAt: Date.now(), data: finalData };
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(payload, null, 2));
    const sizeKB = (fs.statSync(BACKUP_FILE).size / 1024).toFixed(1);
    const myTargetCount = mergedTargets.filter(t => t.memberId === myId).length;
    console.log(`[backup member=${req.user.username}/${myId}] merged → ${myTargetCount} target(s) for member, total ${sizeKB}KB`);
    res.json({ ok: true, savedAt: payload.savedAt, keyCount: Object.keys(finalData).length, sizeKB });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// Cross-device sync for per-target pipeline data (refPhotos,
// repImage, generatedFrames as dataUrls, generatedClips with
// Kling CDN URLs, etc.) and the final composed mp4 binary.
//
// Stored as one file per target so they can be fetched/updated
// independently. mm_* metadata still uses /backup (above).
// ============================================================
const PIPE_DIR  = path.join(DATA_DIR, 'pipes');
const VIDEO_DIR = path.join(DATA_DIR, 'videos');
// Clip cache — permanent local copies of provider-generated clips
// (Replicate / Kling temporary CDN URLs expire). One subdir per target.
const CLIP_CACHE_DIR = path.join(DATA_DIR, 'clip-cache');
// Image cache — public URL hosting for frame images.
// Why: Replicate's image-input fields are declared `format: "uri"` in the
// model schema. They prefer HTTPS URLs over inline base64 data URIs.
// In particular, Seedance 2.0's `last_frame_image` field silently fails
// to be honored when sent as a large data URI — same symptom we hit with
// Kling, fixed there by upload-then-URL. Now applied to Seedance too.
const IMG_CACHE_DIR = path.join(DATA_DIR, 'img-cache');
[PIPE_DIR, VIDEO_DIR, CLIP_CACHE_DIR, IMG_CACHE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;

// Helper: members can only touch backups for targets they own
function denyIfNotOwned(req, res){
  if (req.user.role === 'admin') return false;
  const tid = req.params.targetId;
  const ownerId = targetMemberId(tid);
  if (ownerId === null) {
    // target unknown (deleted or admin hasn't created backup yet) — deny for members
    res.status(404).json({ error: 'target not found' });
    return true;
  }
  if (ownerId !== req.user.memberId) {
    res.status(403).json({ error: 'not your target' });
    return true;
  }
  return false;
}

// List all pipe backups (for debugging / cross-device discovery)
app.get('/pipe-backup', (req, res) => {
  try {
    const files = fs.readdirSync(PIPE_DIR).filter(n => n.endsWith('.json'));
    let list = files.map(n => {
      const tid = n.replace(/\.json$/, '');
      const stat = fs.statSync(path.join(PIPE_DIR, n));
      return {
        targetId: tid,
        memberId: targetMemberId(tid),
        savedAt: stat.mtimeMs,
        sizeKB: +(stat.size / 1024).toFixed(1)
      };
    });
    if (req.user.role !== 'admin'){
      list = list.filter(e => e.memberId === req.user.memberId);
    }
    res.json({ ok: true, list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/pipe-backup/:targetId', (req, res) => {
  const id = req.params.targetId;
  if (!SAFE_ID.test(id)) return res.status(400).json({ error: 'bad targetId' });
  if (denyIfNotOwned(req, res)) return;
  const file = path.join(PIPE_DIR, id + '.json');
  if (!fs.existsSync(file)) return res.json({ exists: false });
  try {
    const stat = fs.statSync(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    res.json({ exists: true, savedAt: stat.mtimeMs, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/pipe-backup/:targetId', (req, res) => {
  const id = req.params.targetId;
  if (!SAFE_ID.test(id)) return res.status(400).json({ error: 'bad targetId' });
  if (denyIfNotOwned(req, res)) return;
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'json body required' });
  }
  try {
    const file = path.join(PIPE_DIR, id + '.json');
    fs.writeFileSync(file, JSON.stringify(req.body));
    const sizeKB = +(fs.statSync(file).size / 1024).toFixed(1);
    console.log(`[pipe-backup user=${req.user.username}] saved ${id} (${sizeKB}KB)`);
    res.json({ ok: true, savedAt: Date.now(), sizeKB });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Final composed mp4 binary — uses raw body parser
app.get('/video-backup/:targetId', (req, res) => {
  const id = req.params.targetId;
  if (!SAFE_ID.test(id)) return res.status(400).end();
  if (denyIfNotOwned(req, res)) return;
  const file = path.join(VIDEO_DIR, id + '.mp4');
  if (!fs.existsSync(file)) return res.status(404).end();
  const stat = fs.statSync(file);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Saved-At', String(stat.mtimeMs));
  fs.createReadStream(file).pipe(res);
});

app.post('/video-backup/:targetId',
  express.raw({ type: '*/*', limit: '300mb' }),
  (req, res) => {
    const id = req.params.targetId;
    if (!SAFE_ID.test(id)) return res.status(400).json({ error: 'bad targetId' });
    if (denyIfNotOwned(req, res)) return;
    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: 'empty body' });
    }
    try {
      const file = path.join(VIDEO_DIR, id + '.mp4');
      fs.writeFileSync(file, req.body);
      const sizeKB = +(req.body.length / 1024).toFixed(1);
      console.log(`[video-backup user=${req.user.username}] saved ${id} (${sizeKB}KB)`);
      res.json({ ok: true, sizeKB, savedAt: Date.now() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

app.delete('/video-backup/:targetId', (req, res) => {
  const id = req.params.targetId;
  if (!SAFE_ID.test(id)) return res.status(400).end();
  if (denyIfNotOwned(req, res)) return;
  const file = path.join(VIDEO_DIR, id + '.mp4');
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const pipeFile = path.join(PIPE_DIR, id + '.json');
    if (fs.existsSync(pipeFile)) fs.unlinkSync(pipeFile);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// Clip cache — save remote provider clips to local disk so the
// generated video survives Replicate / Kling CDN URL expiry.
//
//   POST /clip-cache/save   body { url, targetId, clipIdx }
//     → downloads url, writes to data/clip-cache/<targetId>/<clipIdx>.mp4
//     → returns { url: '/clip-cache/<targetId>/<clipIdx>.mp4', bytes }
//
//   GET  /clip-cache/:targetId/:filename  (auth + owner-only)
//     → serves the saved mp4
// ============================================================
app.post('/clip-cache/save', express.json({ limit: '1mb' }), async (req, res) => {
  const { url, targetId, clipIdx } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url required (http/https)' });
  if (!targetId || !SAFE_ID.test(String(targetId))) return res.status(400).json({ error: 'bad targetId' });
  const idx = Number.parseInt(clipIdx, 10);
  if (!Number.isFinite(idx) || idx < 0 || idx > 999) return res.status(400).json({ error: 'bad clipIdx' });
  // denyIfNotOwned reads req.params.targetId; on this POST route we get it
  // from the body, so plant it into params for the shared check.
  req.params = req.params || {};
  req.params.targetId = String(targetId);
  if (denyIfNotOwned(req, res)) return;

  try {
    const dir = path.join(CLIP_CACHE_DIR, String(targetId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, idx + '.mp4');
    const upstream = await fetch(url, { headers: { 'User-Agent': 'memorial-clip-cache/1.0' } });
    if (!upstream.ok) {
      const t = await upstream.text().catch(() => '');
      return res.status(502).json({ error: `upstream ${upstream.status}`, body: t.slice(0, 300) });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    // Reject tiny bodies (Replicate returns 39-byte JSON "requested file not found"
    // with HTTP 200 once the URL has expired — we don't want to save that as mp4).
    const ct = upstream.headers.get('content-type') || '';
    if (buf.length < 4096 || /json/i.test(ct)) {
      return res.status(502).json({ error: 'upstream returned non-video body', bytes: buf.length, contentType: ct });
    }
    fs.writeFileSync(dest, buf);
    console.log(`[clip-cache user=${req.user.username}] saved ${targetId}/${idx}.mp4 (${(buf.length/1024).toFixed(0)}KB)`);
    res.json({ ok: true, url: `/clip-cache/${targetId}/${idx}.mp4`, bytes: buf.length });
  } catch (e) {
    console.error('[clip-cache save] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/clip-cache/:targetId/:filename', (req, res) => {
  const { targetId, filename } = req.params;
  if (!SAFE_ID.test(targetId) || !/^\d+\.mp4$/.test(filename)) return res.status(400).end();
  if (denyIfNotOwned(req, res)) return;
  const file = path.join(CLIP_CACHE_DIR, targetId, filename);
  if (!fs.existsSync(file)) return res.status(404).end();
  // CACHE STRATEGY: must-revalidate + ETag-from-mtime/size.
  // The previous max-age=86400 made the browser reuse old mp4 bytes for
  // 24h after regen, so users saw their OLD video even after a new one was
  // cached server-side. Now: 304 when content hash (mtime+size) matches,
  // full body when it changed. Cheap because the file is on local disk.
  try {
    const st = fs.statSync(file);
    const etag = `W/"${st.size}-${st.mtimeMs.toString(36)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    res.setHeader('Last-Modified', new Date(st.mtimeMs).toUTCString());
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
  } catch(_){}
  res.setHeader('Content-Type', 'video/mp4');
  fs.createReadStream(file).pipe(res);
});

// ============================================================
// Image cache — public URL hosting for frame images.
//
// POST /img-cache/upload   body { base64, ext, label? }
//   → writes data/img-cache/<random>.<ext> and returns
//     { url: '<host>/img-cache/<random>.<ext>' }
//   The returned URL is publicly accessible (no auth on GET) so
//   Replicate's worker can fetch it during prediction. We MUST NOT
//   require auth on the GET — Replicate doesn't carry our cookie.
//
// GET  /img-cache/:filename  public, mp4-style streaming
//
// Lifetime: each upload gets a fresh random filename. Old files
// accumulate; cleanup is manual (data/img-cache is git-ignored).
// ============================================================
app.post('/img-cache/upload', express.json({ limit: '50mb' }), (req, res) => {
  const { base64, ext, label } = req.body || {};
  if (!base64 || typeof base64 !== 'string') return res.status(400).json({ error: 'base64 required' });
  const safeExt = (ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  if (!/^(jpg|jpeg|png|webp)$/.test(safeExt)) return res.status(400).json({ error: 'bad ext' });
  // Strip a leading data: prefix if present
  const b64 = base64.replace(/^data:[^;]+;base64,/, '');
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch (e) { return res.status(400).json({ error: 'bad base64' }); }
  if (buf.length < 100) return res.status(400).json({ error: 'too small' });
  if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ error: 'too large (>20MB)' });
  // Random filename — no need to make it predictable; we just need it
  // unique and unguessable enough that nobody scrapes the directory.
  const rand = require('crypto').randomBytes(9).toString('hex');
  const fname = `${rand}.${safeExt === 'jpeg' ? 'jpg' : safeExt}`;
  try {
    fs.writeFileSync(path.join(IMG_CACHE_DIR, fname), buf);
    // Build the public URL using the request's host (works behind
    // Cloudflare tunnel — req.get('host') returns "memorialai.org").
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host  = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${proto}://${host}/img-cache/${fname}`;
    console.log(`[img-cache user=${req.user.username}] saved ${fname} (${(buf.length/1024).toFixed(0)}KB) ${label ? '['+label+']' : ''}`);
    res.json({ ok: true, url, filename: fname, bytes: buf.length });
  } catch (e) {
    console.error('[img-cache upload] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Public GET for the image — no auth gate (Replicate must be able to fetch it).
// The auth middleware at the top of the file blocks /img-cache/* under its
// generic rule; we whitelist this route shape there explicitly.
app.get('/img-cache/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9]{18}\.(jpg|png|webp)$/.test(filename)) return res.status(400).end();
  const file = path.join(IMG_CACHE_DIR, filename);
  if (!fs.existsSync(file)) return res.status(404).end();
  const ext = filename.split('.').pop();
  res.setHeader('Content-Type', ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg'));
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(file).pipe(res);
});

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, args);
    let stderr = '';
    ff.stderr.on('data', d => { stderr += d.toString(); });
    ff.on('close', code => code === 0
      ? resolve(stderr)
      : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-1000)}`)));
    ff.on('error', reject);
  });
}

async function downloadTo(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': 'compose-server/1.0' } });
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

app.post('/compose', async (req, res) => {
  const { clipUrls, slots, bgmUrl, bgmBase64, bgmExt, bgmVolume, xfadeDuration, clipBlobs } = req.body || {};
  if (!Array.isArray(clipUrls) || !Array.isArray(slots)) {
    return res.status(400).json({ error: 'clipUrls (array) and slots (array) required' });
  }
  if (clipUrls.length === 0) {
    return res.status(400).json({ error: 'at least one clipUrl required' });
  }

  const id = crypto.randomUUID();
  const tmpDir = path.join('/tmp', 'compose-' + id);
  fs.mkdirSync(tmpDir, { recursive: true });
  console.log(`[compose ${id}] start — ${clipUrls.length} clips, ${slots.length} slots`);
  const t0 = Date.now();

  try {
    // 1) Resolve every clip slot to a local file path.
    //    - clipBlobs[].idx → write the base64-decoded bytes directly (user-uploaded video)
    //    - otherwise → download from clipUrls[i]
    const blobByIdx = new Map();
    for (const b of (clipBlobs || [])) {
      if (typeof b.idx === 'number' && typeof b.base64 === 'string') blobByIdx.set(b.idx, b);
    }
    const clipPaths = await Promise.all(clipUrls.map(async (u, i) => {
      const ext = (blobByIdx.get(i)?.ext || 'mp4').replace(/^\./, '').replace(/[^a-z0-9]/gi, '') || 'mp4';
      const p = path.join(tmpDir, `clip${i}.${ext}`);
      if (blobByIdx.has(i)) {
        const buf = Buffer.from(blobByIdx.get(i).base64, 'base64');
        fs.writeFileSync(p, buf);
        console.log(`[compose ${id}] user clip ${i} written from blob (${(buf.length/1024/1024).toFixed(1)}MB .${ext})`);
      } else if (u) {
        const bytes = await downloadTo(u, p);
        console.log(`[compose ${id}] downloaded clip ${i} ${(bytes/1024/1024).toFixed(1)}MB`);
      } else {
        throw new Error(`clip ${i}: neither URL nor blob provided`);
      }
      return p;
    }));

    // 2) Make 1s black filler matching the first clip's resolution & codec
    //    so concat -c copy works across all entries.
    const probeOut = await new Promise((resolve, reject) => {
      const pr = spawn('/opt/homebrew/bin/ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt',
        '-of', 'json', clipPaths[0]
      ]);
      let out = '';
      pr.stdout.on('data', d => { out += d.toString(); });
      pr.on('close', code => code === 0 ? resolve(JSON.parse(out)) : reject(new Error('ffprobe failed')));
    });
    const s = probeOut.streams?.[0] || {};
    // Target output dimensions — fixed to 1280×720 so different-sized clips
    // (Kling sometimes returns 1284×716, 1108×828, etc.) can be uniformly
    // normalized before xfade. xfade requires all inputs to match exactly.
    // Even dimensions are also a libx264 requirement.
    const W = 1280, H = 720;
    const TARGET_FPS = 30;
    const fr = s.r_frame_rate || `${TARGET_FPS}/1`;
    const pix = 'yuv420p';
    const blackPath = path.join(tmpDir, 'black.mp4');
    await runFfmpeg([
      '-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${TARGET_FPS}:d=1`,
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', pix,
      '-movflags', '+faststart', blackPath
    ]);

    // 3) Build the sequence of segment paths from the slot list
    const segmentPaths = [];
    for (const slot of slots) {
      if (slot === -1) segmentPaths.push(blackPath);
      else if (slot >= 0 && slot < clipPaths.length) segmentPaths.push(clipPaths[slot]);
      // unknown clip indices are skipped
    }
    if (segmentPaths.length === 0) throw new Error('no playable slots');

    // 4) Probe each segment for its duration (needed for xfade offset chain)
    async function probeDuration(p) {
      return await new Promise((resolve, reject) => {
        const pr = spawn('/opt/homebrew/bin/ffprobe', [
          '-v', 'error', '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1', p
        ]);
        let out = '';
        pr.stdout.on('data', d => { out += d.toString(); });
        pr.on('close', code => code === 0 ? resolve(parseFloat(out.trim()) || 0) : reject(new Error('ffprobe failed for ' + p)));
      });
    }
    const segDurs = [];
    for (const p of segmentPaths) segDurs.push(await probeDuration(p));
    console.log(`[compose ${id}] segment durations:`, segDurs.map(d => d.toFixed(2)));

    // 5) Compose with xfade cross-dissolve transitions between consecutive segments.
    //    xfade duration is capped so it never exceeds half of the shorter neighbour
    //    (so e.g. the 1s black tail doesn't get fully eaten by a 1s fade).
    const requestedXfade = (typeof xfadeDuration === 'number' && xfadeDuration > 0 && xfadeDuration <= 3)
      ? xfadeDuration : 1.0;
    const outPath = path.join(tmpDir, 'out.mp4');

    if (segmentPaths.length === 1) {
      // Single segment — re-encode to normalized W×H so the player gets a
      // predictable file (Kling clips may have odd dimensions like 1284×716).
      await runFfmpeg([
        '-y', '-i', segmentPaths[0],
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS},format=${pix}`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-pix_fmt', pix, '-movflags', '+faststart',
        '-an',
        outPath
      ]);
    } else {
      // Build the xfade filter chain.
      // xfade requires every input feeding into it to have the exact same
      // pixel format, SAR, frame rate and dimensions. Different Kling
      // outputs (e.g. 1284×716 vs 1108×828) crash xfade with
      // "First input link main parameters do not match the corresponding
      // second input link xfade parameters". We pre-normalize each input
      // through scale + pad + setsar + fps + format BEFORE feeding xfade.
      const parts = [];
      // 1) Normalize each segment input: [N:v] → [nN]
      for (let i = 0; i < segmentPaths.length; i++) {
        parts.push(
          `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS},format=${pix}[n${i}]`
        );
      }
      // 2) Chain xfade across the normalized streams.
      //    [n0][n1]xfade=...[v1]; [v1][n2]xfade=...[v2]; ...
      let currentLabel = '[n0]';
      let cumOffset = segDurs[0];
      for (let i = 1; i < segmentPaths.length; i++) {
        const prevDur = segDurs[i - 1];
        const thisDur = segDurs[i];
        const xfd = Math.min(requestedXfade, prevDur / 2, thisDur / 2);
        const offset = (cumOffset - xfd).toFixed(3);
        const outLabel = `[v${i}]`;
        parts.push(`${currentLabel}[n${i}]xfade=transition=fade:duration=${xfd.toFixed(3)}:offset=${offset}${outLabel}`);
        cumOffset = cumOffset + thisDur - xfd;
        currentLabel = outLabel;
      }
      const filterComplex = parts.join(';');

      const args = ['-y'];
      for (const p of segmentPaths) args.push('-i', p);
      args.push(
        '-filter_complex', filterComplex,
        '-map', currentLabel,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', pix,
        '-movflags', '+faststart',
        outPath
      );
      console.log(`[compose ${id}] running xfade chain (${segmentPaths.length} segments, ${requestedXfade}s transitions) — normalized to ${W}×${H}@${TARGET_FPS}fps`);
      await runFfmpeg(args);
    }

    // 5) Optional BGM mux
    let finalPath = outPath;
    let bgmPath = null;
    if (bgmBase64) {
      const ext = (bgmExt || 'mp3').replace(/^\.+/, '');
      bgmPath = path.join(tmpDir, 'bgm.' + ext);
      const buf = Buffer.from(bgmBase64.includes(',') ? bgmBase64.split(',', 2)[1] : bgmBase64, 'base64');
      fs.writeFileSync(bgmPath, buf);
      console.log(`[compose ${id}] bgm received ${(buf.length/1024/1024).toFixed(1)}MB (.${ext})`);
    } else if (bgmUrl) {
      bgmPath = path.join(tmpDir, 'bgm.mp3');
      await downloadTo(bgmUrl, bgmPath);
    }
    if (bgmPath) {
      const vol = (typeof bgmVolume === 'number' && bgmVolume >= 0 && bgmVolume <= 2) ? bgmVolume : 0.4;
      const muxedPath = path.join(tmpDir, 'final.mp4');
      await runFfmpeg([
        '-y', '-i', outPath, '-stream_loop', '-1', '-i', bgmPath,
        '-filter:a', `volume=${vol}`,
        '-c:v', 'copy', '-c:a', 'aac', '-shortest',
        '-movflags', '+faststart', muxedPath
      ]);
      finalPath = muxedPath;
      console.log(`[compose ${id}] bgm muxed at vol=${vol}`);
    }

    // 6) Stream the result
    const stat = fs.statSync(finalPath);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Length', String(stat.size));
    res.set('Cache-Control', 'no-store');
    const stream = fs.createReadStream(finalPath);
    stream.pipe(res);
    stream.on('close', () => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      console.log(`[compose ${id}] done in ${((Date.now()-t0)/1000).toFixed(1)}s — ${(stat.size/1024/1024).toFixed(1)}MB`);
    });
    stream.on('error', err => {
      console.error(`[compose ${id}] stream error`, err);
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });
  } catch (err) {
    console.error(`[compose ${id}] error`, err);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// Dynamic /pet-memorial.html — injects the correct body class (mode-member /
// role-admin) at server-side BEFORE the browser paints anything. This
// eliminates the "flash of admin UI" the member used to see while waiting
// for /whoami to come back. Must run BEFORE express.static.
app.get(['/pet-memorial.html', '/'], (req, res) => {
  try {
    let html = fs.readFileSync(path.join(ROOT, 'pet-memorial.html'), 'utf-8');
    const isMember = req.user?.role === 'member';
    const isAdmin  = req.user?.role === 'admin';
    const bodyClass = isMember
      ? 'mode-member'
      : (isAdmin ? 'mode-admin role-admin' : '');
    const prerole = req.user?.role || 'unknown';
    // Replace plain <body> with the pre-classed body so member view starts
    // immediately on first paint — no admin-UI flash.
    if (bodyClass) {
      html = html.replace(
        /<body([^>]*)>/i,
        `<body$1 class="${bodyClass}" data-prerole="${prerole}">`
      );
    } else {
      html = html.replace(
        /<body([^>]*)>/i,
        `<body$1 data-prerole="${prerole}">`
      );
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch(e){
    res.status(500).send('Failed to render: ' + e.message);
  }
});

// Static last so /compose and /health take precedence
app.use(express.static(ROOT, {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

app.listen(PORT, () => {
  console.log(`compose server  http://localhost:${PORT}  (root: ${ROOT})`);
  console.log(`  GET  /<file>     static`);
  console.log(`  POST /compose    body { clipUrls:[], slots:[], bgmUrl? }`);
  console.log(`  GET  /health`);
});
