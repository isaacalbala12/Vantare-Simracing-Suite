import { useEffect, useState } from "react";
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
 * Estado real de los perfiles de overlay del hub. Es la misma fuente que usa
 * `ActiveOverlayCard`: `hub:profiles`, `settings.activeOverlayProfileId` y
 * `overlay:status`, así que la columna no inventa datos.
 */
export function useOverlayState(): OrbitOverlayState {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [status, setStatus] = useState<OverlayStatus | null>(null);

  useEffect(() => {
    const unsubProfiles = Events.On("hub:profiles", (event: { data?: { profiles?: ProfileEntry[] } }) => {
      setProfiles(Array.isArray(event.data?.profiles) ? event.data.profiles : []);
    });
    const unsubSettings = Events.On(
      "settings",
      (event: { data?: { activeOverlayProfileId?: string } }) => {
        const next = event.data?.activeOverlayProfileId;
        setActiveProfileId(next && next.length > 0 ? next : null);
      },
    );
    const unsubStatus = Events.On("overlay:status", (event: { data?: OverlayStatus }) => {
      setStatus(event.data ?? null);
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
        if (next && next.length > 0) setActiveProfileId(next);
        Events.Emit("hub:list");
        Events.Emit("settings:get");
      },
    );
    // `hub:list` es el nombre real del comando en el backend (`hub_service.go`,
    // y lo que emiten `ActiveOverlayCard`, `StudioRoute` y `ProfilesPage`). El
    // briefing 01 escribió `hub:profiles:get`, que nadie atiende: manda el
    // código, y sin este cambio la columna nunca recibía perfiles.
    Events.Emit("hub:list");
    Events.Emit("settings:get");
    Events.Emit("overlay:status:get");
    return () => {
      unsubProfiles?.();
      unsubSettings?.();
      unsubStatus?.();
      unsubActivated?.();
    };
  }, []);

  const active = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  // PROVISIONAL: ver la nota de `recommended` en OrbitOverlayState.
  const recommended = profiles.find((profile) => profile.id !== activeProfileId) ?? null;

  return {
    profiles,
    activeProfileId,
    status,
    running: Boolean(status?.running),
    active,
    recommended,
  };
}
