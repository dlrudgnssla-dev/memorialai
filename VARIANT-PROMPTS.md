# MEMORIAL — Variant.com 단계별 프롬프트

> 각 프롬프트를 **순서대로** Variant 채팅에 복붙하세요.
> 한 번에 다 보내지 말고 한 단계씩 보내면서 결과를 확인하세요.
> 결과가 마음에 들지 않으면 그 단계만 다시 보내 미세 조정 가능.

---

## 🟣 PROMPT 1 — 프로젝트 무드 보드 (가장 먼저 보내기)

```
Create the visual mood board for "MEMORIAL" — a cinematic AI service
that turns photos into moving tribute videos for people, pets, or
moments worth remembering.

VISUAL THEME: "Cosmic Cinema"
- Deep space background, almost pure black with subtle purple/cyan nebula
- Cinematic depth: vignette, film grain, lens flares
- Holographic accents: iridescent borders, chromatic aberration on text
- Floating starfield with twinkle and slow drift
- Serene, mysterious, dignified — not sad

COLOR PALETTE (use as CSS variables):
- bg-deep:    #020108
- accent-A:   #7830d0 (cosmic violet — primary)
- accent-B:   #ff60c0 (magenta nebula)
- accent-C:   #50b0ff (cyan ice giant)
- glow:       rgba(180, 100, 255, 0.7)

TYPOGRAPHY:
- Sans-serif: Helvetica Neue / Inter / Pretendard
- Display headers: weight 200, letter-spacing -0.02em (thin, tight)
- Labels: weight 300, letter-spacing 0.5em, UPPERCASE
- Body: weight 300

REFERENCES:
- Apple Vision Pro launch page
- Linear.app
- Sci-fi films: Interstellar, Dune, Gravity

Generate a mood board / style tile that shows this aesthetic.
```

---

## 🟣 PROMPT 2 — 브랜드 로고 / 워드마크

```
Design a wordmark for "MEMORIAL" — must work as the brand logo for a
cinematic memorial video service.

Variations to explore:
1. Main wordmark: MEMORIAL — weight 200, letter-spacing 0.4–0.5em
2. Wide lockup:  M E M O R I A L — letters spaced further apart
3. Short mark:   M.  or  MEM·
4. With tagline: "MEMORIAL — moving tributes"

Style:
- Thin, refined, cinematic
- Subtle holographic chromatic edge optional
- Should sit on a near-black background
- No icon needed; pure typography focused
- Optional accent: a single small star (✦) or dot
```

---

## 🟣 PROMPT 3 — 회원 첫 진입: 로그인 후 빈 상태 (온보딩 시작 직전)

```
Design the landing state a member sees right after browser Basic Auth
login — the moment before the onboarding wizard begins.

LAYOUT:
- Full-screen cosmic background (deep purple-black gradient)
- Animated starfield (~400 stars with twinkle)
- Soft drifting nebula clouds
- Vignette darkening the corners
- Subtle film grain overlay

CENTER CONTENT:
- A single floating headline:
  "안녕하세요"
  "Welcome to MEMORIAL"
- Below: small thin subtitle
  "Let's create your first memorial"
- Below that: pulsing button "✨ BEGIN"

INTERACTION:
- Headline fades in with subtle blur-pull-focus
- Button has a soft purple-magenta glow that pulses

No header bar, no nav, no chrome. Just the void and a quiet invitation.
```

---

## 🟣 PROMPT 4 — 온보딩 마법사: 호칭 입력 화면 (Step 1)

```
Design Step 1 of a 19-step onboarding wizard that floats in deep space.

SCENE: Cosmic Cinema background (same starfield as before)
NO MODAL FRAME — content floats directly in the void

LAYOUT (centered, vertical):
1. Top: 1px thin gradient progress line (5% filled, violet→magenta)
2. Small label: "STEP 1 · 호칭" — letter-spacing 0.6em, 10px, dim violet
3. Display headline: "안녕하세요, 어떻게 불러드릴까요?"
   - Large 40–52px, weight 200, gradient text (white → lavender → magenta)
   - Subtle text-shadow glow + chromatic aberration ghost
4. Subtitle: "서비스에서 사용할 호칭을 알려주세요" — 13px, letter-spacing 0.15em
5. Input field: just a thin underline, no box
   - Large 28px text, centered, weight 200
   - Underline glows when focused
6. Bottom: "다음 →" button — gradient pill, letter-spacing 0.45em, UPPERCASE
   - "← 뒤로" text-only on the left (subtle)
```

