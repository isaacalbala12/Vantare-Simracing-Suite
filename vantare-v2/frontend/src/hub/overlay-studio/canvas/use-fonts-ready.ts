import { useEffect, useState } from "react";

/**
 * `true` once the document fonts are loaded (or when the environment does not
 * expose FontFaceSet, e.g. tests).
 *
 * Widgets render text with critical metrics: if the first paint happens with
 * the fallback font, the later swap reflows the rows and reads as an initial
 * jump when opening the Studio. Gating the canvas first paint on
 * `document.fonts.ready` removes that race; the safety timeout keeps a broken
 * font from leaving the canvas empty forever.
 */
export function useFontsReady(timeoutMs = 1500): boolean {
  const [ready, setReady] = useState(() => {
    if (typeof document === "undefined" || !document.fonts) {
      return true;
    }
    return document.fonts.status === "loaded";
  });

  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;
    const done = () => {
      if (!cancelled) {
        setReady(true);
      }
    };
    const timer = window.setTimeout(done, timeoutMs);
    void document.fonts?.ready.then(() => {
      window.clearTimeout(timer);
      done();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, timeoutMs]);

  return ready;
}
