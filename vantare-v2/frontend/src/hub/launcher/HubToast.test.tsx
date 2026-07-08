import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { HubToast } from "./HubToast";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
  },
}));

describe("HubToast", () => {
  it("renders success toast with retry button on partial", () => {
    render(
      <HubToast
        variant="partial"
        message="Creator · 3/4 apps listas, falló OBS"
        profileId="creator"
      />,
    );

    expect(screen.getByTestId("hub-toast-partial")).toBeTruthy();
    expect(screen.getByTestId("hub-toast-message").textContent).toBe(
      "Creator · 3/4 apps listas, falló OBS",
    );
    expect(screen.getByTestId("hub-toast-retry")).toBeTruthy();
  });

  it("emits retry event on retry button click", () => {
    render(
      <HubToast
        variant="partial"
        message="Creator · 3/4 apps listas, falló OBS"
        profileId="creator"
      />,
    );

    fireEvent.click(screen.getByTestId("hub-toast-retry"));

    expect(Events.Emit).toHaveBeenCalledWith(
      "launcher:profile:retry:failed",
      { id: "creator" },
    );
  });
});
