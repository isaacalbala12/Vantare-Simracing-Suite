import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlaysStudioPage } from "./OverlaysStudioPage";

const listeners = new Map<string, ((event: { data: unknown }) => void)[]>();

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      const existing = listeners.get(name) ?? [];
      existing.push(cb);
      listeners.set(name, existing);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

vi.mock("../../lib/access", () => ({
  useAccess: () => ({
    planLabel: "free",
    planStatus: "free",
    roles: [],
    isBlocked: false,
    isUnconfigured: false,
  }),
}));

vi.mock("../overlay-studio/state/studio-profile-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../overlay-studio/state/studio-profile-client")>();
  const { deltaDefinition } = await import("../../overlay/widget-types/delta/delta-definition");
  const document = {
    schemaVersion: 3,
    id: "default-racing",
    name: "Default Racing",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
  return {
    ...actual,
    createWailsStudioEventTransport: () => ({
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
    }),
    createStudioProfileClient: () => ({
      load: vi.fn(async () => ({ document, revision: "rev-1" })),
      save: vi.fn(async () => ({ status: "saved" as const, document, revision: "rev-2" })),
    }),
  };
});

function dispatch(name: string, data: unknown) {
  for (const handler of listeners.get(name) ?? []) {
    handler({ data });
  }
}

describe("OverlaysStudioPage", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("delegates to StudioRoute and opens V3 directly for the active profile", async () => {
    render(<OverlaysStudioPage />);
    dispatch("hub:profiles", {
      profiles: [
        { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 1 },
      ],
    });
    dispatch("settings", {
      deltaMode: "self",
      cpuSampling: true,
      hotkeys: {},
      activeOverlayProfileId: "default-racing",
    });

    expect(await screen.findByTestId("overlay-studio-v3")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Overlays Studio" })).toBeNull();
  });

  it("enters recommended mode when pendingRecommendedAutoStart is set", async () => {
    render(<OverlaysStudioPage pendingRecommendedAutoStart="recommended-auto" onAutoStartHandled={vi.fn()} />);
    dispatch("hub:profiles", { profiles: [] });
    expect(await screen.findByText("Clean Overlay")).toBeTruthy();
  });
});