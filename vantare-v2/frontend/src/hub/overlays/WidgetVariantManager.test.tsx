import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { WidgetVariantManager, saveVariant, applyVariant, deleteVariant } from "./WidgetVariantManager";
import type { AccessContext } from "../../lib/access-policy";

vi.mock("@wailsio/runtime", () => ({
  Events: { On: vi.fn(), Off: vi.fn(), Emit: vi.fn() },
}));

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseWidget: WidgetConfig = {
  id: "delta",
  type: "delta",
  enabled: true,
  updateHz: 30,
  position: { x: 100, y: 200, w: 400, h: 48 },
  style: "vantare-crystal",
};

const profile: ProfileConfig = {
  id: "test-profile",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [baseWidget],
  variants: [],
};

const profileWithVariant: ProfileConfig = {
  ...profile,
  variants: [
    {
      id: "variant-delta-1",
      widgetType: "delta",
      themeId: "vantare-crystal",
      name: "My Delta",
      slots: [{ id: "headerStat", metricId: "pos", enabled: true }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe("WidgetVariantManager", () => {
  it("renders 'Save as Variant' button", () => {
    render(
      <WidgetVariantManager
        profile={profile}
        widget={baseWidget}
        onChangeProfile={vi.fn()}
      />,
    );
    expect(screen.getByText("Save as Variant")).toBeTruthy();
  });

  it("disables Save as Variant button when canApply is false", () => {
    render(
      <WidgetVariantManager
        profile={profile}
        widget={baseWidget}
        onChangeProfile={vi.fn()}
        canApply={false}
      />,
    );
    const btn = screen.getByTestId("save-variant-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Save as Variant button when canApply is true and name entered", () => {
    render(
      <WidgetVariantManager
        profile={profile}
        widget={baseWidget}
        onChangeProfile={vi.fn()}
        canApply={true}
      />,
    );
    const input = screen.getByPlaceholderText("Variant name…");
    fireEvent.change(input, { target: { value: "Test Variant" } });
    const btn = screen.getByTestId("save-variant-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("disables Apply button when canApply is false", () => {
    render(
      <WidgetVariantManager
        profile={profileWithVariant}
        widget={baseWidget}
        onChangeProfile={vi.fn()}
        canApply={false}
      />,
    );
    const applyBtn = screen.getByTestId("apply-variant-btn") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });

  it("enables Apply button when canApply is true and variant selected", async () => {
    render(
      <WidgetVariantManager
        profile={profileWithVariant}
        widget={baseWidget}
        onChangeProfile={vi.fn()}
        canApply={true}
      />,
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "variant-delta-1" } });
    const applyBtn = screen.getByTestId("apply-variant-btn") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
  });

  it("variant selector shows variants for current widget type only", () => {
    const mixedProfile: ProfileConfig = {
      ...profile,
      variants: [
        {
          id: "variant-delta-1",
          widgetType: "delta",
          name: "Delta A",
        },
        {
          id: "variant-relative-1",
          widgetType: "relative",
          name: "Relative A",
        },
      ],
    };
    render(
      <WidgetVariantManager
        profile={mixedProfile}
        widget={baseWidget}
        onChangeProfile={vi.fn()}
      />,
    );
    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(options).toContainEqual("Delta A");
    expect(options).not.toContainEqual("Relative A");
  });
});

// ---------------------------------------------------------------------------
// Logic tests
// ---------------------------------------------------------------------------

describe("saveVariant", () => {
  it("creates entry in profile.variants", () => {
    const result = saveVariant(profile, baseWidget, "Test Variant");
    expect(result.variants).toHaveLength(1);
    expect(result.variants![0].name).toBe("Test Variant");
    expect(result.variants![0].widgetType).toBe("delta");
  });

  it("does NOT include position/x/y/w/h in variant", () => {
    const result = saveVariant(profile, baseWidget, "No Position");
    const variant = result.variants![0];
    expect(variant).not.toHaveProperty("position");
    expect(variant).not.toHaveProperty("x");
    expect(variant).not.toHaveProperty("y");
    expect(variant).not.toHaveProperty("w");
    expect(variant).not.toHaveProperty("h");
  });
});

describe("applyVariant", () => {
  it("sets widget.variantId", () => {
    const result = applyVariant(profileWithVariant, "delta", "variant-delta-1");
    const widget = result.widgets.find((w) => w.id === "delta")!;
    expect(widget.variantId).toBe("variant-delta-1");
  });

  it("does NOT change widget.position", () => {
    const originalPosition = { ...baseWidget.position };
    const result = applyVariant(profileWithVariant, "delta", "variant-delta-1");
    const widget = result.widgets.find((w) => w.id === "delta")!;
    expect(widget.position).toEqual(originalPosition);
  });

  it("preserves existing position values", () => {
    const widgetWithPos: WidgetConfig = {
      ...baseWidget,
      position: { x: 55, y: 77, w: 320, h: 280 },
    };
    const prof: ProfileConfig = {
      ...profile,
      widgets: [widgetWithPos],
      variants: profileWithVariant.variants,
    };
    const result = applyVariant(prof, "delta", "variant-delta-1");
    const widget = result.widgets.find((w) => w.id === "delta")!;
    expect(widget.position).toEqual({ x: 55, y: 77, w: 320, h: 280 });
  });
});

describe("deleteVariant", () => {
  it("removes variant from profile.variants", () => {
    const result = deleteVariant(profileWithVariant, "variant-delta-1");
    expect(result.variants).toHaveLength(0);
  });
});
// ---------------------------------------------------------------------------
// Access gating — RED tests (must fail before fix)
// ---------------------------------------------------------------------------

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

describe("saveVariant — access gating", () => {
  it("rejects free user saving a pro widget variant", () => {
    const proWidget: WidgetConfig = { ...baseWidget, type: "relative" };
    const result = saveVariant(profile, proWidget, "Test", freeAccess);
    expect(result.variants).toHaveLength(0);
  });

  it("allows paid user saving a pro widget variant", () => {
    const proWidget: WidgetConfig = { ...baseWidget, type: "relative" };
    const result = saveVariant(profile, proWidget, "Test", paidAccess);
    expect(result.variants).toHaveLength(1);
  });

  it("allows free user saving a free widget variant", () => {
    const result = saveVariant(profile, baseWidget, "Test", freeAccess);
    expect(result.variants).toHaveLength(1);
  });

  it("allows tester user saving a tester widget variant", () => {
    const testerWidget: WidgetConfig = { ...baseWidget, type: "track-weather" };
    const result = saveVariant(profile, testerWidget, "Test", testerAccess);
    expect(result.variants).toHaveLength(1);
  });
});

describe("applyVariant — access gating", () => {
  const proProfile: ProfileConfig = {
    ...profile,
    widgets: [{ ...baseWidget, id: "relative", type: "relative" }],
    variants: [
      {
        id: "variant-relative-1",
        widgetType: "relative",
        themeId: "vantare-crystal",
        name: "Pro Variant",
        slots: [{ id: "headerStat", metricId: "pos", enabled: true }],
      },
    ],
  };

  it("rejects free user applying a pro widget variant", () => {
    const result = applyVariant(proProfile, "relative", "variant-relative-1", freeAccess);
    const widget = result.widgets.find((w) => w.id === "relative")!;
    expect(widget.variantId).toBeUndefined();
  });

  it("allows paid user applying a pro widget variant", () => {
    const result = applyVariant(proProfile, "relative", "variant-relative-1", paidAccess);
    const widget = result.widgets.find((w) => w.id === "relative")!;
    expect(widget.variantId).toBe("variant-relative-1");
  });
});

describe("WidgetVariantManager — handler guards", () => {
  it("does not call onChangeProfile when saving with canApply=false", () => {
    const onChangeProfile = vi.fn();
    render(
      <WidgetVariantManager
        profile={profile}
        widget={baseWidget}
        onChangeProfile={onChangeProfile}
        canApply={false}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Variant name…"), {
      target: { value: "Should Not Save" },
    });
    // Button is disabled, but handler should also guard
    fireEvent.click(screen.getByTestId("save-variant-btn"));
    expect(onChangeProfile).not.toHaveBeenCalled();
  });

  it("does not call onChangeProfile when applying with canApply=false", () => {
    const onChangeProfile = vi.fn();
    render(
      <WidgetVariantManager
        profile={profileWithVariant}
        widget={baseWidget}
        onChangeProfile={onChangeProfile}
        canApply={false}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "variant-delta-1" },
    });
    fireEvent.click(screen.getByTestId("apply-variant-btn"));
    expect(onChangeProfile).not.toHaveBeenCalled();
  });
  it("disables Delete button when canApply is false", () => {
    render(
      <WidgetVariantManager
        profile={profileWithVariant}
        widget={baseWidget}
        onChangeProfile={vi.fn()}
        canApply={false}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "variant-delta-1" },
    });
    const deleteBtn = screen.getByTestId("delete-variant-btn") as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(true);
  });

  it("does not call onChangeProfile when deleting with canApply=false", () => {
    const onChangeProfile = vi.fn();
    render(
      <WidgetVariantManager
        profile={profileWithVariant}
        widget={baseWidget}
        onChangeProfile={onChangeProfile}
        canApply={false}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "variant-delta-1" },
    });
    // Button is disabled, but handler should also guard
    fireEvent.click(screen.getByTestId("delete-variant-btn"));
    expect(onChangeProfile).not.toHaveBeenCalled();
  });

  it("allows Delete when canApply is true and variant selected", () => {
    const onChangeProfile = vi.fn();
    render(
      <WidgetVariantManager
        profile={profileWithVariant}
        widget={baseWidget}
        onChangeProfile={onChangeProfile}
        canApply={true}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "variant-delta-1" },
    });
    const deleteBtn = screen.getByTestId("delete-variant-btn") as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(false);
    fireEvent.click(deleteBtn);
    expect(onChangeProfile).toHaveBeenCalled();
    const result = onChangeProfile.mock.calls[0][0];
    expect(result.variants).toHaveLength(0);
  });
});
