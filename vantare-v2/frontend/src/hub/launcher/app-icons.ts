import { MOTEC_BRAND_ICON } from "./brand-assets";
import type { LauncherAppEntry } from "./launcher-state";

export type OfficialIconId =
  | "lmu"
  | "obs"
  | "crewchief"
  | "discord"
  | "spotify"
  | "motec"
  | "simhub";

/**
 * Activos de marca del repositorio, por aplicación del catálogo.
 *
 * La regla es que el icono instalado gana: es el logotipo real de la aplicación,
 * a máxima resolución y sin redibujar. Una entrada aquí solo se rellena cuando
 * el icono instalado **no** identifica a la marca del catálogo y no hay ningún
 * fichero local mejor, porque entonces la losa engaña.
 *
 * - `motec`: el ejecutable detectado es el visor i2 y pinta el logotipo de i2,
 *   no el de MoTeC (ver `brand-assets.ts`).
 * - El resto queda a `undefined` a propósito: Discord, CrewChief, OBS, Spotify,
 *   SimHub y LMU ya resuelven su logotipo correcto desde la instalación.
 *
 * Mantener la tabla tipada deja la omisión explícita e impide que entre una URL
 * de red en la UI.
 */
export const OFFICIAL_ICON_ASSETS: Record<OfficialIconId, string | undefined> = {
  lmu: undefined,
  obs: undefined,
  crewchief: undefined,
  discord: undefined,
  spotify: undefined,
  motec: MOTEC_BRAND_ICON,
  simhub: undefined,
};

export function getOfficialIconAsset(id: string): string | undefined {
  return id in OFFICIAL_ICON_ASSETS
    ? OFFICIAL_ICON_ASSETS[id as OfficialIconId]
    : undefined;
}

/**
 * Un candidato solo sirve si el webview puede pintarlo sin salir a la red: se
 * aceptan data URI y rutas locales, y se descarta cualquier `http(s)://` (el
 * hub no descarga logotipos de terceros) y las cadenas vacías.
 */
function isPaintable(candidate: string | undefined): candidate is string {
  if (!candidate) return false;
  const value = candidate.trim();
  if (!value) return false;
  return !/^https?:\/\//i.test(value);
}

/**
 * Cadena de candidatos de icono de una aplicación, de más a menos específico:
 *
 * 1. `iconOverridePath` — el icono que el usuario eligió a mano; manda sobre
 *    todo lo demás porque es una decisión suya.
 * 2. activo oficial del repositorio (`OFFICIAL_ICON_ASSETS`).
 * 3. `iconUrl` del contrato (data URI que ya trae la instantánea).
 *
 * El icono extraído del ejecutable no vive aquí: lo añade `useAppIcon` al final
 * cuando el backend responde, porque es asíncrono.
 */
export function resolveIconCandidates(
  app: Pick<LauncherAppEntry, "id"> & { iconUrl?: string; iconOverridePath?: string },
): string[] {
  const candidates: string[] = [];
  if (isPaintable(app.iconOverridePath)) candidates.push(app.iconOverridePath.trim());
  const official = getOfficialIconAsset(app.id);
  if (official) candidates.push(official);
  if (isPaintable(app.iconUrl)) candidates.push(app.iconUrl.trim());
  // Un mismo icono puede llegar por dos vías (override que coincide con
  // `iconUrl`): probarlo dos veces solo retrasa el monograma.
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}
