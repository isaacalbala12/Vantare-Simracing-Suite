import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { resolveIconCandidates } from "./app-icons";
import type { LauncherAppEntry } from "./launcher-state";

/**
 * Aplicación mínima que necesita la resolución de icono. Vale tanto para el
 * `LauncherAppEntry` del Launcher clásico como para el `LauncherApp` del
 * contrato: solo se miran estos campos.
 */
export type IconApp = Pick<LauncherAppEntry, "id"> & {
  iconUrl?: string;
  /** Icono elegido a mano por el usuario; gana a todo lo demás. */
  iconOverridePath?: string;
  executablePath?: string;
  /** Ruta corregida por el usuario cuando la detección no acertó. */
  userExecutablePath?: string;
};

/**
 * Caché de iconos extraídos por el backend (`id` → data URI).
 *
 * Es de módulo a propósito: el mismo icono se pinta en el Launcher clásico, en
 * las filas del catálogo Orbit y en cada paso de cada cadena, y extraerlo del
 * ejecutable cuesta disco. Se comparte para no pedirlo una vez por sitio.
 */
const iconCache = new Map<string, string>();

/** Solo para pruebas: vacía la caché compartida entre casos. */
export function resetAppIconCache(): void {
  iconCache.clear();
}

export type AppIconState = {
  /** URL o data URI del icono real, o `null` si toca el monograma. */
  src: string | null;
  /** Descarta el candidato actual y prueba el siguiente. */
  onError: () => void;
};

/**
 * Icono real de una aplicación del launcher.
 *
 * Ordena los candidatos (icono elegido a mano, activo oficial, `iconUrl` del
 * contrato y, al final, el icono que el backend extrae del ejecutable) y pide
 * por `launcher:app:icon` el que falta. Cuando un candidato no carga, `onError`
 * pasa al siguiente; **solo** cuando se agotan todos `src` es `null` y quien
 * llame pinta las iniciales.
 *
 * La suscripción a `launcher:app:icon:result` no depende del candidato en uso:
 * si se rehiciera en cada cambio de `src` habría una ventana en la que el
 * resultado del backend llegaría sin nadie escuchando y la losa se quedaría
 * vacía hasta un remontaje (el caso de CrewChief).
 */
export function useAppIcon(app: IconApp): AppIconState {
  const appId = app.id;
  // La ruta corregida por el usuario es la buena cuando existe: es la que el
  // launcher usa para arrancar, así que es de la que hay que sacar el icono.
  const executablePath = app.userExecutablePath ?? app.executablePath;
  const [extractedIcon, setExtractedIcon] = useState<string | null>(
    () => iconCache.get(appId) ?? null,
  );
  const iconKey = `${appId}|${app.iconOverridePath ?? ""}|${app.iconUrl ?? ""}|${executablePath ?? ""}`;
  const [failedCandidateState, setFailedCandidateState] = useState({ key: "", count: 0 });
  const failedCandidateCount =
    failedCandidateState.key === iconKey ? failedCandidateState.count : 0;

  const candidates = [...resolveIconCandidates(app), extractedIcon].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const src = candidates[failedCandidateCount] ?? null;
  const exhausted = failedCandidateCount >= candidates.length;

  // Escucha permanente mientras el componente vive: el icono extraído puede
  // llegar tarde y debe actualizar la losa sin remontarla.
  useEffect(() => {
    return Events.On(
      "launcher:app:icon:result",
      (event: { data?: { id?: string; iconUrl?: string } }) => {
        const data = event.data;
        if (!data || data.id !== appId || !data.iconUrl) return;
        iconCache.set(appId, data.iconUrl);
        setExtractedIcon(data.iconUrl);
      },
    );
  }, [appId]);

  // La extracción se pide cuando no queda candidato que pintar: sin candidatos
  // desde el principio, o con todos ya fallados.
  useEffect(() => {
    if (src) return;
    if (!executablePath) return;
    if (iconCache.has(appId)) return;
    Events.Emit("launcher:app:icon", { id: appId, executablePath });
  }, [appId, executablePath, src, exhausted]);

  const onError = useCallback(() => {
    if (extractedIcon && extractedIcon === src) {
      // El icono extraído tampoco carga: se retira de la caché compartida para
      // no repartirlo roto, y como desaparece de la lista no hay que avanzar el
      // contador (si se avanzara se saltaría un candidato válido).
      iconCache.delete(appId);
      setExtractedIcon(null);
      return;
    }
    setFailedCandidateState({ key: iconKey, count: failedCandidateCount + 1 });
  }, [appId, extractedIcon, failedCandidateCount, iconKey, src]);

  return { src, onError };
}
