import { describe, expect, it } from "vitest";
import { modeFromTarget } from "./studio-route-target";

describe("modeFromTarget", () => {
  it("abre Mis perfiles con el destino profiles", () => {
    expect(modeFromTarget("profiles")).toBe("ownProfiles");
  });

  it("no cambia de modo sin destino", () => {
    expect(modeFromTarget(undefined)).toBeNull();
  });

  it("ignora destinos que no nombran una subpantalla del Studio", () => {
    expect(modeFromTarget("application")).toBeNull();
    expect(modeFromTarget("")).toBeNull();
  });
});
