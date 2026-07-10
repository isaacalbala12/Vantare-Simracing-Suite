import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import type { StudioProfileClient } from "./studio-profile-client";
import { StudioProvider, useStudioDocument, useStudioPreview } from "./studio-store";

function buildDocument(visualOverrides: Partial<ProfileDocumentV3["layouts"]["general"]["widgets"][0]["visual"]> = {}): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-main");
  widget.visual = {
    ...widget.visual,
    ...visualOverrides,
  };
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [widget],
      },
    },
  };
}

function createMockClient(loadedDocument: ProfileDocumentV3, revision = "rev-1"): StudioProfileClient {
  let savedRevision = revision;
  return {
    load: vi.fn(async () => ({
      document: structuredClone(loadedDocument),
      revision: savedRevision,
    })),
    save: vi.fn(async ({ document, expectedRevision }) => {
      if (expectedRevision !== savedRevision) {
        return { status: "conflict", message: "revision mismatch" };
      }
      savedRevision = "rev-2";
      return {
        status: "saved",
        document: structuredClone(document),
        revision: savedRevision,
      };
    }),
  };
}

function wrapper(client: StudioProfileClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <StudioProvider client={client} initialFile="profiles/test.json">{children}</StudioProvider>;
  };
}

describe("StudioProvider", () => {
  it("loads the profile and exposes the active layout", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.document).not.toBeNull());
    expect(result.current.activeLayout?.widgets[0].id).toBe("delta-main");
    expect(result.current.dirty).toBe(false);
  });

  it("dispatches commands, tracks dirty state and supports undo/redo", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 200 },
      });
    });

    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(200);
    expect(result.current.dirty).toBe(true);

    act(() => result.current.undo());
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(64);
    expect(result.current.dirty).toBe(false);

    act(() => result.current.redo());
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(200);
    expect(result.current.dirty).toBe(true);
  });

  it("switches sessions and selection without mutating unrelated layouts", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.selectSession("race");
      result.current.dispatch({
        type: "widget/layout",
        session: "race",
        widgetIds: ["delta-main"],
        patch: { x: 333 },
      });
      result.current.selectWidget("delta-main");
    });

    expect(result.current.activeSession).toBe("race");
    expect(result.current.selectedWidgetId).toBe("delta-main");
    expect(result.current.activeLayout?.widgets[0].layout.x).toBe(333);
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(64);
  });

  it("marks migrated visuals as dirty while keeping the disk snapshot as saved", async () => {
    const client = createMockClient(
      buildDocument({ systemVersion: 0, configVersion: 0, baseSettings: { legacy: true } }),
    );
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.visuallyMigratedWidgetIds).toEqual(["delta-main"]));
    expect(result.current.dirty).toBe(true);
    expect(result.current.document?.layouts.general.widgets[0].visual.systemVersion).toBe(1);
  });

  it("saves explicitly and clears migration markers on success", async () => {
    const client = createMockClient(
      buildDocument({ systemVersion: 0, configVersion: 0, baseSettings: { legacy: true } }),
    );
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.dirty).toBe(true));

    await act(async () => {
      const saveResult = await result.current.save();
      expect(saveResult.status).toBe("saved");
    });

    expect(result.current.saveState).toBe("saved");
    expect(result.current.dirty).toBe(false);
    expect(result.current.visuallyMigratedWidgetIds).toEqual([]);
  });

  it("preserves the draft when save fails or conflicts", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 250 },
      });
    });

    client.save = vi.fn(async () => ({ status: "error", message: "disk full" }));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveState).toBe("error");
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(250);

    client.save = vi.fn(async () => ({ status: "conflict", message: "revision mismatch" }));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveState).toBe("conflict");
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(250);
  });

  it("discards all changes back to the saved snapshot", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 250 },
      });
    });
    expect(result.current.dirty).toBe(true);

    act(() => result.current.discardAll());
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(64);
    expect(result.current.dirty).toBe(false);
  });

  it("keeps preview changes out of document history and dirty state", async () => {
    const client = createMockClient(buildDocument());
    const documentHook = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    const previewHook = renderHook(() => useStudioPreview(), { wrapper: wrapper(client) });
    await waitFor(() => expect(documentHook.result.current.document).not.toBeNull());

    act(() => {
      previewHook.result.current.setPreview({ zoom: 125, mockSession: "race", source: "live" });
    });

    expect(previewHook.result.current.preview.zoom).toBe(125);
    expect(previewHook.result.current.preview.mockSession).toBe("race");
    expect(previewHook.result.current.preview.source).toBe("live");
    expect(documentHook.result.current.dirty).toBe(false);
    expect(documentHook.result.current.document?.layouts.general.widgets[0].layout.x).toBe(64);
  });
});