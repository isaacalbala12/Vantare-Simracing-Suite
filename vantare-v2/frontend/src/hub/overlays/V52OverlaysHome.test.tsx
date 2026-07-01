import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECOMMENDED_PROFILES } from "./recommended-profiles";
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

  it("calls callbacks for Widgets, Mis perfiles and Recomendados, but not Comunidad", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Configurar widgets/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ver mis perfiles/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ver recomendados/ }));

    expect(onOpenWidgets).toHaveBeenCalledTimes(1);
    expect(onOpenOwnProfiles).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
    expect(onOpenCommunity).not.toHaveBeenCalled();
  });

  it("Comunidad card is disabled and does not call onOpenCommunity", () => {
    const onOpenCommunity = vi.fn();

    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={onOpenCommunity}
      />,
    );

    const comunidadCard = screen.getByText("Comunidad").closest("article");
    expect(comunidadCard?.className).toContain("opacity-50");
    expect(comunidadCard?.className).toContain("cursor-not-allowed");
    expect(comunidadCard?.className).toContain("pointer-events-none");

    const comunidadButton = screen.getByRole("button", { name: /Explorar comunidad/ });
    fireEvent.click(comunidadButton);
    expect(onOpenCommunity).not.toHaveBeenCalled();
  });

  it("renders recommended pills from RECOMMENDED_PROFILES", () => {
    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.getByText(RECOMMENDED_PROFILES[0].name)).toBeTruthy();
    expect(screen.getByText(RECOMMENDED_PROFILES[1].name)).toBeTruthy();
    expect(screen.queryByText("Le Mans Basic")).toBeNull();
  });

  it("shows real profilesCount in meta and eyebrow", () => {
    render(
      <V52OverlaysHome
        profilesCount={3}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    const matches = screen.getAllByText(/3 perfiles propios/i);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render fake marketplace as active", () => {
    render(
      <V52OverlaysHome
        profilesCount={0}
        onOpenWidgets={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.queryByText(/marketplace/i)).toBeNull();
    expect(screen.queryByText(/comunidad activa/i)).toBeNull();
    expect(screen.queryByText(/explorar comunidad/i)).toBeTruthy();
  });
});
