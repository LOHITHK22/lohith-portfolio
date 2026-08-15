import { ImageResponse } from "next/og";
import { profile } from "@/data/profile";

export const runtime = "edge";
export const alt = `${profile.name} — ${profile.headline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#05060a",
          backgroundImage:
            "radial-gradient(circle at 15% 15%, rgba(99,102,241,0.35), transparent 45%), radial-gradient(circle at 85% 85%, rgba(34,211,238,0.25), transparent 45%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: "#34d399",
            }}
          />
          <div style={{ display: "flex", color: "#94a3b8", fontSize: 24, letterSpacing: 2 }}>
            AVAILABLE FOR OPPORTUNITIES
          </div>
        </div>
        <div style={{ display: "flex", color: "#f8fafc", fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>
          {profile.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 34,
            fontWeight: 500,
            backgroundImage: "linear-gradient(90deg, #22d3ee, #6366f1, #8b5cf6)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {profile.headline}
        </div>
        <div style={{ display: "flex", marginTop: 36, color: "#cbd5e1", fontSize: 26 }}>
          {profile.subIdentity}
        </div>
      </div>
    ),
    { ...size }
  );
}
