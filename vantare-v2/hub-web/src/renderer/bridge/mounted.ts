/** Tells Main, through the preload, that the real content mounted (#2785). */
export function reportMounted() {
  window.vantare?.mounted?.();
}
