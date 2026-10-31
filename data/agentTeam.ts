// "Meet My AI Team": a scripted, narrated introduction. The seven agents are
// illustrative roles for the disciplines used to plan, build, and check this
// site. They are NOT autonomous agents running in the visitor's browser, and
// the UI says so.
//
// `caption` is what visitors read. `spoken` is what the TTS engine reads (same
// words, with acronyms spelled out so they're pronounced correctly). If you
// edit either, re-run `npm run generate:team-audio`.

export type AgentId = "astra" | "nova" | "forge" | "atlas" | "pulse" | "sentinel" | "echo";

export type Agent = {
  id: AgentId;
  name: string;
  role: string;
  /** Short handle shown under the avatar. */
  short: string;
  /** Accent color for the avatar ring, speaking indicator, and handoff signal. */
  color: string;
  /** Two-letter glyph rendered inside the avatar (no fake human faces). */
  glyph: string;
  responsibilities: string[];
  /**
   * OpenAI gpt-4o-mini-tts stock voice + acting direction, cast the same way
   * as the AutoTube AI Studio voice catalogue. Stock voices only, no cloning.
   */
  voice: { name: string; instructions: string };
};

export const agents: Agent[] = [
  {
    id: "astra",
    name: "ASTRA",
    role: "Chief Orchestrator",
    short: "Orchestration",
    color: "#22d3ee",
    glyph: "As",
    responsibilities: [
      "Audits requirements and the existing repository",
      "Breaks work into phases and tracks dependencies",
      "Reviews completion evidence before sign-off",
    ],
    voice: {
      name: "sage",
      instructions: "Calm, measured, and assured, like a mission lead opening a briefing. Warm but precise, unhurried pacing.",
    },
  },
  {
    id: "nova",
    name: "NOVA",
    role: "Creative Director & UI/UX",
    short: "Design",
    color: "#a78bfa",
    glyph: "No",
    responsibilities: [
      "Visual identity, typography, and color system",
      "Portrait-led hero and layout hierarchy",
      "Component specs and visual consistency",
    ],
    voice: {
      name: "coral",
      instructions: "Warm, confident, and expressive, like a creative director who loves the craft. Light smile in the voice.",
    },
  },
  {
    id: "forge",
    name: "FORGE",
    role: "Frontend Engineering",
    short: "Frontend",
    color: "#f59e0b",
    glyph: "Fo",
    responsibilities: [
      "Implements designs as responsive React components",
      "Builds case-study pages and interactive diagrams",
      "Makes every control keyboard-operable",
    ],
    voice: {
      name: "ash",
      instructions: "Clear, modern, and direct, like a hands-on engineer explaining what they built. Steady energy.",
    },
  },
  {
    id: "atlas",
    name: "ATLAS",
    role: "AI Systems Architect",
    short: "Architecture",
    color: "#34d399",
    glyph: "At",
    responsibilities: [
      "Verifies project claims against real repositories",
      "Designs accurate architecture visualizations",
      "Explains MCP, tool calling, RAG, and orchestration",
    ],
    voice: {
      name: "onyx",
      instructions: "Deep, steady, and authoritative, like a principal architect walking through a system design. Deliberate pacing.",
    },
  },
  {
    id: "pulse",
    name: "PULSE",
    role: "Motion & Performance",
    short: "Performance",
    color: "#f472b6",
    glyph: "Pu",
    responsibilities: [
      "Transitions, handoff animations, and motion tuning",
      "Image optimization and lazy loading",
      "Reduced-motion support and mobile responsiveness",
    ],
    voice: {
      name: "verse",
      instructions: "Energetic and upbeat, quick but articulate, like someone who obsesses over speed and smoothness.",
    },
  },
  {
    id: "sentinel",
    name: "SENTINEL",
    role: "Testing, Security & QA",
    short: "Quality",
    color: "#60a5fa",
    glyph: "Se",
    responsibilities: [
      "Runs builds, lint, and type checks",
      "Tests navigation, links, accessibility, and layouts",
      "Checks every claim has evidence behind it",
    ],
    voice: {
      name: "alloy",
      instructions: "Even, precise, and serious, like a careful QA lead. Crisp consonants, no hype.",
    },
  },
  {
    id: "echo",
    name: "ECHO",
    role: "Voice & Presentation",
    short: "Voice",
    color: "#fb7185",
    glyph: "Ec",
    responsibilities: [
      "Writes and records each agent's narration",
      "Syncs audio with captions and avatars",
      "Provides transcripts and a no-audio mode",
    ],
    voice: {
      name: "nova",
      instructions: "Bright, friendly, and polished, like a presenter hosting a live showcase. Inviting tone.",
    },
  },
];

export type TeamStep = {
  id: string;
  agentId: AgentId;
  caption: string;
  spoken: string;
  audioFile: string;
};

