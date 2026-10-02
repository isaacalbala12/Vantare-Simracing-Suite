import { Events } from "@wailsio/runtime";
import { UPDATER_CHANNEL_EVENT } from "./updater-channel";

/**
 * Fanout único del dominio `updater` (ISA-1143 / issue #1147, fase 2).
 *
 * Los canales del actualizador se suscribían desde tres puntos
 * (`useUpdaterSettings`, `OrbitShell` y `HubApp`), cada uno con su propio
 * `Events.On` de Wails y su propio closure: con Ajustes abierto
 * `updater:settings`, `updater:available`, `updater:progress`,
 * `updater:installed` y `updater:error` estaban duplicados. Este módulo
 * instala una única suscripción Wails por canal cuando llega el primer
 * listener, reparte el payload ya desenvuelto (`event.data`) a todos los
 * suscriptores y la retira cuando se va el último. Es el mismo patrón que
 * `settings-events.ts` y `lib/license-events.ts`; como aquí son nueve
 * canales, el boilerplate se factoriza en `createUpdaterChannel`.
 *
 * También cubre `UPDATER_CHANNEL_EVENT` (`hub:updater-channel`): es el aviso
 * frontend del propio dominio updater — lo emite `useUpdaterSettings` al
 * confirmar el canal y lo escucha la shell (B4).
 *
 * Los consumidores siguen acotando la forma del payload como antes: el fanout
 * solo conoce el sobre `{ data }`. Ningún evento updater usa correlación
 * request/response (`updater:settings-saved` es un aviso pelado), así que el
 * reparto es seguro para todos.
 */

export type Unsubscribe = () => void;
export type UpdaterEventListener = (data: unknown) => void;

function createUpdaterChannel(eventName: string) {
  const listeners = new Set<UpdaterEventListener>();
  let wailsUnsubscribe: Unsubscribe | null = null;

  function ensureWailsListener(): void {
    if (wailsUnsubscribe) return;
    wailsUnsubscribe = Events.On(eventName, (event: unknown) => {
      const data = (event as { data?: unknown } | undefined)?.data;
      listeners.forEach((listener) => listener(data));
    });
  }

  return function subscribe(listener: UpdaterEventListener): Unsubscribe {
    ensureWailsListener();
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
      if (listeners.size === 0) {
        wailsUnsubscribe?.();
        wailsUnsubscribe = null;
      }
    };
  };
}

export const subscribeUpdaterSettings = createUpdaterChannel("updater:settings");
export const subscribeUpdaterAvailable = createUpdaterChannel("updater:available");
export const subscribeUpdaterProgress = createUpdaterChannel("updater:progress");
export const subscribeUpdaterInstalled = createUpdaterChannel("updater:installed");
export const subscribeUpdaterIgnored = createUpdaterChannel("updater:ignored");
export const subscribeUpdaterSettingsSaved = createUpdaterChannel("updater:settings-saved");
export const subscribeUpdaterError = createUpdaterChannel("updater:error");
export const subscribeUpdaterNotify = createUpdaterChannel("updater:notify");
export const subscribeUpdaterChannel = createUpdaterChannel(UPDATER_CHANNEL_EVENT);
