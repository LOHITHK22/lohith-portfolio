import { track as vercelTrack } from "@vercel/analytics";

// Exact event list from CONTENT_BRIEF.md. Keep this union in sync with it —
// it exists so every call site is type-checked against the approved list.
export type AnalyticsEvent =
  | "qr_landing_view"
  | "careerfair_mode_view"
  | "resume_view_click"
  | "resume_download_click"
  | "github_click"
  | "linkedin_click"
  | "project_click"
  | "contact_click"
  | "recruiter_mode_open"
  | "vcard_download"
  | "terminal_open"
  | "ai_pitch_start"
  | "ai_pitch_complete"
  | "ai_pitch_close"
  | "ai_pitch_skip"
  | "command_palette_open"
  | "command_palette_select"
  | "ask_question";

type AnalyticsProps = Record<string, string | number | boolean | null>;

/**
 * Thin, privacy-conscious analytics wrapper around @vercel/analytics.
 * No PII is ever passed — only anonymous event names + small string/number props
 * (e.g. project id). Safe to call from client components; no-ops on the server.
 */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  try {
    vercelTrack(event, props);
  } catch {
    // Swallow analytics errors — never let tracking break the UI.
  }
}
