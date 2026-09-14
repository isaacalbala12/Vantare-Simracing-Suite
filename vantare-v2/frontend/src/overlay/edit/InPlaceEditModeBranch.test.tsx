import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { createTestTelemetryCoordinator } from "../../hub/overlay-studio/test-helpers";
import { InPlaceEditModeBranch } from "./InPlaceEditModeBranch";

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

const originalResizeObserver = globalThis.ResizeObserver;

function installResizeObserver(): void {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.callback(
        [{
          target,
          contentBoxSize: [{ inlineSize: 1920, blockSize: 1080 }],
          contentRect: { width: 1920, height: 1080 },
        } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    disconnect(): void {}
    unobserve(): void {}
  } as unknown as typeof ResizeObserver;
}

function buildDocument(): ProfileDocumentV3 {
  const delta = deltaDefinition.createDefault("delta-main");
  delta.layout = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: { type: "general", widgets: [delta] },
    },
  };
}

function dispatch(name: string, data: unknown) {
  for (const handler of runtimeMock.handlers.get(name) ?? []) {
    handler({ data });
  }
}

beforeEach(() => {
  installResizeObserver();
  runtimeMock.emit.mockClear();
  runtimeMock.handlers.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("InPlaceEditModeBranch", () => {
  it("uses the stored locale and mounts the edit overlay inside the providers", async () => {
    localStorage.setItem("vantare.locale", "es");
    const coordinator = createTestTelemetryCoordinator();

    render(
      <InPlaceEditModeBranch
        document={buildDocument()}
        revision="rev-1"
        layoutOrigin={{ x: 0, y: 0 }}
        telemetry={coordinator}
      />,
    );

    dispatch("license:cached:get", {});
    dispatch("license:changed", {
      data: { state: "active", email: "test@example.com", entitlements: [], capabilities: [], operationalRoles: [] },
    });

    expect(screen.getByTestId("inplace-edit-overlay")).toBeTruthy();
  });
});
