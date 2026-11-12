import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parse } from "@babel/parser";
import { expect, it } from "vitest";

const mockRoot = resolve("src/mock").toLowerCase();
function mockImports(source: string, file: string): string[] {
  const imports: string[] = [];
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  function record(value: unknown) {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type !== "StringLiteral" || typeof node.value !== "string") return;
    const target = resolve(dirname(file), node.value).toLowerCase();
    if (target === mockRoot || target.startsWith(mockRoot + sep))
      imports.push(node.value);
  }
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(String(node.type))
    )
      record(node.source);
    if (node.type === "TSImportType") record(node.source ?? node.argument);
    if (node.type === "TSExternalModuleReference") record(node.expression);
    if (
      node.type === "CallExpression" &&
      (node.callee as { type?: string } | undefined)?.type === "Import"
    )
      record((node.arguments as unknown[])[0]);
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
  }
  visit(ast);
  return imports;
}
function* sources(folder: string): Generator<string> {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = resolve(folder, entry.name);
    if (entry.isDirectory()) yield* sources(file);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) yield file;
  }
}
it("rejects static, dynamic, type and re-export imports of test doubles", () => {
  const file = resolve("src/renderer/screens/testing/Example.tsx");
  expect(
    mockImports(
      `
    import { fixture } from "../../../mock/testing";
    export * from "../../../mock/testing";
    void import("../../../mock/testing");
    type Fixture = import("../../../mock/testing").Fixture;
    import fixtureAlias = require("../../../mock/testing");
  `,
      file,
    ),
  ).toHaveLength(5);
  expect(
    mockImports(
      `import { Button } from "../../ui/Button"; // import("../../../mock/testing")`,
      file,
    ),
  ).toEqual([]);
});
it("keeps product screens and UI independent of src/mock", () => {
  const violations: string[] = [];
  for (const folder of ["src/renderer/screens", "src/renderer/ui"])
    for (const file of sources(folder))
      for (const specifier of mockImports(readFileSync(file, "utf8"), file))
        violations.push(`${relative(process.cwd(), file)}: ${specifier}`);
  expect(violations).toEqual([]);
});
