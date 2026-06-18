import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { StudioHome } from "./StudioHome";

afterEach(() => {
  cleanup();
});

const profiles = [
  { id: "default-racing", file: "example-racing.json", name: "Default Racing", displayMode: "racing", widgets: 3 },
];

describe("StudioHome", () => {
  it("shows own profiles, widget studio entry, recommended profiles, and community placeholder", () => {
    render(
      <StudioHome
        profiles={profiles}
        onOpenWidgetStudio={vi.fn()}
        onOpenProfile={vi.fn()}
        onCreateProfile={vi.fn()}
        onSaveRecommended={vi.fn()}
      />,
    );

    expect(screen.getByText("Widgets")).toBeTruthy();
    expect(screen.getByText("Perfiles específicos")).toBeTruthy();
    expect(screen.getByText("Default Racing")).toBeTruthy();
    expect(screen.getByText("Recomendados por Vantare")).toBeTruthy();
    expect(screen.getByText("Comunidad")).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();
  });

  it("opens widget studio when Widgets is clicked", () => {
    const onOpenWidgetStudio = vi.fn();

    render(
      <StudioHome
        profiles={profiles}
        onOpenWidgetStudio={onOpenWidgetStudio}
        onOpenProfile={vi.fn()}
        onCreateProfile={vi.fn()}
        onSaveRecommended={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Abrir widgets/i }));
    expect(onOpenWidgetStudio).toHaveBeenCalled();
  });

  it("opens a specific profile when clicking its edit action", () => {
    const onOpenProfile = vi.fn();

    render(
      <StudioHome
        profiles={profiles}
        onOpenWidgetStudio={vi.fn()}
        onOpenProfile={onOpenProfile}
        onCreateProfile={vi.fn()}
        onSaveRecommended={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Editar Default Racing/i }));
    expect(onOpenProfile).toHaveBeenCalledWith(profiles[0]);
  });
});
