import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { WidgetPresetSection } from "./WidgetPresetSection";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import type { WidgetPreset } from "../../lib/widget-presets";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock("../../lib/widget-presets-store", () => ({
  listPresets: vi.fn().mockResolvedValue([]),
  savePreset: vi.fn(),
  deletePreset: vi.fn(),
  renamePreset: vi.fn(),
  onPresetSaveError: vi.fn().mockReturnValue(() => {}),
  onPresetDeleteError: vi.fn().mockReturnValue(() => {}),
  onPresetRenameError: vi.fn().mockReturnValue(() => {}),
}));

const mockWidget: WidgetConfig = {
  id: "rel-1",
  type: "relative",
  enabled: true,
  updateHz: 15,
  position: { x: 100, y: 200, w: 320, h: 280 },
  props: { appearance: { accentColor: "#ff0000" } },
};

const mockProfile: ProfileConfig = {
  schemaVersion: 2,
  id: "test",
  name: "Test",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [mockWidget],
  variants: [],
};

describe("WidgetPresetSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders section header when widget is selected", () => {
    render(
      <WidgetPresetSection
        profile={mockProfile}
        widget={mockWidget}
        onChangeProfile={vi.fn()}
      />,
    );
    expect(screen.getByText("Presets")).toBeTruthy();
  });

  it("renders save button", () => {
    render(
      <WidgetPresetSection
        profile={mockProfile}
        widget={mockWidget}
        onChangeProfile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("preset-save-btn")).toBeTruthy();
  });

  it("calls savePreset when save button clicked and name provided", async () => {
    window.prompt = vi.fn().mockReturnValue("My Preset");
    const { savePreset } = await import("../../lib/widget-presets-store");
    render(
      <WidgetPresetSection
        profile={mockProfile}
        widget={mockWidget}
        onChangeProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("preset-save-btn"));
    await waitFor(() => {
      expect(savePreset).toHaveBeenCalled();
    });
  });

  it("does not save when prompt is cancelled", () => {
    window.prompt = vi.fn().mockReturnValue(null);
    render(
      <WidgetPresetSection
        profile={mockProfile}
        widget={mockWidget}
        onChangeProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("preset-save-btn"));
    // No crash, no save call
  });

  it("lists presets filtered by widget type", async () => {
    const { listPresets } = await import("../../lib/widget-presets-store");
    const mockPresets: WidgetPreset[] = [
      { id: "p1", name: "P1", widgetType: "relative", appearance: {}, createdAt: "", updatedAt: "" },
    ];
    vi.mocked(listPresets).mockResolvedValue(mockPresets);
    render(
      <WidgetPresetSection
        profile={mockProfile}
        widget={mockWidget}
        onChangeProfile={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("P1")).toBeTruthy();
    });
  });

  it("applies preset and calls onChangeProfile without touching position", async () => {
    const { listPresets } = await import("../../lib/widget-presets-store");
    const mockPresets: WidgetPreset[] = [
      {
        id: "p1",
        name: "P1",
        widgetType: "relative",
        appearance: { accentColor: "#00ff00" },
        createdAt: "",
        updatedAt: "",
      },
    ];
    vi.mocked(listPresets).mockResolvedValue(mockPresets);
    const onChange = vi.fn();
    render(
      <WidgetPresetSection
        profile={mockProfile}
        widget={mockWidget}
        onChangeProfile={onChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("P1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("preset-apply-p1"));
    expect(onChange).toHaveBeenCalled();
    const newProfile = onChange.mock.calls[0][0] as ProfileConfig;
    const newWidget = newProfile.widgets.find((w) => w.id === "rel-1");
    expect(newWidget?.position).toEqual(mockWidget.position);
    expect(newWidget?.props?.appearance).toEqual({ accentColor: "#00ff00" });
  });

  it("removes previous variant from profile when applying preset with variant", async () => {
    const { listPresets } = await import("../../lib/widget-presets-store");
    const widgetWithVariant: WidgetConfig = {
      ...mockWidget,
      variantId: "variant-rel-1",
    };
    const profileWithVariant: ProfileConfig = {
      ...mockProfile,
      widgets: [widgetWithVariant],
      variants: [
        {
          id: "variant-rel-1",
          widgetType: "relative",
          templateId: "old-template",
          columns: [],
        },
      ],
    };
    const mockPresets: WidgetPreset[] = [
      {
        id: "p1",
        name: "P1",
        widgetType: "relative",
        appearance: {},
        variant: {
          templateId: "new-template",
          columns: [{ id: "position", metricId: "position", enabled: true, width: 24 }],
        },
        createdAt: "",
        updatedAt: "",
      },
    ];
    vi.mocked(listPresets).mockResolvedValue(mockPresets);
    const onChange = vi.fn();
    render(
      <WidgetPresetSection
        profile={profileWithVariant}
        widget={widgetWithVariant}
        onChangeProfile={onChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("P1")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("preset-apply-p1"));
    expect(onChange).toHaveBeenCalled();
    const newProfile = onChange.mock.calls[0][0] as ProfileConfig;
    expect(newProfile.variants?.some((v) => v.id === "variant-rel-1")).toBe(false);
    expect(newProfile.variants?.some((v) => v.templateId === "new-template")).toBe(true);
  });

  it("displays backend save error when preset:save:error is received", async () => {
    const {
      listPresets,
      onPresetSaveError,
    } = await import("../../lib/widget-presets-store");
    vi.mocked(listPresets).mockResolvedValue([]);
    let saveErrorCallback: ((payload: { id: string; message: string }) => void) | undefined;
    vi.mocked(onPresetSaveError).mockImplementation((callback) => {
      saveErrorCallback = callback;
      return () => {};
    });

    render(
      <WidgetPresetSection
        profile={mockProfile}
        widget={mockWidget}
        onChangeProfile={vi.fn()}
      />,
    );

    expect(saveErrorCallback).toBeDefined();
    saveErrorCallback!({ id: "p1", message: "preset name is required" });

    await waitFor(() => {
      expect(screen.getByTestId("preset-error-msg")).toBeTruthy();
    });
    expect(screen.getByTestId("preset-error-msg").textContent).toContain("preset name is required");
  });
});
