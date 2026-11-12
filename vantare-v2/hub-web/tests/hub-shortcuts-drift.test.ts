import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { expect, it } from "vitest";
import { hubKeys } from "../src/renderer/ui/hub-shortcuts";

type Node = Record<string, unknown>;
const child = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Node)
    : undefined;
function walk(value: unknown, visit: (node: Node) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const node = child(value);
  if (!node) return;
  visit(node);
  for (const item of Object.values(node)) walk(item, visit);
}
function usesKey(value: unknown) {
  let yes = false;
  walk(value, (node) => {
    if (
      (node.type === "Identifier" && node.name === "key") ||
      child(node.property)?.name === "key"
    )
      yes = true;
  });
  return yes;
}
function missing(source: string) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const handlers = new Map<string, Node[]>(),
    registrations: unknown[] = [],
    absent: string[] = [];
  walk(ast, (node) => {
    const id = child(node.id)?.name;
    if (
      typeof id === "string" &&
      ["FunctionDeclaration", "VariableDeclarator"].includes(String(node.type))
    ) {
      const handler =
        node.type === "VariableDeclarator" ? child(node.init) : node;
      if (handler) handlers.set(id, [...(handlers.get(id) ?? []), handler]);
    }
    if (
      ["CallExpression", "OptionalCallExpression"].includes(
        String(node.type),
      ) &&
      child(child(node.callee)?.property)?.name === "addEventListener"
    ) {
      const args = node.arguments as Node[];
      if (args[0]?.value === "keydown") registrations.push(args[1]);
    }
  });
  const known = new Set<string>(Object.values(hubKeys).flat());
  for (const registered of registrations) {
    const handler = child(registered);
    const bodies =
      handler?.type === "Identifier"
        ? (handlers.get(String(handler.name)) ?? [])
        : [handler];
    for (const body of bodies) {
      let modified = false;
      walk(body, (node) => {
        if (["ctrlKey", "metaKey"].includes(String(child(node.property)?.name)))
          modified = true;
      });
      if (!modified) continue;
      const check = (node: unknown) => {
        const value = child(node)?.value;
        if (
          typeof value === "string" &&
          /^[a-z0-9+=-]$/i.test(value) &&
          !known.has(value.toLowerCase())
        )
          absent.push(value);
      };
      walk(body, (node) => {
        if (node.type === "BinaryExpression") {
          if (usesKey(node.left)) check(node.right);
          if (usesKey(node.right)) check(node.left);
        }
        if (
          node.type === "CallExpression" &&
          child(child(node.callee)?.property)?.name === "includes" &&
          usesKey(node.arguments)
        ) {
          const object = child(child(node.callee)?.object);
          if (object?.type === "ArrayExpression")
            for (const item of object.elements as unknown[]) check(item);
        }
      });
    }
  }
  return absent;
}
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(root, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(root, entry.name)]
        : [],
  );
}
it("fails when a newly registered global shortcut is absent from hubKeys", () => {
  expect(
    missing(
      'window.addEventListener("keydown", e => { if (e.ctrlKey && e.key === "q") launch(); });',
    ),
  ).toEqual(["q"]);
  expect(
    missing(
      'function key(e) { if (e.ctrlKey && ["q"].includes(e.key)) launch(); } window.addEventListener("keydown", key);',
    ),
  ).toEqual(["q"]);
  expect(
    missing(
      'window.addEventListener("keydown", e => { if (e.ctrlKey && e.altKey && e.key === "b") toggle(); });',
    ),
  ).toEqual([]);
  for (const file of files("src/renderer").filter(
    (file) => !file.replaceAll("\\", "/").includes("/qa/"),
  ))
    expect(missing(readFileSync(file, "utf8")), file).toEqual([]);
});
