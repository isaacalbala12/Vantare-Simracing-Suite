import { describe, expect, it, vi } from "vitest";
import { runRecommendedFirstUse } from "./recommended-first-use";
import { RECOMMENDED_PROFILES } from "./recommended-profiles";

describe("runRecommendedFirstUse", () => {
  it("uses the first recommended profile when no name is provided", async () => {
    const emit = vi.fn();
    const resolveFile = vi.fn().mockResolvedValue("custom-clean-overlay.json");
    const onSuccess = vi.fn();
    const onError = vi.fn();

    await runRecommendedFirstUse({
      profile: RECOMMENDED_PROFILES[0],
      name: "Clean Overlay",
      emit,
      resolveFile,
      onSuccess,
      onError,
    });

    expect(emit).toHaveBeenCalledWith("hub:save-own-copy", expect.objectContaining({ profile: expect.any(Object) }));
    expect(emit).toHaveBeenCalledWith("hub:list");
    expect(emit).toHaveBeenCalledWith("hub:set-active", { id: "custom-clean-overlay", file: "custom-clean-overlay.json" });
    expect(emit).toHaveBeenCalledWith("overlay:start-active");
    expect(resolveFile).toHaveBeenCalledWith("custom-clean-overlay");
    expect(onSuccess).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError when resolveFile returns null", async () => {
    const emit = vi.fn();
    const resolveFile = vi.fn().mockResolvedValue(null);
    const onSuccess = vi.fn();
    const onError = vi.fn();

    await runRecommendedFirstUse({
      profile: RECOMMENDED_PROFILES[0],
      name: "Clean Overlay",
      emit,
      resolveFile,
      onSuccess,
      onError,
    });

    expect(emit).toHaveBeenCalledWith("hub:save-own-copy", expect.any(Object));
    expect(emit).not.toHaveBeenCalledWith("hub:set-active");
    expect(emit).not.toHaveBeenCalledWith("overlay:start-active");
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/no se encontr/i));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not emit anything when name is empty", async () => {
    const emit = vi.fn();
    const resolveFile = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();

    await runRecommendedFirstUse({
      profile: RECOMMENDED_PROFILES[0],
      name: "   ",
      emit,
      resolveFile,
      onSuccess,
      onError,
    });

    expect(emit).not.toHaveBeenCalled();
    expect(resolveFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/vacío/i));
  });
});
