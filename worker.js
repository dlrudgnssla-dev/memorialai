/**
 * Cloudflare Worker: Pet Memorial Kling Proxy + Image Host
 * Ports kling-proxy.py to Workers + R2.
 *
 * Routes:
 *   GET  /          → health
 *   GET  /health    → health
 *   POST /img-upload→ store base64 image in R2, return public URL
 *   GET  /img/<key> → serve image from R2
 *   *    /v1/*      → forward to https://api-singapore.klingai.com
 */

const KLING_HOST = "api-singapore.klingai.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, ngrok-skip-browser-warning, x-ngrok-skip-browser-warning",
  "Access-Control-Max-Age": "86400",
};

function withCors(headers = {}) {
  return { ...CORS, ...headers };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: withCors({ "Content-Type": "application/json" }),
  });
}

function base64ToBytes(b64) {
  if (b64.includes(",")) b64 = b64.split(",", 2)[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const EXT_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

async function handleImgUpload(request, env, url) {
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  const b64 = data.base64 || data.data || "";
  const ext = String(data.ext || "jpg").replace(/^\.+/, "").toLowerCase();
  if (!b64) return jsonResponse({ error: "base64 비어있음" }, 400);

  let bytes;
  try {
    bytes = base64ToBytes(b64);
  } catch (e) {
    return jsonResponse({ error: "base64 디코드 실패: " + e.message }, 400);
  }

  const mime = EXT_MIME[ext] || "application/octet-stream";
  const key = `${crypto.randomUUID().replace(/-/g, "")}.${ext}`;

  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: mime, cacheControl: "public, max-age=3600" },
  });

  const publicUrl = `${url.origin}/img/${key}`;
  return jsonResponse({ url: publicUrl, size: bytes.length });
}

async function handleImgGet(path, env) {
  const key = decodeURIComponent(path.slice("/img/".length).split("?")[0]);
  if (!key) return new Response("not found", { status: 404, headers: CORS });

  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response("not found", { status: 404, headers: CORS });

  const headers = new Headers(CORS);
  headers.set("Content-Type", obj.httpMetadata?.contentType || "image/jpeg");
  headers.set("Cache-Control", "public, max-age=3600");
  if (obj.size != null) headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

async function handleKlingProxy(request, path, url) {
  const target = `https://${KLING_HOST}${path}${url.search}`;

  const fwdHeaders = new Headers();
  const allowFwd = new Set(["authorization", "content-type", "accept"]);
  for (const [k, v] of request.headers) {
    if (allowFwd.has(k.toLowerCase())) fwdHeaders.set(k, v);
  }
  if (!fwdHeaders.has("User-Agent")) {
    fwdHeaders.set(
      "User-Agent",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
  }
  if (!fwdHeaders.has("Accept")) fwdHeaders.set("Accept", "application/json, */*;q=0.5");
  fwdHeaders.set("Accept-Language", "ko,en-US;q=0.9,en;q=0.8");

  const init = { method: request.method, headers: fwdHeaders };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return jsonResponse({ error: "proxy_error", message: e.message }, 502);
  }

  const drop = new Set([
    "transfer-encoding",
    "content-encoding",
    "connection",
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
  ]);
  const respHeaders = new Headers(CORS);
  for (const [k, v] of upstream.headers) {
    if (!drop.has(k.toLowerCase())) respHeaders.set(k, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

async function handleVideoProxy(url) {
  const target = url.searchParams.get("url");
  if (!target) return jsonResponse({ error: "url query param required" }, 400);
  let u;
  try { u = new URL(target); } catch { return jsonResponse({ error: "invalid url" }, 400); }
  if (!/(^|\.)klingai\.com$/i.test(u.hostname)) {
    return jsonResponse({ error: "host not allowed", host: u.hostname }, 403);
  }
  let upstream;
  try {
    upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "video/*,*/*;q=0.8",
      },
      // Bypass Cloudflare cache so our CORS headers aren't lost on cache hit
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  } catch (e) {
    return jsonResponse({ error: "fetch failed", message: e.message }, 502);
  }
  const passthrough = new Set([
    "content-type", "content-length", "accept-ranges",
    "content-range", "last-modified", "etag",
  ]);
  const respHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (passthrough.has(k.toLowerCase())) respHeaders.set(k, v);
  }
  // Force CORS + no-cache so Cloudflare edge does not strip headers
  for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);
  respHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
  respHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
  respHeaders.set("Timing-Allow-Origin", "*");
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (path === "/" || path === "/health") {
      return jsonResponse({
        ok: true,
        target: `https://${KLING_HOST}`,
        public_base: url.origin,
      });
    }

    if (path === "/img-upload" && request.method === "POST") {
      return handleImgUpload(request, env, url);
    }

    if (path.startsWith("/img/")) {
      return handleImgGet(path, env);
    }

    if (path.startsWith("/v1/")) {
      return handleKlingProxy(request, path, url);
    }

    if (path === "/video-proxy") {
      return handleVideoProxy(url);
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
};