---

## 🟣 PROMPT 5 — 온보딩 마법사: 큰 선택 카드 (Step 2 — 사람/동물)

```
Same cosmic void scene. Design Step 2 where the user picks "사람" or
"반려동물".

LAYOUT:
- Progress line at 10%
- Label: "STEP 2 · 대상"
- Display headline: "누구를 기억하고 싶으신가요?"
- Subtitle: "나중에 더 추가하실 수 있어요"

TWO BIG PILL BUTTONS side-by-side (centered, 18px gap):
- Each pill: 44px vertical padding, 56px horizontal padding
- Glass background (rgba(15,6,32,0.65)) with 24px backdrop-blur
- 1px violet border, sharp 2px radius
- Stacked content: huge emoji (56px, drop-shadow purple) + label below
- Pill A: 🐾 (large) + "반려동물" (UPPERCASE, letter-spacing 0.3em)
- Pill B: 👤 (large) + "사람"

Hover state: pill lifts 4px, holographic chromatic border appears,
gradient glow underneath.

Click auto-advances to next step after 200ms.
```

---

## 🟣 PROMPT 6 — 온보딩 마법사: 성격 테스트 한 문항 (Step 5~17)

```
Design a single question screen of a 13-question personality test
that flows one-at-a-time. Each question takes the full screen.

LAYOUT:
- Progress line at ~50% (animates as user advances)
- Label: "성격 테스트 · 7 / 13"
- Display headline: "[question]"
  e.g. "평소 활동량은 어떤가요?"
- Subtitle: "직감대로 가장 가까운 모습을 골라주세요"

FOUR ANSWER PILLS stacked vertically (14px gap, max-width 540px):
- Each pill: full width, 22px×28px padding
- Left-aligned text, 15px weight 300, line-height 1.5
- Glass background, holographic border on hover
- Click triggers selection glow + 280ms delay then auto-advance

OPTION TEXTS (example):
- "잠시도 가만히 못 있고 늘 뛰어다녀요"
- "적당히 놀고 적당히 쉬어요"
- "대부분 누워서 쉬는 걸 좋아해요"
- "가끔 폭발적으로 놀다가 다시 차분해져요"

Selected pill: gradient violet→magenta fill + bright border + glow.
```

---

## 🟣 PROMPT 7 — 결과: 매칭 행성 Top 3 (Step 18, ⭐ 핵심 화면)

```
Design the result reveal screen — Top 3 matched planets shown as
3D-rendered spheres floating in cosmic space.

LAYOUT:
- Progress line at 95%
- Label: "STEP · 결과"
- Display headline: "✨ 가장 잘 어울리는 별을 찾았어요"
- Subtitle: "행성을 눌러서 선택할 수 있어요"

THREE PLANET CARDS in a responsive grid (auto-fit, min 240px,
40px row gap, 28px column gap, max-width 840px):

CARD #1 (BEST, larger 110% scale):
- Top: gold-pink gradient pill "🥇 BEST"
- Center: 180px planet sphere with atmospheric corona + outer aura halo
  • Planet body: radial gradient (highlight → mid → shadow)
  • Deep inset terminator shadow on the dark side
  • Bright specular highlight bead top-left
  • Saturn-style ring on some planets
  • Color varies by personality: violet, gold, cyan, magenta, etc.
- Name: e.g. "솔라리아" — 32px weight 200, gradient text
- Score line: "매칭 9점" — tiny letter-spacing 0.45em
- Description: "이 행성에 사는 이들은 잠시도 가만 못 있고 활기 넘치는
  에너자이저예요. 늘 신나게 뛰어다녀요."

CARD #2 & #3 (smaller 130px planets, 2위/3위 labels):
- Same structure but smaller scale
- Less prominent

INTERACTION:
- Hover any card → lifts up, planet aura intensifies
- Click → that planet becomes the "selected" one (big aura pulse,
  card scales to 110%)
- Click "다음 →" to proceed

Render the 3 planets as actual 3D-looking CSS spheres, not images.
Each planet should look like a real distant world.
```

