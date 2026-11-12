import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parse } from "@babel/parser";
import { expect, it } from "vitest";

const mockRoot = resolve("src/mock").toLowerCase();
const qaRoot = resolve("src/renderer/qa").toLowerCase();
const appExceptions: Record<string, readonly string[]> = {
  "src/renderer/app/Shell.tsx": ["../qa/entry"],
};
function mockDependencies(source: string, file: string): string[] {
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
    if (
      target === mockRoot ||
      target.startsWith(mockRoot + sep) ||
      target === qaRoot ||
      target.startsWith(qaRoot + sep)
    )
      imports.push(node.value);
  }
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "Identifier" && node.name === "__VANTARE_RENDERER_MOCK__")
      imports.push(String(node.name));
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
    mockDependencies(
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
    mockDependencies(
      `import { Button } from "../../ui/Button"; // import("../../../mock/testing")`,
      file,
    ),
  ).toEqual([]);
});
it("rejects mock build branches while ignoring their mention in comments and strings", () => {
  const file = resolve("src/renderer/ui/Example.tsx");
  expect(
    mockDependencies("if (__VANTARE_RENDERER_MOCK__) seed();", file),
  ).toEqual(["__VANTARE_RENDERER_MOCK__"]);
  expect(
    mockDependencies(
      'const note = "__VANTARE_RENDERER_MOCK__"; // __VANTARE_RENDERER_MOCK__',
      file,
    ),
  ).toEqual([]);
});
it("keeps product screens and UI independent of src/mock and mock build branches", () => {
  const violations: string[] = [];
  for (const folder of [
    "src/renderer/screens",
    "src/renderer/ui",
    "src/renderer/app",
  ])
    for (const file of sources(folder))
      for (const specifier of mockDependencies(
        readFileSync(file, "utf8"),
        file,
      )) {
        const name = relative(process.cwd(), file).replaceAll("\\", "/");
        // Existing screen-owned seams remain explicit, never a folder exemption.
        const exceptions =
          appExceptions[name] ??
          (
            {
              "src/renderer/screens/calendar/entry.tsx": [
                "../../qa/calendar-runs",
              ],
              "src/renderer/screens/notifications/NotificationsState.tsx": [
                "../../qa/notifications-scene",
              ],
            } as Record<string, string[]>
          )[name] ??
          [];
        if (!exceptions.includes(specifier))
          violations.push(`${name}: ${specifier}`);
      }
  expect(violations).toEqual([]);
});
