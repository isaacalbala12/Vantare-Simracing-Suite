import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObsOverlaySetupView } from "./ObsOverlaySetupView";

afterEach(() => cleanup());

describe("ObsOverlaySetupView", () => {
  it("renders OBS Browser Source heading and ObsSetup with URL", () => {
    render(<ObsOverlaySetupView url="http://localhost/overlay?profile=test-profile" onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "OBS Browser Source" })).toBeTruthy();
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const urlInput = inputs.find((i) => i.value.includes("/overlay"));
    expect(urlInput).toBeDefined();
    expect(urlInput!.value).toContain("profile=test-profile");
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(<ObsOverlaySetupView url="http://localhost/overlay?profile=test" onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders copy URL and copy instructions buttons", () => {
    render(<ObsOverlaySetupView url="http://localhost/overlay?profile=test" onBack={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Copiar URL" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar instrucciones" })).toBeTruthy();
  });
});