export const teamSteps: TeamStep[] = [
  {
    id: "astra-intro",
    agentId: "astra",
    caption:
      "Hello, and welcome to Lohith's AI engineering portfolio. I'm Astra, the orchestration agent. My job is to turn complex requirements into an organized engineering workflow. I coordinate the specialists responsible for design, development, architecture, performance, and testing. Every system starts with a clear plan. Let me introduce you to Nova, our creative director.",
    spoken:
      "Hello, and welcome to Lohith's AI engineering portfolio. I'm Astra, the orchestration agent. My job is to turn complex requirements into an organized engineering workflow. I coordinate the specialists responsible for design, development, architecture, performance, and testing. Every system starts with a clear plan. Let me introduce you to Nova, our creative director.",
    audioFile: "/audio/team/astra-intro.mp3",
  },
  {
    id: "nova",
    agentId: "nova",
    caption:
      "Thanks, Astra. Hello, I'm Nova, the design agent. I turn ideas into intuitive, visually compelling digital experiences. I focus on the interface, visual hierarchy, usability, and consistency. My goal is to make complex technology feel elegant and understandable. Once the design is ready, I pass it to Forge, who brings it to life.",
    spoken:
      "Thanks, Astra. Hello, I'm Nova, the design agent. I turn ideas into intuitive, visually compelling digital experiences. I focus on the interface, visual hierarchy, usability, and consistency. My goal is to make complex technology feel elegant, and understandable. Once the design is ready, I pass it to Forge, who brings it to life.",
    audioFile: "/audio/team/nova.mp3",
  },
  {
    id: "forge",
    agentId: "forge",
    caption:
      "Thanks, Nova. I'm Forge, the frontend engineering agent. I transform design systems into working applications, building responsive interfaces, interactive components, and polished user experiences. But beautiful interfaces are only part of the story. Atlas, our systems architect, connects them to the engineering behind Lohith's projects.",
    spoken:
      "Thanks, Nova. I'm Forge, the frontend engineering agent. I transform design systems into working applications, building responsive interfaces, interactive components, and polished user experiences. But beautiful interfaces are only part of the story. Atlas, our systems architect, connects them to the engineering behind Lohith's projects.",
    audioFile: "/audio/team/forge.mp3",
  },
  {
    id: "atlas",
    agentId: "atlas",
    caption:
      "Hello, I'm Atlas. I focus on AI architecture, agent orchestration, tool calling, and data infrastructure. Here, you'll explore systems such as PipelineMedic AI, which combines deterministic incident detection, LLM-assisted diagnosis, and controlled tool execution through MCP. Engineering isn't just about making an AI system respond. It's about ensuring its actions are structured, traceable, and reliable. Now let's hand things to Pulse.",
    spoken:
      "Hello, I'm Atlas. I focus on AI architecture, agent orchestration, tool calling, and data infrastructure. Here, you'll explore systems such as Pipeline Medic A.I., which combines deterministic incident detection, L-L-M assisted diagnosis, and controlled tool execution through M-C-P. Engineering isn't just about making an AI system respond. It's about ensuring its actions are structured, traceable, and reliable. Now, let's hand things to Pulse.",
    audioFile: "/audio/team/atlas.mp3",
  },
  {
    id: "pulse",
    agentId: "pulse",
    caption:
      "Thanks, Atlas. I'm Pulse, the performance and optimization agent. My responsibility is to make every interaction feel smooth and responsive, from animated workflows to page loading and mobile performance. A sophisticated system shouldn't have to sacrifice usability for visual impact. Once everything is tuned, Sentinel checks whether it actually works.",
    spoken:
      "Thanks, Atlas. I'm Pulse, the performance and optimization agent. My responsibility is to make every interaction feel smooth and responsive, from animated workflows, to page loading, and mobile performance. A sophisticated system shouldn't have to sacrifice usability for visual impact. Once everything is tuned, Sentinel checks whether it actually works.",
    audioFile: "/audio/team/pulse.mp3",
  },
  {
    id: "sentinel",
    agentId: "sentinel",
    caption:
      "Hello, I'm Sentinel. My responsibility is quality, reliability, accessibility, and security. I inspect interactions, verify engineering claims, run tests, and identify problems before they reach users. A feature isn't finished simply because it looks complete. It needs evidence that it works. Echo, I'll hand the presentation back to you.",
    spoken:
      "Hello, I'm Sentinel. My responsibility is quality, reliability, accessibility, and security. I inspect interactions, verify engineering claims, run tests, and identify problems before they reach users. A feature isn't finished simply because it looks complete. It needs evidence that it works. Echo, I'll hand the presentation back to you.",
    audioFile: "/audio/team/sentinel.mp3",
  },
  {
    id: "echo",
    agentId: "echo",
    caption:
      "Thanks, Sentinel. I'm Echo, the voice and presentation agent. I bring this engineering workflow to life through narration, synchronized visuals, and accessible explanations. Together, our team represents the different disciplines involved in building reliable digital systems. Now that you've met us, let's explore the real projects behind Lohith's work. Astra, back to you.",
    spoken:
      "Thanks, Sentinel. I'm Echo, the voice and presentation agent. I bring this engineering workflow to life through narration, synchronized visuals, and accessible explanations. Together, our team represents the different disciplines involved in building reliable digital systems. Now that you've met us, let's explore the real projects behind Lohith's work. Astra, back to you.",
    audioFile: "/audio/team/echo.mp3",
  },
  {
    id: "astra-closing",
    agentId: "astra",
    caption:
      "Thank you, Echo. You've met the team. Now explore the systems Lohith has built, examine their architecture, review the engineering decisions, and see how AI, software, and data infrastructure come together. Welcome to the portfolio.",
    spoken:
      "Thank you, Echo. You've met the team. Now, explore the systems Lohith has built. Examine their architecture, review the engineering decisions, and see how AI, software, and data infrastructure come together. Welcome to the portfolio.",
    audioFile: "/audio/team/astra-closing.mp3",
  },
];

export const agentById = Object.fromEntries(agents.map((a) => [a.id, a])) as Record<AgentId, Agent>;

/** Fallback pacing for no-audio mode: roughly 2.6 words per second. */
export function readingTimeMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(4000, Math.round((words / 2.6) * 1000));
}
