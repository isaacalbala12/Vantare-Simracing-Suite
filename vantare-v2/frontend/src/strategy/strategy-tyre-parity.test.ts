import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STRATEGY_COMPOUNDS,
  STRATEGY_CONFIDENCE_LEVELS,
  STRATEGY_CORNERS,
  STRATEGY_PROVENANCE_KINDS,
  STRATEGY_TYRE_ORIGINS,
  STRATEGY_TYRE_STATES,
  defaultTyreCondition,
} from "./strategy-tyre";

/**
 * `internal/strategy/tyres` is the authority for the tyre domain and this
 * module mirrors it. The editor once carried a second, simpler tyre model that
 * drifted from it, so these tests fail the moment the Go vocabulary gains a
 * value the TypeScript side does not know about.
 */
function goSource(relative: string): string {
  return readFileSync(join(process.cwd(), "..", relative), "utf8");
}

/** Pulls the string values out of a Go `const (...)` block for one type. */
function goConstants(source: string, typeName: string): string[] {
  const block = new RegExp(`const \\(([^)]*?)\\)`, "gs");
  const values: string[] = [];
  for (const match of source.matchAll(block)) {
    const body = match[1];
    if (!body.includes(`${typeName} = `)) continue;
    for (const line of body.matchAll(new RegExp(`${typeName}\\s*=\\s*"([^"]*)"`, "g"))) {
      values.push(line[1]);
    }
  }
  return values;
}

describe("strategy tyre model parity with the Go domain", () => {
  const inventory = goSource("internal/strategy/tyres/inventory.go");
  const metadata = goSource("internal/strategy/contract/metadata.go");

  it.each([
    ["Compound", STRATEGY_COMPOUNDS],
    ["Origin", STRATEGY_TYRE_ORIGINS],
    ["State", STRATEGY_TYRE_STATES],
  ])("covers every %s the domain declares", (typeName, mirrored) => {
    const declared = goConstants(inventory, typeName).filter((value) => value !== "");
    expect(declared.length).toBeGreaterThan(0);
    expect([...mirrored].sort()).toEqual([...declared].sort());
  });

  it("covers every physical corner, ignoring the empty sentinel", () => {
    const declared = goConstants(inventory, "Corner").filter((value) => value !== "");
    expect([...STRATEGY_CORNERS].sort()).toEqual([...declared].sort());
  });

  it.each([
    ["ProvenanceKind", STRATEGY_PROVENANCE_KINDS],
    ["ConfidenceLevel", STRATEGY_CONFIDENCE_LEVELS],
  ])("covers every %s the contract declares", (typeName, mirrored) => {
    const declared = goConstants(metadata, typeName);
    expect(declared.length).toBeGreaterThan(0);
    expect([...mirrored].sort()).toEqual([...declared].sort());
  });

  it("reproduces the default condition ranges the domain documents", () => {
    // Guards against the mirror quietly inventing kinder numbers than Go's.
    const ranges: Record<string, [number, number]> = {
      event_allocation: [100, 100],
      qualifying: [80, 90],
      unknown: [40, 70],
    };
    for (const [origin, [minimum, maximum]] of Object.entries(ranges)) {
      const source = new RegExp(
        `MinimumRemainingPercent: ${minimum},\\s*\\n\\s*MaximumRemainingPercent: ${maximum},`,
      );
      expect(source.test(inventory), `Go no declara el rango ${minimum}-${maximum}`).toBe(true);
      const condition = defaultTyreCondition(origin as keyof typeof ranges);
      expect(condition.minimumRemainingPercent).toBe(minimum);
      expect(condition.maximumRemainingPercent).toBe(maximum);
    }
  });

  it("keeps the editor from redeclaring a tyre model of its own", () => {
    const editor = readFileSync(join(process.cwd(), "src/strategy/strategy-editor.ts"), "utf8");
    expect(/remainingPercent/.test(editor), "the editor reintroduced a flat percentage").toBe(false);
    expect(editor).toContain('from "./strategy-tyre"');
  });
});
