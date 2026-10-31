// Generates the static networking assets for /event and verifies them:
//   public/event/qr-event.svg          vector QR (screens, print shops)
//   public/event/qr-event.png          512 px QR (slides, laptop screen)
//   public/event/qr-event-print.png    2048 px QR (posters, business cards)
//   public/event/lohith-kovuri.vcf     contact card
//
// Each PNG is decoded back with jsQR and must match the intended URL exactly,
// otherwise the script exits non-zero.
//
// Usage: npm run generate:event-assets
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { profile } from "../data/profile";
import { EVENT_QR_URL, EVENT_URL } from "../data/eventTour";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "event");

const qrOptions = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
  color: { dark: "#050814", light: "#ffffff" },
};

function decodePng(path: string): string | null {
  const png = PNG.sync.read(readFileSync(path));
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return result?.data ?? null;
}

function vcard(): string {
  const [first, ...rest] = profile.name.split(" ");
  // Public, crawlable file: email and links only. The phone number stays out
  // (data/profile.ts keeps it off the public page on purpose).
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${rest.join(" ")};${first};;;`,
    `FN:${profile.name}`,
    `TITLE:${profile.headline}`,
    `EMAIL;TYPE=INTERNET:${profile.email}`,
    `URL;TYPE=Portfolio:${EVENT_URL.replace("/event", "")}`,
    `URL;TYPE=LinkedIn:${profile.linkedinUrl}`,
    `URL;TYPE=GitHub:${profile.githubUrl}`,
    "END:VCARD",
    "",
  ].join("\r\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  writeFileSync(join(OUT, "qr-event.svg"), await QRCode.toString(EVENT_QR_URL, { ...qrOptions, type: "svg" }));
  await QRCode.toFile(join(OUT, "qr-event.png"), EVENT_QR_URL, { ...qrOptions, width: 512 });
  await QRCode.toFile(join(OUT, "qr-event-print.png"), EVENT_QR_URL, { ...qrOptions, width: 2048 });
  writeFileSync(join(OUT, "lohith-kovuri.vcf"), vcard());

  let failed = false;
  for (const file of ["qr-event.png", "qr-event-print.png"]) {
    const decoded = decodePng(join(OUT, file));
    const ok = decoded === EVENT_QR_URL;
    failed ||= !ok;
    console.log(`${ok ? "PASS" : "FAIL"}  ${file} decodes to ${decoded ?? "(nothing)"}`);
  }
  console.log(`Wrote public/event/{qr-event.svg, qr-event.png, qr-event-print.png, lohith-kovuri.vcf}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
