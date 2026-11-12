// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import { dialogShortcut, hubBindings } from "../src/renderer/ui/hub-shortcuts";

it("only lets the three exact zoom actions cross partial-window modality", () => {
  for (const binding of hubBindings) {
    for (const repeat of [false, true]) {
      const event = new KeyboardEvent("keydown", {
        key: binding.key,
        ctrlKey: binding.ctrl,
        altKey: binding.alt,
        metaKey: binding.meta,
        shiftKey: binding.shift,
        repeat,
      });
      const zoom = ["zoomIn", "zoomOut", "zoomReset"].includes(binding.action);
      expect(dialogShortcut(event), binding.action).toBe(!zoom);
    }
  }
  for (const key of ["s", "r", "p", "z"])
    expect(
      dialogShortcut(new KeyboardEvent("keydown", { key, ctrlKey: true })),
      key,
    ).toBe(true);
});

const root = "src/renderer";
type Node = Record<string, unknown>;
function sub(node: Node | undefined, key: string): Node | undefined {
  const value = node?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Node)
    : undefined;
}
function walk(node: unknown, visit: (node: Node) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  visit(node as Node);
  for (const child of Object.values(node)) walk(child, visit);
}
function name(node?: Node): string {
  if (node?.type === "JSXMemberExpression")
    return `${name(sub(node, "object"))}.${name(sub(node, "property"))}`;
  return typeof node?.name === "string" ? node.name : "";
}
function literal(node?: Node): unknown {
  if (node?.type === "JSXExpressionContainer")
    return literal(sub(node, "expression"));
  return node &&
    ["StringLiteral", "BooleanLiteral", "NumericLiteral"].includes(
      String(node.type),
    )
    ? node.value
    : undefined;
}
function audit(source: string, file: string) {
  const errors: string[] = [],
    classes = new Set<string>(),
    floating = new Set<string>();
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const common = file === "ui/WindowDialog.tsx";
  const native = file === "ui/AccessBoundary.tsx";
  walk(ast, (node) => {
    const source = (
      sub(node, "source") ??
      (node.type === "TSExternalModuleReference"
        ? sub(node, "expression")
        : node.type === "TSImportType"
          ? sub(node, "argument")
          : undefined)
    )?.value;
    if (typeof source === "string") {
      if (
        !common &&
        (source === "@base-ui/react" ||
          /^@base-ui\/react\/(dialog|alert-dialog|context-menu)(\/|$)/.test(
            source,
          ))
      )
        errors.push("raw dialog import");
      if (/^@base-ui\/react\/(menu|select|popover)$/.test(source))
        for (const specifier of (node.specifiers as Node[] | undefined) ?? []) {
          const local = sub(specifier, "local")?.name;
          if (typeof local === "string") floating.add(local);
        }
    }
    if (
      node.type === "CallExpression" &&
      sub(node, "callee")?.name === "require"
    ) {
      const module = (node.arguments as Node[])[0]?.value;
      if (
        typeof module === "string" &&
        /^@base-ui\/react(?:\/(?:dialog|alert-dialog|context-menu)(?:\/.*)?)?$/.test(
          module,
        ) &&
        !common
      )
        errors.push("raw require");
    }
    if (
      ["CallExpression", "OptionalCallExpression"].includes(
        String(node.type),
      ) &&
      (sub(sub(node, "callee"), "property")?.name ??
        sub(sub(node, "callee"), "property")?.value) === "showModal" &&
      !native
    )
      errors.push("native top layer outside AccessBoundary");
    if (node.type !== "JSXOpeningElement") return;
    const tag = name(sub(node, "name")),
      attrs = node.attributes as Node[];
    if (tag === "dialog" && !native)
      errors.push("native dialog outside AccessBoundary");
    if (common) return;
    const attr = (key: string) =>
      attrs.find((item) => sub(item, "name")?.name === key);
    if (tag.endsWith(".Root")) {
      if (
        floating.has(tag.split(".")[0]) &&
        literal(sub(attr("modal"), "value")) !== false
      )
        errors.push("floating root must be non-modal");
      const scope = attr("scope");
      if (scope) {
        const value = literal(sub(scope, "value"));
        if (
          value !== "screen" &&
          !(value === "gate" && file === "ui/PrivacyQuestion.tsx") &&
          !(value === "notice" && file === "ui/launcher/ResidentInbox.tsx")
        )
          errors.push("unapproved scope");
      }
    }
    if (/\.(Backdrop|Popup)$/.test(tag)) {
      if (attr("style")) errors.push("inline popup layout");
      const value = literal(sub(attr("className"), "value"));
      if (attr("className") && typeof value !== "string")
        errors.push("popup classes must be statically auditable");
      if (typeof value === "string")
        for (const cls of value.split(/\s+/)) classes.add(cls);
    }
  });
  return { errors, classes };
}
function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(folder, entry.name))
      : [join(folder, entry.name)],
  );
}
// CSS declaration values are checked independently of the JSX AST.
function fullCover(body: string) {
  const declarations = new Map(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)].map((match) => [
      match[1],
      match[2].replace(/\s*!important\s*$/, "").trim(),
    ]),
  );
  const zero = (value?: string) =>
    !!value && value.split(/\s+/).every((part) => /^0(?:px)?$/.test(part));
  return (
    zero(declarations.get("inset")) ||
    ["top", "right", "bottom", "left"].every((key) =>
      zero(declarations.get(key)),
    )
  );
}
describe("dialog architecture for every screen", () => {
  it("finds namespace, combined, dynamic and native bypasses with an AST", () => {
    for (const source of [
      'import * as D from "@base-ui/react/dialog";',
      'import { Dialog as D, Button } from "@base-ui/react";',
      'void import("@base-ui/react/alert-dialog");',
      'const D = require("@base-ui/react/dialog/root");',
      "const x = <dialog />;",
      "node.showModal();",
      'const x = <D.Root scope={"gate"} />;',
      'import * as M from "@base-ui/react/menu"; const x = <M.Menu.Root />;',
      'import { Menu as M, MenuItem } from "@base-ui/react/menu"; const x = <M.Root modal={true} />;',
    ])
      expect(audit(source, "ui/Example.tsx").errors, source).not.toEqual([]);
    expect(
      audit(
        '/* node.showModal() */ const note = "@base-ui/react/dialog";',
        "ui/Example.tsx",
      ).errors,
    ).toEqual([]);
    expect(
      audit(
        'import { Menu as M } from "@base-ui/react/menu"; const x = <M.Root modal={false} />;',
        "ui/Example.tsx",
      ).errors,
    ).toEqual([]);
    expect(
      audit('const x = <D.Root scope={"gate"} />;', "ui/PrivacyQuestion.tsx")
        .errors,
    ).toEqual([]);
  });
  it("requires the common root, explicit non-modal floats and audited native/scope exceptions", () => {
    for (const path of files(root).filter((path) => /\.tsx?$/.test(path))) {
      const file = relative(root, path).replaceAll("\\", "/");

      expect(audit(readFileSync(path, "utf8"), file).errors, file).toEqual([]);
    }
  });
  it("rejects full-cover CSS including zero px and all four physical edges", () => {
    for (const css of [
      "inset: 0;",
      "inset: 0px 0px;",
      "top:0;right:0px;bottom:0;left:0;",
    ])
      expect(fullCover(css)).toBe(true);
    expect(fullCover("inset: var(--topbar-h) 0 0;")).toBe(false);
    const classes = new Set<string>();
    for (const path of files(root).filter((path) => /\.tsx?$/.test(path))) {
      const file = relative(root, path).replaceAll("\\", "/");

      for (const cls of audit(readFileSync(path, "utf8"), file).classes)
        classes.add(cls);
    }
    for (const path of files(root).filter((path) => path.endsWith(".css")))
      for (const rule of readFileSync(path, "utf8").matchAll(
        /([^{}]+)\{([^{}]*)\}/g,
      ))
        if (
          [...classes].some((cls) =>
            new RegExp(`\\.${cls}(?![\\w-])`).test(rule[1]),
          )
        )
          expect(fullCover(rule[2]), `${path}: ${rule[1]}`).toBe(false);
    expect(classes.has("v-backdrop")).toBe(true);
  });
});