---

## 🟣 PROMPT 8 — 사진 업로드: 프레임리스 우주 떠다님 (Step 19, 마지막)

```
Design the photo upload step. No dashed border, no traditional
file-picker box — everything floats in the void.

LAYOUT:
- Progress line at 100%
- Label: "STEP · 마지막"
- Display headline: "사진을 1~5장 띄워주세요"
- Subtitle: "정면·측면·전신이 있으면 더 좋아요"

CENTER PROMPT (clickable, no visible box):
- Just a large floating ✨ icon (56px, purple drop-shadow, gently
  bobbing up/down 6s loop)
- Below: "여기를 눌러 사진 선택" — 15px weight 300
- Tiny line: "PNG · JPG · 최대 5장"

UPLOADED PHOTOS (after selection):
- Appear as floating square thumbnails (88×88, 16px radius)
- Each photo has its own bobbing animation (different phase, 5s loop)
- Purple-magenta glow around each
- Hover: shows × delete button
- Photos stagger in with fade+slide animation

Bottom: "✨ 완료" gradient pill button — same style as before.

The vibe: photos drifting in zero gravity, not pinned to a frame.
```

---

## 🟣 PROMPT 9 — 회원 홈: 영상 컬렉션 갤러리

```
Design the member home — a personal collection page showing all
the videos they've created.

TOP NAV BAR:
- Translucent dark glass with backdrop-blur
- Left: "MEMORIAL" wordmark — weight 200, letter-spacing 0.3em
- Right: minimal — just member name avatar

HERO SECTION (above the fold):
- Large centered block, 72px vertical padding
- Glass card with holographic animated border
- Center: 110px circular avatar with purple-magenta inner glow,
  gently pulsing 5.5s
- Tiny uppercase label: "MEMORIAL · COLLECTION"
- Display name: "{회원이름}의 기억" or "{Name}'s Collection"
  • 60px, weight 200, gradient text (white → lavender → magenta)
  • With chromatic aberration (red/cyan offset ghosts)
- Subtitle: "{N}개의 시네마틱 영상이 빛나고 있어요"
- Gradient pill button: "＋ NEW MEMORIAL" or "＋ 새로 만들기"

COLLECTION GRID (below hero):
- Responsive grid, 1-3 columns (320px min cards)
- Each card: 16:10 photo at top, name + meta below
- Glass card with deep shadow + holographic border on hover
- Cards tilt 3D on mouse hover (perspective 1600px)
- Card lifts 14px + 40px Z translate on hover
- Sheen sweep animation across the photo
- Subtle scanline overlay on photos

Background: same Cosmic Cinema starfield with vignette + grain.
```

---

## 🟣 PROMPT 10 — AI 영상 생성 파이프라인 (작업 화면)

```
Design the 4-step video creation pipeline page.

LAYOUT: vertical stack of large glass cards (rgba(15,6,32,0.55),
30px backdrop-blur, 4px radius, deep purple glow shadows).

CARD 1 — "1️⃣ 대표 이미지 (Hero Image)"
- Empty state: upload area for 1-5 reference photos
- After generation: single large image displayed centered
- Right side: "↻ 재생성" ghost button

CARD 2 — "2️⃣ 프레임별 포즈 (3 Frames)"
- Grid of 3 image cards (1:1 aspect, gap 12px)
- Each card has a checkbox in top-left corner (batch select)
- Each card has "↻ 재생성" small button bottom-center
- Top toolbar: "선택 0" badge + "↻ 선택 재생성" button
- During generation: spinning indicator inside placeholder

CARD 3 — "3️⃣ 동영상 클립 (3 Clips)"
- Grid of 3 video cards (autoplay muted loop after generation)
- Each card shows frame mapping: "프레임 1 → 2"
- Same batch-select UI as Card 2
- Pre-generation: shows start-frame + end-frame side by side

CARD 4 — "4️⃣ 최종 합성"
- Large 16:9 video player at top
- Status text: "✓ 완성! (서버 합성, X.X MB)"
- Two buttons: "⬇ 영상 다운로드" + "🖼 컬렉션에 등록"

All cards use the same glass-purple style as the rest of the site.
Each card has its own progress indicator and retry button.
Cinematic transitions between states.
```

