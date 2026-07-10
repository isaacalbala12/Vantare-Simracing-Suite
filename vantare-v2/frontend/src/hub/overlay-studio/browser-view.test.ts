import { describe, expect, it, vi } from "vitest";
import { buildBrowserViewUrl, openBrowserView } from "./browser-view";

describe("buildBrowserViewUrl", () => {
  it("encodes the profile file in the overlay query", () => {
    expect(buildBrowserViewUrl("http://localhost:5176", "profiles/a.json")).toBe(
      "http://localhost:5176/overlay?profile=profiles%2Fa.json",
    );
    expect(buildBrowserViewUrl("http://localhost:5176/", "profiles/racing #1.json")).toBe(
      "http://localhost:5176/overlay?profile=profiles%2Fracing%20%231.json",
    );
  });
});

describe("openBrowserView", () => {
  it("opens immediately when the draft is clean", async () => {
    const open = vi.fn();
    await expect(
      openBrowserView({
        dirty: false,
        profileFile: "profiles/a.json",
        baseUrl: "http://localhost:5176",
        decide: vi.fn(),
        save: vi.fn(),
        open,
      }),
    ).resolves.toBe("opened");
    expect(open).toHaveBeenCalledWith("http://localhost:5176/overlay?profile=profiles%2Fa.json");
  });

  it("asks to save before opening when dirty and opens after a successful save", async () => {
    const open = vi.fn();
    const decide = vi.fn(async () => "save" as const);
    const save = vi.fn(async () => ({ status: "saved", document: {}, revision: "rev-2" } as const));

    await expect(
      openBrowserView({
        dirty: true,
        profileFile: "profiles/a.json",
        baseUrl: "http://localhost:5176",
        decide,
        save,
        open,
      }),
    ).resolves.toBe("opened");

    expect(decide).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith("http://localhost:5176/overlay?profile=profiles%2Fa.json");
  });

  it("cancels without opening when the user declines the dirty prompt", async () => {
    const open = vi.fn();
    await expect(
      openBrowserView({
        dirty: true,
        profileFile: "profiles/a.json",
        baseUrl: "http://localhost:5176",
        decide: async () => "cancel",
        save: vi.fn(),
        open,
      }),
    ).resolves.toBe("cancelled");
    expect(open).not.toHaveBeenCalled();
  });

  it("does not open when save fails after the user chooses save", async () => {
    const open = vi.fn();
    await expect(
      openBrowserView({
        dirty: true,
        profileFile: "profiles/a.json",
        baseUrl: "http://localhost:5176",
        decide: async () => "save",
        save: vi.fn(async () => ({ status: "error", message: "disk full" })),
        open,
      }),
    ).resolves.toBe("failed");
    expect(open).not.toHaveBeenCalled();
  });

  it("uses the provided profile file reference without rewriting it", async () => {
    const open = vi.fn();
    await openBrowserView({
      dirty: false,
      profileFile: "profiles/custom-path.json",
      baseUrl: "https://app.vantare.test",
      decide: vi.fn(),
      save: vi.fn(),
      open,
    });
    expect(open).toHaveBeenCalledWith(
      "https://app.vantare.test/overlay?profile=profiles%2Fcustom-path.json",
    );
  });
});