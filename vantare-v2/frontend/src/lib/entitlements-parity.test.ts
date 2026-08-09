import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { entitlementsSuiteGranting } from "./entitlements-refresh";
import type { Entitlement } from "./license-types";

/**
 * PARITY TEST: Verifies that TypeScript entitlementsSuiteGranting() and Go
 * ClassifyPlan() agree on which entitlements grant Suite access.
 *
 * This test reads internal/license/plan.go as source TEXT (not via imports)
 * and extracts the suite-granting entitlements using regex. It then asserts
 * that entitlementsSuiteGranting() returns true for each one.
 *
 * If this test fails, it means one side defines a suite-granting entitlement
 * that the other side does not recognize. This is the exact bug that
 * originally caused users with beta_access to see the paywall.
 */
describe("entitlements parity: TS vs Go suite-granting rules", () => {
  it("entitlementsSuiteGranting accepts all suite-granting entitlements from Go", () => {
    // Resolve the Go source file path robustly relative to repo root,
    // working from both repo root and package directory.
    const repoRoot = resolve(__dirname, "../../..");
    const goSourcePath = resolve(repoRoot, "internal/license/plan.go");

    let goSource: string;
    try {
      goSource = readFileSync(goSourcePath, "utf-8");
    } catch (err) {
      throw new Error(
        `Failed to read Go source for parity test at ${goSourcePath}: ${err}`,
      );
    }

    // Extract suite-granting entitlements from Go source.
    // Look for the case statement in ClassifyPlan that returns PlanSuite:
    // case has[EntitlementBundle],
    //   has[EntitlementBetaAccess],
    //   ... (multiple lines)
    //   has[EntitlementOverlays] && has[EntitlementEngineer]:
    //   return PlanSuite
    //
    // Match from "case has[" up to "return PlanSuite"
    const suiteGrantingPattern =
      /case\s+has\[[\s\S]*?\]\s*:[\s\S]*?return\s+PlanSuite/;
    const match = goSource.match(suiteGrantingPattern);

    if (!match) {
      throw new Error(
        "Could not find suite-granting case statement in Go source. " +
          "Pattern expected: 'case has[...]:' followed by 'return PlanSuite'. " +
          "Parser may be out of sync with internal/license/plan.go structure.",
      );
    }

    // Extract all EntitlementX constant names from the matched case block.
    // This includes both standalone: has[EntitlementBundle]
    // and combination: has[EntitlementOverlays] && has[EntitlementEngineer]
    const caseBlock = match[0];
    const entitlementMatches = caseBlock.match(/Entitlement\w+/g) || [];
    const uniqueEntitlements = [...new Set(entitlementMatches)];

    if (uniqueEntitlements.length < 4) {
      throw new Error(
        `Expected at least 4 suite-granting entitlements in Go, got ${uniqueEntitlements.length}: ${uniqueEntitlements.join(", ")}`,
      );
    }

    // Map Go constant names (e.g., "EntitlementBundle") to string values
    // by reading the constant definitions from types.go.
    const typesSourcePath = resolve(repoRoot, "internal/license/types.go");
    let typesSource: string;
    try {
      typesSource = readFileSync(typesSourcePath, "utf-8");
    } catch (err) {
      throw new Error(
        `Failed to read types.go for parity test at ${typesSourcePath}: ${err}`,
      );
    }

    // Extract entitlement constant definitions.
    // Pattern: EntitlementXXX Entitlement = "xxx"
    // Filter out overlays and engineer if they appear in a combined condition.
    const combinationPattern = /has\[EntitlementOverlays\]\s*&&\s*has\[EntitlementEngineer\]/;
    const hasCombination = combinationPattern.test(caseBlock);

    const suiteGrantingStringValues: string[] = [];
    for (const constName of uniqueEntitlements) {
      // Skip overlays and engineer if they only appear in combination
      if (
        hasCombination &&
        (constName === "EntitlementOverlays" || constName === "EntitlementEngineer")
      ) {
        continue;
      }

      const constPattern = new RegExp(
        `${constName}\\s+Entitlement\\s+=\\s+"([^"]+)"`,
      );
      const constMatch = typesSource.match(constPattern);
      if (constMatch) {
        suiteGrantingStringValues.push(constMatch[1]);
      }
    }

    if (suiteGrantingStringValues.length === 0) {
      throw new Error(
        `Could not extract string values for Go entitlements: ${uniqueEntitlements.join(", ")}`,
      );
    }

    // Verify that each suite-granting entitlement in Go is accepted by TS.
    for (const entValue of suiteGrantingStringValues) {
      const result = entitlementsSuiteGranting([entValue as Entitlement]);
      expect(result).toBe(
        true,
        `PARITY MISMATCH: Go defines "${entValue}" as suite-granting, but TS function does not recognize it. ` +
          `Check internal/license/plan.go vs frontend/src/lib/entitlements-refresh.ts`,
      );
    }

    // Also verify the overlays+engineer combination is recognized.
    const overlaysEngineerResult = entitlementsSuiteGranting(["overlays" as Entitlement, "engineer" as Entitlement]);
    expect(overlaysEngineerResult).toBe(
      true,
      "TS should recognize overlays+engineer combination as suite-granting",
    );

    // Verify that known non-suite entitlements are NOT accepted.
    const nonSuiteValues = ["supporter", "overlays", "engineer", "ac_lua_pack"];
    for (const entValue of nonSuiteValues) {
      const result = entitlementsSuiteGranting([entValue as Entitlement]);
      expect(result).toBe(
        false,
        `TS should NOT recognize standalone ${entValue} as suite-granting`,
      );
    }
  });
});
