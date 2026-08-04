import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useLicenseMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/license", () => ({
  useLicense: useLicenseMock,
}));

import { OverlayWorkshopAccessRoute } from "./OverlayWorkshopDevRoute";

afterEach(() => cleanup());

describe("OverlayWorkshopAccessRoute", () => {
  it("waits for the native signed-credential result before evaluating an internal deep-link", () => {
    useLicenseMock.mockReturnValue({ loading: true, result: null });

    render(<OverlayWorkshopAccessRoute isDevelopment={false} />);

    expect(document.querySelector("[data-overlay-workshop-access-pending]")).toBeTruthy();
    expect(document.querySelector("[data-overlay-workshop-page]")).toBeNull();
  });

  it("denies a non-owner deep-link before mounting workshop controls in prerelease mode", () => {
    useLicenseMock.mockReturnValue({
      loading: false,
      result: {
        state: "active", entitlements: [], operationalRoles: ["nightly_tester"],
        userId: "user", email: "not-authority@example.test", deviceOK: true,
      },
    });

    render(<OverlayWorkshopAccessRoute isDevelopment={false} />);

    expect(screen.getByRole("alert").textContent).toContain("access denied");
    expect(document.querySelector("[data-overlay-workshop-page]")).toBeNull();
    expect(document.querySelector("[data-overlay-workshop-stage]")).toBeNull();
  });

  it("mounts the real Workshop only for a verified owner role, independently of commercial entitlements", () => {
    useLicenseMock.mockReturnValue({
      loading: false,
      result: {
        state: "active", entitlements: [], operationalRoles: ["owner"],
        userId: "owner", email: "not-authority@example.test", deviceOK: true,
      },
    });

    render(<OverlayWorkshopAccessRoute isDevelopment={false} />);

    expect(document.querySelector("[data-overlay-workshop-access-denied]")).toBeNull();
    expect(document.querySelector("[data-overlay-workshop-page]")).toBeTruthy();
  });
});
