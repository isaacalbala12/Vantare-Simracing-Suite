import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileNameDialog } from "./ProfileNameDialog";

describe("ProfileNameDialog", () => {
  afterEach(() => cleanup());

  it("requires a non-empty name and submits the trimmed value", () => {
    const onConfirm = vi.fn();
    render(
      <ProfileNameDialog
        open
        title="Crear perfil"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByTestId("studio-profile-name-dialog-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("studio-profile-name-dialog-input"), {
      target: { value: "  Race HUD  " },
    });
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("Race HUD");
  });

  it("shows backend errors and resets the default name when reopened", () => {
    const { rerender } = render(
      <ProfileNameDialog
        open
        title="Crear perfil"
        defaultName="Preset"
        errorMessage="profile already exists"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-profile-name-dialog-error")).toBeTruthy();
    expect((screen.getByTestId("studio-profile-name-dialog-input") as HTMLInputElement).value).toBe("Preset");

    rerender(
      <ProfileNameDialog
        open={false}
        title="Crear perfil"
        defaultName="Preset"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    rerender(
      <ProfileNameDialog
        open
        title="Crear perfil"
        defaultName="Another"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("studio-profile-name-dialog-error")).toBeNull();
    expect((screen.getByTestId("studio-profile-name-dialog-input") as HTMLInputElement).value).toBe("Another");
  });
});