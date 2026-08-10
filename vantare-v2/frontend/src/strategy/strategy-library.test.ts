import { describe, expect, it } from "vitest";
import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  type StrategyApplicationClient,
  type StrategyApplicationCommandV1,
  type StrategyApplicationResultV1,
} from "./strategy-application-client";
import {
  describePlan,
  filterPlans,
  loadStrategyLibrary,
  sortPlans,
  type StrategyLibraryEntry,
} from "./strategy-library";

function plan(overrides: Partial<StrategyLibraryEntry> & Pick<StrategyLibraryEntry, "planId">): StrategyLibraryEntry {
  return {
    variantId: "variant-1",
    name: "Plan",
    mode: "manual",
    updatedAt: "2026-08-01T10:00:00Z",
    hasDraft: false,
    revisionCount: 1,
    ...overrides,
  };
}

function clientReturning(
  plans: readonly StrategyLibraryEntry[],
  seen: StrategyApplicationCommandV1<unknown>[] = [],
): StrategyApplicationClient<unknown> {
  return {
    async execute(command) {
      seen.push(command);
      return {
        protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
        commandId: command.commandId,
        repositoryVersion: 7,
        plans,
        recoveredFromBackup: false,
        closed: false,
      } satisfies StrategyApplicationResultV1<unknown>;
    },
    cancel() { return false; },
    dispose() {},
  };
}

describe("strategy library read model", () => {
  it("asks the application service for the library and nothing else", async () => {
    const seen: StrategyApplicationCommandV1<unknown>[] = [];
    const library = await loadStrategyLibrary(clientReturning([plan({ planId: "plan-1" })], seen), "list-1");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
      operation: "list",
      commandId: "list-1",
    });
    expect(library.repositoryVersion).toBe(7);
    expect(library.plans).toHaveLength(1);
  });

  it("treats a library with no plans as empty rather than as a failure", async () => {
    const library = await loadStrategyLibrary(clientReturning([]), "list-2");
    expect(library.plans).toEqual([]);
    expect(library.recoveredFromBackup).toBe(false);
  });

  it("matches a search ignoring case and accents", () => {
    const plans = [
      plan({ planId: "plan-1", name: "6h Spa · Hypercar" }),
      plan({ planId: "plan-2", name: "24h Le Máns · LMGT3" }),
    ];
    expect(filterPlans(plans, { query: "spa" }).map((entry) => entry.planId)).toEqual(["plan-1"]);
    expect(filterPlans(plans, { query: "LE MANS" }).map((entry) => entry.planId)).toEqual(["plan-2"]);
    expect(filterPlans(plans, { query: "" })).toHaveLength(2);
  });

  it("searches identifiers as well as names", () => {
    const plans = [plan({ planId: "spa-2026", name: "Sin nombre" })];
    expect(filterPlans(plans, { query: "spa-2026" })).toHaveLength(1);
  });

  it("filters by whether work is open or saved", () => {
    const plans = [
      plan({ planId: "plan-1", hasDraft: true, revisionCount: 0 }),
      plan({ planId: "plan-2", hasDraft: false, revisionCount: 3 }),
    ];
    expect(filterPlans(plans, { onlyUnsaved: true }).map((entry) => entry.planId)).toEqual(["plan-1"]);
    expect(filterPlans(plans, { onlySaved: true }).map((entry) => entry.planId)).toEqual(["plan-2"]);
  });

  it("orders by recency and by name without mutating the input", () => {
    const plans = [
      plan({ planId: "plan-b", name: "Bravo", updatedAt: "2026-08-01T10:00:00Z" }),
      plan({ planId: "plan-a", name: "Alfa", updatedAt: "2026-08-05T10:00:00Z" }),
    ];
    const original = [...plans];

    expect(sortPlans(plans, "recent").map((entry) => entry.planId)).toEqual(["plan-a", "plan-b"]);
    expect(sortPlans(plans, "name").map((entry) => entry.name)).toEqual(["Alfa", "Bravo"]);
    expect(plans).toEqual(original);
  });

  it("breaks ties on identity so the order never wobbles", () => {
    const tied = [
      plan({ planId: "plan-c", name: "Igual" }),
      plan({ planId: "plan-a", name: "Igual" }),
      plan({ planId: "plan-b", name: "Igual" }),
    ];
    for (const sort of ["recent", "name"] as const) {
      const first = sortPlans(tied, sort).map((entry) => entry.planId);
      expect(first).toEqual(["plan-a", "plan-b", "plan-c"]);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(sortPlans(tied, sort).map((entry) => entry.planId)).toEqual(first);
      }
    }
  });

  it("separates variants of one plan deterministically", () => {
    const variants = [
      plan({ planId: "plan-1", variantId: "variant-b" }),
      plan({ planId: "plan-1", variantId: "variant-a" }),
    ];
    expect(sortPlans(variants, "recent").map((entry) => entry.variantId)).toEqual(["variant-a", "variant-b"]);
  });

  it("describes a plan from what it holds, with no invented detail", () => {
    expect(describePlan(plan({ planId: "p", revisionCount: 1 }))).toBe("1 revisión");
    expect(describePlan(plan({ planId: "p", revisionCount: 4 }))).toBe("4 revisiones");
    expect(describePlan(plan({ planId: "p", revisionCount: 0, hasDraft: true })))
      .toBe("0 revisiones · con cambios abiertos");
  });
});
