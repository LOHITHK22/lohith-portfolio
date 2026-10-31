// Pre-renders every "Meet My AI Team" line in data/agentTeam.ts into a static
// MP3 with OpenAI gpt-4o-mini-tts (stock voices + per-agent acting direction,
// the same casting approach as AutoTube AI Studio). Writes to
// public/audio/team/. The deployed site only plays these static files; the
// API key never ships to the browser.
//
// Usage:
//   1. Put OPENAI_API_KEY in .env.local
//   2. npm run generate:team-audio            (all clips)
//      npm run generate:team-audio -- nova    (only steps whose id matches)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { agentById, teamSteps } from "../data/agentTeam";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o-mini-tts";

async function main() {
  if (!API_KEY) {
    console.error("Missing OPENAI_API_KEY. Add it to .env.local, then re-run this script.");
    process.exit(1);
  }

  const only = process.argv[2];
  const steps = only ? teamSteps.filter((s) => s.id.includes(only)) : teamSteps;
  const outDir = join(__dirname, "..", "public");

  console.log(`Generating ${steps.length} clip(s) with ${MODEL}...`);

  for (const step of steps) {
    const agent = agentById[step.agentId];
    const outPath = join(outDir, step.audioFile);
    mkdirSync(dirname(outPath), { recursive: true });
    process.stdout.write(`  ${step.id} [${agent.voice.name}] (${step.spoken.length} chars)... `);

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        voice: agent.voice.name,
        input: step.spoken,
        instructions: agent.voice.instructions,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      console.log("FAILED");
      throw new Error(`TTS failed for "${step.id}": ${res.status} ${await res.text().catch(() => "")}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buffer);
    console.log(`done (${(buffer.length / 1024).toFixed(0)} KB) -> public${step.audioFile}`);
  }

  console.log("\nDone. Commit the public/audio/team/*.mp3 files.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
