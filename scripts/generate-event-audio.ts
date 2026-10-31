// Pre-renders the seven /event narration lines in data/eventTour.ts with
// OpenAI gpt-4o-mini-tts (stock voices, same casting as data/agentTeam.ts),
// then post-processes them locally so the presentation sounds even:
//
//   1. request raw 24 kHz 16-bit mono PCM
//   2. trim leading/trailing silence (keeps a short natural pad)
//   3. normalize loudness to a common RMS target, peak-limited to -1 dBFS
//   4. encode to 64 kbps mono MP3 (pure JS, no ffmpeg needed)
//   5. record the exact duration of each clip in data/eventAudioManifest.json
//
// Playback speed is never changed. The deployed site only plays the static
// files; the API key never reaches the browser.
//
// Usage:
//   1. Put OPENAI_API_KEY in .env.local
//   2. npm run generate:event-audio            (all clips)
//      npm run generate:event-audio -- atlas   (only scenes whose id or agent matches)
//      npm run generate:event-audio -- astra --takes=4   (keep the tightest of 4 takes)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { agentById } from "../data/agentTeam";
import { eventScenes, HANDOFF_MS, POST_CLIP_HOLD_MS } from "../data/eventTour";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o-mini-tts";
const SAMPLE_RATE = 24000;
const BITRATE = 64;
const TARGET_RMS_DBFS = -20;
const PEAK_LIMIT = 0.89; // -1 dBFS
const SILENCE = 0.012 * 32768;
const LEAD_PAD = Math.round(0.08 * SAMPLE_RATE);
const TAIL_PAD = Math.round(0.15 * SAMPLE_RATE);

const takesArg = process.argv.find((a) => a.startsWith("--takes="));
const TAKES = Math.max(1, Number(takesArg?.split("=")[1] ?? 1));

const MANIFEST_PATH = join(__dirname, "..", "data", "eventAudioManifest.json");

function trimSilence(pcm: Int16Array): Int16Array {
  let start = 0;
  while (start < pcm.length && Math.abs(pcm[start]) < SILENCE) start++;
  let end = pcm.length - 1;
  while (end > start && Math.abs(pcm[end]) < SILENCE) end--;
  return pcm.slice(Math.max(0, start - LEAD_PAD), Math.min(pcm.length, end + TAIL_PAD));
}

/** Gated RMS (ignores near-silent 20 ms windows) so pauses don't skew loudness. */
function normalize(pcm: Int16Array): { out: Int16Array; gainDb: number } {
  const win = Math.round(0.02 * SAMPLE_RATE);
  let sumSq = 0;
  let n = 0;
  let peak = 0;
  for (let i = 0; i < pcm.length; i += win) {
    let s = 0;
    const end = Math.min(pcm.length, i + win);
    for (let j = i; j < end; j++) {
      const v = pcm[j] / 32768;
      s += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    const rms = Math.sqrt(s / (end - i));
    if (20 * Math.log10(rms + 1e-9) > -50) {
      sumSq += s;
      n += end - i;
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(n, 1));
  let gain = Math.pow(10, TARGET_RMS_DBFS / 20) / Math.max(rms, 1e-6);
  gain = Math.min(gain, PEAK_LIMIT / Math.max(peak, 1e-6));
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * gain)));
  return { out, gainDb: 20 * Math.log10(gain) };
}

async function encodeMp3(pcm: Int16Array): Promise<Buffer> {
  // ESM-only build; a static import resolves to the IIFE bundle under tsx.
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, SAMPLE_RATE, BITRATE);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const buf = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (buf.length) chunks.push(new Uint8Array(buf));
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(new Uint8Array(tail));
  return Buffer.concat(chunks);
}

async function synthesize(input: string, voice: string, instructions: string): Promise<Int16Array> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, voice, input, instructions, response_format: "pcm" }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status} ${await res.text().catch(() => "")}`);
  const raw = Buffer.from(await res.arrayBuffer());
  return new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2)).slice();
}

async function main() {
  if (!API_KEY) {
    console.error("Missing OPENAI_API_KEY. Add it to .env.local, then re-run this script.");
    console.error("Missing clips:", eventScenes.map((s) => `public${s.audioFile}`).join(", "));
    process.exit(1);
  }

  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const scenes = only ? eventScenes.filter((s) => s.id.includes(only) || s.agentId.includes(only)) : eventScenes;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  manifest.clips ??= {};

  console.log(`Generating ${scenes.length} event clip(s) with ${MODEL}...`);
  for (const scene of scenes) {
    const agent = agentById[scene.agentId];
    const outPath = join(__dirname, "..", "public", scene.audioFile);
    mkdirSync(dirname(outPath), { recursive: true });
    process.stdout.write(`  ${scene.id} [${agent.name} / ${agent.voice.name}]... `);

    // Optionally record several takes and keep the tightest one, the way a
    // director picks a take. Speed is never altered.
    let pcm: Int16Array | null = null;
    for (let take = 0; take < TAKES; take++) {
      const candidate = trimSilence(await synthesize(scene.spoken, agent.voice.name, scene.instructions));
      if (!pcm || candidate.length < pcm.length) pcm = candidate;
    }
    const { out, gainDb } = normalize(pcm!);
    const mp3 = await encodeMp3(out);
    writeFileSync(outPath, mp3);

    const durationMs = Math.round((out.length / SAMPLE_RATE) * 1000);
    manifest.clips[scene.id] = { file: scene.audioFile, durationMs, bytes: mp3.length };
    console.log(`${(durationMs / 1000).toFixed(2)}s, gain ${gainDb >= 0 ? "+" : ""}${gainDb.toFixed(1)} dB, ${(mp3.length / 1024).toFixed(0)} KB`);
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.model = `${MODEL} (stock voices), ${BITRATE} kbps mono, RMS ${TARGET_RMS_DBFS} dBFS`;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  // Report the planned runtime with the measured clips.
  let total = 0;
  eventScenes.forEach((s, i) => {
    const clip = manifest.clips[s.id]?.durationMs ?? 0;
    const last = i === eventScenes.length - 1;
    const hold = last ? clip + POST_CLIP_HOLD_MS : Math.max(clip + POST_CLIP_HOLD_MS, s.targetMs - HANDOFF_MS);
    total += hold + (last ? 0 : HANDOFF_MS);
    console.log(`    ${s.id.padEnd(14)} clip ${(clip / 1000).toFixed(2)}s  scene ${((hold + (last ? 0 : HANDOFF_MS)) / 1000).toFixed(2)}s  (target ${(s.targetMs / 1000).toFixed(0)}s)`);
  });
  console.log(`\nPlanned runtime: ${(total / 1000).toFixed(2)}s (goal 43-47s). Manifest: data/eventAudioManifest.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
