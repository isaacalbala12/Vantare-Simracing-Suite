import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = "src/renderer";
const calendar = new Set([
  "ui/CalendarAlertsDialog.tsx",
  "ui/CalendarDetail.tsx",
  "ui/CalendarIcsDialog.tsx",
  "ui/CalendarDayView.tsx",
  "ui/CalendarMonthView.tsx",
  "ui/CalendarWeekView.tsx",
]);
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(path, entry.name))
      : [join(path, entry.name)],
  );
}
const raw = (source: string) =>
  /["']@base-ui\/react(?:\/(?:dialog|alert-dialog)(?:\/[^"']*)?)?["']/.test(
    source,
  );
describe("dialog architecture outside Calendar", () => {
  it("keeps floating menus non-modal and confines exceptions to the two audited gates", () => {
    for (const path of files(root).filter((path) => path.endsWith(".tsx"))) {
      const name = relative(root, path).replaceAll("\\", "/");
      if (calendar.has(name)) continue;
      const source = readFileSync(path, "utf8");
      expect(source.includes('"@base-ui/react/context-menu"'), name).toBe(
        false,
      );
      for (const match of source.matchAll(
        /import\s*\{\s*(\w+)(?:\s+as\s+(\w+))?\s*\}\s*from\s*["']@base-ui\/react\/(?:menu|select|popover)["']/g,
      )) {
        const component = match[2] ?? match[1];
        for (const root of source.matchAll(
          new RegExp(`<${component}\\.Root\\b([\\s\\S]*?)>`, "g"),
        ))
          expect(
            root[1],
            `${name}: floating Root must preserve caption controls`,
          ).toMatch(/modal=\{false\}/);
      }
      if (name !== "ui/WindowDialog.tsx")
        for (const scope of source.matchAll(/scope="(gate|notice)"/g))
          expect(name).toBe(
            scope[1] === "gate"
              ? "ui/PrivacyQuestion.tsx"
              : "ui/launcher/ResidentInbox.tsx",
          );
    }
  });
  it("requires the common non-modal root, including aliased or dynamic imports", () => {
    for (const path of files(root).filter((path) => /\.tsx?$/.test(path))) {
      const name = relative(root, path).replaceAll("\\", "/");
      if (calendar.has(name) || name === "ui/WindowDialog.tsx") continue;
      expect(
        raw(readFileSync(path, "utf8")),
        `${name}: import WindowDialog/WindowAlertDialog instead of Base UI dialogs`,
      ).toBe(false);
    }
    expect(raw('import { Dialog as D } from "@base-ui/react/dialog"')).toBe(
      true,
    );
    expect(raw('import("@base-ui/react/alert-dialog")')).toBe(true);
    expect(raw('import { Dialog } from "@base-ui/react"')).toBe(true);
  });
  it("forbids fullscreen backdrop/popup CSS and inline layout overrides", () => {
    const classes = new Set<string>();
    for (const path of files(root).filter((path) => path.endsWith(".tsx"))) {
      if (
        calendar.has(relative(root, path).replaceAll("\\", "/")) ||
        path.endsWith("WindowDialog.tsx")
      )
        continue;
      const source = readFileSync(path, "utf8");
      expect(/<\w+\.(?:Backdrop|Popup)\b[^>]*\bstyle=/.test(source), path).toBe(
        false,
      );
      for (const match of source.matchAll(
        /<\w+\.(?:Backdrop|Popup)\b[^>]*\bclassName="([^"]+)"/g,
      ))
        for (const name of match[1].split(" ")) classes.add(name);
    }
    for (const path of files(root).filter((path) => path.endsWith(".css")))
      for (const match of readFileSync(path, "utf8").matchAll(
        /([^{}]+)\{([^{}]*)\}/g,
      )) {
        if (
          ![...classes].some((name) =>
            new RegExp(`\\.${name}(?![\\w-])`).test(match[1]),
          )
        )
          continue;
        expect(
          /\binset:\s*0(?:\s+0){0,3}\s*;/.test(match[2]),
          `${path}: ${match[1]}`,
        ).toBe(false);
      }
    expect(classes.has("v-backdrop")).toBe(true);
    expect(readFileSync(join(root, "ui/ui.css"), "utf8")).toMatch(
      /\.v-backdrop\s*\{[^}]*inset:\s*var\(--topbar-h\)/,
    );
  });
});
