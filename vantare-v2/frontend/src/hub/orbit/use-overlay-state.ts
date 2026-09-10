import { useSyncExternalStore } from "react";
import { Events } from "@wailsio/runtime";
import type { OverlayStatus, ProfileEntry } from "../state/overlay-workbench";

export interface OrbitOverlayState {
  profiles: ProfileEntry[];
  activeProfileId: string | null;
  status: OverlayStatus | null;
  running: boolean;
  active: ProfileEntry | null;
  /**
   * PROVISIONAL: `ProfileEntry` no trae ninguna señal de "recomendado de
   * Vantare", así que se toma el primer perfil no activo. Cuando el backend
   * exponga esa marca, este campo debe leerla en vez de adivinarla.
   */
  recommended: ProfileEntry | null;
}

/**
 * Estado crudo del store; `active`, `recommended` y `running` se derivan al
 * leer para que la instantánea quede estable entre notificaciones.
 */
interface OverlaySnapshot {
  profiles: ProfileEntry[];
  activeProfileId: string | null;
  status: OverlayStatus | null;
}

const EMPTY_SNAPSHOT: OverlaySnapshot = {
  profiles: [],
  activeProfileId: null,
  status: null,
};

/**
 * Store de módulo con una única suscripción Wails compartida por todos los
 * consumidores (`OrbitShell`, `StudioTopbarControls`, los dos puntos de
 * Ajustes). Antes cada instancia del hook abría sus 4 `Events.On` y repetía
 * el handshake `hub:list` + `settings:get` + `overlay:status:get` en cada
 * montaje (auditoría ISA-1111): hasta 3 instancias simultáneas triplicaban
 * suscripciones y peticiones.
 *
 * Refcount: la suscripción se instala con el primer oyente y se libera con el
 * último. Es lo que hacía cada hook por su cuenta —montar = suscribir y
 * pedir, desmontar = liberar— y evita suscripciones huérfanas cuando ninguna
 * pantalla del Hub lo consume. Un always-on seguiría pagando listeners en
 * ventanas sin Hub (overlay, tests) sin beneficio: los datos llegan por push
 * y el store está activo mientras haya al menos una pantalla montada.
 *
 * Frescura: mientras el store está activo la suscripción viva mantiene el
 * estado al día, así que un segundo consumidor no re-emite las peticiones
 * iniciales: lee la instantánea ya poblada. Si el store llega a desactivarse
 * (cero oyentes), el estado se reinicia y la siguiente activación vuelve a
 * pedirlo, igual que un montaje nuevo.
 */
let snapshot: OverlaySnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let releaseWails: (() => void) | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function activate(): void {
  if (releaseWails) return;
  const unsubProfiles = Events.On("hub:profiles", (event: { data?: { profiles?: ProfileEntry[] } }) => {
    snapshot = {
      ...snapshot,
      profiles: Array.isArray(event.data?.profiles) ? event.data.profiles : [],
    };
    notify();
  });
  const unsubSettings = Events.On(
    "settings",
    (event: { data?: { activeOverlayProfileId?: string } }) => {
      const next = event.data?.activeOverlayProfileId;
      snapshot = { ...snapshot, activeProfileId: next && next.length > 0 ? next : null };
      notify();
    },
  );
  const unsubStatus = Events.On("overlay:status", (event: { data?: OverlayStatus }) => {
    snapshot = { ...snapshot, status: event.data ?? null };
    notify();
  });
  // El backend **no** reemite `settings` tras `hub:set-active`: confirma con
  // `hub:profile-activated` (es lo que escucha `StudioRoute`). Sin esto la
  // columna decía "activado" y seguía marcando el perfil anterior hasta
  // recargar. Se toma el id del payload y, además, se vuelve a pedir la lista
  // y los ajustes porque una de las rutas del backend emite solo `{ok:true}`.
  const unsubActivated = Events.On(
    "hub:profile-activated",
    (event: { data?: { activeProfileId?: string } }) => {
      const next = event.data?.activeProfileId;
      if (next && next.length > 0) {
        snapshot = { ...snapshot, activeProfileId: next };
        notify();
      }
      Events.Emit("hub:list");
      Events.Emit("settings:get");
    },
  );
  releaseWails = () => {
    unsubProfiles?.();
    unsubSettings?.();
    unsubStatus?.();
    unsubActivated?.();
  };
  // `hub:list` es el nombre real del comando en el backend (`hub_service.go`,
  // y lo que emiten `ActiveOverlayCard`, `StudioRoute` y `ProfilesPage`). El
  // briefing 01 escribió `hub:profiles:get`, que nadie atiende: manda el
  // código, y sin este cambio la columna nunca recibía perfiles. Se emiten
  // una vez por activación del store, no por consumidor.
  Events.Emit("hub:list");
  Events.Emit("settings:get");
  Events.Emit("overlay:status:get");
}

function deactivate(): void {
  releaseWails?.();
  releaseWails = null;
  snapshot = EMPTY_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  activate();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) deactivate();
  };
}

function getSnapshot(): OverlaySnapshot {
  return snapshot;
}

/**
 * Estado real de los perfiles de overlay del hub. Es la misma fuente que usa
 * `ActiveOverlayCard`: `hub:profiles`, `settings.activeOverlayProfileId` y
 * `overlay:status`, así que la columna no inventa datos.
 */
export function useOverlayState(): OrbitOverlayState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const active = state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
  // PROVISIONAL: ver la nota de `recommended` en OrbitOverlayState.
  const recommended = state.profiles.find((profile) => profile.id !== state.activeProfileId) ?? null;

  return {
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    status: state.status,
    running: Boolean(state.status?.running),
    active,
    recommended,
  };
}
