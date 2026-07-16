import { describe, expect, it } from "vitest";
import type { InspectorControl } from "./inspector-control";
import {
  readControlValue,
  validateInspectorControls,
  writeControlValue,
} from "./inspector-control";

const showHeaderToggle: InspectorControl = {
  kind: "toggle",
  id: "show-header",
  labelKey: "overlay.inspector.delta.showHeader",
  path: "showHeader",
  defaultValue: true,
};

describe("validateInspectorControls", () => {
  it("rejects duplicate control ids", () => {
    expect(() =>
      validateInspectorControls([
        showHeaderToggle,
        { ...showHeaderToggle, labelKey: "other" },
      ]),
    ).toThrow(/duplicate id/i);
  });

  it("rejects duplicate paths", () => {
    expect(() =>
      validateInspectorControls([
        showHeaderToggle,
        { ...showHeaderToggle, id: "show-header-copy" },
      ]),
    ).toThrow(/duplicate path/i);
  });

  it("rejects forbidden path segments for appearance and content controls", () => {
    for (const segment of ["layout", "behavior", "id", "type"] as const) {
      expect(() =>
        validateInspectorControls([
          {
            kind: "toggle",
            id: `forbidden-${segment}`,
            labelKey: "test",
            path: segment,
            defaultValue: true,
          },
        ]),
      ).toThrow(/forbidden/i);
    }
  });

  it("rejects prototype pollution path segments", () => {
    for (const path of ["__proto__.polluted", "prototype.polluted", "constructor.polluted"]) {
      expect(() =>
        validateInspectorControls([
          {
            kind: "toggle",
            id: "unsafe",
            labelKey: "test",
            path,
            defaultValue: true,
          },
        ]),
      ).toThrow(/unsafe/i);
    }
  });

  it("rejects defaults outside control constraints", () => {
    expect(() =>
      validateInspectorControls([
        {
          kind: "range",
          id: "opacity",
          labelKey: "test",
          path: "opacity",
          min: 0,
          max: 1,
          step: 0.1,
          defaultValue: 2,
        },
      ]),
    ).toThrow(/default/i);

    expect(() =>
      validateInspectorControls([
        {
          kind: "select",
          id: "theme",
          labelKey: "test",
          path: "theme",
          options: [{ value: "dark", labelKey: "dark" }],
          defaultValue: "light",
        },
      ]),
    ).toThrow(/default/i);
  });

  it("accepts valid Delta appearance controls", () => {
    expect(() => validateInspectorControls([showHeaderToggle])).not.toThrow();
  });
});

describe("readControlValue", () => {
  it("reads dot-separated own properties", () => {
    const root = { showHeader: false, nested: { accent: "cyan" } };
    expect(readControlValue(root, "showHeader")).toBe(false);
    expect(readControlValue(root, "nested.accent")).toBe("cyan");
    expect(readControlValue(root, "missing.path")).toBeUndefined();
  });

  it("rejects unsafe paths", () => {
    expect(() => readControlValue({}, "__proto__.x")).toThrow(/unsafe/i);
  });
});

describe("writeControlValue", () => {
  it("writes dot-separated own properties without mutating the source root", () => {
    const root = { showHeader: true, nested: { accent: "cyan" } };
    const next = writeControlValue(root, "showHeader", false);
    expect(next.showHeader).toBe(false);
    expect(root.showHeader).toBe(true);
  });

  it("creates intermediate objects when missing", () => {
    const next = writeControlValue({}, "nested.accent", "magenta");
    expect(readControlValue(next, "nested.accent")).toBe("magenta");
  });

  it("rejects unsafe paths", () => {
    expect(() => writeControlValue({}, "constructor.x", 1)).toThrow(/unsafe/i);
  });
});