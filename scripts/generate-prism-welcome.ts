// Pre-renders PRISM's homepage greeting (data/prismWelcome.ts) into one static
// MP3 with OpenAI gpt-4o-mini-tts (a stock voice not used by the seven
// narrated characters), processed the same way as generate-event-audio.ts:
// raw 24 kHz PCM → trim silence → loudness-normalize → 64 kbps mono MP3.
//
// Caption timing is measured, not guessed: the finished MP3 is transcribed
// once with whisper-1 word timestamps and each caption sentence starts at its
// first word. Results go to data/prismWelcomeManifest.json.
//
// The deployed site only plays the static file; no visitor ever triggers an
// API request and the key never reaches the browser.
//
// Usage:
//   1. Put OPENAI_API_KEY in .env.local
//   2. npm run generate:prism-welcome
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PRISM_GREETING, PRISM_CAPTIONS, PRISM_AUDIO_FILE, PRISM_VOICE } from "../data/prismWelcome";

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
const TAIL_PAD = Math.round(0.2 * SAMPLE_RATE);
const MANIFEST_PATH = join(__dirname, "..", "data", "prismWelcomeManifest.json");

function trimSilence(pcm: Int16Array): Int16Array {
  let start = 0;
  while (start < pcm.length && Math.abs(pcm[start]) < SILENCE) start++;
  let end = pcm.length - 1;
  while (end > start && Math.abs(pcm[end]) < SILENCE) end--;
  return pcm.slice(Math.max(0, start - LEAD_PAD), Math.min(pcm.length, end + TAIL_PAD));
}

/** Gated RMS (ignores near-silent 20 ms windows) so pauses don't skew loudness. */
function normalize(pcm: Int16Array): Int16Array {
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
    if (20 * Math.log10(Math.sqrt(s / (end - i)) + 1e-9) > -50) {
      sumSq += s;
      n += end - i;
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(n, 1));
  const gain = Math.min(Math.pow(10, TARGET_RMS_DBFS / 20) / Math.max(rms, 1e-6), PEAK_LIMIT / Math.max(peak, 1e-6));
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * gain)));
  return out;
}

async function encodeMp3(pcm: Int16Array): Promise<Buffer> {
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

async function synthesize(): Promise<Int16Array> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, voice: PRISM_VOICE.name, input: PRISM_GREETING, instructions: PRISM_VOICE.instructions, response_format: "pcm" }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status} ${await res.text().catch(() => "")}`);
  const raw = Buffer.from(await res.arrayBuffer());
  return new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2)).slice();
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Start time of each caption sentence, from whisper word timestamps of the finished MP3. */
async function captionStarts(mp3: Buffer): Promise<number[]> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }), "prism-welcome.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${API_KEY}` }, body: form });
  if (!res.ok) throw new Error(`transcription failed: ${res.status} ${await res.text().catch(() => "")}`);
  const words: { word: string; start: number }[] = (await res.json()).words ?? [];

  // Walk the transcript in order; each caption starts at the first transcribed
  // word matching its first word, searched after the previous caption's start.
  const starts: number[] = [];
  let from = 0;
  for (const cap of PRISM_CAPTIONS) {
    const first = norm(cap.split(/\s+/)[0]);
    const idx = words.findIndex((w, i) => i >= from && norm(w.word) === first);
    if (idx < 0) throw new Error(`could not align caption "${cap}" (first word "${first}") in the transcript`);
    starts.push(Math.round(words[idx].start * 1000));
    from = idx + 1;
  }
  return starts;
}

async function main() {
  if (!API_KEY) {
    console.error("Missing OPENAI_API_KEY. Add it to .env.local, then re-run this script.");
    process.exit(1);
  }
  process.stdout.write(`PRISM greeting [${PRISM_VOICE.name}] (${PRISM_GREETING.length} chars)... `);
  const pcm = normalize(trimSilence(await synthesize()));
  const mp3 = await encodeMp3(pcm);
  const outPath = join(__dirname, "..", "public", PRISM_AUDIO_FILE);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, mp3);
  const durationMs = Math.round((pcm.length / SAMPLE_RATE) * 1000);
  console.log(`${(durationMs / 1000).toFixed(2)}s, ${(mp3.length / 1024).toFixed(0)} KB -> public${PRISM_AUDIO_FILE}`);

  process.stdout.write("Aligning captions (whisper-1 word timestamps)... ");
  const starts = await captionStarts(mp3);
  console.log(starts.map((s) => `${(s / 1000).toFixed(2)}s`).join(", "));

  const manifest = {
    file: PRISM_AUDIO_FILE,
    durationMs,
    bytes: mp3.length,
    cues: PRISM_CAPTIONS.map((text, i) => ({ startMs: starts[i], endMs: i + 1 < starts.length ? starts[i + 1] : durationMs, text })),
    generatedAt: new Date().toISOString(),
    model: `${MODEL} (stock voice "${PRISM_VOICE.name}"), ${BITRATE} kbps mono, RMS ${TARGET_RMS_DBFS} dBFS; cues from whisper-1 word timestamps`,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Done. Commit public" + PRISM_AUDIO_FILE + " and data/prismWelcomeManifest.json.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
