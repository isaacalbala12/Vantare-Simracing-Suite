import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { registerBuiltinDesignSystems } from "../registry/builtin-systems";
import { ProfilePreview } from "./ProfilePreview";
import type { ProfileConfig } from "../../lib/profile";

beforeAll(() => {
  registerBuiltinDesignSystems();
});

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

const fullRacingProfile: ProfileConfig = {
  ...profile,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 610, y: 940, w: 700, h: 120 } },
    { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 40, y: 40, w: 300, h: 250 } },
    { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 1310, y: 156, w: 320, h: 550 } },
    { id: "telemetry", type: "telemetry", enabled: true, updateHz: 30, position: { x: 176, y: 488, w: 400, h: 250 } },
    { id: "telemetry-vertical", type: "telemetry-vertical", enabled: true, updateHz: 30, position: { x: 1338, y: 66, w: 140, h: 400 } },
    { id: "pedals", type: "pedals", enabled: true, updateHz: 30, position: { x: 690, y: 980, w: 530, h: 80 } },
  ],
};

describe("ProfilePreview", () => {
  it("renders V3 preview frames for core widgets", () => {
    render(<ProfilePreview profile={profile} />);

    expect(screen.getByTestId("profile-preview")).toBeTruthy();
    expect(screen.getByTestId("profile-preview-frame-delta")).toBeTruthy();
    expect(screen.getByTestId("profile-preview-frame-relative")).toBeTruthy();
  });

  it("scales content from a stable canonical width inside the document frame", () => {
    render(<ProfilePreview profile={profile} />);

    const relativeFrame = screen.getByTestId("profile-preview-frame-relative");
    expect(relativeFrame.style.width).toBe("320px");
    expect(relativeFrame.style.height).toBe("280px");
    const viewport = screen.getByTestId("profile-preview-viewport-relative");
    expect(viewport.style.width).toBe("430px");
    expect(Number.parseFloat(viewport.style.height)).toBeCloseTo(376.25, 5);
    expect(viewport.style.transform).toBe(`scale(${320 / 430})`);
  });

  it("renders when ResizeObserver is unavailable", () => {
    const originalResizeObserver = window.ResizeObserver;
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: undefined,
    });

    try {
      render(<ProfilePreview profile={profile} />);

      expect(screen.getByTestId("profile-preview")).toBeTruthy();
      expect(screen.getByTestId("profile-preview-frame-delta")).toBeTruthy();
    } finally {
      Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        value: originalResizeObserver,
      });
    }
  });

  it("renders core widgets from a mixed legacy racing profile", () => {
    render(<ProfilePreview profile={fullRacingProfile} />);

    expect(screen.getByTestId("profile-preview-frame-standings")).toBeTruthy();
    expect(screen.getByTestId("profile-preview-frame-pedals")).toBeTruthy();
    expect(screen.queryByTestId("profile-preview-frame-telemetry")).toBeNull();
  });
});
