import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommendedQuickStart } from "./RecommendedQuickStart";

afterEach(() => cleanup());

describe("RecommendedQuickStart", () => {
  it("renders primary CTA when there is no active profile", () => {
    const onUseRecommended = vi.fn();
    render(
      <RecommendedQuickStart
        hasActiveProfile={false}
        onUseRecommended={onUseRecommended}
        onGoToObsSetup={vi.fn()}
      />,
    );
    const cta = screen.getByTestId("recommended-quickstart-cta");
    expect(cta.textContent).toMatch(/Usar perfil recomendado/i);
    expect(screen.queryByTestId("recommended-quickstart-obs-link")).toBeNull();
  });

  it("calls onUseRecommended when primary CTA is clicked (no active profile)", () => {
    const onUseRecommended = vi.fn();
    render(
      <RecommendedQuickStart
        hasActiveProfile={false}
        onUseRecommended={onUseRecommended}
        onGoToObsSetup={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("recommended-quickstart-cta"));
    expect(onUseRecommended).toHaveBeenCalledTimes(1);
  });

  it("renders OBS link and hides primary CTA when there is an active profile", () => {
    render(
      <RecommendedQuickStart
        hasActiveProfile
        onUseRecommended={vi.fn()}
        onGoToObsSetup={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("recommended-quickstart-cta")).toBeNull();
    const link = screen.getByTestId("recommended-quickstart-obs-link");
    expect(link.textContent).toMatch(/Configurar OBS/i);
  });

  it("calls onGoToObsSetup when OBS link is clicked (active profile)", () => {
    const onGoToObsSetup = vi.fn();
    render(
      <RecommendedQuickStart
        hasActiveProfile
        onUseRecommended={vi.fn()}
        onGoToObsSetup={onGoToObsSetup}
      />,
    );
    fireEvent.click(screen.getByTestId("recommended-quickstart-obs-link"));
    expect(onGoToObsSetup).toHaveBeenCalledWith("setup");
  });
});
