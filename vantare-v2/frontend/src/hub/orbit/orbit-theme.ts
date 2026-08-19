import {
  applyTheme,
  getStoredThemeId,
  type ThemeId,
  type VantareTheme,
} from "../../lib/theme";
import vantareV5 from "../../themes/vantare-v5.json";
import vantareLite from "../../themes/vantare-lite.json";
import vantareOrbit from "../../themes/vantare-orbit.json";

const THEMES: Record<ThemeId, VantareTheme> = {
  "vantare-v5": vantareV5 as unknown as VantareTheme,
  "vantare-lite": vantareLite as unknown as VantareTheme,
  "vantare-orbit": vantareOrbit as unknown as VantareTheme,
};

export function themeById(id: ThemeId): VantareTheme {
  return THEMES[id];
}

/**
 * Aplica el tema Orbit **sin** tocar la preferencia guardada y devuelve la
 * función que restaura el tema que el usuario tuviera.
 *
 * La shell del Hub siempre usa Orbit sin alterar la preferencia persistida que
 * todavía consumen las superficies de overlay y sus previews.
 */
export function applyOrbitThemeWhileMounted(
  storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage,
): () => void {
  const previous: ThemeId = storage ? getStoredThemeId(storage) : "vantare-orbit";
  applyTheme(THEMES["vantare-orbit"]);
  return () => {
    applyTheme(THEMES[previous]);
  };
}
