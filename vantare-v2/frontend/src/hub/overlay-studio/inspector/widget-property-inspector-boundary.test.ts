import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const viewPath = join(process.cwd(), "src/hub/overlay-studio/inspector/WidgetPropertyInspectorView.tsx");

// La vista prop-driven no puede arrastrar acoplamientos del Hub: store,
// telemetria del Studio, cliente de disenos o transporte Wails. Si aparecen,
// el guard falla y hay que resolver el acoplamiento con props.
const FORBIDDEN_IMPORTS: readonly string[] = [
  "studio-store",
  "StudioTelemetryProvider",
  "widget-design-client",
  "@wailsio/runtime",
];

describe("WidgetPropertyInspectorView boundary", () => {
  it("rejects hidden couplings to store, studio telemetry, design client and Wails", () => {
    const source = readFileSync(viewPath, "utf8");
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(
        source,
        `WidgetPropertyInspectorView must not import "${forbidden}"`,
      ).not.toMatch(new RegExp(`from\\s+["'][^"']*${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  });

  it("exports exactly the prop-driven view without default exports of hub components", () => {
    const source = readFileSync(viewPath, "utf8");
    expect(source).toMatch(/export function WidgetPropertyInspectorView/);
    expect(source).not.toMatch(/import\s+\{[^}]*useStudioDocument/);
  });
});
