# AI Event Mode (`/event`)

A 45-second narrated introduction built for in-person events: a laptop at a
booth, a tablet, or a phone after scanning the QR code. It is a **scripted
presentation**. The seven agents are illustrative roles with recorded voices,
and the PipelineMedic walkthrough is a recorded, simulated incident. Nothing on
the page talks to live infrastructure or an LLM.

| URL | What it is |
|---|---|
| `/event` | Landing page: identity, resume/GitHub/LinkedIn/contact, top projects, architecture explorer, QR, offline prep |
| `/event?source=ai-event` | What the QR code opens (the `source` value only feeds the anonymous `event_view` analytics event) |
| `/event?kiosk=true` | Booth layout: large type, big QR, full-screen button, optional silent replay when idle |
| `/event/emergency.html` | Static fallback: no JavaScript, no audio, no network needed once cached or opened from disk |

The home page, `?careerfair=true`, `/recruiter`, the "Meet My AI Team" tour and
the case-study pages keep working (the home page hero, AI team overlay and
project showcase were redesigned separately).

## How it works

- **Narration**: `data/eventTour.ts` holds the seven lines (caption + spoken
  text + acting direction). `scripts/generate-event-audio.ts` renders them with
  OpenAI `gpt-4o-mini-tts` (stock voices, same casting as `data/agentTeam.ts`),
  trims silence, normalizes loudness to −20 dBFS RMS (peak ≤ −1 dBFS), encodes
  64 kbps mono MP3 and writes the exact durations to
  `data/eventAudioManifest.json`. Playback speed is never altered.
- **Timing**: each scene holds for `max(clip + 60 ms, target slot − handoff)`;
  handoffs are 550 ms (150 ms with reduced motion). The last scene ends when
  Echo finishes, and the closing screen then stays up.
- **Playback** (`hooks/useEventPlayback.ts`): one state machine
  (`idle → preparing → playing ⇄ paused → completed`). All clips are fetched
  and decoded with the Web Audio API before the first scene, so the show makes
  no network requests and only one audio source exists at a time. Rapid
  Next/Previous/Restart is guarded by a run id. A clip that fails to load
  becomes a captions-only scene of the same length.
- **PipelineMedic demo** (`data/eventDemo.ts`): seven stages (detect, context,
  diagnose, policy, approve, MCP call, validate) using the real names, fields,
  thresholds, risk levels and status strings from the PipelineMedic-AI repo,
  each linked to its source file. The values are a sanitized sample. The Kafka
  lag path is implemented in the repo but was not one of the live-injected
  scenarios (those were schema drift, poison message and Airflow failure); the
  architecture panel says so.
- **No live MCP from the browser**: the PipelineMedic MCP server is stdio only.
  No bridge is exposed, and none is needed for the event.

## Regenerating assets

```bash
# Narration (needs OPENAI_API_KEY in .env.local; the key never reaches the browser)
npm run generate:event-audio                      # all seven clips
npm run generate:event-audio -- astra --takes=5   # keep the tightest of 5 takes
# QR codes (SVG, 512 px PNG, 2048 px print PNG) + contact card (name, title, email, links; no phone number, since the file is public); decodes each PNG to verify
npm run generate:event-assets
```

## Running the event build locally (laptop demo)

```bash
npm install
npm run build
npx next start -p 3000        # then open http://localhost:3000/event
```

The page loads fonts, scripts, images and audio from the local server only (a
test asserts zero requests to other hosts). The only thing that fails without
internet is the Vercel analytics script, which is silent.

## Offline options

1. **Browser cache (recommended at the venue).** Open `/event` while online and
   press **Prepare for Offline Demo**. The service worker (`public/sw.js`,
   registered only on that click) downloads everything into a staging cache
   and swaps it in only when every file arrived, so a half-finished prepare
   never replaces a working one. It reads the `/event` HTML to find the exact
   script, style and font files of the current build, then adds the kiosk
   page, narration, portrait, QR, vCard, resume and emergency page. "Offline
   Demo Ready · N files verified" appears only after every file is confirmed
   in Cache Storage.
   - Page loads try the network for 3 seconds, then fall back to the cached
     page, then to the emergency page. The resume PDF is network-first; other
     assets are cache-first.
   - If the cached copy belongs to an older build, the panel says so. Re-press
     **Prepare** after every deploy.
2. **Local server.** The commands above, with the laptop's Wi-Fi off.
3. **Emergency page.** `public/event/emergency.html` opens straight from disk
   (double-click it) and still shows the identity, agents, architecture
   diagram, highlights, contact details and QR code.

A visitor scanning the QR code needs internet on their own phone. Offline mode
only helps the presenter's device.

## Tests

```bash
npm run build
npm run test:e2e        # Playwright, uses the installed Google Chrome
```

`tests/e2e/event.spec.ts` covers:
- the landing page (desktop, Pixel 7 emulation, tablet width) and kiosk mode;
- full silent, narrated and reduced-motion runs: scene order, measured runtime, one audio source at a time, no mid-show requests;
- controls, keyboard, focus return, and audio-failure fallbacks;
- the architecture explorer, QR decoding, the vCard, and the no-JS emergency page;
- offline playback after Prepare, and zero requests to other hosts;
- regression checks for `/`, `?careerfair=true`, `/recruiter` and a case study.

Screenshots: `npx tsx scripts/capture-event-screenshots.ts` against a running
server writes `docs/event-screenshots/`.

## Event-day checklist

**The night before**
- [ ] `git pull`, `npm install`, `npm run build`, and `npm run test:e2e` all pass.
- [ ] Laptop charged, and charger packed.
- [ ] On the deployed site, open `https://lohithkovuri.store/event` in the presenting browser and press **Prepare for Offline Demo**. Wait for "Offline Demo Ready".
- [ ] Turn Wi-Fi off, reload `/event` and `/event?kiosk=true`, and play a narrated run. Turn Wi-Fi back on.
- [ ] As a backup, keep a local build ready (`npx next start`), and confirm `public/event/emergency.html` opens from disk.
- [ ] Print `public/event/qr-event-print.png` (2048 px) with the short URL `lohithkovuri.store/event` under it. Scan the printout with two different phones.
- [ ] Open `/Lohith_Kovuri_Resume.pdf`, GitHub and LinkedIn from the page. All three links work.

**At the booth**
- [ ] Open `/event?kiosk=true` and press **Full screen**.
- [ ] Choose the mode for the room: **Watch Without Sound** in a loud hall, or narrated with speakers or headphones. Set volume with one full run.
- [ ] Captions are on. Press `C` to toggle them.
- [ ] Optional: tick "Replay silently after 60 s idle". It never replays audio on its own.
- [ ] No API keys are needed. Nothing in the show depends on live infrastructure.

**Rehearsal (do it once, end to end)**
1. Start narrated. Confirm each agent speaks in turn, ASTRA → … → ECHO, with captions following.
2. Pause during ATLAS, wait, and resume. The voice and visuals continue from the same point.
3. Press → three times quickly, then ←. Exactly one voice plays.
4. Let it finish. The closing screen stays up with the QR code. It should run about 45 to 47 s.
5. Press **Explore the Architecture** and click through Policy Gateway and MCP Server.
6. Press Esc. The landing page returns with focus on the Start button.
