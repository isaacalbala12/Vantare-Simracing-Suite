import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_WIDGET_TYPES } from "./profile-document";

type Row = { id: string; free: boolean; pro: boolean; proPlus: boolean; launch: boolean };

describe("widget matrix contract", () => {
  it("covers every widget type delivered to Studio and the native runtime", () => {
    const path = resolve(process.cwd(), "../internal/license/widget_matrix.json");
    const matrix = JSON.parse(readFileSync(path, "utf8")) as { version: number; widgets: Row[] };
    expect(matrix.version).toBe(1);
    expect(matrix.widgets.map((row) => row.id).sort()).toEqual([...ALL_WIDGET_TYPES].sort());
    expect(matrix.widgets.filter((row) => row.free).map((row) => row.id).sort())
      .toEqual(["pedals", "standings"]);
  });
});
