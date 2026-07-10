import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { StudioProfileClient } from "./studio-profile-client";
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
    expect(documentHook.result.current.dirty).toBe(false);
    expect(documentHook.result.current.document?.layouts.general.widgets[0].layout.x).toBe(64);
  });

  it("blocks dispatch mutations for premium widgets on free access", async () => {
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

    expect(result.current.document?.layouts.general.widgets[1]?.layout.x).toBe(64);
    expect(result.current.lastError).toContain("acceso");
  });

  it("rejects save when a premium widget changed under free access", async () => {
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
      expect(saveResult.status).toBe("error");
    });
    expect(result.current.saveState).toBe("error");
    expect(client.save).not.toHaveBeenCalled();
  });
});