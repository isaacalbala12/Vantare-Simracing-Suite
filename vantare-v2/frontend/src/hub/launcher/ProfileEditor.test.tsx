import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileEditor } from "./ProfileEditor";
import type { LaunchProfile } from "./launcher-state";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseProfile: LaunchProfile = {
  id: "p1",
  name: "P1",
  description: "d",
  steps: [],
  notes: "n",
};

describe("ProfileEditor", () => {
  it("renders side-panel with name, description, notes fields", () => {
    render(
      <ProfileEditor
        profile={baseProfile}
        open={true}
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    const nameInput = screen.getByTestId(
      "profile-editor-name",
    ) as HTMLInputElement;
    const descInput = screen.getByTestId(
      "profile-editor-description",
    ) as HTMLInputElement;
    const notesInput = screen.getByTestId(
      "profile-editor-notes",
    ) as HTMLTextAreaElement;
    expect(nameInput.value).toBe("P1");
    expect(descInput.value).toBe("d");
    expect(notesInput.value).toBe("n");
  });

  it("calls onSave with updated profile when save button clicked", () => {
    const onSave = vi.fn();
    render(
      <ProfileEditor
        profile={baseProfile}
        open={true}
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    const nameInput = screen.getByTestId("profile-editor-name");
    fireEvent.change(nameInput, { target: { value: "P1 Updated" } });
    fireEvent.click(screen.getByTestId("profile-editor-save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p1",
        name: "P1 Updated",
        description: "d",
        notes: "n",
      }),
    );
  });

  it("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(
      <ProfileEditor
        profile={baseProfile}
        open={true}
        onClose={onClose}
        onSave={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("profile-editor-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
