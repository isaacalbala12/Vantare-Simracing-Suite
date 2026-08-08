import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The package format is defined in Go and consumed in TypeScript. Nothing
 * compiles across that boundary, so this test reads the Go source and fails if
 * the two vocabularies drift.
 *
 * A word that exists on one side and not the other is how an import silently
 * shows the wrong thing, or refuses with a reason the interface cannot name.
 */

const goRoot = join(process.cwd(), "..", "internal", "strategy");

function goSource(...path: string[]): string {
  return readFileSync(join(goRoot, ...path), "utf8");
}

function goConstants(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]).sort();
}

function tsUnion(source: string, name: string): string[] {
  const declaration = new RegExp(`export type ${name}[^=]*=([^;]+);`).exec(source);
  if (!declaration) throw new Error(`${name} is not declared`);
  return [...declaration[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();
}

describe("strategy package format parity", () => {
  const client = readFileSync(join(process.cwd(), "src", "strategy", "strategy-application-client.ts"), "utf8");

  it("names every disposition Go can report", () => {
    const go = goConstants(
      goSource("packaging", "preview.go"),
      /Disposition\w+\s+Disposition\s*=\s*"([a-z_]+)"/g,
    );
    expect(go.length).toBeGreaterThan(0);
    expect(tsUnion(client, "StrategyImportDispositionV1")).toEqual(go);
  });

  it("recognises every packaging refusal Go can raise", () => {
    const packagingCodes = goConstants(
      goSource("packaging", "errors.go"),
      /Error\w+\s+ErrorCode\s*=\s*"([a-z_]+)"/g,
    );
    const applicationCodes = goConstants(
      goSource("application", "errors.go"),
      /Error\w+\s+ErrorCode\s*=\s*"([a-z_]+)"/g,
    );
    // Without this the loop below could pass by scanning nothing.
    expect(packagingCodes.length).toBeGreaterThan(5);
    expect(applicationCodes.length).toBeGreaterThan(5);
    const known = new Set(tsUnion(client, "StrategyApplicationErrorCode"));
    for (const code of [...packagingCodes, ...applicationCodes]) {
      expect(known, `TypeScript cannot name the Go refusal ${code}`).toContain(code);
    }
  });

  it("agrees with Go on the package envelope version", () => {
    const declared = /PackageVersionV1 = "([a-z0-9.]+)"/.exec(goSource("packaging", "package.go"));
    expect(declared?.[1]).toBe("strategy.package.v1");
    const transfer = readFileSync(join(process.cwd(), "src", "strategy", "strategy-transfer.test.ts"), "utf8");
    expect(transfer).toContain(declared?.[1] ?? "");
  });

  it("keeps both sides on the same two transfer operations", () => {
    const operations = goConstants(
      goSource("application", "types.go"),
      /Operation(?:Export|Import)\s+Operation\s*=\s*"([a-z_]+)"/g,
    );
    expect(operations).toEqual(["export", "import"]);
    for (const operation of operations) {
      expect(client).toContain(`CommandHeader<"${operation}">`);
    }
  });
});
