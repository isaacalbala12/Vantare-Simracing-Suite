import { describe, expect, it, vi } from "vitest";
import type { OverlayFrameV2Store } from "../../telemetry-transport/overlay-frame-v2-store";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { createOverlayV2ShadowActivation } from "./overlay-v2-shadow-activation";

describe("Overlay V2 shadow activation", () => {
  it("allocates and subscribes only when the first V1 frame arrives", () => {
    const subscribe = vi.fn(() => vi.fn());
    const store = {
      subscribe,
      getSnapshot: vi.fn(() => ({ frame: undefined, source: undefined })),
    } as unknown as OverlayFrameV2Store;
    const acceptLegacy = vi.fn();
    const acceptOverlayV2 = vi.fn();
    const createRuntime = vi.fn(() => ({
      acceptLegacy,
      acceptOverlayV2,
      sessionSummary: vi.fn(),
    }));
    const activation = createOverlayV2ShadowActivation(store, createRuntime);

    expect(createRuntime).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(activation.sessionSummary()).toBeNull();

    activation.acceptLegacy(1, 2, {} as TelemetrySnapshot);

    expect(createRuntime).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(acceptLegacy).toHaveBeenCalledOnce();
    expect(acceptOverlayV2).not.toHaveBeenCalled();
  });
});
