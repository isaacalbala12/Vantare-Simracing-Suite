import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () =>
        runtimeMock.handlers.set(
          name,
          (runtimeMock.handlers.get(name) ?? []).filter((h) => h !== handler),
        );
    },
    Emit: runtimeMock.emit,
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

describe("SettingsPage", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders header and channel options", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeDefined();
    expect(screen.getByLabelText("Solo releases estables")).toBeDefined();
    expect(screen.getByLabelText("Incluir pre-releases")).toBeDefined();
  });

  it("emits settings save when channel changes", () => {
    render(<SettingsPage />);
    dispatch("updater:settings", { settings: { channel: "stable" } });

    fireEvent.click(screen.getByLabelText("Incluir pre-releases"));

    expect(runtimeMock.emit).toHaveBeenCalledWith("updater:settings:save", {
      channel: "prerelease",
    });
  });

  it("displays available releases after updater:available", () => {
    render(<SettingsPage />);
    dispatch("updater:available", {
      info: {
        currentVersion: "v0.1.4-prealpha",
        releases: [
          {
            tag_name: "v0.1.4-prealpha",
            name: "v0.1.4",
            prerelease: true,
            published_at: "2026-06-15T00:00:00Z",
            html_url: "https://github.com/example",
            assets: [{ name: "vantare-amd64-installer.exe", size: 6624510, browser_download_url: "https://example.com/installer.exe" }],
          },
        ],
      },
    });

    expect(screen.getByText("v0.1.4-prealpha")).toBeDefined();
    expect(screen.getByRole("button", { name: "Actual" })).toBeDefined();
  });
});
