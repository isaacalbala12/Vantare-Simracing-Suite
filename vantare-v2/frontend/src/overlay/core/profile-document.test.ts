import { describe, expect, it } from "vitest";
import {
  ProfileDocumentValidationError,
  cloneProfileDocumentV3,
  parseProfileDocumentV3,
  type ProfileDocumentV3,
} from "./profile-document";

function minimalDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "minimal-v3",
    name: "Minimal V3",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [],
      },
    },
  };
}

function validWidget(id: string, type: "delta" | "standings" | "relative" | "pedals") {
  return {
    id,
    type,
    layout: { x: 100, y: 100, w: 200, h: 120, zIndex: 0, aspectLocked: true },
    behavior: { enabled: true, updateHz: 15 },
    content: {},
    visual: {
      systemId: "vantare-original" as const,
      systemVersion: 1,
      configVersion: 1,
      baseSettings: {},
      appearanceOverrides: {},
    },
  };
}

function expectPath(error: unknown, path: string) {
  expect(error).toBeInstanceOf(ProfileDocumentValidationError);
  expect((error as ProfileDocumentValidationError).path).toBe(path);
}

describe("parseProfileDocumentV3", () => {
  it("defaults older documents to the Original visual system", () => {
    expect(parseProfileDocumentV3(minimalDocument()).defaultVisualSystemId).toBe("vantare-original");
  });

  it("round-trips visual memory without functional document fields", () => {
    const document = parseProfileDocumentV3({
      ...minimalDocument(),
      defaultVisualSystemId: "vantare-crystal",
      layouts: {
        general: {
          type: "general",
          widgets: [
            {
              ...validWidget("delta-1", "delta"),
              visual: {
                ...validWidget("delta-1", "delta").visual,
                systemMemories: {
                  "vantare-crystal": {
                    systemVersion: 2,
                    configVersion: 3,
                    baseSettings: { accentColor: "#8cf" },
                    appearanceOverrides: { opacity: 0.9 },
                    provenance: {
                      designId: "delta-crystal",
                      designName: "Delta Crystal",
                      origin: "vantare",
                      appliedAt: "2026-07-12T00:00:00Z",
                    },
                  },
                },
              },
            },
          ],
        },
      },
    });

    const memory = document.layouts.general.widgets[0]?.visual.systemMemories?.["vantare-crystal"];
    expect(memory?.provenance?.designId).toBe("delta-crystal");
    const cloned = cloneProfileDocumentV3(document);
    cloned.layouts.general.widgets[0]!.visual.systemMemories!["vantare-crystal"]!.baseSettings.accentColor = "#f88";
    expect(memory?.baseSettings.accentColor).toBe("#8cf");
  });

  it.each([
    ["unknown system", { "unknown-system": {} }, "layouts.general.widgets[0].visual.systemMemories.unknown-system"],
    [
      "version below one",
      { "vantare-crystal": { systemVersion: 0, configVersion: 1, baseSettings: {}, appearanceOverrides: {} } },
      "layouts.general.widgets[0].visual.systemMemories.vantare-crystal.systemVersion",
    ],
  ])("rejects invalid visual memory: %s", (_label, systemMemories, path) => {
    const doc = {
      ...minimalDocument(),
      layouts: {
        general: {
          type: "general" as const,
          widgets: [
            {
              ...validWidget("delta-1", "delta"),
              visual: { ...validWidget("delta-1", "delta").visual, systemMemories },
            },
          ],
        },
      },
    };

    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, path);
    }
  });

  it("rejects functional fields in visual memory", () => {
    const doc = {
      ...minimalDocument(),
      layouts: {
        general: {
          type: "general" as const,
          widgets: [
            {
              ...validWidget("delta-1", "delta"),
              visual: {
                ...validWidget("delta-1", "delta").visual,
                systemMemories: {
                  "vantare-crystal": {
                    systemVersion: 1,
                    configVersion: 1,
                    baseSettings: {},
                    appearanceOverrides: {},
                    content: { mustNotPersist: true },
                  },
                },
              },
            },
          ],
        },
      },
    };

    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.widgets[0].visual.systemMemories.vantare-crystal.content");
    }
  });

  it.each([
    "delta",
    "standings",
    "relative",
    "pedals",
    "broadcast-tower",
    "fuel-strategy",
    "pedals-telemetry",
    "pedals-telemetry-compact",
    "racing-flags",
    "delta-trace",
    "race-schedule",
    "head-to-head",
    "delta-advanced",
    "input-telemetry",
    "multiclass-relative",
    "track-weather",
    "car-damage-visual",
    "car-damage-numbers",
  ] as const)("accepts widget type %s", (type) => {
    const doc = {
      ...minimalDocument(),
      layouts: {
        general: {
          type: "general" as const,
          widgets: [{ ...validWidget("widget-1", "delta"), type }],
        },
      },
    };

    expect(parseProfileDocumentV3(doc).layouts.general.widgets[0]?.type).toBe(type);
  });

  it.each(["pedals-v1", "car-damage", "delta-simple"])("rejects non-canonical widget type %s", (type) => {
    const doc = {
      ...minimalDocument(),
      layouts: {
        general: {
          type: "general" as const,
          widgets: [{ ...validWidget("widget-1", "delta"), type }],
        },
      },
    };

    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.widgets[0].type");
    }
  });

  it("accepts valid empty general layout", () => {
    expect(parseProfileDocumentV3(minimalDocument()).id).toBe("minimal-v3");
  });

  it("rejects schema not 3", () => {
    const doc = { ...minimalDocument(), schemaVersion: 2 };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "schemaVersion");
    }
  });

  it("rejects empty profile id", () => {
    const doc = { ...minimalDocument(), id: "" };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "id");
    }
  });

  it("rejects empty profile name", () => {
    const doc = { ...minimalDocument(), name: "" };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "name");
    }
  });

  it("rejects missing general layout", () => {
    const doc = { ...minimalDocument(), layouts: {} };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general");
    }
  });

  it("rejects layout key type mismatch", () => {
    const doc = {
      ...minimalDocument(),
      layouts: {
        general: { type: "race", widgets: [] },
      },
    };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.type");
    }
  });

  it("rejects duplicate widget id", () => {
    const widget = validWidget("dup", "delta");
    const doc = {
      ...minimalDocument(),
      layouts: { general: { type: "general", widgets: [widget, widget] } },
    };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.widgets");
    }
  });

  it("rejects unsupported widget type", () => {
    const doc = {
      ...minimalDocument(),
      layouts: {
        general: {
          type: "general",
          widgets: [
            {
              ...validWidget("telemetry-1", "delta"),
              id: "telemetry-1",
              type: "telemetry",
            },
          ],
        },
      },
    };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.widgets[0].type");
    }
  });

  it("accepts preserved unsupported legacy payload", () => {
    const doc = {
      ...minimalDocument(),
      layouts: {
        general: {
          type: "general",
          widgets: [],
          preservedWidgets: [{ id: "telemetry-aux", type: "telemetry", source: { id: "telemetry-aux" } }],
        },
      },
    };
    expect(parseProfileDocumentV3(doc).layouts.general.preservedWidgets?.[0].type).toBe("telemetry");
  });

  it("rejects unsupported system id", () => {
    const widget = {
      ...validWidget("delta-1", "delta"),
      visual: { ...validWidget("delta-1", "delta").visual, systemId: "broadcast-pro" },
    };
    const doc = {
      ...minimalDocument(),
      layouts: { general: { type: "general", widgets: [widget] } },
    };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.widgets[0].visual.systemId");
    }
  });

  it("rejects width less than 1", () => {
    const widget = {
      ...validWidget("delta-1", "delta"),
      layout: { ...validWidget("delta-1", "delta").layout, w: 0 },
    };
    const doc = {
      ...minimalDocument(),
      layouts: { general: { type: "general", widgets: [widget] } },
    };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.widgets[0].layout.w");
    }
  });

  it("rejects updateHz outside range", () => {
    const widget = {
      ...validWidget("delta-1", "delta"),
      behavior: { ...validWidget("delta-1", "delta").behavior, updateHz: 0 },
    };
    const doc = {
      ...minimalDocument(),
      layouts: { general: { type: "general", widgets: [widget] } },
    };
    try {
      parseProfileDocumentV3(doc);
      throw new Error("expected validation error");
    } catch (error) {
      expectPath(error, "layouts.general.widgets[0].behavior.updateHz");
    }
  });
});

describe("cloneProfileDocumentV3", () => {
  it("returns a deep copy", () => {
    const original = parseProfileDocumentV3(minimalDocument());
    const cloned = cloneProfileDocumentV3(original);
    cloned.name = "mutated";
    expect(original.name).toBe("Minimal V3");
  });
});
