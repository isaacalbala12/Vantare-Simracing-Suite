// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { buildAuthoringV2Runtime } from "../../authoring/fixtures/authoring-v2-fixture";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../core/telemetry-rate-coordinator";
import type { WidgetInstanceV3, WidgetType } from "../../core/profile-document";
import { RuntimeWidgetFrame } from "../../runtime/RuntimeWidgetFrame";
import { TRACK_GEOMETRY_PACK } from "../../track-geometry/track-geometry-pack";
import { deltaDefinition } from "../../widget-types/delta/delta-definition";
import { pedalsDefinition } from "../../widget-types/pedals/pedals-definition";
import { relativeDefinition } from "../../widget-types/relative/relative-definition";
import { standingsDefinition } from "../../widget-types/standings/standings-definition";
import { trackMapDefinition } from "../../widget-types/track-map/track-map-definition";
import { DELTA_ENDURANCE_TEMPLATE_IDS } from "./delta/delta-endurance-settings";
import { PEDALS_ENDURANCE_TEMPLATE_IDS } from "./pedals/pedals-endurance-settings";
import { RELATIVE_ENDURANCE_TEMPLATE_IDS } from "./relative/relative-endurance-settings";
import { STANDINGS_ENDURANCE_TEMPLATE_IDS } from "./standings/standings-endurance-settings";
import { TRACK_MAP_ENDURANCE_TEMPLATE_IDS } from "./track-map/track-map-endurance-settings";

type Catalog = Readonly<{
  type: WidgetType;
  templateIds: readonly string[];
  width: number;
  height: number;
  functionalSelector: string;
}>;

const catalog: readonly Catalog[] = [
  {
    type: "standings",
    templateIds: STANDINGS_ENDURANCE_TEMPLATE_IDS,
    width: 520,
    height: 464,
    functionalSelector: "[data-standings-row], [data-class-header], .ven-red-chip",
  },
  {
    type: "relative",
    templateIds: RELATIVE_ENDURANCE_TEMPLATE_IDS,
    width: 430,
    height: 234,
    functionalSelector: "[data-relative-row], .ven-rel-axis, .ven-relative-row",
  },
  {
    type: "delta",
    templateIds: DELTA_ENDURANCE_TEMPLATE_IDS,
    width: 500,
    height: 153,
    functionalSelector: ".ven-delta-track, .ven-delta-laps, .ven-neod-card, .ven-dred-bar",
  },
  {
    type: "pedals",
    templateIds: PEDALS_ENDURANCE_TEMPLATE_IDS,
    width: 320,
    height: 353,
    functionalSelector: "[data-pedal], .ven-pedal-bar, .ven-pred-well, .ven-neop-card",
  },
  {
    type: "track-map",
    templateIds: TRACK_MAP_ENDURANCE_TEMPLATE_IDS,
    width: 640,
    height: 440,
    functionalSelector: ".ven-tm-canvas, .ven-tm-outline, .ven-tm-footer",
  },
];

const definitions = {
  standings: standingsDefinition,
  relative: relativeDefinition,
  delta: deltaDefinition,
  pedals: pedalsDefinition,
  "track-map": trackMapDefinition,
} as const;

function buildWidget(entry: Catalog, templateId: string): WidgetInstanceV3 {
  const widget = definitions[entry.type].createDefault(`transparent-${entry.type}-${templateId}`);
  return {
    ...widget,
    layout: { ...widget.layout, x: 0, y: 0, w: entry.width, h: entry.height },
    visual: {
      systemId: "vantare-endurance",
      systemVersion: 1,
      configVersion: 1,
      baseSettings: { templateId },
      appearanceOverrides: {},
    },
  } as WidgetInstanceV3;
}

function renderWidget(
  entry: Catalog,
  templateId: string,
  surface: "desktop" | "obs",
): string {
  const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
  const trackLabel = TRACK_GEOMETRY_PACK.find((geometry) => geometry.synthetic)?.label;
  if (!trackLabel) throw new Error("reference track geometry missing");
  const runtime = buildAuthoringV2Runtime(entry.type, entry.type === "track-map"
    ? { ...snapshot, session: { ...snapshot.session, trackName: trackLabel } }
    : snapshot);
  const telemetry = createTelemetryRateCoordinator();
  if (runtime.overlayV2Frame && runtime.overlayV2Source) {
    telemetry.setOverlayFrame(runtime.overlayV2Frame, runtime.overlayV2Source);
  }
  const markup = renderToStaticMarkup(
    <RuntimeWidgetFrame
      widget={buildWidget(entry, templateId)}
      telemetry={telemetry}
      renderMode={surface}
    />,
  );
  telemetry.dispose();
  return markup;
}

