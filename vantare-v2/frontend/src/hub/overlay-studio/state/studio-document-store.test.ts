import { describe, expect, it, vi } from "vitest";
import { createStudioStore, buildInitialHistory } from "./studio-document-store";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";

function makeDocument(id = "doc-1"): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id,
    name: "test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  } as ProfileDocumentV3;
}

describe("studio document store", () => {
  it("emite un snapshot nuevo solo cuando cambia el estado", () => {
    const store = createStudioStore(null);
    const listener = vi.fn();
    const off = store.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    store.selectWidget("w1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().selectedWidgetId).toBe("w1");

    // El unsubscribe frena las notificaciones.
    off();
    store.selectWidget("w2");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("selectWidget no toca la historia ni el saveState", () => {
    const document = makeDocument();
    const seed = buildInitialHistory(document);
    const store = createStudioStore(seed);
    const before = store.getSnapshot();

    store.selectWidget("w9");
    const after = store.getSnapshot();

    expect(after.selectedWidgetId).toBe("w9");
    expect(after.history).toBe(before.history);
    expect(after.saveState).toBe(before.saveState);
    expect(after.revision).toBe(before.revision);
  });

  it("applyLoadedDocument con semilla identica solo avanza la revision", () => {
    const document = makeDocument();
    const seed = buildInitialHistory(document);
    const store = createStudioStore(seed);
    const listener = vi.fn();
    store.subscribe(listener);

    store.applyLoadedDocument({ document, revision: "rev-9" }, seed);

    const state = store.getSnapshot();
    expect(state.revision).toBe("rev-9");
    // La semilla intacta conserva la MISMA referencia de historia: el canvas
    // no repinta al reabrir un perfil sin cambios.
    expect(state.history).toBe(seed.history);
  });

  it("dispatch sin documento devuelve false sin mutar estado", () => {
    const store = createStudioStore(null);
    const listener = vi.fn();
    store.subscribe(listener);

    const accepted = store.dispatch({ type: "widget/remove", widgetId: "x" } as never);
    expect(accepted).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
