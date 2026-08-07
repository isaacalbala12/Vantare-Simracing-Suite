import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Strategy Planner shipped a workspace that looked finished while every
 * headline figure was a string constant. These guards fail if presentation
 * starts inventing race data again: the page may only render what a calculation
 * or a stored document gave it.
 */
const PRESENTATION_SOURCES = [
  "StrategyPlannerPage.tsx",
  "StrategyManualInputPanel.tsx",
] as const;

function readPresentation(file: string): string {
  return readFileSync(join(process.cwd(), "src/hub/strategy", file), "utf8");
}

describe("Strategy Planner presentation honesty", () => {
  it("states no race or lap time that presentation invented", () => {
    // e.g. "6h 04m 12.0s", "6h 04m", "1:38.031"
    const raceTime = /\d+\s*h\s*\d{2}\s*m|\b\d+:\d{2}\.\d{3}\b/;
    for (const file of PRESENTATION_SOURCES) {
      const offenders = readPresentation(file)
        .split("\n")
        .map((line, index) => [index + 1, line] as const)
        .filter(([, line]) => raceTime.test(line));
      expect(offenders, `${file} hardcodes a race or lap time:\n${offenders.map(([n, l]) => `${n}: ${l.trim()}`).join("\n")}`).toEqual([]);
    }
  });

  it("labels only the variants the solver actually produces", () => {
    const source = readPresentation("StrategyPlannerPage.tsx");
    // The fabricated trio was Conservadora / Agresiva / Segura. Two of those are
    // not solver variants at all, so their return would mean invented plans.
    expect(/"Agresiva"/.test(source), "Agresiva is not a solver variant").toBe(false);
    expect(/"Segura"/.test(source), "Segura is not a solver variant").toBe(false);
    // The label map must cover the solver's kinds and nothing else.
    const labels = source.match(/VARIANT_LABELS[^=]*=\s*\{([\s\S]*?)\n\};/);
    expect(labels, "VARIANT_LABELS is missing").not.toBeNull();
    const kinds = Array.from(labels![1].matchAll(/^\s{2}(\w+):/gm), (match) => match[1]).sort();
    expect(kinds).toEqual(["conservative", "fast", "robust"]);
  });

  it("does not seed number inputs with a value the user did not enter", () => {
    for (const file of PRESENTATION_SOURCES) {
      const offenders = readPresentation(file)
        .split("\n")
        .filter((line) => /type="number"/.test(line) && /defaultValue=/.test(line));
      expect(offenders, `${file} seeds a number input with an invented default`).toEqual([]);
    }
  });

  it("renders the strategy list only from candidates handed to the page", () => {
    const source = readPresentation("StrategyPlannerPage.tsx");
    // A module-level array of plan-shaped literals is exactly what went wrong.
    expect(/const\s+STRATEGIES\s*=/.test(source), "STRATEGIES constant is back").toBe(false);
    expect(source).toContain("strategy-candidates-empty");
  });
});
