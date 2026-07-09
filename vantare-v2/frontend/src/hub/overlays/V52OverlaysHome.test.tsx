import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECOMMENDED_PROFILES } from "./recommended-profiles";
import { V52OverlaysHome } from "./V52OverlaysHome";

afterEach(() => cleanup());

describe("V52OverlaysHome", () => {
  it("renders the four Overlays Studio entry cards including OBS", () => {
    render(
      <V52OverlaysHome
        profilesCount={4}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Overlays Studio" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mis perfiles" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Comunidad" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "OBS Browser Source" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Widgets" })).toBeNull();
  });

  it("calls callbacks for all four entry cards", () => {
    const onOpenOwnProfiles = vi.fn();
    const onOpenRecommended = vi.fn();
    const onOpenCommunity = vi.fn();
    const onOpenObs = vi.fn();

    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={onOpenOwnProfiles}
        onOpenRecommended={onOpenRecommended}
        onOpenCommunity={onOpenCommunity}
        onOpenObs={onOpenObs}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Ver mis perfiles/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ver recomendados/ }));
    fireEvent.click(screen.getByRole("button", { name: /Explorar comunidad/ }));
    fireEvent.click(screen.getByRole("button", { name: /Configurar OBS/ }));

    expect(onOpenOwnProfiles).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
    expect(onOpenObs).toHaveBeenCalledTimes(1);
  });

  it("Comunidad card is clickable and calls onOpenCommunity", () => {
    const onOpenCommunity = vi.fn();

    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={onOpenCommunity}
        onOpenObs={vi.fn()}
      />,
    );

    const comunidadButton = screen.getByRole("button", { name: /Explorar comunidad/ });
    fireEvent.click(comunidadButton);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
  });

  it("renders recommended pills from RECOMMENDED_PROFILES", () => {
    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
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
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    const matches = screen.getAllByText(/3 perfiles propios/i);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render fake marketplace as active", () => {
    render(
      <V52OverlaysHome
        profilesCount={0}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    expect(screen.queryByText(/marketplace/i)).toBeNull();
    expect(screen.queryByText(/comunidad activa/i)).toBeNull();
    expect(screen.queryByText(/explorar comunidad/i)).toBeTruthy();
  });

  it("renders OBS Browser Source card with correct copy", () => {
    render(
      <V52OverlaysHome
        profilesCount={2}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />,
    );

    expect(screen.getByText("OBS Browser Source")).toBeTruthy();
    expect(screen.getByText("Copia la URL para capturar tu overlay en OBS.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Configurar OBS/ })).toBeTruthy();
  });
});
