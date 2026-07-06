import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const mockOnDraftChange = vi.hoisted(() => vi.fn());
vi.mock("./WidgetConfigSections", () => ({
  WidgetConfigSections: ({
    canApply,
    onDraftChange,
  }: {
    canApply?: boolean;
    onDraftChange?: (changes: { slots?: unknown[]; columns?: unknown[]; columnGroups?: unknown[] }) => void;
  }) => (
    <div data-testid="widget-config" data-can-apply={String(canApply ?? true)}>
      <button
        type="button"
        data-testid="trigger-draft-change"
        onClick={() => {
          if (mockOnDraftChange.mock.calls.length === 0) {
            onDraftChange?.({ slots: [{ id: "x", metricId: "pos", enabled: false }] });
          } else {
            onDraftChange?.({ slots: [{ id: "x", metricId: "pos", enabled: true }] });
          }
          mockOnDraftChange();
        }}
      />
    </div>
  ),
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
    expect(notice.textContent).toContain("mejora para aplicar");
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
// ── Save-to-widget (handleSaveToWidget) ────────────────────────────────────

describe("WidgetSettingsPanel — Save to widget", () => {
  beforeEach(() => {
    mockOnDraftChange.mockReset();
  });

  it("shows save-to-widget button when draft is dirty and canApply=true", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    const widget = makeWidget("standings"); // free widget → canApply=true for paid
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    // Initially no save button (draft === effective)
    expect(screen.queryByTestId("save-to-widget-btn")).toBeNull();

    // Trigger draft change via mock test button
    fireEvent.click(screen.getByTestId("trigger-draft-change"));

    // Now save button should appear
    expect(screen.getByTestId("save-to-widget-btn")).toBeDefined();
  });

  it("calls onChangeProfile with correct payload on save", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    const widget = makeWidget("standings");
    const profile = makeProfile([widget]);
    const onChangeProfile = vi.fn();

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={onChangeProfile}
      />,
    );

    // Trigger dirty state
    fireEvent.click(screen.getByTestId("trigger-draft-change"));
    // Click save
    fireEvent.click(screen.getByTestId("save-to-widget-btn"));

    expect(onChangeProfile).toHaveBeenCalledTimes(1);
    const saved = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    const updatedWidget = saved.widgets.find((w) => w.id === widget.id)!;

    // props.slots should match the draft change
    expect(updatedWidget.props?.slots).toEqual([
      { id: "x", metricId: "pos", enabled: false },
    ]);
  });

  it("preserves widget.position when saving", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    const widget = makeWidget("standings", {
      position: { x: 100, y: 200, w: 400, h: 300 },
    });
    const profile = makeProfile([widget]);
    const onChangeProfile = vi.fn();

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByTestId("trigger-draft-change"));
    fireEvent.click(screen.getByTestId("save-to-widget-btn"));

    const saved = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    const updatedWidget = saved.widgets.find((w) => w.id === widget.id)!;
    expect(updatedWidget.position).toEqual({ x: 100, y: 200, w: 400, h: 300 });
  });

  it("does NOT create or modify profile.variants", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    const widget = makeWidget("standings");
    const profile = makeProfile([widget]);
    profile.variants = [{ id: "existing-v", widgetType: "standings", name: "Existing" }];
    const onChangeProfile = vi.fn();

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByTestId("trigger-draft-change"));
    fireEvent.click(screen.getByTestId("save-to-widget-btn"));

    const saved = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    // Variants should be unchanged (same reference)
    expect(saved.variants).toBe(profile.variants);
    expect(saved.variants).toHaveLength(1);
    expect(saved.variants![0].id).toBe("existing-v");
  });

  it("only changes props.slots, props.columns, props.columnGroups", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    const widget = makeWidget("standings", {
      props: { appearance: { accentColor: "#ff0000" }, customKey: "keep-me" },
    });
    const profile = makeProfile([widget]);
    const onChangeProfile = vi.fn();

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByTestId("trigger-draft-change"));
    fireEvent.click(screen.getByTestId("save-to-widget-btn"));

    const saved = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    const updatedWidget = saved.widgets.find((w) => w.id === widget.id)!;

    // Existing props preserved
    expect(updatedWidget.props?.appearance).toEqual({ accentColor: "#ff0000" });
    expect(updatedWidget.props?.customKey).toBe("keep-me");
    // Config props added
    expect(updatedWidget.props?.slots).toBeDefined();
    expect(updatedWidget.props?.columns).toBeDefined();
    expect(updatedWidget.props?.columnGroups).toBeDefined();
  });

  it("does NOT show save-to-widget button when canApply=false", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    const widget = makeWidget("relative"); // pro widget → canApply=false for free
    const profile = makeProfile([widget]);

    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={widget}
        onChangeProfile={vi.fn()}
      />,
    );

    // Trigger draft change
    fireEvent.click(screen.getByTestId("trigger-draft-change"));

    // Save button should NOT appear even though draft is dirty
    expect(screen.queryByTestId("save-to-widget-btn")).toBeNull();
  });
});
