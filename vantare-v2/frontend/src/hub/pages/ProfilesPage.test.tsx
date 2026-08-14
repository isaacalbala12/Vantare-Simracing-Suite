import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Events } from "@wailsio/runtime";
import { ProfilesPage } from "./ProfilesPage";

const handlers = new Map<string, (event: { data: unknown }) => void>();

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, handler: (event: { data: unknown }) => void) => {
      handlers.set(name, handler);
      return vi.fn();
    }),
    Emit: vi.fn(),
  },
}));

function renderWithProfile() {
  handlers.clear();
  vi.mocked(Events.Emit).mockClear();
  render(<ProfilesPage />);
  act(() => {
    handlers.get("hub:profiles")?.({
      data: { profiles: [{ id: "race-hud", file: "race-hud.json", name: "Race HUD" }] },
    });
  });
}

describe("ProfilesPage", () => {
  afterEach(() => cleanup());

  it("renders heading", () => {
    render(<ProfilesPage />);
    expect(screen.getByText("Overlays")).toBeTruthy();
  });

  it("confirms a delete in the hub dialog instead of the native confirm", () => {
    const nativeConfirm = vi.fn();
    vi.stubGlobal("confirm", nativeConfirm);
    renderWithProfile();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    const dialog = screen.getByTestId("profiles-delete-dialog");
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("Race HUD");
    expect(vi.mocked(Events.Emit).mock.calls.some(([name]) => name === "hub:delete")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(Events.Emit).toHaveBeenCalledWith("hub:delete", {
      id: "race-hud",
      file: "race-hud.json",
    });
    vi.unstubAllGlobals();
  });

  it("keeps the profile when the delete dialog is cancelled", () => {
    renderWithProfile();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(
      within(screen.getByTestId("profiles-delete-dialog")).getByRole("button", { name: "Cancelar" }),
    );

    expect(screen.queryByTestId("profiles-delete-dialog")).toBeNull();
    expect(vi.mocked(Events.Emit).mock.calls.some(([name]) => name === "hub:delete")).toBe(false);
  });
});
