import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { resolveIconCandidates } from "./app-icons";
import type { LauncherAppEntry } from "./launcher-state";

/**
 * Aplicación mínima que necesita la resolución de icono. Vale tanto para el
 * `LauncherAppEntry` del Launcher clásico como para el `LauncherApp` del
 * contrato: solo se miran estos cuatro campos.
 */
export type IconApp = Pick<LauncherAppEntry, "id"> & {
  iconUrl?: string;
  executablePath?: string;
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
 * Ordena los candidatos (activo oficial, `iconUrl` local del contrato, icono
 * extraído del ejecutable) y pide al backend por `launcher:app:icon` el que
 * falta, escuchando `launcher:app:icon:result` **antes** de emitir. Cuando un
 * candidato no carga, `onError` pasa al siguiente y, agotados todos, `src` es
 * `null` y quien llame pinta las iniciales.
 */
export function useAppIcon(app: IconApp): AppIconState {
  const appId = app.id;
  const executablePath = app.executablePath;
  const [extractedIcon, setExtractedIcon] = useState<string | null>(
    () => iconCache.get(appId) ?? null,
  );
  const iconKey = `${appId}|${app.iconUrl ?? ""}|${executablePath ?? ""}`;
  const [failedCandidateState, setFailedCandidateState] = useState({ key: "", count: 0 });
  const failedCandidateCount =
    failedCandidateState.key === iconKey ? failedCandidateState.count : 0;

  const candidates = [
    ...resolveIconCandidates(app as LauncherAppEntry),
    extractedIcon,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const src = candidates[failedCandidateCount] ?? null;

  useEffect(() => {
    const off = Events.On(
      "launcher:app:icon:result",
      (event: { data?: { id?: string; iconUrl?: string } }) => {
        const data = event.data;
        if (!data || data.id !== appId || !data.iconUrl) return;
        iconCache.set(appId, data.iconUrl);
        setExtractedIcon(data.iconUrl);
      },
    );

    if (!src && executablePath && !iconCache.has(appId)) {
      Events.Emit("launcher:app:icon", { id: appId, executablePath });
    }

    return off;
  }, [appId, executablePath, src]);

  const onError = useCallback(() => {
    if (extractedIcon && extractedIcon === src) {
      iconCache.delete(appId);
      setExtractedIcon(null);
    }
    setFailedCandidateState({ key: iconKey, count: failedCandidateCount + 1 });
  }, [appId, extractedIcon, failedCandidateCount, iconKey, src]);

  return { src, onError };
}
