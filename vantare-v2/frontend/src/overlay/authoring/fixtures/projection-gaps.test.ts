import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WIDGET_PROJECTION_GAPS, projectionGapsFor } from "./projection-gaps";
import { widgetTypeRegistry } from "../../core/widget-registry";

function declaredUnsupportedFields(): string[] {
  const adapter = readFileSync(
    join(process.cwd(), "src/overlay/projection/overlay-projection-adapter.ts"),
    "utf8",
  );
  const block = adapter.slice(
    adapter.indexOf("UNSUPPORTED_FIELDS"),
    adapter.indexOf("];", adapter.indexOf("UNSUPPORTED_FIELDS")),
  );
  return [...block.matchAll(/targetPath: "([^"]+)"/g)].map((match) => match[1]);
}

describe("projection gaps", () => {
  it("only names fields the projection adapter declares unsupported", () => {
    const declared = declaredUnsupportedFields();
    expect(declared.length).toBeGreaterThan(0);
    for (const [widget, gaps] of Object.entries(WIDGET_PROJECTION_GAPS)) {
      for (const gap of gaps ?? []) {
        expect(declared, `${widget} names a field the adapter does not list`).toContain(gap.field);
      }
    }
  });

  it("warns about the car number, which both grids put on every row", () => {
    for (const widget of ["standings", "relative"] as const) {
      expect(projectionGapsFor(widget).map((gap) => gap.field)).toContain("scoring[].driverNumber");
    }
  });

  it("keys every entry to a registered widget type", () => {
    const known = new Set(widgetTypeRegistry.list().map((definition) => definition.type));
    for (const widget of Object.keys(WIDGET_PROJECTION_GAPS)) {
      expect(known).toContain(widget);
    }
  });

  it("states a consequence, not just a field name", () => {
    for (const gaps of Object.values(WIDGET_PROJECTION_GAPS)) {
      for (const gap of gaps ?? []) {
        expect(gap.consequence.trim().length).toBeGreaterThan(10);
      }
    }
  });
});
