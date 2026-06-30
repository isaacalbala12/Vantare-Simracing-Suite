import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommendedSuccessBanner } from "./RecommendedSuccessBanner";

afterEach(() => cleanup());

describe("RecommendedSuccessBanner", () => {
  it("renderiza el texto literal y el id del perfil", () => {
    render(<RecommendedSuccessBanner profileId="custom-vantare-clean-overlay" onGoToDashboard={vi.fn()} />);
    expect(screen.getByTestId("recommended-success-banner").textContent).toMatch(/Recomendado activado y abierto/);
    expect(screen.getByText(/custom-vantare-clean-overlay/)).toBeTruthy();
  });

  it("llama a onGoToDashboard al hacer click", () => {
    const onGoToDashboard = vi.fn();
    render(<RecommendedSuccessBanner profileId="x" onGoToDashboard={onGoToDashboard} />);
    fireEvent.click(screen.getByTestId("recommended-success-go-hub"));
    expect(onGoToDashboard).toHaveBeenCalledTimes(1);
  });
});
