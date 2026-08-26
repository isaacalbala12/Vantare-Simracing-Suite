import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { StudioProfileClient, StudioSaveResult } from "./studio-profile-client";
import { StudioProvider, useStudioDocument } from "./studio-store";
import { StudioAutosave } from "./studio-autosave";
import { writeCachedStudioDocument } from "./studio-doc-cache";

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Autosave Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
}

function createClient(results: StudioSaveResult[] = []): StudioProfileClient {
  let revision = "rev-1";
  return {
    load: vi.fn(async () => ({ document: buildDocument(), revision })),
    save: vi.fn(async ({ document }) => {
      const result = results.shift();
      if (result) {
        if (result.status === "saved") revision = result.revision;
        return result;
      }
      revision = `${revision}-next`;
      return { status: "saved", document: structuredClone(document), revision };
    }),
  };
}

function wrapper(client: StudioProfileClient, delayMs = 300) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <StudioProvider client={client} initialFile="profile.json">
        <StudioAutosave delayMs={delayMs} />
        {children}
      </StudioProvider>
    );
  };
}

function moveX(x: number) {
  return {
    type: "widget/layout" as const,
    session: "general" as const,
    widgetIds: ["delta-main"],
    patch: { x },
  };
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("StudioAutosave", () => {
  it("debounces a burst and persists only the latest confirmed document", async () => {
    const client = createClient();
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    vi.useFakeTimers();

    act(() => result.current.dispatch(moveX(150)));
    act(() => result.current.dispatch(moveX(250)));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(client.save).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(client.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.save).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        file: "profile.json",
        document: expect.objectContaining({
          layouts: expect.objectContaining({
            general: expect.objectContaining({
              widgets: [expect.objectContaining({ layout: expect.objectContaining({ x: 250 }) })],
            }),
          }),
        }),
      }),
    );
    expect(result.current.dirty).toBe(false);
  });

  it("waits for the fresh revision before autosaving an edit made on a cached seed", async () => {
    let resolveLoad: ((loaded: { document: ProfileDocumentV3; revision: string }) => void) | null =
      null;
    const client = createClient();
    client.load = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    writeCachedStudioDocument("profile.json", buildDocument());
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    expect(result.current.document).not.toBeNull();
    expect(result.current.revision).toBe("");
    vi.useFakeTimers();

    act(() => result.current.dispatch(moveX(210)));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(client.save).not.toHaveBeenCalled();

    await act(async () => {
      resolveLoad?.({ document: buildDocument(), revision: "rev-fresh" });
      await Promise.resolve();
    });
    expect(result.current.revision).toBe("rev-fresh");
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(client.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.save).mock.calls[0]?.[0].expectedRevision).toBe("rev-fresh");
    expect(result.current.dirty).toBe(false);
  });

  it("owns Photoshop-style undo and redo shortcuts and autosaves each result", async () => {
    const client = createClient();
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    const originalX = result.current.document!.layouts.general.widgets[0].layout.x;
    vi.useFakeTimers();

    act(() => result.current.dispatch(moveX(320)));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(client.save).toHaveBeenCalledTimes(1);

    const undoEvent = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(undoEvent));
    expect(undoEvent.defaultPrevented).toBe(true);
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(originalX);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(client.save).toHaveBeenCalledTimes(2);

    const redoEvent = new KeyboardEvent("keydown", {
      key: "y",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(redoEvent));
    expect(redoEvent.defaultPrevented).toBe(true);
    expect(result.current.document?.layouts.general.widgets[0].layout.x).toBe(320);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(client.save).toHaveBeenCalledTimes(3);
  });

  it("pauses after an error and retries when a later edit creates a new document", async () => {
    const client = createClient([{ status: "error", message: "disk full" }]);
    const { result } = renderHook(() => useStudioDocument(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.document).not.toBeNull());
    vi.useFakeTimers();

    act(() => result.current.dispatch(moveX(180)));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(client.save).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe("error");

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(client.save).toHaveBeenCalledTimes(1);

    act(() => result.current.dispatch(moveX(280)));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(client.save).toHaveBeenCalledTimes(2);
    expect(result.current.saveState).toBe("saved");
    expect(result.current.dirty).toBe(false);
  });
});
