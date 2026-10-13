# TrailZ — mobile web app (phase 1: the core loop)

**Saw it on a reel? See it for real.** Paste or share a TikTok, Instagram Reel or YouTube Short; TrailZ works out
what the video really shows and opens the right result screen.

| What the reel turns out to be | Screen |
|---|---|
| Wrong link, profile, private or deleted post | Inline message under the paste box (no AI call, free) |
| One place, confidently identified and confirmed on the map | **Reality Card**: reel vs. reality, authenticity score, best months, cost from Amsterdam, quieter alternatives |
| One place, but unsure which | **Is it one of these?** picker, or type the name |
| Many places (lists, compilations, road trips) | **This reel shows N places in M regions**: map, regions, per-place Reality Cards on tap |
| Travel scenery, no identifiable place | **Places with this vibe** |
| Not about travel | **This doesn't look like a travel video**, with "It is a place, let me say where" |

Works as an installable web app on phones (Android users get **Share → TrailZ** from inside TikTok/Instagram/YouTube).

## How it works

```
paste / share ─► POST /api/checks
                   1. parse link (TikTok, Instagram, YouTube; short links resolved)      free
                   2. same video checked before? reuse the result                         free
                   3. daily limit per device                                              free
                   4. oEmbed: is the post public? caption, creator, thumbnail             free
                   5. Supadata Extract job with our JSON schema                           paid
app polls ─► GET /api/checks/:id   (every 2 s while "Checking your reel" is open)
                   - asks Supadata for the job status (free)
                   - when done: decide the outcome → confirm places on the map
                     (OpenStreetMap) → Gemini writes the Reality Card → save
```

Everything runs in **one Cloudflare Worker**: the React app (static assets) plus the `/api` routes, with a **D1** database.

```
worker/            API (Hono)
  index.ts         routes: start a check, poll it, place cards, feedback, history
  lib/links.ts     link parsing + short-link resolving
  lib/oembed.ts    free public/private check
  lib/supadata.ts  Supadata Extract client
  lib/extract-schema.ts   the "video text record" JSON schema + safe normalizing
  lib/route.ts     decides the outcome (single / pick / multi / vibe / not travel) + region clustering
  lib/analyze.ts   map confirmation + Reality Card generation
  lib/gemini.ts    Gemini prompts with JSON output
  lib/geocode.ts   OpenStreetMap Nominatim lookups, cached in D1
  lib/mock.ts      sample results for mock mode
src/               React app (screens match the TrailZ designs)
shared/types.ts    types shared by both
migrations/        D1 schema
tests/             unit tests (link parsing, outcome routing)
```

## Run it on your computer

Needs Node.js 20+.

```bash
npm install
cp .dev.vars.example .dev.vars      # MOCK_AI=1: sample results, no API keys needed
npm run db:migrate:local
npm run dev                          # open http://localhost:5173 (no Cloudflare login needed)
npm test
```

**Mock mode** picks a sample result from words in the link, so you can try every screen:

| Link contains | Result |
|---|---|
| anything else | Reality Card (Oia, Santorini) |
| `italy`, `gems`, `list` | Many places |
| `hallstatt`, `alps`, `lake` | Is it one of these? |
| `cove`, `beach`, `vibe` | Places with this vibe |
| `pasta`, `cook`, `recipe` | Not a travel video |

e.g. `https://www.tiktok.com/@italy.gems/video/7301234567890000002`

Mock mode is also used automatically when `SUPADATA_API_KEY` is not set, so a first deploy works before the keys exist.

## Deploy (one time, ~20 minutes)

All accounts belong to the Dutch company with EU billing.

1. **Cloudflare**: create an account, add your domain.
2. **Database**:
   ```bash
   npx wrangler login
   npx wrangler d1 create trailz-app      # copy the database_id into wrangler.jsonc
   npm run db:migrate:remote
   ```
3. **Connect GitHub** → Cloudflare dashboard → Workers & Pages → Create → *Import a repository* → this repo.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Non-production branch deploy command: `npx wrangler versions upload`

   Every push to `main` deploys; other branches get their own preview link.
4. **Keys** (dashboard → the Worker → Settings → Variables and secrets, type *Secret*):
   - `SUPADATA_API_KEY` from supadata.ai
   - `GEMINI_API_KEY` from Google AI Studio. Use a **paid** tier for real users: on the free tier
     Google may use the data to improve its products, which is a GDPR problem for EU users.
5. **Variables** in `wrangler.jsonc`:
   - `GEOCODER_CONTACT`: a real email address (required by OpenStreetMap's usage policy)
   - `DAILY_LIMIT`: new AI checks per device per day (default 10)
   - `GEMINI_MODEL`: models to try in order, comma-separated. When Google retires a model the next one is used.
     Open `/api/health?ai=1` to see whether your key and models work, and which model answered.
   - `FALLBACK_MODEL`: a Cloudflare Workers AI model used only when no Gemini model answers (Google overloaded).
     Uses the Worker's `AI` binding, no extra key; free daily allowance, then billed by Cloudflare. Set to `""` to turn off.
   - optional `GEMINI_BASE_URL`: put Cloudflare **AI Gateway** in front of Gemini for logs and cost tracking
6. Open the site on a phone → browser menu → **Add to Home screen**.

## Before real users

- [ ] Lawyer review: Supadata fetching TikTok/Instagram videos, and the privacy policy (GDPR).
- [ ] Data processing agreements with Supadata, Google and Cloudflare.
- [ ] Privacy policy + terms pages, and a "Remove my video" form for creators.
- [ ] Turnstile (bot check) on the paste box if you see abuse.
- [ ] Test 50 real travel reels and compare the place matches with a manual check.
- [ ] OpenStreetMap Nominatim is fine for testing; switch to a commercial places API before launch traffic.
- [ ] Place photos come from Wikipedia/Wikimedia Commons (photographer + licence shown in the viewer). Check the licence wording with the lawyer, or swap in a photo API.
- [ ] Maps use free OpenFreeMap tiles (OpenStreetMap data). Fine to start; consider sponsoring them or self-hosting at scale.
- [ ] Video covers are copied into D1 (`images` table). Move them to R2 when there are many.

## What's next (later phases)

- Accounts (Clerk), saved boards, home city instead of "Amsterdam".
- Trip setup → AI itinerary → Compare & Go with partner prices (Kiwi.com, Booking.com, …).
- Explore feed of curated reels.
- Admin console behind Cloudflare Access (AI review queue uses the `feedback` table already collected).
- Native app wrapper (Capacitor) for the iPhone share sheet.
