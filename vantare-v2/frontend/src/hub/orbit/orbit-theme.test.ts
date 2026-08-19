import { afterEach, describe, expect, it } from "vitest";
import { applyOrbitThemeWhileMounted } from "./orbit-theme";
import { applyTheme, getStoredThemeId, persistThemeId } from "../../lib/theme";
import vantareV5 from "../../themes/vantare-v5.json";
import type { VantareTheme } from "../../lib/theme";

const v5 = vantareV5 as unknown as VantareTheme;

afterEach(() => {
  window.localStorage.clear();
  applyTheme(v5);
});

describe("applyOrbitThemeWhileMounted", () => {
  it("aplica el tema Orbit al documento", () => {
    applyOrbitThemeWhileMounted();
    expect(document.documentElement.dataset.theme).toBe("vantare-orbit");
  });

  it("no escribe la preferencia de tema guardada", () => {
    persistThemeId("vantare-lite");
    applyOrbitThemeWhileMounted();
    expect(window.localStorage.getItem("vantare.theme")).toBe("vantare-lite");
    expect(getStoredThemeId()).toBe("vantare-lite");
  });

  it("restaura el tema del usuario al desmontar", () => {
    persistThemeId("vantare-lite");
    const restore = applyOrbitThemeWhileMounted();
    expect(document.documentElement.dataset.theme).toBe("vantare-orbit");
    restore();
    expect(document.documentElement.dataset.theme).toBe("vantare-lite");
  });

  it("sin preferencia guardada vuelve al tema por defecto", () => {
    const restore = applyOrbitThemeWhileMounted();
    restore();
    expect(document.documentElement.dataset.theme).toBe("vantare-v5");
  });
});
