// PRISM's homepage greeting. The audio is prerecorded once with
// scripts/generate-prism-welcome.ts; visitors only ever load the static file.
// PRISM itself is the weekly review agent in scripts/agents/prism.mjs: this
// greeting introduces it, it is not a live conversational model.

export const PRISM_GREETING =
  "Welcome to Lohith's portfolio. I'm PRISM, his AI portfolio guide. I help review and improve this website alongside his cloud maintenance agents. Explore his projects, and see the engineering behind the experience.";

/** One caption per spoken sentence, in order. Joined, they equal the greeting. */
export const PRISM_CAPTIONS = [
  "Welcome to Lohith's portfolio.",
  "I'm PRISM, his AI portfolio guide.",
  "I help review and improve this website alongside his cloud maintenance agents.",
  "Explore his projects, and see the engineering behind the experience.",
];

export const PRISM_AUDIO_FILE = "/audio/prism/welcome.mp3";

/** OpenAI gpt-4o-mini-tts stock voice, not one of the seven narrated characters' voices. */
export const PRISM_VOICE = {
  name: "shimmer",
  instructions:
    "A polished, futuristic AI guide welcoming a visitor to an engineering portfolio. Confident, friendly and warm, clearly articulated, natural human pacing with brief pauses between sentences. Never robotic, never salesy.",
};

/** sessionStorage: the greeting already played (or was dismissed) this browsing session. */
export const PRISM_SESSION_KEY = "prism-welcome-heard";
/** localStorage: the visitor's sound preference for PRISM ("on" | "off"). */
export const PRISM_SOUND_KEY = "prism-sound";
