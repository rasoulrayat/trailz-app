# TrailZ design reference

The design lives in code: `src/styles.css` (tokens + every component class), `src/components/*` and `src/pages/*`.
This file is the short human reference; the rendered screens are in [`design/SCREENS.md`](design/SCREENS.md).

## Principles

- **Mobile first, one hand.** Everything is laid out for a 390 px phone first; tablet/desktop just gets more breathing room (`.page` max-width). Nothing may scroll sideways — `npm run visual` enforces it.
- **Video first.** A reel is shown before it is explained: Explore tiles and the Home trend row open the full-screen reel viewer; the Reality Card is one tap away.
- **Reel vs reality.** The one idea in every card: yellow (`--reel`) is what the reel promised, green (`--real`) is what visitors find. The 0–10 authenticity score is colour-coded good / mid / low.
- **Gen Z tone.** Short lines, direct verbs, no corporate copy. Onboarding is six quick, skippable taps.
- **Glass, not chrome.** The tab bar is a floating iOS-style glass pill that shrinks (`.tabbar.compact`) while scrolling and grows back when you stop.

## Tokens (`:root` in `src/styles.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--navy` | `#0b1b3f` | Text, dark surfaces, hero |
| `--blue` / `--sky` / `--blue-tint` | `#1f5eff` / `#5aa9ff` / `#e1ebff` | Primary actions, links, highlights |
| `--bg` / `--surface` | `#f2f5fb` / `#ffffff` | Page background / cards |
| `--line`, `--line-strong`, `--line-soft` | `#d6deec`, `#b8c4da`, `#e6ecf5` | Borders |
| `--muted`, `--muted-on-dark` | `#4e5d78`, `#afc0e0` | Secondary text |
| `--real`, `--real-tint`, `--real-soft` | `#0e6b5c`, `#dcefea`, `#8cc4b8` | "Reality" green |
| `--reel` | `#f5c518` | "Reel" yellow |
| `--warn`, `--warn-tint`, `--crowded` | `#b42318`, `#fee4e2`, `#e5484d` | Errors, crowded months |
| `--radius-card` / `--radius-lg` | 18 px / 22 px | Cards / sheets |
| `--font` | Lexend | Body (self-hosted, `public/fonts`) |
| `--display` | Bricolage Grotesque | Wordmark, h1 (800 weight, tight tracking) |

Both fonts are bundled under the SIL Open Font License (`public/fonts/OFL-*.txt`).

## Building blocks

- `.page` / `.topbar` — page frame and title row.
- `.card`, `.stack`, `.row`, `.chips .chip`, `.seg .seg-btn` — layout and filter primitives.
- `.btn`, `.icon-btn`, `.icon-btn.on-media` — buttons; `on-media` is the translucent variant over video.
- `.tabbar` (+ `.compact`) — the glass tab bar; `.home { overflow-x: clip }` keeps the trend row from widening the page.
- `.mosaic .tile(.big)` — Explore grid; `.reel-score.good|mid|low`, `.reel-tag` — badges.
- `.reels`, `.reel-slide`, `.reel-stage`, `.reel-overlay` — the full-screen reel viewer.
- `.bsteps .bstep` — booking step chips (renamed from `.steps` after a collision with the analysing steps; `tests/regressions/css-collisions.test.ts` guards against repeats).
- `.skeleton` — loading shimmer; the Reality Card uses it for the verdict while the place facts are already shown.
- `Img` / `PlacePhoto` — images with fade-in and Wikimedia thumbnails sized by `thumb(url, width)`.

## Icons and PWA

- `public/icons/` — app icons; `public/manifest.webmanifest` — name, theme colour (`--navy`), display standalone.
- Share target: on Android the app appears in the TikTok / Instagram / YouTube share sheet.

## How to check a design change

1. `npm run dev` with `MOCK_AI=1` in `.dev.vars` (fake AI + providers).
2. `npm run visual` → screenshots in `visual/` (git-ignored); copy them to `docs/design/screens/` when you want the reference updated.
3. `npm test` includes the CSS-collision guard.
