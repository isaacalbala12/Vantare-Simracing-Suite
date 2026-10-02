import { useMemo, useSyncExternalStore } from "react";

const TICK_MS = 1_000;

let tick = Date.now();
let intervalId: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  intervalId ??= window.setInterval(() => {
    tick = Date.now();
    listeners.forEach((l) => l());
  }, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}

const noopSubscribe = () => () => {};
const getTick = () => tick;

/**
 * Reloj compartido de 1 s: un único `setInterval` para todos los consumidores,
 * que arranca con el primero y para con el último. Si se inyecta `now`
 * (tests), no se suscribe y devuelve ese valor.
 */
export function useNow(now?: Date): Date {
  const shared = useSyncExternalStore(now ? noopSubscribe : subscribe, getTick, getTick);
  return useMemo(() => now ?? new Date(shared), [now, shared]);
}
