import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EditOverlayApp } from "./EditOverlayApp";

vi.mock("./overlay-document", () => ({
  applyOverlayDocumentMode: () => vi.fn(),
}));

vi.mock("./shared-widget-map", () => ({
  WIDGET_COMPONENTS: {
    delta: () => <div data-testid="delta-mock">Delta</div>,
  },
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, handler: (event: { data: unknown }) => void) => {
      if (name === "profile:loaded") {
        handler({
          data: {
            profile: {
              id: "p1",
              displayMode: "racing",
              widgets: [{ id: "w1", type: "delta", enabled: true, position: { x: 10, y: 10, w: 100, h: 50 } }],
            },
          },
        });
      }
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

describe("EditOverlayApp", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders edit frame for enabled widget", async () => {
    render(<EditOverlayApp />);
    expect(await screen.findByTestId("edit-frame-w1")).toBeTruthy();
  });
});
