import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CommunityComingSoonView } from "./CommunityComingSoonView";

afterEach(() => {
  cleanup();
});

describe("CommunityComingSoonView", () => {
  it("shows a dedicated coming soon screen and back action", () => {
    const onBack = vi.fn();
    render(<CommunityComingSoonView onBack={onBack} />);

    expect(screen.getByRole("heading", { name: "Comunidad de overlays" })).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("contains honest copy about future community features", () => {
    render(<CommunityComingSoonView onBack={vi.fn()} />);

    expect(screen.getByText(/descubrir overlays de otros usuarios/i)).toBeTruthy();
    expect(screen.getByText(/compartir tus propios diseños/i)).toBeTruthy();
    expect(screen.getByText(/votar los mejores/i)).toBeTruthy();
  });

  it("does not contain fake community profiles or overlays", () => {
    render(<CommunityComingSoonView onBack={vi.fn()} />);

    expect(screen.queryByText(/overlay de/i)).toBeNull();
    expect(screen.queryByText(/usuario.*compartido/i)).toBeNull();
    expect(screen.queryByText(/descargar perfil/i)).toBeNull();
    expect(screen.queryByText(/comunidad activa/i)).toBeNull();
  });

  it("renders roadmap bullets", () => {
    render(<CommunityComingSoonView onBack={vi.fn()} />);

    expect(screen.getByText(/Explorar galería/i)).toBeTruthy();
    expect(screen.getByText(/Compartir perfiles/i)).toBeTruthy();
    expect(screen.getByText(/Votar y comentar/i)).toBeTruthy();
  });
});
