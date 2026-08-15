// One-time (or re-run-on-edit) local script: pre-renders every line in
// data/guidedTour.ts into a static MP3 via the ElevenLabs API and writes it
// to public/audio/. The deployed site only ever plays these static files —
// this script and the API key it uses never ship to the browser.
//
// Usage:
//   1. Put ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID) in .env.local
//   2. npm run generate:tour-audio
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { guidedTourSteps } from "../data/guidedTour";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const API_KEY = process.env.ELEVENLABS_API_KEY;
// "Adam" — a clear, professional premade ElevenLabs voice. Override with
// ELEVENLABS_VOICE_ID to use any voice from your own library instead.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim() || "pNInz6obpgDQGcFmaJgB";

async function main() {
  if (!API_KEY) {
    console.error(
      "Missing ELEVENLABS_API_KEY. Add it to .env.local (see .env.example), then re-run this script."
    );
    process.exit(1);
  }

  const outDir = join(__dirname, "..", "public", "audio");
  mkdirSync(outDir, { recursive: true });

  console.log(`Generating ${guidedTourSteps.length} narration clips with voice ${VOICE_ID}...`);

  for (const step of guidedTourSteps) {
    const fileName = step.audioFile.replace(/^\/audio\//, "");
    const outPath = join(outDir, fileName);

    process.stdout.write(`  ${step.id} (${step.line.length} chars)... `);

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: step.line,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log("FAILED");
      throw new Error(`ElevenLabs request failed for "${step.id}": ${res.status} ${body}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buffer);
    console.log(`done (${(buffer.length / 1024).toFixed(0)} KB) -> public/audio/${fileName}`);
  }

  console.log("\nAll narration clips generated. Commit the public/audio/*.mp3 files.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
