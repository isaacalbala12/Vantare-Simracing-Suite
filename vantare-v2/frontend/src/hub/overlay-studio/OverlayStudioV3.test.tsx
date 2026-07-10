import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../overlay/core/profile-document";
import { OverlayStudioV3 } from "./OverlayStudioV3";
import { expectDisabled, expectEnabled } from "./test-helpers";
import { StudioProvider, useStudioDocument } from "./state/studio-store";
import type { StudioProfileClient } from "./state/studio-profile-client";

function buildDocument(): ProfileDocumentV3 {
  const delta = deltaDefinition.createDefault("delta-main");
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [delta],
        preservedWidgets: [{ id: "legacy-1", type: "standings", source: {} }],
      },
    },
  };
}

function createMockClient(document = buildDocument()): StudioProfileClient {
  return {
    load: vi.fn(async () => ({ document: structuredClone(document), revision: "rev-1" })),
    save: vi.fn(async () => ({ status: "saved", document: structuredClone(document), revision: "rev-2" })),
  };
}

const profiles = [
  { id: "profile-1", name: "Perfil A", file: "profiles/a.json" },
  { id: "profile-2", name: "Perfil B", file: "profiles/b.json" },
];

function renderWorkbench(client = createMockClient(), onRequestProfileChange = vi.fn()) {
  return render(
    <StudioProvider client={client} initialFile="profiles/a.json">
      <OverlayStudioV3
        profiles={profiles}
        activeFile="profiles/a.json"
        onRequestProfileChange={onRequestProfileChange}
        onOpenManageProfiles={vi.fn()}
        onOpenRecommended={vi.fn()}
        onOpenCommunity={vi.fn()}
        onOpenObs={vi.fn()}
      />
    </StudioProvider>,
  );
}

describe("OverlayStudioV3", () => {
  afterEach(() => cleanup());
  it("renders the modular workbench without an outer Vantare shell", async () => {
    renderWorkbench();
    await waitFor(() => expect(screen.getByTestId("overlay-studio-v3")).toBeTruthy());
    expect(screen.queryByTestId("hub-topbar")).toBeNull();
    expect(screen.getByTestId("studio-widget-list-panel")).toBeTruthy();
    expect(screen.getByTestId("studio-canvas-slot")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-slot")).toBeTruthy();
  });

  it("does not expose WidgetStudio chrome or local save-to-widget actions", async () => {
    renderWorkbench();
    await waitFor(() => expect(screen.getByTestId("studio-header")).toBeTruthy());
    expect(screen.queryByText(/widget studio/i)).toBeNull();
    expect(screen.queryByText(/save to widget/i)).toBeNull();
    expect(screen.getByTestId("studio-save-button")).toBeTruthy();
    expect(screen.getByTestId("studio-undo-button")).toBeTruthy();
    expect(screen.getByTestId("studio-redo-button")).toBeTruthy();
  });

  it("reflects widget selection across list, canvas slot and inspector", async () => {
    renderWorkbench();
    await waitFor(() => expect(screen.getByTestId("studio-widget-row-delta-main")).toBeTruthy());

    fireEvent.click(screen.getByTestId("studio-widget-row-delta-main"));

    expect(screen.getByTestId("studio-canvas-viewport").getAttribute("data-selected-widget-id")).toBe("delta-main");
    expect(screen.getByTestId("studio-inspector-slot").getAttribute("data-selected-widget-id")).toBe("delta-main");
  });

  it("requests guarded profile changes instead of loading directly", async () => {
    const onRequestProfileChange = vi.fn();
    renderWorkbench(createMockClient(), onRequestProfileChange);
    await waitFor(() => expect(screen.getByTestId("studio-profile-select")).toBeTruthy());

    fireEvent.change(screen.getByTestId("studio-profile-select"), {
      target: { value: "profiles/b.json" },
    });

    expect(onRequestProfileChange).toHaveBeenCalledWith("profiles/b.json");
  });

  it("exposes navigation entries in the header menu", async () => {
    renderWorkbench();
    await waitFor(() => expect(screen.getByTestId("studio-menu-button")).toBeTruthy());
    fireEvent.click(screen.getByTestId("studio-menu-button"));
    expect(screen.getByText("Gestionar perfiles")).toBeTruthy();
    expect(screen.getByText("Recomendados")).toBeTruthy();
    expect(screen.getByText("Comunidad")).toBeTruthy();
    expect(screen.getByText("OBS")).toBeTruthy();
  });

  it("enables undo after a committed document edit", async () => {
    function MakeDirtyButton() {
      const { dispatch } = useStudioDocument();
      return (
        <button
          type="button"
          data-testid="make-dirty"
          onClick={() =>
            dispatch({
              type: "widget/layout",
              session: "general",
              widgetIds: ["delta-main"],
              patch: { x: 240 },
            })
          }
        />
      );
    }

    render(
      <StudioProvider client={createMockClient()} initialFile="profiles/a.json">
        <MakeDirtyButton />
        <OverlayStudioV3
          profiles={profiles}
          activeFile="profiles/a.json"
          onRequestProfileChange={vi.fn()}
          onOpenManageProfiles={vi.fn()}
          onOpenRecommended={vi.fn()}
          onOpenCommunity={vi.fn()}
          onOpenObs={vi.fn()}
        />
      </StudioProvider>,
    );

    await waitFor(() => expectDisabled(screen.getByTestId("studio-undo-button")));
    fireEvent.click(screen.getByTestId("make-dirty"));
    await waitFor(() => expectEnabled(screen.getByTestId("studio-undo-button")));
  });
});