import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioCommand } from "../../hub/overlay-studio/state/studio-command";
import type { StudioSaveResult } from "../../hub/overlay-studio/state/studio-profile-client";
import { useInplaceAutosave } from "./use-inplace-autosave";

function layoutCommand(): StudioCommand {
  return {
    type: "widget/layout",
    session: "general",
    widgetIds: ["delta-main"],
    patch: { x: 150 },
  };
}

function contentCommand(): StudioCommand {
  return {
    type: "widget/content",
    session: "general",
    widgetIds: ["delta-main"],
    content: { reference: "session-best" },
  };
}

function renderAutosave(options: {
  dispatchReturns?: boolean;
  saveResults?: StudioSaveResult[];
  interactionActive?: boolean;
  debounceMs?: number;
} = {}) {
  const dispatch = vi.fn(() => options.dispatchReturns ?? true);
  const undo = vi.fn(() => true);
  const redo = vi.fn(() => true);
  const results = [...(options.saveResults ?? [{ status: "saved" as const, document: {} as never, revision: "rev-2" }])];
  const save = vi.fn(async (): Promise<StudioSaveResult> => {
    const next = results.shift();
    if (!next) {
      return { status: "saved", document: {} as never, revision: "rev-3" };
    }
    return next;
  });
  const hook = renderHook(() =>
    useInplaceAutosave({
      dispatch,
      undo,
      redo,
      save,
      interactionActive: options.interactionActive ?? false,
      debounceMs: options.debounceMs ?? 300,
    }),
  );
  return { ...hook, dispatch, undo, redo, save };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useInplaceAutosave", () => {
  it("saves layout commands immediately without debounce", async () => {
    const { result, save } = renderAutosave();
    let changed = false;
    act(() => {
      changed = result.current.dispatch(layoutCommand());
    });
    expect(changed).toBe(true);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it("debounces content commands", async () => {
    vi.useFakeTimers();
    const { result, save, dispatch } = renderAutosave();
    act(() => {
      result.current.dispatch(contentCommand());
    });
    act(() => {
      result.current.dispatch(contentCommand());
    });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("does not schedule a save when dispatch is rejected or a no-op", () => {
    const { result, save } = renderAutosave({ dispatchReturns: false });
    act(() => {
      result.current.dispatch(layoutCommand());
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps only one save in flight and coalesces later changes", async () => {
    let resolveFirst: (value: StudioSaveResult) => void = () => undefined;
    const { result, save } = renderAutosave();
    save.mockImplementationOnce(
      () =>
        new Promise<StudioSaveResult>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    act(() => {
      result.current.dispatch(layoutCommand());
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    // Segundo cambio mientras el primero esta en vuelo: se coalesce, no se
    // lanza un segundo save.
    act(() => {
      result.current.dispatch(layoutCommand());
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    act(() => {
      resolveFirst({ status: "saved", document: {} as never, revision: "rev-2" });
    });
    // Tras resolver, el pendiente se guarda con la revision nueva.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it("undo and redo save immediately", async () => {
    const { result, save } = renderAutosave();
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it("pauses on error and offers retry that saves again", async () => {
    const { result, save } = renderAutosave({
      saveResults: [{ status: "error", message: "disk full" }],
    });
    act(() => {
      result.current.dispatch(layoutCommand());
    });
    await waitFor(() => expect(result.current.paused).toBe("error"));
    expect(save).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it("pauses on conflict without automatic retry", async () => {
    const { result, save } = renderAutosave({
      saveResults: [{ status: "conflict", message: "revision mismatch" }],
    });
    act(() => {
      result.current.dispatch(layoutCommand());
    });
    await waitFor(() => expect(result.current.paused).toBe("conflict"));
    expect(save).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not schedule saves while paused", async () => {
    const { result, save } = renderAutosave({
      saveResults: [{ status: "error", message: "disk full" }],
    });
    act(() => {
      result.current.dispatch(layoutCommand());
    });
    await waitFor(() => expect(result.current.paused).toBe("error"));

    act(() => {
      result.current.dispatch(layoutCommand());
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("tracks pending state while a save is in flight", async () => {
    let resolveFirst: (value: StudioSaveResult) => void = () => undefined;
    const { result, save } = renderAutosave();
    save.mockImplementationOnce(
      () =>
        new Promise<StudioSaveResult>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    act(() => {
      result.current.dispatch(layoutCommand());
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    act(() => {
      resolveFirst({ status: "saved", document: {} as never, revision: "rev-2" });
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });
});
