import { describe, expect, it } from "vitest";
import { designSystemRegistry } from "../core/design-system-registry";
import { widgetTypeRegistry } from "../core/widget-registry";
import { listOfficialDesigns } from "./official-designs";
import { assertCatalogMatrixEquivalent, buildAndCheckCatalogMatrix, CATALOG_MIGRATION_LOTS, type CatalogMatrixInput } from "./catalog-migration-checker";

function input(): CatalogMatrixInput {
  return { officialDesigns: listOfficialDesigns(), systems: designSystemRegistry.list(), widgetTypes: widgetTypeRegistry.list(), lots: CATALOG_MIGRATION_LOTS };
}

describe("catalog migration matrix", () => {
  it("freezes the real catalog metadata, order and migration provenance", () => {
    expect(buildAndCheckCatalogMatrix(input())).toMatchSnapshot();
  });

  it("keeps the two Crystal contracts separate", () => {
    const matrix = buildAndCheckCatalogMatrix(input());
    expect(matrix).toHaveLength(41);
    expect(matrix.filter((entry) => entry.systemId === "vantare-original")).toHaveLength(19);
    expect(matrix.filter((entry) => entry.systemId === "vantare-crystal")).toHaveLength(22);
    expect(matrix.find((entry) => entry.id === "engineer-radio-crystal")?.lotId).toBe("crystal-engineer");
  });

  it.each([
    ["disappearance", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => matrix.slice(1), "catalog design disappeared"],
    ["appearance", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => [...matrix, { ...matrix[0], id: "invented" }], "catalog design appeared"],
    ["metadata", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => matrix.map((entry, index) => index === 0 ? { ...entry, configVersion: 99 } : entry), "catalog metadata changed"],
    ["settings", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => matrix.map((entry, index) => index === 0 ? { ...entry, defaultSettings: { changed: true } } : entry), "catalog metadata changed"],
    ["dimensions", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => matrix.map((entry, index) => index === 0 ? { ...entry, defaultSize: { width: 1, height: 1 } } : entry), "catalog metadata changed"],
    ["renderer provenance", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => matrix.map((entry, index) => index === 0 ? { ...entry, renderer: "changed" } : entry), "catalog metadata changed"],
    ["lot", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => matrix.map((entry, index) => index === 0 ? { ...entry, lotId: "changed" } : entry), "catalog metadata changed"],
    ["reorder", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => [matrix[1], matrix[0], ...matrix.slice(2)], "catalog design order changed"],
    ["duplicate candidate ID", (matrix: ReturnType<typeof buildAndCheckCatalogMatrix>) => matrix.map((entry, index) => index === 1 ? { ...entry, id: matrix[0].id } : entry), "duplicate candidate catalog design ID"],
  ])("rejects %s during a migration equivalence comparison", (_name, mutate, message) => {
    const frozen = buildAndCheckCatalogMatrix(input());
    expect(() => assertCatalogMatrixEquivalent(frozen, mutate(frozen))).toThrow(message);
  });

  it("rejects duplicate design IDs in the frozen baseline", () => {
    const frozen = buildAndCheckCatalogMatrix(input());
    const invalidFrozen = frozen.map((entry, index) => index === 1 ? { ...entry, id: frozen[0].id } : entry);
    expect(() => assertCatalogMatrixEquivalent(invalidFrozen, frozen)).toThrow(
      "duplicate frozen catalog design ID",
    );
  });

  it.each([
    ["duplicate", (value: CatalogMatrixInput) => ({ ...value, officialDesigns: [...value.officialDesigns, value.officialDesigns[0]] }), "duplicate design ID"],
    ["missing lot", (value: CatalogMatrixInput) => ({ ...value, lots: value.lots.slice(1) }), "design missing lot"],
    ["duplicate lot assignment", (value: CatalogMatrixInput) => ({ ...value, lots: [...value.lots, { ...value.lots[0], id: "duplicate" }] }), "design appears in multiple lots"],
    ["duplicate lot ID", (value: CatalogMatrixInput) => ({ ...value, lots: value.lots.map((lot, index) => index === 1 ? { ...lot, id: value.lots[0].id } : lot) }), "duplicate lot ID"],
    ["multiple default", (value: CatalogMatrixInput) => ({ ...value, officialDesigns: value.officialDesigns.map((design, index) => index === 2 ? { ...design, isDefault: true } : design) }), "multiple default designs"],
    ["invalid pair", (value: CatalogMatrixInput) => ({ ...value, officialDesigns: value.officialDesigns.map((design, index) => index === 0 ? { ...design, systemVersion: 99 } : design) }), "invalid widget/system pair"],
    ["orphan", (value: CatalogMatrixInput) => ({ ...value, widgetTypes: value.widgetTypes.slice(1) }), "orphan design widget type"],
  ])("fails closed for %s inventory mutation", (_name, mutate, message) => {
    expect(() => buildAndCheckCatalogMatrix(mutate(input()))).toThrow(message);
  });
});
