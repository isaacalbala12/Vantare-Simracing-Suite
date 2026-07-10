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

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function renderWorkbench(
  client = createMockClient(),
  onRequestProfileChange = vi.fn(),
  options?: { viewportWidth?: number; recoveryStorage?: Storage | null },
) {
  return render(
    <StudioProvider
      client={client}
      initialFile="profiles/a.json"
      recoveryStorage={options?.recoveryStorage ?? null}
      recoveryWriteDelayMs={0}
    >
      <OverlayStudioV3
        profiles={profiles}
        activeFile="profiles/a.json"
        viewportWidth={options?.viewportWidth ?? 1600}
        recoveryStorage={options?.recoveryStorage ?? null}
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

  it("keeps canvas scale stable when selecting a widget from the list", async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(element: Element): void {
        Object.defineProperty(element, "clientWidth", { configurable: true, value: 960 });
        Object.defineProperty(element, "clientHeight", { configurable: true, value: 420 });
        this.callback([], this as unknown as ResizeObserver);
      }

      disconnect(): void {
        return undefined;
      }

      unobserve(): void {
        return undefined;
      }
    } as unknown as typeof ResizeObserver;

    try {
      renderWorkbench();
      await waitFor(() => expect(screen.getByTestId("studio-canvas-scene")).toBeTruthy());

      const scaleBefore = screen.getByTestId("studio-canvas-scene").getAttribute("data-scale");
      fireEvent.click(screen.getByTestId("studio-widget-row-delta-main"));

      await waitFor(() =>
        expect(screen.getByTestId("studio-canvas-action-bar")).toBeTruthy(),
      );
      expect(screen.getByTestId("studio-canvas-scene").getAttribute("data-scale")).toBe(scaleBefore);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
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

  it("opens the dirty dialog instead of switching profiles while dirty", async () => {
    const onRequestProfileChange = vi.fn();
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
          viewportWidth={1600}
          onRequestProfileChange={onRequestProfileChange}
          onOpenManageProfiles={vi.fn()}
          onOpenRecommended={vi.fn()}
          onOpenCommunity={vi.fn()}
          onOpenObs={vi.fn()}
        />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-profile-select")).toBeTruthy());
    fireEvent.click(screen.getByTestId("make-dirty"));
    fireEvent.change(screen.getByTestId("studio-profile-select"), {
      target: { value: "profiles/b.json" },
    });

    expect(screen.getByTestId("studio-dirty-dialog")).toBeTruthy();
    expect(onRequestProfileChange).not.toHaveBeenCalled();
  });

  it("continues profile navigation after a successful dirty save", async () => {
    const onRequestProfileChange = vi.fn();
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
          viewportWidth={1600}
          onRequestProfileChange={onRequestProfileChange}
          onOpenManageProfiles={vi.fn()}
          onOpenRecommended={vi.fn()}
          onOpenCommunity={vi.fn()}
          onOpenObs={vi.fn()}
        />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-profile-select")).toBeTruthy());
    fireEvent.click(screen.getByTestId("make-dirty"));
    fireEvent.change(screen.getByTestId("studio-profile-select"), {
      target: { value: "profiles/b.json" },
    });
    fireEvent.click(screen.getByTestId("studio-dirty-save"));

    await waitFor(() => expect(onRequestProfileChange).toHaveBeenCalledWith("profiles/b.json"));
  });

  it("prompts for recovery when a local draft exists", async () => {
    const storage = createMemoryStorage();
    const document = buildDocument();
    storage.setItem(
      "vantare:overlay-studio:v3:recovery:profile-1",
      JSON.stringify({
        version: 1,
        profileId: "profile-1",
        baseRevision: "rev-1",
        capturedAt: "2026-07-10T12:34:00.000Z",
        document: {
          ...document,
          layouts: {
            general: {
              ...document.layouts.general,
              widgets: [
                {
                  ...document.layouts.general.widgets[0],
                  layout: { ...document.layouts.general.widgets[0].layout, x: 400 },
                },
              ],
            },
          },
        },
      }),
    );

    renderWorkbench(createMockClient(), vi.fn(), { recoveryStorage: storage });
    await waitFor(() => expect(screen.getByTestId("studio-recovery-dialog")).toBeTruthy());
    expect(screen.getByTestId("studio-recovery-profile").textContent).toContain("Test Profile");
  });

  it("does not re-prompt recovery after dismissing and editing", async () => {
    const storage = createMemoryStorage();
    const document = buildDocument();
    storage.setItem(
      "vantare:overlay-studio:v3:recovery:profile-1",
      JSON.stringify({
        version: 1,
        profileId: "profile-1",
        baseRevision: "rev-1",
        capturedAt: "2026-07-10T12:34:00.000Z",
        document: {
          ...document,
          layouts: {
            general: {
              ...document.layouts.general,
              widgets: [
                {
                  ...document.layouts.general.widgets[0],
                  layout: { ...document.layouts.general.widgets[0].layout, x: 400 },
                },
              ],
            },
          },
        },
      }),
    );

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
      <StudioProvider
        client={createMockClient()}
        initialFile="profiles/a.json"
        recoveryStorage={storage}
        recoveryWriteDelayMs={0}
      >
        <MakeDirtyButton />
        <OverlayStudioV3
          profiles={profiles}
          activeFile="profiles/a.json"
          viewportWidth={1600}
          recoveryStorage={storage}
          onRequestProfileChange={vi.fn()}
          onOpenManageProfiles={vi.fn()}
          onOpenRecommended={vi.fn()}
          onOpenCommunity={vi.fn()}
          onOpenObs={vi.fn()}
        />
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-recovery-dialog")).toBeTruthy());
    fireEvent.click(screen.getByTestId("studio-recovery-discard"));
    await waitFor(() => expect(screen.queryByTestId("studio-recovery-dialog")).toBeNull());

    fireEvent.click(screen.getByTestId("make-dirty"));
    await waitFor(() =>
      expect(storage.getItem("vantare:overlay-studio:v3:recovery:profile-1")).toContain("\"x\":240"),
    );
    expect(screen.queryByTestId("studio-recovery-dialog")).toBeNull();
  });

  it("exposes responsive layout mode from the viewport width prop", async () => {
    renderWorkbench(createMockClient(), vi.fn(), { viewportWidth: 800 });
    await waitFor(() => expect(screen.getByTestId("studio-responsive-grid")).toBeTruthy());
    expect(screen.getByTestId("studio-responsive-grid").getAttribute("data-layout-mode")).toBe(
      "compact",
    );
    expect(screen.getByTestId("studio-list-drawer-toggle")).toBeTruthy();
  });
});