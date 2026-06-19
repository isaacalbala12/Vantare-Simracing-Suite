import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { ProfilePreview } from "./ProfilePreview";
import type { ProfileConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const profile: ProfileConfig = {
  id: "preview-test",
  name: "Preview Test",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
    { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
  ],
};

describe("ProfilePreview", () => {
  it("renders real preview widget frames for a profile", () => {
    render(<ProfilePreview profile={profile} />);

    expect(screen.getByTestId("profile-preview")).toBeTruthy();
    expect(screen.getByTestId("preview-widget-frame-delta")).toBeTruthy();
    expect(screen.getByTestId("preview-widget-frame-relative")).toBeTruthy();
  });
});
