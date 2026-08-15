# Lohith Kovuri — Portfolio

A production-ready, mobile-first Next.js portfolio built for career fairs: recruiters scan a QR code
printed on a shirt and land on a page designed to answer "who is this candidate, what do they know, what
have they built, how do I contact them" in under 30 seconds on a phone.

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, lucide-react, and
`@vercel/analytics`. All content lives in `data/*.ts`, sourced from `CONTENT_BRIEF.md`.

## Tech stack

- **Next.js 14** (App Router, React Server Components)
- **TypeScript** (strict mode)
- **Tailwind CSS** — utility-first styling, dark-mode-first design tokens in `tailwind.config.ts`
- **Framer Motion** — scroll-triggered reveals and micro-interactions, respecting `prefers-reduced-motion`
- **lucide-react** — icon set
- **@vercel/analytics** — cookie-free, privacy-conscious event tracking (see `lib/analytics.ts`)

No 3D/WebGL library is used — the hero background is pure CSS + SVG to keep the bundle light.

## Project structure

```
app/                    Routes (App Router)
  page.tsx              Home page — assembles all sections, reads ?careerfair=true
  recruiter/page.tsx     /recruiter — the 30-second recruiter summary
  layout.tsx             Root layout, fonts, metadata, skip link, <Analytics />
  opengraph-image.tsx    Generated OG/social share image (next/og)
  icon.svg                Favicon
  globals.css             Tailwind layers + base styles

components/             Presentation only — no hardcoded copy, all data comes from data/
data/                    Typed content — the single source of truth (mirrors CONTENT_BRIEF.md)
lib/                     analytics.ts, vcard.ts, motion.ts, utils.ts
hooks/                   useReducedMotion.ts, useAudioNarration.ts, useSpeechSynthesis.ts
scripts/
  generate-tour-audio.ts  One-time local script — renders data/guidedTour.ts into public/audio/*.mp3

public/
  Lohith_Kovuri_Resume.pdf
  audio/                 Pre-generated AI Pitch narration clips (see "AI Pitch" section below)
```

## Local setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app should start with zero console errors.

## Build

```bash
npm run build
npm run start   # serve the production build locally
```

`npm run build` must complete with no TypeScript errors.

## Environment variables

Copy `.env.example` to `.env.local` and set the production URL once you know it:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SITE_URL=https://your-deployment-url.vercel.app
```

This value feeds `metadataBase`, canonical URLs, and the Open Graph/Twitter share image. It's safe to leave
the placeholder for local development.

## Deploying to Vercel

1. Push this project to a GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel auto-detects Next.js — no build settings need to change.
4. Add the `NEXT_PUBLIC_SITE_URL` environment variable in the Vercel project settings, set to the
   production URL Vercel assigns you (e.g. `https://lohith-portfolio.vercel.app`), then redeploy so
   metadata picks it up.
5. `@vercel/analytics` works automatically once deployed on Vercel — no extra config needed. Events appear
   under the project's **Analytics** tab.

## QR code for career fairs

1. Deploy the site first and grab the production URL (step 4 above).
2. Generate a QR code that points to:

   ```
   https://<your-production-url>/?careerfair=true
   ```

   The `?careerfair=true` query param triggers **Career Fair Mode** — a condensed banner at the very top of
   the page with the fastest possible path to the resume, top skills, top 3 projects, GitHub, LinkedIn, and
   contact, with minimal motion so it paints fast on crowded venue wifi.
3. Any free QR generator works (e.g. the one built into most phone camera apps' "create QR code" tools, or
   a site like qr-code-generator.com) — just paste the URL above in. Print the code on a shirt, badge, or
   business card.
4. Recruiters scanning the code land directly in Career Fair Mode; the full site (project case studies,
   experience timeline, skills, terminal) is still one scroll away underneath the banner.

## Analytics events

Wired via `lib/analytics.ts` (`track(event, props?)`), backed by `@vercel/analytics`. No PII is ever sent —
only anonymous event names and small string/number props (e.g. a project id):

`qr_landing_view`, `careerfair_mode_view`, `resume_view_click`, `resume_download_click`, `github_click`,
`linkedin_click`, `project_click`, `contact_click`, `recruiter_mode_open`, `vcard_download`, `terminal_open`,
`ai_pitch_start`, `ai_pitch_complete`, `ai_pitch_close`, `ai_pitch_skip`

## AI Pitch (guided audio tour)

A floating "Hear My Pitch" trigger (bottom-right, appears once you scroll past the hero) that auto-scrolls
through Hero → Why Me → Projects → Skills → Experience → Contact while narrating a ~75-90s highlight reel.
Never autoplays — only starts on an explicit click — and is fully controllable (pause/resume, skip, close)
at any time.

**How the audio works:** the narration script in `data/guidedTour.ts` is pre-rendered into static MP3s
via ElevenLabs, *once*, by a local script — not called live per visitor. The deployed site just plays
static files, so there's no runtime API cost, no API key shipped to the browser, and consistent voice
quality on every device. A small glowing orb reacts to the real audio waveform (via the Web Audio API)
while it talks. If the audio files are ever missing (e.g. a fresh clone before running the script), it
falls back to the browser's built-in speech synthesis, and further falls back to silent timed captions if
that's unsupported too — the tour always works, audio quality is just best with the pre-generated files.

To (re)generate the narration after editing `data/guidedTour.ts`:

```bash
cp .env.example .env.local   # if you haven't already
# add your own ELEVENLABS_API_KEY to .env.local (get one at elevenlabs.io)
npm run generate:tour-audio
```

This writes `public/audio/tour-*.mp3` — commit those files so the deployed site has them. The whole script
is ~1,000 characters total (well inside ElevenLabs' free tier), and generation is a one-time cost regardless
of how many recruiters play the pitch afterward.

## Recruiter Mode

Reachable in one tap from the nav bar and the hero CTAs, or directly at `/recruiter`. Shows every field from
the brief's "30-second summary" in one dense, fast-loading view: current status, degrees, targeting, top
skills, top 3 projects, certifications, location, and Resume/LinkedIn/GitHub/Email CTAs. Press `Escape` or
tap the close (×) button to return to the full site.

## Content

All facts, numbers, links, and copy live in `data/*.ts` and are sourced exclusively from
`CONTENT_BRIEF.md`. To update content later (a new role, a corrected metric, a new project), edit the
relevant file under `data/` — no component/UI code needs to change.
