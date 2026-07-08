import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileEditor } from "./ProfileEditor";
import type { LaunchProfile, LauncherAppEntry } from "./launcher-state";

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

const mockApps: LauncherAppEntry[] = [
  {
    id: "lmu",
    displayName: "Le Mans Ultimate",
    abbreviation: "LMU",
    category: "simulator",
    launchMethod: "steam-uri",
    steamAppId: 2399420,
    detected: true,
    gradientFrom: "#ff3b3b",
    gradientTo: "#9a0606",
  },
  {
    id: "obs",
    displayName: "OBS Studio",
    abbreviation: "OBS",
    category: "streaming",
    launchMethod: "executable",
    detected: true,
    gradientFrom: "#302e31",
    gradientTo: "#1a1a1a",
  },
];

describe("ProfileEditor", () => {
  it("renders side-panel with name, description, notes fields", () => {
    render(
      <ProfileEditor
        profile={baseProfile}
        open={true}
        onClose={() => {}}
        onSave={() => {}}
        apps={mockApps}
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
        apps={mockApps}
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
        apps={mockApps}
      />,
    );
    fireEvent.click(screen.getByTestId("profile-editor-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Task 3.3b tests ──────────────────────────────────────────

  it("renders steps editor with add/remove/reorder", () => {
    const profileWithStep: LaunchProfile = {
      ...baseProfile,
      steps: [{ appId: "lmu", delay: 2 }],
    };
    render(
      <ProfileEditor
        profile={profileWithStep}
        open={true}
        onClose={() => {}}
        onSave={() => {}}
        apps={mockApps}
      />,
    );
    // Step row exists with select, delay, remove, up, and down elements
    expect(screen.getByTestId("editor-step-0")).not.toBeNull();
    expect(screen.getByTestId("editor-step-app-0")).not.toBeNull();
    expect(screen.getByTestId("editor-step-delay-0")).not.toBeNull();
    expect(screen.getByTestId("editor-step-remove-0")).not.toBeNull();
    expect(screen.getByTestId("editor-step-up-0")).not.toBeNull();
    expect(screen.getByTestId("editor-step-down-0")).not.toBeNull();
    // "Add step" button is present
    expect(screen.getByTestId("editor-step-add")).not.toBeNull();
  });

  it("renders hotkey input", () => {
    render(
      <ProfileEditor
        profile={baseProfile}
        open={true}
        onClose={() => {}}
        onSave={() => {}}
        apps={mockApps}
      />,
    );
    const hotkeyInput = screen.getByTestId(
      "profile-editor-hotkey",
    ) as HTMLInputElement;
    expect(hotkeyInput).not.toBeNull();
    expect(hotkeyInput.placeholder).toContain("ctrl+shift+1");
  });

  it("renders autostart toggle disabled when no steps", () => {
    render(
      <ProfileEditor
        profile={baseProfile}
        open={true}
        onClose={() => {}}
        onSave={() => {}}
        apps={mockApps}
      />,
    );
    const autostartCheckbox = screen.getByTestId(
      "profile-editor-autostart",
    ) as HTMLInputElement;
    expect(autostartCheckbox).not.toBeNull();
    expect(autostartCheckbox.disabled).toBe(true);
  });
});
