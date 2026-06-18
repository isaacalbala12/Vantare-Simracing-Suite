import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverlaysStudioPage } from "./OverlaysStudioPage";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => vi.fn()),
    Emit: vi.fn(),
  },
}));

describe("OverlaysStudioPage", () => {
  it("renders the Overlays Studio library shell", () => {
    render(<OverlaysStudioPage />);

    expect(screen.getByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
    expect(screen.getByText("Mis perfiles")).toBeTruthy();
    expect(screen.getByText("Recomendados por Vantare")).toBeTruthy();
    expect(screen.getByText("Comunidad")).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
  });
});
