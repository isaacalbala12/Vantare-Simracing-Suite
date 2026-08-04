import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ALL_WIDGET_TYPES } from "./profile-document";
import { designSystemRegistry } from "./design-system-registry";
import { listOfficialDesigns } from "../design-systems/official-designs";
import historicalCrystalManifest from "../../../testdata/crystal-reference/manifest.json";

const sourceRoot = join(process.cwd(), "src");
const hostConsumers = [
  "hub/overlay-studio/canvas/StudioWidgetFrame.tsx",
  "overlay/runtime/RuntimeWidgetFrame.tsx",
  "hub/overlays/ProfilePreview.tsx",
] as const;
const hostPath = "overlay/core/WidgetVisualHost.tsx";

function productSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productSources(path);
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name) || /\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [path];
  }).sort();
}

function sourcePath(path: string): string {
  return relative(sourceRoot, path).replaceAll("\\", "/");
}

function isSystemRegistration(path: string): boolean {
  return path === "overlay/core/design-system-registry.ts"
    || /^overlay\/design-systems\/vantare-(?:original|crystal)\/manifest\.ts$/.test(path);
}

describe("Overlay Workshop characterization", () => {
  it("derives the current catalog and keeps Engineer distinct from historical Crystal parity", () => {
    const designs = listOfficialDesigns();
    const crystal = designs.filter((design) => design.systemId === "vantare-crystal");
    const historical = historicalCrystalManifest.entries;

    expect(ALL_WIDGET_TYPES).toHaveLength(19);
    expect(designSystemRegistry.list().map((system) => [system.id, system.widgets.length])).toEqual([
      ["vantare-original", 18], ["vantare-crystal", 19],
    ]);
    expect(designs).toHaveLength(41);
    expect(crystal).toHaveLength(22);
    expect(new Set(crystal.map((design) => design.widgetType)).size).toBe(19);
    expect(crystal.find((design) => design.id === "engineer-radio-crystal")?.widgetType).toBe("engineer-radio");
    expect(historical).toHaveLength(21);
    expect(new Set(historical.map((entry) => entry.widgetType)).size).toBe(18);
    expect(historical.some((entry) => entry.widgetType === "engineer-radio")).toBe(false);
  });

  it("keeps Studio and production runtime frames on the sole WidgetVisualHost boundary", () => {
    for (const consumer of hostConsumers) {
      const source = readFileSync(join(sourceRoot, consumer), "utf8");
      expect(source).toMatch(/import\s+\{\s*WidgetVisualHost\s*\}/);
      expect(source).toMatch(/<(?:(?:Memo)?WidgetVisualHost)\b/);
    }
    const host = readFileSync(join(sourceRoot, "overlay/core/WidgetVisualHost.tsx"), "utf8");
    expect(host).toMatch(/prepareWidgetVisualSettings/);
    const resolver = readFileSync(join(sourceRoot, "overlay/core/widget-visual-settings.ts"), "utf8");
    expect(resolver).toMatch(/designSystemRegistry\.resolve/);
  });

  it("rejects renderer bypasses outside the host and system registrations", () => {
    const offenders = productSources(sourceRoot).flatMap((path) => {
      const normalizedPath = sourcePath(path);
      const source = readFileSync(path, "utf8");
      const findings: string[] = [];
      if (normalizedPath !== hostPath && /\b(?:registration|resolved(?:System|WidgetSystem)?|system)\.Renderer\b/.test(source)) {
        findings.push("executes a resolved renderer");
      }
      if (!isSystemRegistration(normalizedPath)
        && /from\s*["'][^"']*design-systems\/vantare-(?:original|crystal)\//.test(source)) {
        findings.push("imports a concrete system renderer outside its registration");
      }
      return findings.map((finding) => `${normalizedPath}: ${finding}`);
    });
    expect(offenders, `WidgetVisualHost boundary bypasses:\n${offenders.join("\n")}`).toEqual([]);
  });
});
