import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Events } from "@wailsio/runtime";
import { OverlaysStudioPage } from "./OverlaysStudioPage";

const listeners = new Map<string, (event: { data: unknown }) => void>();

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, cb: (event: { data: unknown }) => void) => {
      listeners.set(name, cb);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

describe("OverlaysStudioPage", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it("requests profiles on mount", () => {
    render(<OverlaysStudioPage />);
    expect(Events.Emit).toHaveBeenCalledWith("hub:list");
  });

  it("renders the Overlays Studio library shell after profiles load", async () => {
    render(<OverlaysStudioPage />);

    listeners.get("hub:profiles")?.({
      data: {
        profiles: [
          { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 3 },
        ],
      },
    });

    expect(await screen.findByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
    expect(screen.getByText("Mis perfiles")).toBeTruthy();
    expect(screen.getByText("Recomendados por Vantare")).toBeTruthy();
    expect(screen.getByText("Comunidad")).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
    expect(screen.getByText("Default Racing")).toBeTruthy();
  });
});