describe("Endurance transparent production shells", () => {
  it("keeps all 23 canonical templates free of opaque outer plates in desktop and OBS", async () => {
    expect(catalog.reduce((total, entry) => total + entry.templateIds.length, 0)).toBe(23);
    const css = readFileSync(join(__dirname, "tokens.css"), "utf8");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      for (const surface of ["desktop", "obs"] as const) {
        for (const entry of catalog) {
          for (const templateId of entry.templateIds) {
            await page.setContent(
              `<style>html,body{margin:0;background:transparent}${css}</style>`
                + renderWidget(entry, templateId, surface),
            );
            const result = await page.evaluate(({ functionalSelector, templateId }) => {
              const frame = document.querySelector<HTMLElement>('[data-testid="runtime-widget-frame"]');
              const root = document.querySelector<HTMLElement>(
                '[data-widget-system="vantare-endurance"]',
              );
              if (!frame || !root) throw new Error("missing productive runtime frame or renderer root");
              const frameBox = frame.getBoundingClientRect();
              const elements = [root, ...root.querySelectorAll<HTMLElement>("*")];
              const transparent = (value: string) =>
                value === "transparent" || value === "rgba(0, 0, 0, 0)";
              const hasOpaqueBackground = (computed: CSSStyleDeclaration) =>
                computed.backgroundImage !== "none" || !transparent(computed.backgroundColor);
              const isIntentionalPanel = (element: HTMLElement) =>
                templateId.endsWith("-neo") && element.matches(".ven-neo-card");
              const fillsFrame = (element: HTMLElement) => {
                const box = element.getBoundingClientRect();
                return box.width >= frameBox.width - 1 && box.height >= frameBox.height - 1;
              };
              const opaqueFrameFillers = elements
                .filter((element) =>
                  element !== root && !isIntentionalPanel(element) && fillsFrame(element))
                .filter((element) => hasOpaqueBackground(getComputedStyle(element)))
                .map((element) => element.className || element.tagName);
              const opaqueFullPseudos = elements.flatMap((element) =>
                (["::before", "::after"] as const).flatMap((pseudo) => {
                  const computed = getComputedStyle(element, pseudo);
                  const content = computed.content;
                  const active = content !== "none" && content !== "normal";
                  const width = Number.parseFloat(computed.width);
                  const height = Number.parseFloat(computed.height);
                  const fillsOwner = computed.top === "0px"
                    && computed.right === "0px"
                    && computed.bottom === "0px"
                    && computed.left === "0px";
                  const coversFrame = width >= frameBox.width - 1 && height >= frameBox.height - 1
                    || fillsFrame(element) && fillsOwner;
                  if (
                    !active
                    || !coversFrame
                    || isIntentionalPanel(element)
                    || !hasOpaqueBackground(computed)
                  ) return [];
                  return [`${element.className || element.tagName}${pseudo}`];
                }),
              );
              const functional = [...root.querySelectorAll<HTMLElement>(functionalSelector)]
                .filter((element) => {
                  const box = element.getBoundingClientRect();
                  return box.width > 0 && box.height > 0;
                });
              const hasFunctionalPaint = functional.some((element) => {
                const computed = getComputedStyle(element);
                const borderPaint = Number.parseFloat(computed.borderTopWidth) > 0
                  && !transparent(computed.borderTopColor);
                const textPaint = !transparent(computed.color);
                const svgPaint = computed.stroke !== "none" && !transparent(computed.stroke);
                return hasOpaqueBackground(computed) || borderPaint || textPaint || svgPaint;
              });
              const rootStyle = getComputedStyle(root);
              return {
                rootBackgroundColor: rootStyle.backgroundColor,
                rootBackgroundImage: rootStyle.backgroundImage,
                rootBorderWidth: rootStyle.borderTopWidth,
                rootBoxShadow: rootStyle.boxShadow,
                opaqueFrameFillers,
                opaqueFullPseudos,
                functionalCount: functional.length,
                hasFunctionalPaint,
              };
            }, { functionalSelector: entry.functionalSelector, templateId });

            const context = `${surface}/${entry.type}/${templateId}`;
            expect(result.rootBackgroundColor, `${context} root alpha`)
              .toBe("rgba(0, 0, 0, 0)");
            expect(result.rootBackgroundImage, `${context} root image`).toBe("none");
            expect(result.rootBorderWidth, `${context} root border`).toBe("0px");
            expect(result.rootBoxShadow, `${context} root shadow`).toBe("none");
            expect(result.opaqueFrameFillers, `${context} opaque full-frame children`).toEqual([]);
            expect(result.opaqueFullPseudos, `${context} opaque full-frame pseudos`).toEqual([]);
            expect(result.functionalCount, `${context} functional nodes`).toBeGreaterThan(0);
            expect(result.hasFunctionalPaint, `${context} functional contrast`).toBe(true);
          }
        }
      }
    } finally {
      await browser.close();
    }
  });
});
