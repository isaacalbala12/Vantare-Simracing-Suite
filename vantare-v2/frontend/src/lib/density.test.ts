import { describe, expect, it } from "vitest";
import {
  DENSITY_STORAGE_KEY,
  applyDensity,
  getStoredDensity,
  initializeDensity,
  persistDensity,
} from "./density";

describe("Orbit density", () => {
  it("normalizes stored values and applies them to the body", () => {
    const body = document.createElement("body");
    const storage = { getItem: () => "compact" } as Storage;

    expect(initializeDensity(body, storage)).toBe("compact");
    expect(body.dataset.density).toBe("compact");
  });

  it("falls back to balanced for an unknown setting", () => {
    const storage = { getItem: () => "dense" } as Storage;
    expect(getStoredDensity(storage)).toBe("balanced");
  });

  it("persists the canonical settings key", () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => values.set(key, value),
    } as Storage;

    persistDensity("comfortable", storage);
    expect(values.get(DENSITY_STORAGE_KEY)).toBe("comfortable");
  });

  it("applies density without requiring storage", () => {
    const body = document.createElement("body");
    applyDensity("balanced", body);
    expect(body.dataset.density).toBe("balanced");
  });
});
