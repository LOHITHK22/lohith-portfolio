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
data/                    Typed content — the single source of truth (sourced from the resume + public repos)
lib/                     analytics.ts, vcard.ts, motion.ts, utils.ts
hooks/                   useReducedMotion.ts, useAudioNarration.ts, useSpeechSynthesis.ts
app/projects/[id]/       Case-study pages (content in data/caseStudies.ts)
scripts/
  generate-team-audio.ts  One-time local script — renders data/agentTeam.ts into public/audio/team/*.mp3

public/
  Lohith_Kovuri_Resume.pdf
  images/                Portrait (lohith-portrait-2026.webp; next/image builds responsive sizes)
  audio/team/            Pre-generated "Meet My AI Team" narration clips (see below)
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
`ai_team_open`, `ai_team_start`, `ai_team_complete`, `ai_team_close`, `ai_team_jump`, `hero_cta_click`,
`case_study_view`, `lab_demo_run`, `command_palette_open`, `command_palette_select`, `ask_question`,
`event_view`, `event_start`, `event_complete`, `event_exit`, `event_cta_click`, `event_architecture_open`,
`event_offline_ready`

## Meet My AI Team (narrated agent introduction)

Opened from the hero's "Meet My AI Team" button, the floating launcher, or the command palette. A full-screen
"command center" introduces seven illustrative roles (ASTRA, NOVA, FORGE, ATLAS, PULSE, SENTINEL, ECHO) in a
handoff chain, with a signal animating along each connection as one agent passes to the next. It is a
scripted presentation, not live AI, and the UI says so.

- Never autoplays: the visitor picks "Start with voices" or "Read without audio".
- Controls: pause/resume, previous/next, replay, mute, captions, full transcript, text-only mode, skip intro,
  jump to any agent from the ring or the progress bar. Escape closes; focus is trapped and restored.
- Captions highlight the sentence being spoken (approximate sync from playback position).
- If a clip fails to load, it continues as a captioned presentation.
- The closing screen hosts the grounded "Ask about me" Q&A.

**Audio:** each line in `data/agentTeam.ts` is pre-rendered with OpenAI `gpt-4o-mini-tts`, using stock voices
plus per-agent acting direction (the same casting approach as AutoTube AI Studio). The deployed site only plays
static files. To regenerate after editing a line:

```bash
npm run generate:team-audio            # all clips (needs OPENAI_API_KEY in .env.local)
npm run generate:team-audio -- nova    # just the steps whose id contains "nova"
```

Commit `public/audio/team/*.mp3`.

## AI Event Mode (`/event`)

A 45-second narrated walkthrough for in-person events: seven voiced agents hand off to each other, ATLAS walks
through a recorded, simulated PipelineMedic incident (detect → context → diagnose → policy → approve → MCP call
→ validate), and the closing screen shows a real QR code to `lohithkovuri.store/event?source=ai-event`. Includes
kiosk mode (`/event?kiosk=true`), a "Prepare for Offline Demo" service-worker cache, and a no-JavaScript
emergency page (`/event/emergency.html`). Resume, GitHub, LinkedIn and contact are one tap away without
watching anything.

```bash
npm run generate:event-audio     # narration + measured durations (needs OPENAI_API_KEY in .env.local)
npm run generate:event-assets    # QR SVG/PNG/print PNG + vCard, with decode check
npm run build && npm run test:e2e
```

Full details, offline options and the event-day checklist: [`docs/AI_EVENT_MODE.md`](docs/AI_EVENT_MODE.md).

## AI Lab and case studies

`components/AILab.tsx` holds eight in-browser simulations (agent orchestration, MCP, tool calling, RAG
evaluation, human approval, pipeline monitoring, observability, testing), each linked to the real
PipelineMedic AI file it's based on and labelled as simulated. `/projects/[id]` pages add an interactive
architecture explorer, engineering decisions, evidence links, and stated limitations.

## Recruiter Mode

Reachable in one tap from the nav bar and the hero CTAs, or directly at `/recruiter`. Shows every field from
the brief's "30-second summary" in one dense, fast-loading view: current status, degrees, targeting, top
skills, top 3 projects, certifications, location, and Resume/LinkedIn/GitHub/Email CTAs. Press `Escape` or
tap the close (×) button to return to the full site.

## Content

All facts, numbers, links, and copy live in `data/*.ts` and are sourced exclusively from
`CONTENT_BRIEF.md`. To update content later (a new role, a corrected metric, a new project), edit the
relevant file under `data/` — no component/UI code needs to change.