---

## 🟣 PROMPT 11 — 워프 페이지 전환 애니메이션

```
Design a page-transition animation called "WARP" — used whenever
the user navigates from one page to another in member view.

SEQUENCE (760ms total):
1. (0–200ms) Current page starts scaling down + translating into
   the screen's center, blurring slightly
2. (200–500ms) Starfield streaks accelerate outward from center
   like stars at warp speed; a bright white core flash appears
   in the center and grows
3. (500–760ms) White core peaks (50× scale), everything except
   the void is hidden
4. (760–1000ms) New page fades in from the center, scaling up
   from 0.25× back to 1×, with blur 16px → 0

VISUAL CUES:
- Background gets darker during the warp
- Center has a pulsing bright white-purple core flash
- Streaks are conic gradient pattern, blurred slightly
- Vignette intensifies during the transition

Storyboard this in 4–5 keyframes.
```

---

## 🟣 PROMPT 12 — 관리자 디자인 패널 (라이브 에디터)

```
Design a floating right-side panel that lets the admin live-edit
the entire site's visual theme.

PANEL DIMENSIONS:
- 320px wide, max-height calc(100vh - 110px)
- Fixed top-right, 16px margin
- Dark glass with violet glow shadow

HEADER:
- Title: "🎨 디자인 패널"
- × close button

BODY (scrollable, 3 sections):

Section 1 — PRESETS (2-column grid of pill buttons):
- 시네마틱 우주
- 필름 누아르
- 사이버펑크
- 일출
- 파스텔 드림

Section 2 — COLORS (color pickers):
- 주 보라  [color]
- 마젠타  [color]
- 시안    [color]
- 배경    [color]

Section 3 — SLIDERS:
- 글로우 강도
- 비네팅
- 필름 그레인
- 별 밀도
- 글래스 블러
- 글래스 농도
- 코너 둥글기
- 글자 간격
- 제목 굵기
- 애니 속도

Each slider: label + current value badge + range input with
purple→magenta gradient track and white sphere thumb.

FOOTER ACTIONS:
- 💾 모두에게 적용 (저장)   ← gradient primary
- ↻ 기본값 리셋
- 📋 JSON 복사
- 📥 JSON 붙여넣기

Behavior: every input change is reflected on the page IMMEDIATELY
(no save needed for preview). Save button writes to server so all
users see the change.
```

---

## 🟣 PROMPT 13 — 모바일 반응형

```
Show the mobile (375px) version of:
1. Member home (collection)
2. Onboarding wizard (any step)
3. Result screen with 3 planets

RULES:
- Hero text shrinks but stays cinematic
- Cards stack to 1 column
- Padding stays generous (24px+ side gutters)
- Pills wrap to multiple lines if needed
- Planets in result screen: 1위 stacks above, 2/3위 side-by-side
- All hover effects → tap states
- Reduce starfield density to ~250 (was 420 on desktop)
- Reduce backdrop-blur to 16px (was 28-30px) for perf

Keep everything else identical to desktop.
```

---

## 사용 순서 추천

1. **PROMPT 1 + 2** 먼저 보내서 무드보드와 로고를 확정
2. **PROMPT 3** 으로 첫 화면 분위기 잡기
3. **PROMPT 9** 로 가장 자주 보이는 메인 페이지부터
4. **PROMPT 4~8** 온보딩 마법사 단계별
5. **PROMPT 10** AI 영상 생성 페이지
6. **PROMPT 11** 트랜지션 영상
7. **PROMPT 12** 관리자 패널
8. **PROMPT 13** 모바일 변형

각 단계가 완성되면 "이건 좋은데 [이 부분]을 [이렇게] 바꿔줘"로 후속 요청.

---

*MEMORIAL · 2026-05-15 · Prompt pack v1*
