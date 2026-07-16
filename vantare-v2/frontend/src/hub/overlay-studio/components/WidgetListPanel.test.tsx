import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { StudioProvider } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { WidgetListPanel } from "./WidgetListPanel";

function widget(id: string, zIndex: number, enabled = true): WidgetInstanceV3 {
  const base = deltaDefinition.createDefault(id);
  base.layout.zIndex = zIndex;
  base.behavior.enabled = enabled;
  base.visual.systemId = id === "delta-b" ? "vantare-crystal" : "vantare-original";
  return base;
}

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [widget("delta-a", 0), widget("delta-b", 2), widget("delta-c", 1, false)],
        preservedWidgets: [{ id: "legacy-1", type: "standings", source: {} }],
      },
    },
  };
}

function createMockClient(): StudioProfileClient {
  return {
    load: vi.fn(async () => ({ document: buildDocument(), revision: "rev-1" })),
    save: vi.fn(),
  };
}

describe("WidgetListPanel", () => {
  afterEach(() => cleanup());
  it("lists widgets by z-index with status badges and supports search", async () => {
    render(
      <StudioProvider client={createMockClient()} initialFile="profiles/a.json">
        <WidgetListPanel />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-widget-row-delta-a")).toBeTruthy());
    expect(screen.getByTestId("studio-widget-list-title").textContent).toBe("Widgets");
    expect(screen.getByTestId("studio-widget-count").textContent).toBe("3");
    const rows = screen.getAllByTestId(/^studio-widget-row-/);
    expect(rows.map((row) => row.getAttribute("data-widget-id"))).toEqual(["delta-a", "delta-c", "delta-b"]);
    expect(screen.getByTestId("studio-widget-row-delta-c").textContent).toContain("oculto");
    expect(screen.getByTestId("studio-widget-row-delta-b").textContent).toContain("vantare-crystal");

    fireEvent.change(screen.getByTestId("studio-widget-search"), { target: { value: "delta-b" } });
    expect(screen.queryByTestId("studio-widget-row-delta-a")).toBeNull();
    expect(screen.getByTestId("studio-widget-row-delta-b")).toBeTruthy();
  });

  it("selects a widget when its row is clicked", async () => {
    render(
      <StudioProvider client={createMockClient()} initialFile="profiles/a.json">
        <WidgetListPanel />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-widget-row-delta-b")).toBeTruthy());
    fireEvent.click(screen.getByTestId("studio-widget-row-delta-b"));
    expect(screen.getByTestId("studio-widget-row-delta-b").className).toContain("osv3-list-panel__row--selected");
  });

  it("adds a widget from the derived catalog dialog", async () => {
    render(
      <StudioProvider client={createMockClient()} initialFile="profiles/a.json">
        <WidgetListPanel />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-show-add-widget")).toBeTruthy());
    fireEvent.click(screen.getByTestId("studio-show-add-widget"));
    expect(screen.getByTestId("studio-add-widget-dialog")).toBeTruthy();
    expect(screen.getByTestId("studio-catalog-entry-delta")).toBeTruthy();

    fireEvent.click(screen.getByTestId("studio-catalog-add-delta"));
    await waitFor(() => expect(screen.getByTestId("studio-widget-row-delta-main")).toBeTruthy());
    expect(screen.getByTestId("studio-widget-row-delta-main").className).toContain("osv3-list-panel__row--selected");
  });

  it("shows preserved legacy widgets as read-only entries", async () => {
    render(
      <StudioProvider client={createMockClient()} initialFile="profiles/a.json">
        <WidgetListPanel />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-preserved-widgets")).toBeTruthy());
    expect(screen.getByTestId("studio-preserved-widgets").textContent).toContain("standings");
    expect(screen.getByTestId("studio-preserved-widgets").textContent).toContain("legacy-1");
    expect(screen.queryByTestId("studio-widget-row-legacy-1")).toBeNull();
  });
});
