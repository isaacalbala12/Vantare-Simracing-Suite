import { Events } from "@wailsio/runtime";

/**
 * Fanout único del stream de licencia (ISA-1143 / issue #1147, fase 1).
 *
 * `license:changed` y `license:error` se suscribían desde cuatro puntos
 * (LicenseProvider, LoginScreen y las dos operaciones request/response de
 * `entitlements-refresh`), cada uno con su propio `Events.On` de Wails. Este
 * módulo instala una única suscripción por evento cuando llega el primer
 * listener, reparte el payload ya desenvuelto (`event.data`) a todos los
 * suscriptores y retira la suscripción cuando se va el último. Los
 * consumidores siguen acotando la forma del payload como antes: el fanout
 * solo conoce el sobre `{ data }`.
 *
 * Es el mismo patrón que `hub/launcher/launcher-bridge.ts`.
 */

export type Unsubscribe = () => void;
export type LicenseEventListener = (data: unknown) => void;

const changedListeners = new Set<LicenseEventListener>();
const errorListeners = new Set<LicenseEventListener>();
let wailsChangedUnsubscribe: Unsubscribe | null = null;
let wailsErrorUnsubscribe: Unsubscribe | null = null;

function ensureChangedListener(): void {
  if (wailsChangedUnsubscribe) return;
  wailsChangedUnsubscribe = Events.On("license:changed", (event: unknown) => {
    const data = (event as { data?: unknown } | undefined)?.data;
    changedListeners.forEach((listener) => listener(data));
  });
}

function ensureErrorListener(): void {
  if (wailsErrorUnsubscribe) return;
  wailsErrorUnsubscribe = Events.On("license:error", (event: unknown) => {
    const data = (event as { data?: unknown } | undefined)?.data;
    errorListeners.forEach((listener) => listener(data));
  });
}

export function subscribeLicenseChanged(listener: LicenseEventListener): Unsubscribe {
  ensureChangedListener();
  changedListeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    changedListeners.delete(listener);
    if (changedListeners.size === 0) {
      wailsChangedUnsubscribe?.();
      wailsChangedUnsubscribe = null;
    }
  };
}

export function subscribeLicenseError(listener: LicenseEventListener): Unsubscribe {
  ensureErrorListener();
  errorListeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    errorListeners.delete(listener);
    if (errorListeners.size === 0) {
      wailsErrorUnsubscribe?.();
      wailsErrorUnsubscribe = null;
    }
  };
}
