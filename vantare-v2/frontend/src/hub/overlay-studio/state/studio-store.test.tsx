import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { StudioProfileClient, StudioSaveResult } from "./studio-profile-client";
import { StudioProvider, useStudioDocument, useStudioPreview } from "./studio-store";

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

function buildRelativeWidget(id = "relative-main"): WidgetInstanceV3 {
  return {
    ...deltaDefinition.createDefault(id),
    id,
    type: "relative",
  };
}

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

function createMemoryStorage(): Storage {
  const storage = new Map<string, string>();
  return {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    key(index: number) {
      return [...storage.keys()][index] ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  };
}

function wrapper(
  client: StudioProfileClient,
  options?: { recoveryStorage?: Storage; recoveryWriteDelayMs?: number; access?: AccessContext },
) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <StudioProvider
        client={client}
        initialFile="profiles/test.json"
        recoveryStorage={options?.recoveryStorage ?? null}
        recoveryWriteDelayMs={options?.recoveryWriteDelayMs ?? 300}
        access={options?.access}
      >
        {children}
      </StudioProvider>
    );
  };
}

afterEach(() => {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("vantare.studio.doc.")) window.localStorage.removeItem(key);
  }
});

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

  it("dispatches, undoes, redoes and saves an explicit layout viewport", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "document/layout-viewport",
        viewport: { width: 3440, height: 1440 },
      });
    });
    expect(result.current.document?.layoutViewport).toEqual({ width: 3440, height: 1440 });
    expect(result.current.dirty).toBe(true);

    act(() => result.current.undo());
    expect(result.current.document?.layoutViewport).toBeUndefined();
    expect(result.current.dirty).toBe(false);

    act(() => result.current.redo());
    expect(result.current.document?.layoutViewport).toEqual({ width: 3440, height: 1440 });
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      const saveResult = await result.current.save();
      expect(saveResult.status).toBe("saved");
    });
    expect(client.save).toHaveBeenCalledWith({
      file: "profiles/test.json",
      document: expect.objectContaining({ layoutViewport: { width: 3440, height: 1440 } }),
      expectedRevision: "rev-1",
    });
    expect(result.current.document?.layoutViewport).toEqual({ width: 3440, height: 1440 });
    expect(result.current.dirty).toBe(false);
  });

  it("tracks an atomic monitor selection as one dirty undo and redo step", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "document/monitor",
        monitorIndex: 2,
        viewport: { width: 3440, height: 1440 },
      });
    });
    expect(result.current.document).toEqual(
      expect.objectContaining({
        monitorIndex: 2,
        layoutViewport: { width: 3440, height: 1440 },
      }),
    );
    expect(result.current.dirty).toBe(true);

    act(() => result.current.undo());
    expect(result.current.document?.monitorIndex).toBe(0);
    expect(result.current.document?.layoutViewport).toBeUndefined();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.dirty).toBe(false);

    act(() => result.current.redo());
    expect(result.current.document?.monitorIndex).toBe(2);
    expect(result.current.document?.layoutViewport).toEqual({ width: 3440, height: 1440 });
    expect(result.current.canRedo).toBe(false);
    expect(result.current.dirty).toBe(true);
  });

  it("keeps document history intact and exposes a failed viewport command", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    const before = structuredClone(result.current.document);

    act(() => {
      result.current.dispatch({
        type: "document/layout-viewport",
        viewport: { width: 32, height: 32 },
      });
    });

    expect(result.current.document).toEqual(before);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.accessNotice).toContain("recoverable");
    expect(result.current.lastError).toBeNull();
  });

  it("rethrows unexpected access-check errors without converting them to a notice", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    const recovered = structuredClone(result.current.document!);
    recovered.layouts.general.widgets[0]!.type = "unregistered" as WidgetInstanceV3["type"];
    act(() => result.current.acceptRecovery(recovered));

    let caught: unknown;
    try {
      act(() => {
        result.current.dispatch({
          type: "widget/content",
          session: "general",
          widgetIds: ["delta-main"],
          content: { mode: "unexpected-access-error" },
        });
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("No feature gate registered");
    expect(result.current.accessNotice).toBeNull();
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

  it("writes recovery drafts locally without calling profile save", async () => {
    const storage = createMemoryStorage();
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), {
      wrapper: wrapper(client, { recoveryStorage: storage, recoveryWriteDelayMs: 0 }),
    });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 250 },
      });
    });
    await waitFor(() =>
      expect(storage.getItem("vantare:overlay-studio:v3:recovery:profile-1")).toContain("\"x\":250"),
    );
    expect(client.save).not.toHaveBeenCalled();
  });

  it("clears recovery drafts after a successful save or discard", async () => {
    const storage = createMemoryStorage();
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), {
      wrapper: wrapper(client, { recoveryStorage: storage, recoveryWriteDelayMs: 0 }),
    });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 250 },
      });
    });
    await waitFor(() =>
      expect(storage.getItem("vantare:overlay-studio:v3:recovery:profile-1")).not.toBeNull(),
    );

    await act(async () => {
      await result.current.save();
    });
    expect(storage.getItem("vantare:overlay-studio:v3:recovery:profile-1")).toBeNull();

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 300 },
      });
    });
    await waitFor(() =>
      expect(storage.getItem("vantare:overlay-studio:v3:recovery:profile-1")).not.toBeNull(),
    );
    act(() => result.current.discardAll());
    expect(storage.getItem("vantare:overlay-studio:v3:recovery:profile-1")).toBeNull();
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
    expect("resolution" in previewHook.result.current.preview).toBe(false);
    expect(documentHook.result.current.dirty).toBe(false);
    expect(documentHook.result.current.document?.layouts.general.widgets[0].layout.x).toBe(64);
  });

  it("allows layout dispatch for premium widgets on free access", async () => {
    const document = buildDocument();
    document.layouts.general.widgets.push(buildRelativeWidget());
    const client = createMockClient(document);
    const { result } = renderHook(() => useStudioDocument(), {
      wrapper: wrapper(client, { access: freeAccess }),
    });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["relative-main"],
        patch: { x: 400 },
      });
    });

    expect(result.current.document?.layouts.general.widgets[1]?.layout.x).toBe(400);
    expect(result.current.accessNotice).toBeNull();
    expect(result.current.lastError).toBeNull();
  });

  it("allows save when only premium widget layout changed under free access", async () => {
    const savedDocument = buildDocument();
    savedDocument.layouts.general.widgets.push(buildRelativeWidget());
    const client = createMockClient(savedDocument);
    const { result } = renderHook(() => useStudioDocument(), {
      wrapper: wrapper(client, { access: freeAccess }),
    });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    const tampered = structuredClone(result.current.document!);
    tampered.layouts.general.widgets[0]!.layout.x = 180;
    tampered.layouts.general.widgets[1]!.layout.x = 500;
    act(() => {
      result.current.acceptRecovery(tampered);
    });

    await act(async () => {
      const saveResult = await result.current.save();
      expect(saveResult.status).toBe("saved");
    });
    expect(result.current.saveState).toBe("saved");
    expect(client.save).toHaveBeenCalled();
  });

  it("serializes edit B behind save A and resolves after the latest document is persisted", async () => {
    const deferred: { resolve: (value: StudioSaveResult) => void } = { resolve: () => undefined };
    const client = createMockClient(buildDocument());
    client.save = vi.fn((input) => {
      if (vi.mocked(client.save).mock.calls.length === 1) {
        return new Promise<StudioSaveResult>((resolve) => {
          deferred.resolve = resolve;
        });
      }
      return Promise.resolve({
        status: "saved",
        document: structuredClone(input.document),
        revision: "rev-3",
      });
    }) as typeof client.save;

    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 150 },
      });
    });
    const documentA = result.current.document!;

    let saveAPromise: Promise<StudioSaveResult>;
    act(() => {
      saveAPromise = result.current.save();
    });

    // Edicion B mientras A esta en vuelo.
    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 250 },
      });
    });
    const documentB = result.current.document!;
    expect(documentB.layouts.general.widgets[0].layout.x).toBe(250);

    // Resuelve A con revision 2 y el documento A.
    await act(async () => {
      deferred.resolve({
        status: "saved",
        document: structuredClone(documentA),
        revision: "rev-2",
      });
      await saveAPromise;
    });

    // El presente conserva B y el mismo drenaje lo persiste con la revision A.
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(250);
    expect(result.current.dirty).toBe(false);
    expect(result.current.revision).toBe("rev-3");
    expect(client.save).toHaveBeenCalledTimes(2);
    const nextCall = vi.mocked(client.save).mock.calls[1];
    expect(nextCall?.[0].document.layouts.general.widgets[0].layout.x).toBe(250);
    expect(nextCall?.[0].expectedRevision).toBe("rev-2");
  });

  it("turns thrown save failures into a recoverable error state", async () => {
    const client = createMockClient(buildDocument());
    client.save = vi.fn(async () => {
      throw new Error("transport timeout");
    });
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 275 },
      });
    });
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveState).toBe("error");
    expect(result.current.accessNotice).toBe("transport timeout");
    expect(result.current.dirty).toBe(true);
  });

  it("saves the recovered document held by the history ref", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    const recovered = structuredClone(result.current.document!);
    recovered.layouts.general.widgets[0].layout.x = 425;

    act(() => result.current.acceptRecovery(recovered));
    await act(async () => {
      await result.current.save();
    });

    expect(client.save).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          layouts: expect.objectContaining({
            general: expect.objectContaining({
              widgets: [expect.objectContaining({ layout: expect.objectContaining({ x: 425 }) })],
            }),
          }),
        }),
      }),
    );
  });

  it("dispatch returns true only when the command creates history", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());

    let changed: boolean | undefined;
    act(() => {
      changed = result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 150 },
      });
    });
    expect(changed).toBe(true);

    act(() => {
      changed = result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: 150 },
      });
    });
    expect(changed).toBe(false);
  });

  it("undo and redo report whether they changed history", async () => {
    const client = createMockClient(buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    const originalX = result.current.document!.layouts.general.widgets[0].layout.x;

    act(() => {
      result.current.dispatch({
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-main"],
        patch: { x: originalX + 50 },
      });
    });

    let changed: boolean | undefined;
    act(() => {
      changed = result.current.undo();
    });
    expect(changed).toBe(true);
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(originalX);

    act(() => {
      changed = result.current.undo();
    });
    expect(changed).toBe(false);

    act(() => {
      changed = result.current.redo();
    });
    expect(changed).toBe(true);
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(originalX + 50);

    act(() => {
      changed = result.current.redo();
    });
    expect(changed).toBe(false);
  });
});
