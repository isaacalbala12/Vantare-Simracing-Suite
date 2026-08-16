import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "../core/profile-document";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
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

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
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
      general: {
        type: "general",
        widgets: [delta],
      },
    },
  };
}

beforeEach(() => {
  runtimeMock.emit.mockClear();
  runtimeMock.handlers.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("InPlaceEditModeBranch", () => {
  it("uses the stored locale in the in-place edit branch", () => {
    localStorage.setItem("vantare.locale", "es");

    render(
      <InPlaceEditModeBranch document={buildDocument()} revision="rev-1" layoutOrigin={{ x: 0, y: 0 }}>
        <div data-testid="branch-child">child</div>
      </InPlaceEditModeBranch>,
    );

    expect(screen.getByTestId("branch-child")).toBeTruthy();
    dispatch("license:cached:get", {});
    dispatch("license:changed", {
      data: { state: "active", email: "test@example.com", entitlements: [], capabilities: [], operationalRoles: [] },
    });
  });

  it("mounts without a profile document", () => {
    render(
      <InPlaceEditModeBranch document={null} revision="" layoutOrigin={{ x: 0, y: 0 }}>
        <div data-testid="branch-child">child</div>
      </InPlaceEditModeBranch>,
    );
    expect(screen.getByTestId("branch-child")).toBeTruthy();
  });
});
