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