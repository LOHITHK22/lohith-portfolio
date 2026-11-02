// One narrator at a time. Each audio source on the site announces when it starts
// playing; every other source stops when it hears that. This covers players built
// on detached Audio() elements, whose "play" events never reach the document.
export const SITE_AUDIO_EVENT = "site-audio-start";

export type AudioOwner = "prism" | "agent-hq";

export function announceAudio(owner: AudioOwner) {
  window.dispatchEvent(new CustomEvent(SITE_AUDIO_EVENT, { detail: { owner } }));
}

/** Calls `stop` whenever a different source starts. Returns the unsubscribe function. */
export function onOtherAudio(owner: AudioOwner, stop: () => void) {
  const handler = (e: Event) => {
    if ((e as CustomEvent<{ owner: AudioOwner }>).detail?.owner !== owner) stop();
  };
  window.addEventListener(SITE_AUDIO_EVENT, handler);
  return () => window.removeEventListener(SITE_AUDIO_EVENT, handler);
}
