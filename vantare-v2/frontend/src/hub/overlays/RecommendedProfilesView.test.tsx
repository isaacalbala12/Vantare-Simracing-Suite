import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RecommendedProfilesView } from "./RecommendedProfilesView";
import { RECOMMENDED_PROFILES } from "./recommended-profiles";

afterEach(() => {
  cleanup();
});

describe("RecommendedProfilesView", () => {
  it("shows recommended profiles with real previews", () => {
    render(
      <RecommendedProfilesView
        profiles={RECOMMENDED_PROFILES}
        onSaveRecommended={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Recomendados por Vantare" })).toBeTruthy();
    expect(screen.getByText("Racing Básico")).toBeTruthy();
    expect(screen.getAllByTestId("profile-preview").length).toBe(RECOMMENDED_PROFILES.length);
  });

  it("saves a recommended profile and goes back", () => {
    const onSaveRecommended = vi.fn();
    const onBack = vi.fn();

    render(
      <RecommendedProfilesView
        profiles={RECOMMENDED_PROFILES}
        onSaveRecommended={onSaveRecommended}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Guardar Racing Básico como perfil propio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));

    expect(onSaveRecommended).toHaveBeenCalledWith(RECOMMENDED_PROFILES[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
