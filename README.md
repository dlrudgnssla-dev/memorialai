# MEMORIAL

> Cinematic AI Tributes — 추모 영상을 AI로 만드는 서비스

별빛 우주를 배경으로 반려동물·가족의 추모 영상을 자동 생성합니다.
이미지 (Gemini) → 프레임 → 영상 클립 (Kling) → ffmpeg 합성까지 전체 파이프라인 자동화.

## Architecture

- **Frontend**: Single-page HTML/CSS/JS (no build step) — `pet-memorial.html`
- **Backend**: Node.js + Express — `server.js`
- **Data storage**: Local filesystem (`data/` — git-ignored)
- **Auth**: Cookie-based session + Basic Auth fallback
- **Public access**: Cloudflare named tunnel → `memorialai.org`

## Quick start (dev)

```bash
# Prerequisites: Node.js 18+
node server.js
# → http://localhost:8765
```

Default admin login: `kosiny / 123456` (change in `data/users.json` for production).

## Features

- ✦ Cinematic onboarding wizard (별빛 / 행성 / 성격 테스트)
- 🐶 강아지 20 성격 preset / 🐱 고양이 19 / 👤 사람 20+ preset
- 🎬 Gemini hero / frame 이미지 + Kling 영상 클립
- 🎵 BGM 업로드 + ffmpeg 합성
- 📱 모바일 최적화 (carousel swipe, autoplay fallback)
- 👥 회원 / 관리자 분리 — admin은 프롬프트·API 키 관리, 회원은 자기 추모대상만

## Project structure

```
.
├── server.js               # Express server (auth, backups, ffmpeg compose, OAuth-ready)
├── pet-memorial.html       # Full SPA (대시보드 + 마법사 + 갤러리)
├── data/                   # Runtime data (git-ignored)
│   ├── users.json          # Admin/member credentials
│   ├── backup.json         # Latest snapshot of all mm_* localStorage keys
│   ├── pipes/              # Per-target pipeline state (rep image, frames, clips)
│   ├── videos/             # Final composed mp4 per target
│   └── onb-states/         # Per-member wizard resume state
├── README.md
├── .gitignore
└── .cloudflared/           # Cloudflare tunnel config (git-ignored)
```

## Deployment

- Cloudflare tunnel (`cloudflared tunnel run memorial`) → `memorialai.org`
- Server must stay running 24/7 — host on Mac mini / Raspberry Pi / VPS

## License

Proprietary — All rights reserved.
