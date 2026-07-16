import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import {
  copySessionLayout,
  materializeSessionLayout,
  resolveSessionLayout,
} from "./session-layouts";

function buildDocument(): ProfileDocumentV3 {
  const delta = deltaDefinition.createDefault("delta-general");
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
        preservedWidgets: [{ id: "legacy-1", type: "telemetry", source: { x: 1 } }],
      },
    },
  };
}

describe("resolveSessionLayout", () => {
  it("resolves general directly from the document", () => {
    const document = buildDocument();
    const layout = resolveSessionLayout(document, "general");
    expect(layout.type).toBe("general");
    expect(layout.widgets[0].id).toBe("delta-general");
    expect(layout.preservedWidgets?.[0].id).toBe("legacy-1");
  });

  it("resolves a missing session as a cloned general layout with the requested type", () => {
    const document = buildDocument();
    const layout = resolveSessionLayout(document, "race");
    expect(layout.type).toBe("race");
    expect(layout.widgets[0].id).toBe("delta-general");
    expect(document.layouts.race).toBeUndefined();
  });

  it("does not mutate the source document while resolving", () => {
    const document = buildDocument();
    const before = structuredClone(document);
    resolveSessionLayout(document, "qualifying");
    expect(document).toEqual(before);
  });
});

describe("materializeSessionLayout", () => {
  it("writes an independent layout into the document", () => {
    const document = buildDocument();
    const next = materializeSessionLayout(document, "race");
    expect(next.layouts.race?.type).toBe("race");
    expect(next.layouts.race?.widgets[0].id).toBe("delta-general");
    expect(document.layouts.race).toBeUndefined();
  });

  it("keeps materialized race isolated from later general edits", () => {
    const document = buildDocument();
    const materialized = materializeSessionLayout(document, "race");
    const editedGeneral = structuredClone(materialized);
    editedGeneral.layouts.general.widgets[0].layout.x = 999;

    expect(materialized.layouts.race?.widgets[0].layout.x).toBe(64);
    expect(editedGeneral.layouts.race?.widgets[0].layout.x).toBe(64);
  });
});

describe("copySessionLayout", () => {
  it("replaces only the target session layout", () => {
    const document = buildDocument();
    const withRace = materializeSessionLayout(document, "race");
    withRace.layouts.race!.widgets[0].layout.x = 240;

    const copied = copySessionLayout(withRace, "race", "qualifying");
    expect(copied.layouts.qualifying?.widgets[0].layout.x).toBe(240);
    expect(copied.layouts.race?.widgets[0].layout.x).toBe(240);
    expect(copied.layouts.general.widgets[0].layout.x).toBe(64);
  });

  it("copies empty source layouts correctly", () => {
    const document = buildDocument();
    document.layouts.general.widgets = [];
    const copied = copySessionLayout(document, "general", "practice");
    expect(copied.layouts.practice?.widgets).toEqual([]);
    expect(copied.layouts.practice?.type).toBe("practice");
  });
});