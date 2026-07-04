import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../../lib/access-policy";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockUseAccess = vi.fn<() => AccessContext>();
vi.mock("../../lib/access", () => ({
  useAccess: () => mockUseAccess(),
}));

vi.mock("../preview/PreviewInspector", () => ({
  PreviewInspector: () => <div data-testid="preview-inspector" />,
}));

vi.mock("./RelativeSettingsSection", () => ({
  RelativeSettingsSection: () => <div data-testid="relative-settings" />,
}));

vi.mock("./StandingsSettingsSection", () => ({
  StandingsSettingsSection: () => <div data-testid="standings-settings" />,
}));

vi.mock("./PedalsSettingsSection", () => ({
  PedalsSettingsSection: () => <div data-testid="pedals-settings" />,
}));

vi.mock("./WidgetPresetSection", () => ({
  WidgetPresetSection: () => <div data-testid="widget-preset" />,
}));

vi.mock("./WidgetConfigSections", () => ({
  WidgetConfigSections: () => <div data-testid="widget-config" />,
}));

vi.mock("../widgets/WidgetDesignGallery", () => ({
  WidgetDesignGallery: () => <div data-testid="widget-design-gallery" />,
}));

vi.mock("../widgets/widget-design-gallery", () => ({
  applyOfficialDesignToProfile: vi.fn((p: unknown) => p),
}));

vi.mock("./WidgetVariantManager", () => ({
  WidgetVariantManager: ({ canApply }: { canApply?: boolean }) => (
    <div data-testid="widget-variant-manager" data-can-apply={String(canApply ?? true)} />
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { WidgetSettingsPanel } from "./WidgetSettingsPanel";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Factories ──────────────────────────────────────────────────────────────

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const paidAccess: AccessContext = {
  planLabel: "paid_overlays",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const testerAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: ["tester"],
  isBlocked: false,
  isUnconfigured: false,
};

function makeProfile(widgets: WidgetConfig[]): ProfileConfig {
  return {
    displayMode: "racing",
    monitorIndex: 0,
    widgets,
  };
}

function makeWidget(type: string, overrides?: Partial<WidgetConfig>): WidgetConfig {
  return {
    id: `${type}-1`,
    type,
    enabled: true,
    position: { x: 0, y: 0, w: 200, h: 100 },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("WidgetSettingsPanel — Pro gating", () => {
  it("shows Pro upgrade notice for a pro widget when user is free", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    const widget = makeWidget("relative"); // relative has access: "pro" in catalog
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    const notice = screen.getByTestId("pro-upgrade-notice");
    expect(notice).toBeDefined();
    expect(notice.textContent).toContain("Pro");
    expect(notice.textContent).toContain("upgrade to apply");
  });

  it("does NOT show Pro notice when user has paid access", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    const widget = makeWidget("relative");
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("pro-upgrade-notice")).toBeNull();
  });

  it("does NOT show Pro notice when user has tester role", () => {
    mockUseAccess.mockReturnValue(testerAccess);
    const widget = makeWidget("relative");
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("pro-upgrade-notice")).toBeNull();
  });

  it("does NOT show Pro notice for free-tier widgets", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    const widget = makeWidget("standings"); // standings has access: "free" in catalog
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("pro-upgrade-notice")).toBeNull();
  });

  it("does NOT show Pro notice when no widget is selected", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    const profile = makeProfile([]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={null}
        onChangeProfile={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("pro-upgrade-notice")).toBeNull();
  });
});

describe("WidgetSettingsPanel — canApply enforcement", () => {
  it("passes canApply=false to WidgetVariantManager for Free user on Pro widget", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    const widget = makeWidget("relative");
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    const variantMgr = screen.getByTestId("widget-variant-manager");
    expect(variantMgr.getAttribute("data-can-apply")).toBe("false");
  });

  it("passes canApply=true to WidgetVariantManager for Paid user on Pro widget", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    const widget = makeWidget("relative");
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    const variantMgr = screen.getByTestId("widget-variant-manager");
    expect(variantMgr.getAttribute("data-can-apply")).toBe("true");
  });

  it("passes canApply=true to WidgetVariantManager for Free user on Free widget", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    const widget = makeWidget("standings");
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    const variantMgr = screen.getByTestId("widget-variant-manager");
    expect(variantMgr.getAttribute("data-can-apply")).toBe("true");
  });

  it("passes canApply=true to WidgetVariantManager for Tester on Tester widget", () => {
    mockUseAccess.mockReturnValue(testerAccess);
    const widget = makeWidget("track-weather");
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    const variantMgr = screen.getByTestId("widget-variant-manager");
    expect(variantMgr.getAttribute("data-can-apply")).toBe("true");
  });
});
