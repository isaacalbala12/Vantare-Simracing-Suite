import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { StudioHome } from "./StudioHome";

afterEach(() => {
  cleanup();
});

describe("StudioHome", () => {
  it("renders professional clickable panels instead of inline profile lists", () => {
    render(
      <StudioHome
        profileCount={2}
        recommendedCount={3}
        onOpenWidgetStudio={vi.fn()}
        onOpenOwnProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Abrir Widgets/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Mis perfiles/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Abrir Comunidad/i })).toBeTruthy();

    expect(screen.queryByText("Perfiles específicos")).toBeNull();
  });

  it("opens each section when its whole panel is clicked", () => {
    const onOpenWidgetStudio = vi.fn();
    const onOpenOwnProfiles = vi.fn();
    const onOpenRecommended = vi.fn();
    const onOpenCommunity = vi.fn();

    render(
      <StudioHome
        profileCount={2}
        recommendedCount={3}
        onOpenWidgetStudio={onOpenWidgetStudio}
        onOpenOwnProfiles={onOpenOwnProfiles}
        onOpenRecommended={onOpenRecommended}
        onOpenCommunity={onOpenCommunity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Abrir Widgets/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Mis perfiles/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Recomendados por Vantare/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Comunidad/i }));

    expect(onOpenWidgetStudio).toHaveBeenCalledTimes(1);
    expect(onOpenOwnProfiles).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
    expect(onOpenCommunity).toHaveBeenCalledTimes(1);
  });
});
