// Window-event bridge so any button (hero, nav, command palette) can open the
// "Meet My AI Team" experience without importing its heavy module.
export const OPEN_AGENT_TEAM_EVENT = "open-ai-team";

export function openAgentTeam() {
  window.dispatchEvent(new Event(OPEN_AGENT_TEAM_EVENT));
}
