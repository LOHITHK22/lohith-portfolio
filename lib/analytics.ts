import { track as vercelTrack } from "@vercel/analytics";

// Approved event list. It exists so every call site is type-checked against it.
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
  | "ai_team_open"
  | "ai_team_start"
  | "ai_team_complete"
  | "ai_team_close"
  | "ai_team_jump"
  | "hero_cta_click"
  | "case_study_view"
  | "lab_demo_run"
  | "command_palette_open"
  | "command_palette_select"
  | "ask_question"
  | "event_view"
  | "event_start"
  | "event_complete"
  | "event_exit"
  | "event_cta_click"
  | "event_architecture_open"
  | "event_offline_ready"
  | "prism_welcome_play"
  | "prism_welcome_blocked"
  | "prism_welcome_shortcut";

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
