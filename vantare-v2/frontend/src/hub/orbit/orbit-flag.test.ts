import { afterEach, describe, expect, it } from "vitest";
import { isOrbitEnabled, readOrbitBuildDefault, setOrbitEnabled } from "./orbit-flag";
import { ORBIT_KEYS, orbitStore } from "./orbit-store";

describe("orbit-flag", () => {
  afterEach(() => {
    orbitStore.set(ORBIT_KEYS.enabled, "");
    localStorage.removeItem(`vantare.orbit.enabled`);
  });

  it("?orbit=1 enciende y persiste; ?orbit=0 apaga", () => {
    expect(isOrbitEnabled("?orbit=1")).toBe(true);
    expect(isOrbitEnabled("")).toBe(true);
    expect(isOrbitEnabled("?orbit=0")).toBe(false);
    expect(isOrbitEnabled("")).toBe(false);
  });

  it("sin URL ni preferencia manda el valor por defecto de build", () => {
    // En tests VITE_ORBIT_DEFAULT no está definido: por defecto OFF.
    expect(readOrbitBuildDefault()).toBe(false);
    expect(isOrbitEnabled("")).toBe(false);
  });

  it("la preferencia guardada gana al valor de build", () => {
    setOrbitEnabled(true);
    expect(isOrbitEnabled("")).toBe(true);
    setOrbitEnabled(false);
    expect(isOrbitEnabled("")).toBe(false);
  });
});
