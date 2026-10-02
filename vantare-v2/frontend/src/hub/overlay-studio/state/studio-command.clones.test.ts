import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trackWeatherDefinition } from "../../../overlay/widget-types/track-weather/track-weather-definition";
import type { ProfileDocumentV3, SessionLayoutType } from "../../../overlay/core/profile-document";
import { commitStudioCommand, createStudioHistory } from "./studio-history";
import type { StudioCommand } from "./studio-command";

// Guardia de regresion de la campaña perf/round2: cada comando pasaba por dos
// structuredClone completos del documento (withSessionLayout + materialize /
// copySessionLayout). Estas pruebas fijan el numero exacto de clones por ruta
// para que un retorno del clone redundante falle aqui y no en un benchmark
// ruidoso.

let cloneCount = 0;
const realStructuredClone = globalThis.structuredClone;

beforeAll(() => {
  globalThis.structuredClone = <T,>(value: T): T => {
    cloneCount += 1;
    return realStructuredClone(value);
  };
});

afterAll(() => {
  globalThis.structuredClone = realStructuredClone;
});

function buildDocument(widgets: number, sessions: SessionLayoutType[] = ["general"]): ProfileDocumentV3 {
  const makeWidgets = (offset: number) =>
    Array.from({ length: widgets }, (_, i) => {
      const widget = trackWeatherDefinition.createDefault(`track-${offset + i}`);
      widget.layout.x = 64 + i;
      widget.layout.zIndex = i;
      return widget;
    });
  const layouts: ProfileDocumentV3["layouts"] = {
    general: { type: "general", widgets: makeWidgets(0) },
  };
  sessions.forEach((session, index) => {
    if (session === "general") return;
    layouts[session] = { type: session, widgets: makeWidgets(1000 * (index + 1)) };
  });
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Clone Count Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts,
  };
}

function commitAndCount(command: StudioCommand, widgets = 25, sessions?: SessionLayoutType[]) {
  const document = buildDocument(widgets, sessions);
  const history = createStudioHistory(document);
  cloneCount = 0;
  const next = commitStudioCommand(history, command);
  const clones = cloneCount;
  return { history, next, clones };
}

describe("commitStudioCommand clone accounting", () => {
  it("widget/layout on an existing session does not mutate the input document", () => {
    const document = buildDocument(25);
    const history = createStudioHistory(document);
    const before = realStructuredClone(history.present);
    commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["track-0"],
      patch: { x: 999 },
    });
    expect(history.present).toEqual(before);
  });

  it("widget/layout on an existing session clones the document once plus the history snapshot", () => {
    const { next, history, clones } = commitAndCount({
      type: "widget/layout",
      session: "general",
      widgetIds: ["track-0"],
      patch: { x: 999 },
    });
    expect(next).not.toBe(history);
    expect(next.present.layouts.general.widgets[0].layout.x).toBe(999);
    expect(clones).toBe(2);
  });

  it("widget/content clones the document once plus payload and history snapshot", () => {
    const { clones } = commitAndCount({
      type: "widget/content",
      session: "general",
      widgetIds: ["track-1"],
      content: { note: "updated" },
    });
    // documento + payload content + snapshot de historial
    expect(clones).toBe(3);
  });

  it("widget/visual clones the document once plus payload and history snapshot", () => {
    const { clones } = commitAndCount({
      type: "widget/visual",
      session: "general",
      widgetIds: ["track-1"],
      visual: {
        systemId: "vantare-crystal",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    });
    // documento + payload visual + snapshot de historial
    expect(clones).toBe(3);
  });

  it("a no-op command performs a single document clone", () => {
    const { next, history, clones } = commitAndCount({
      type: "widget/layout",
      session: "general",
      widgetIds: ["track-0"],
      patch: { x: 64 },
    });
    expect(next).toBe(history);
    expect(clones).toBe(1);
  });

  it("materializing a missing session adds exactly one layout clone", () => {
    const { next, clones } = commitAndCount({
      type: "widget/layout",
      session: "race",
      widgetIds: ["track-0"],
      patch: { x: 500 },
    });
    expect(next.present.layouts.race?.type).toBe("race");
    expect(next.present.layouts.race?.widgets[0].layout.x).toBe(500);
    // documento + layout general materializado + snapshot de historial
    expect(clones).toBe(3);
  });

  it("session/copy clones the document once and the source layout once", () => {
    const { next, history, clones } = commitAndCount(
      { type: "session/copy", source: "race", target: "qualifying" },
      10,
      ["general", "race"],
    );
    expect(next).not.toBe(history);
    expect(next.present.layouts.qualifying?.type).toBe("qualifying");
    expect(clones).toBe(3);
    // La copia queda aislada: editar el target no toca la sesion origen.
    const edited = commitStudioCommand(next, {
      type: "widget/layout",
      session: "qualifying",
      widgetIds: ["track-2000"],
      patch: { x: 777 },
    });
    expect(edited.present.layouts.race?.widgets[0].layout.x).toBe(64);
  });

  it("session/copy materializing from general stays independent", () => {
    const { next, clones } = commitAndCount({
      type: "session/copy",
      source: "general",
      target: "endurance",
    });
    expect(next.present.layouts.endurance?.type).toBe("endurance");
    expect(next.present.layouts.endurance?.widgets).toHaveLength(25);
    expect(clones).toBe(3);
  });
});
