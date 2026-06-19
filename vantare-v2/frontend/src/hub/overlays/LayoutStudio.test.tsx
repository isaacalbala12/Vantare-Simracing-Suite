import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutStudio } from "./LayoutStudio";
import type { ProfileConfig } from "../../lib/profile";

const profile: ProfileConfig = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
  ],
};

describe("LayoutStudio", () => {
  it("renders layout studio and hides appearance controls", () => {
    render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("Perfiles Específicos")).toBeTruthy();
    expect(screen.queryByText("APARIENCIA")).toBeNull();
    expect(screen.getByText("POSICIÓN Y TAMAÑO")).toBeTruthy();
  });
});
