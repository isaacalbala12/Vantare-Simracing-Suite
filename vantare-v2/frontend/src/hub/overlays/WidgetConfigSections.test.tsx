import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetConfigSections } from "./WidgetConfigSections";
import type { SlotConfig, ColumnConfig, ColumnGroupConfig } from "../../lib/profile";
import {
  buildDefaultSlots,
  buildDefaultColumns,
  buildDefaultColumnGroups,
} from "./widget-config-model";

afterEach(() => {
  cleanup();
});

const deltaSlots = buildDefaultSlots("delta", undefined);
const standingsColumns = buildDefaultColumns("standings", undefined);
const standingsColumnGroups = buildDefaultColumnGroups("standings", undefined);

function renderSections(overrides?: {
  slots?: SlotConfig[];
  columns?: ColumnConfig[];
  columnGroups?: ColumnGroupConfig[];
  widgetType?: string;
  canApply?: boolean;
  onDraftChange?: () => void;
}) {
  return render(
    <WidgetConfigSections
      slots={overrides?.slots ?? deltaSlots}
      columns={overrides?.columns ?? []}
      columnGroups={overrides?.columnGroups ?? []}
      widgetType={overrides?.widgetType ?? "delta"}
      canApply={overrides?.canApply ?? true}
      onDraftChange={overrides?.onDraftChange ?? vi.fn()}
    />,
  );
}

describe("WidgetConfigSections", () => {
  it("renders slots section for delta widget", () => {
    renderSections();
    expect(screen.getByText("Slots")).toBeDefined();
    expect(screen.getByText("headerStat")).toBeDefined();
  });

  it("renders columns section for standings widget", () => {
    renderSections({
      slots: [],
      columns: standingsColumns,
      widgetType: "standings",
    });
    expect(screen.getByText("Columns")).toBeDefined();
    expect(screen.getByText("position")).toBeDefined();
  });

  it("renders column groups section for standings widget", () => {
    renderSections({
      slots: [],
      columns: [],
      columnGroups: standingsColumnGroups,
      widgetType: "standings",
    });
    expect(screen.getByText("Column Groups")).toBeDefined();
    expect(screen.getByText("hypercar")).toBeDefined();
  });

  it("renders nothing when no slots, columns, or groups", () => {
    const { container } = renderSections({
      slots: [],
      columns: [],
      columnGroups: [],
    });
    expect(container.querySelector("[data-testid='widget-config-sections']")).toBeNull();
  });

  // MC-3: Slot editing
  it("toggles slot enabled via switch", () => {
    const onDraftChange = vi.fn();
    renderSections({ onDraftChange });
    const toggle = screen.getByRole("switch", { name: /toggle headerStat/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: expect.arrayContaining([
          expect.objectContaining({ id: "headerStat", enabled: false }),
        ]),
      }),
    );
  });

  it("disables slot toggle when canApply is false", () => {
    renderSections({ canApply: false });
    const toggle = screen.getByRole("switch", { name: /toggle headerStat/i });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
  });

  it("slot metric selector calls onDraftChange", () => {
    const onDraftChange = vi.fn();
    renderSections({ onDraftChange });
    const selects = screen.getAllByLabelText("Métrica");
    fireEvent.change(selects[0], { target: { value: "sessionTime" } });
    expect(onDraftChange).toHaveBeenCalled();
  });

  // MC-4: Column editing
  it("toggles column enabled via switch", () => {
    const onDraftChange = vi.fn();
    renderSections({
      slots: [],
      columns: standingsColumns,
      widgetType: "standings",
      onDraftChange,
    });
    const toggle = screen.getByRole("switch", { name: /toggle position/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: expect.arrayContaining([
          expect.objectContaining({ id: "position", enabled: false }),
        ]),
      }),
    );
  });

  it("column width preset selector is present", () => {
    renderSections({
      slots: [],
      columns: standingsColumns,
      widgetType: "standings",
    });
    const widthSelects = screen.getAllByLabelText("Ancho");
    expect(widthSelects.length).toBeGreaterThan(0);
  });

  it("disables column toggle when canApply is false", () => {
    renderSections({
      slots: [],
      columns: standingsColumns,
      widgetType: "standings",
      canApply: false,
    });
    const toggle = screen.getByRole("switch", { name: /toggle position/i });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
  });

  // MC-5: Column group editing
  it("toggles column group enabled via switch", () => {
    const onDraftChange = vi.fn();
    renderSections({
      slots: [],
      columns: [],
      columnGroups: standingsColumnGroups,
      widgetType: "standings",
      onDraftChange,
    });
    const toggle = screen.getByRole("switch", { name: /toggle hypercar/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        columnGroups: expect.arrayContaining([
          expect.objectContaining({ id: "hypercar", enabled: false }),
        ]),
      }),
    );
  });

  it("disables column group toggle when canApply is false", () => {
    renderSections({
      slots: [],
      columns: [],
      columnGroups: standingsColumnGroups,
      widgetType: "standings",
      canApply: false,
    });
    const toggle = screen.getByRole("switch", { name: /toggle hypercar/i });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not expose position fields in any output", () => {
    const onDraftChange = vi.fn();
    renderSections({ onDraftChange });
    const toggle = screen.getByRole("switch", { name: /toggle headerStat/i });
    fireEvent.click(toggle);
    const call = onDraftChange.mock.calls[0]?.[0];
    if (call?.slots) {
      for (const slot of call.slots) {
        expect(slot).not.toHaveProperty("position");
        expect(slot).not.toHaveProperty("x");
        expect(slot).not.toHaveProperty("y");
        expect(slot).not.toHaveProperty("w");
        expect(slot).not.toHaveProperty("h");
      }
    }
  });
});
