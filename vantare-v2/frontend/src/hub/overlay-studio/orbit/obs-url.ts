import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

/**
 * Origen HTTP real del servidor de overlays (ISA-1162).
 *
 * Dentro del WebView, window.location.origin es el esquema de Wails
 * (wails://wails en produccion, localhost:5173 en dev), nunca la direccion
 * donde /overlay y los SSE escuchan de verdad. El backend responde a
 * obs:url:get emitiendo obs:url con su direccion bound; hasta que llega se
 * usa el puerto por defecto documentado.
 */
export const OBS_URL_EVENT = "obs:url";
export const OBS_URL_REQUEST_EVENT = "obs:url:get";
export const DEFAULT_OBS_BASE_URL = "http://127.0.0.1:39261";
export const DEFAULT_OBS_PROFILE = "example-streaming.json";

export function useObsBaseUrl(): string {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_OBS_BASE_URL);
  useEffect(() => {
    const unsubscribe = Events.On(OBS_URL_EVENT, (event: { data?: { baseUrl?: unknown } }) => {
      const next = event?.data?.baseUrl;
      if (typeof next === "string" && next.length > 0) {
        setBaseUrl(next.replace(/\/+$/, ""));
      }
    });
    Events.Emit(OBS_URL_REQUEST_EVENT);
    return () => unsubscribe?.();
  }, []);
  return baseUrl;
}

/** URL del Browser Source de OBS para un perfil (fichero o id del documento). */
export function buildObsOverlayUrl(baseUrl: string, profile: string | undefined): string {
  const ref = profile && profile.length > 0 ? profile : DEFAULT_OBS_PROFILE;
  return `${baseUrl.replace(/\/+$/, "")}/overlay?profile=${encodeURIComponent(ref)}`;
}
