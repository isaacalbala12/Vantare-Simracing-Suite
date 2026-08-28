import { describe, expect, it } from "vitest";
import { selectOverlayRuntime } from "./overlay-entry-route";

describe("selectOverlayRuntime", () => {
  it("keeps the native Wails entry on the desktop runtime", () => {
    expect(selectOverlayRuntime("/overlay.html", "")).toBe("desktop");
  });

  it("preserves the OBS route and explicit query", () => {
    expect(selectOverlayRuntime("/overlay", "?profile=race")).toBe("obs");
    expect(selectOverlayRuntime("/overlay.html", "?obs=1")).toBe("obs");
  });
});
