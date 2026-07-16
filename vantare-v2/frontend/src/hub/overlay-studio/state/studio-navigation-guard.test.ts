import { describe, expect, it, vi } from "vitest";
import { resolveDirtyNavigation } from "./studio-navigation-guard";

describe("resolveDirtyNavigation", () => {
  it("continues immediately when the draft is clean", async () => {
    const continueNavigation = vi.fn();
    await expect(
      resolveDirtyNavigation({
        dirty: false,
        decide: vi.fn(),
        save: vi.fn(),
        discard: vi.fn(),
        continueNavigation,
      }),
    ).resolves.toBe("continued");
    expect(continueNavigation).toHaveBeenCalledOnce();
  });

  it("discards and continues when requested", async () => {
    const continueNavigation = vi.fn();
    const discard = vi.fn();
    await expect(
      resolveDirtyNavigation({
        dirty: true,
        decide: async () => "discard",
        save: vi.fn(),
        discard,
        continueNavigation,
      }),
    ).resolves.toBe("continued");
    expect(discard).toHaveBeenCalledOnce();
    expect(continueNavigation).toHaveBeenCalledOnce();
  });

  it("continues only after a successful save", async () => {
    const continueNavigation = vi.fn();
    const save = vi.fn(async () => ({ status: "saved", document: {}, revision: "rev-2" } as const));
    await expect(
      resolveDirtyNavigation({
        dirty: true,
        decide: async () => "save",
        save,
        discard: vi.fn(),
        continueNavigation,
      }),
    ).resolves.toBe("continued");
    expect(save).toHaveBeenCalledOnce();
    expect(continueNavigation).toHaveBeenCalledOnce();
  });

  it("cancels navigation on save error, conflict or cancel decisions", async () => {
    const continueNavigation = vi.fn();
    await expect(
      resolveDirtyNavigation({
        dirty: true,
        decide: async () => "cancel",
        save: vi.fn(),
        discard: vi.fn(),
        continueNavigation,
      }),
    ).resolves.toBe("cancelled");

    await expect(
      resolveDirtyNavigation({
        dirty: true,
        decide: async () => "save",
        save: vi.fn(async () => ({ status: "error", message: "disk full" })),
        discard: vi.fn(),
        continueNavigation,
      }),
    ).resolves.toBe("cancelled");

    await expect(
      resolveDirtyNavigation({
        dirty: true,
        decide: async () => "save",
        save: vi.fn(async () => ({ status: "conflict", message: "revision mismatch" })),
        discard: vi.fn(),
        continueNavigation,
      }),
    ).resolves.toBe("cancelled");

    expect(continueNavigation).not.toHaveBeenCalled();
  });
});