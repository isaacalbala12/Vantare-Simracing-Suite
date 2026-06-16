import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WidgetsPage } from "./WidgetsPage";

const testProfile = {
  id: "test",
  name: "Test Profile",
  widgets: [
    { id: "w1", type: "delta", enabled: true, updateHz: 30, position: { x: 0, y: 0, w: 400, h: 200 }, props: {} },
  ],
};

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((_event: string, cb: (event: unknown) => void) => {
      // Simulate receiving a profile on mount
      setTimeout(() => cb({ data: { profile: testProfile } }), 0);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

vi.mock("../preview/PreviewInspector", () => ({
  PreviewInspector: () => <div data-testid="inspector-mock">Inspector</div>,
}));

vi.mock("../preview/WidgetPreview", () => ({
  WidgetPreview: () => <div data-testid="preview-mock">Preview</div>,
}));

describe("WidgetsPage", () => {
  afterEach(() => cleanup());

  it("renders heading", async () => {
    render(<WidgetsPage />);
    expect(await screen.findByText("Widgets")).toBeTruthy();
  });

  it("shows loading state initially", () => {
    render(<WidgetsPage />);
    expect(screen.getByText("Cargando perfil activo...")).toBeTruthy();
  });
});
