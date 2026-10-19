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

## Phase 2: save → plan → book (built)

- **Save** (heart) on every Reality Card and place. Per device until accounts exist.
- **Saved** tab: **Magic trips**. Saved places are grouped by *Country*, *Nearby* (within ~120 km) or *Region* (nearby
  countries, e.g. Southern Europe), each group with a title, photos, shared vibe and a one-tap **Magic trip** button that
  writes the plan for the whole group in the chosen mood. "Pick places for a trip" remains for a manual selection.
- **Plan**: mood (Solo & slow / Energetic / With friends), days, budget mode → Gemini writes a day-by-day plan
  that reuses what the Reality Cards found (base city, local tips, best months). Saved under **Trips**.
- **Book** = two screens. *Trip setup*: month chips (the Reality Cards' best months marked), three suggested Friday
  starts or a date, flying from, travelers. *Your trip, priced*: one number per person, three decisions (flight → stay
  per base town → activities), each with its best option and a "Book on …" button, the rest folded under "More options",
  partner searches (Kiwi.com, Booking.com, GetYourGuide) as the last rows. Coming back from a partner asks "Did you book
  it?" and ticks the step; Duffel bookings tick themselves. Ranking rule (`rank()` in `worker/lib/prices.ts`): exact
  dates › live › cheapest; an option that earns TrailZ money takes the top slot only within 3 % of the cheapest.
  Tracking: with a **Travelpayouts** account, set `TP_MARKER`, `TP_TRS` and the brand campaign ids (`TP_KIWI_P`, `TP_BOOKING_P`,
  `TP_GYG_P`, `TP_OMIO_P`) in `wrangler.jsonc`; every partner link is then wrapped in Travelpayouts tracking with the trip's
  search filled in. Direct affiliate ids (`KIWI_AFFILIATE_ID`, `BOOKING_AFFILIATE_ID`, `GYG_PARTNER_ID`, `OMIO_PARTNER_ID`) also work.
  Nothing is charged in TrailZ.

## Phase 3: discover and decide (built)

- **Explore** tab: an image-first mosaic (every 7th tile large) of every reel anyone checked, from stored results
  only (no AI or partner calls); each tile carries the deciding facts (score, cost, best months). Filters: *My vibe*
  (overlap with the vibe words of your saves), *Near my places* (within 400 km of a save), *Good in <month>*,
  *Under €…*, search; sort by Trending (checks this week), New, Most real.
- **Reality Card** is ordered by what decides a trip: an "In short" box (score + verdict, best months, cost, flight
  hours + entry rule), then 1 · How real, 2 · When to go, 3 · Real cost, then the map, base city and alternatives.
  Also: "Right now" chip from this month's rating, "When to go on the day" (quiet / busy / closed, tip),
  and a practicalities strip (flight hours, time difference, daily spend, EU-passport entry rule, safety line).
- **Friends**: "Ask friends" on a card or a trip makes a share link (`/s/<token>`), a read-only page with
  *I'm in / Not for me* (one vote per device, name optional, no account). The owner sees the tally on the button.

- **Watch first**: tapping an Explore tile opens the reel full-screen (`/explore/reel/:id`), muted and looping,
  with the deciding facts and a "See the Reality Card" button underneath; swipe for the next reel. Only the reel
  on screen plays. (Playing inside the grid would need hosting the video files, which the platforms don't allow.)

## Phase 4: accounts and first run (built)

- **No login to use it.** Checks, saves, trips, Explore and sharing work on the anonymous device cookie.
- **Google sign-in** (`/api/auth/google/start` → Google → `/api/auth/google/callback`): plain OAuth code flow,
  id token checked with Google's tokeninfo endpoint, 90-day session cookie (`tz_session`, hashed in D1 `sessions`).
  Settings: var `GOOGLE_CLIENT_ID`, secret `GOOGLE_CLIENT_SECRET`; the redirect URI to register in Google Cloud
  is `https://<your host>/api/auth/google/callback`. In mock mode "Continue with Google" signs in a sample user.
- **One owner id.** A logged-in user's rows are keyed `u:<user id>`; on login the device's checks, saves, trips,
  shares, votes and picks move to the account (`mergeDeviceIntoUser`), so every phone they log in on sees the same.
- **Login only for booking**: `/trips/:id/book`, `/prices`, `/handoff` and the Duffel link need an account
  (401 `login_required`); the page shows why and sends the person back to the same trip after Google.
- **First run** (`/welcome`, shown once from Home; deep links skip it): a hook screen, then one-tap picks —
  vibe tiles, who's coming, budget, home city (guessed from the time zone) — then "Continue with Google" or skip.
  Picks are saved as they're made (`profiles`, per device or account) and used for Explore's *My vibe*
  (`VIBE_WORDS`), the trip's origin and traveller count. `/me` shows the account and picks, replays the intro,
  logs out. `/privacy` is the policy page the Google consent screen links to (set `CONTACT_EMAIL`).

## Phase 5: place profiles and prebuilt cards (built)

- **One profile per place, shared by everyone.** The stable part of a Reality Card (months, cost, crowds, practicalities,
  city guide, gems) is stored once in `place_profiles` (keyed by name + country, 180-day refresh). The next reel that
  shows the same place only gets a short "verdict" call (authenticity, summary, reel-vs-reality pairs) on top of it:
  a few seconds instead of a full generation, and the same facts for every user.
- **Cards are written before anyone taps.** After a reel is analysed, the first place's card is built at once; every
  later visit of the result writes one more missing card in the background, and a cron (`*/10 * * * *`) tops up
  recent reels. Builds are locked per place in `kv_cache` (`prebuild:<video>:<place>`) so parallel isolates don't
  write the same card twice. See `worker/lib/cards.ts`, `worker/lib/profiles.ts`.
- **Facts first, verdict after.** `POST /checks/:id/place-card` answers with the place facts as soon as they exist
  (`{ profile, pending: true }` — instantly for a known place, one model call for a new one) and finishes the reel
  verdict in the background; the app shows the card with the score/comparisons shimmering and polls every 2.5 s
  until the full card is stored (`placeCardFull` in `src/api.ts`).

## What's next (later phases)

- Accounts (Clerk), so saves and trips follow the user across devices; home city instead of "Amsterdam".
- Live prices from partner APIs inside Compare & go (today: deep links to their search pages).
- Funnel analytics: reel checked → card viewed → saved → plan made → partner click.
- Explore feed of curated reels.
- Admin console behind Cloudflare Access (AI review queue uses the `feedback` table already collected).
- Native app wrapper (Capacitor) for the iPhone share sheet.
