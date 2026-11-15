import { useEffect, useState } from "react";

/** Visual wall clock only; never use for receipts, saves, alerts or launch deadlines. */
export function useVisibleNow(period: number, enabled = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const wake = () => {
      stop();
      if (document.hidden) return;
      // Resume from the current wall clock, not by replaying missed ticks.
      setNow(Date.now());
      timer = window.setInterval(() => setNow(Date.now()), period);
    };
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [period, enabled]);
  return now;
}
