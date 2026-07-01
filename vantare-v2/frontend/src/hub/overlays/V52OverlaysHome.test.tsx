import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V52OverlaysHome } from "./V52OverlaysHome";

afterEach(() => cleanup());

describe("V52OverlaysHome", () => {
  it("renders the four Overlays Studio entry cards", () => {
    render(
      <V52OverlaysHome
        profilesCount={4}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Widgets" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Comunidad" })).toBeTruthy();
  });

  it("calls the correct callbacks from primary buttons", () => {
    const onOpenWidgets = vi.fn();
    const onOpenOwnProfiles = vi.fn();
    const onOpenRecommended = vi.fn();
    const onOpenCommunity = vi.fn();

    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenWidgets={onOpenWidgets}
        onOpenOwnProfiles={onOpenOwnProfiles}
        onOpenRecommended={onOpenRecommended}
        onOpenCommunity={onOpenCommunity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Configurar widgets" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver mis perfiles" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver recomendados" }));
    fireEvent.click(screen.getByRole("button", { name: "Explorar comunidad" }));

    expect(onOpenWidgets).toHaveBeenCalledTimes(1);
    expect(onOpenOwnProfiles).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
  });

  it("does not render fake profile counts", () => {
    render(
      <V52OverlaysHome
        profilesCount={0}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.queryByText(/4 perfiles · 3 layouts activos/i)).toBeNull();
    expect(screen.getByText(/0 perfiles propios/i)).toBeTruthy();
  });
});
