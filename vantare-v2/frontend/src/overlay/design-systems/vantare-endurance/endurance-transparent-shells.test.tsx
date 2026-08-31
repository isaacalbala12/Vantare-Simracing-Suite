// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2 } from "../../../generated/telemetry";
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
}>;

type FunctionalRegion = Readonly<{
  name: string;
  selector: string;
  kind: "backing" | "graphic";
}>;

const catalog: readonly Catalog[] = [
  {
    type: "standings",
    templateIds: STANDINGS_ENDURANCE_TEMPLATE_IDS,
    width: 520,
    height: 464,
  },
  {
    type: "relative",
    templateIds: RELATIVE_ENDURANCE_TEMPLATE_IDS,
    width: 430,
    height: 234,
  },
  {
    type: "delta",
    templateIds: DELTA_ENDURANCE_TEMPLATE_IDS,
    width: 500,
    height: 153,
  },
  {
    type: "pedals",
    templateIds: PEDALS_ENDURANCE_TEMPLATE_IDS,
    width: 320,
    height: 353,
  },
  {
    type: "track-map",
    templateIds: TRACK_MAP_ENDURANCE_TEMPLATE_IDS,
    width: 640,
    height: 440,
  },
];

function functionalRegions(type: WidgetType, templateId: string): readonly FunctionalRegion[] {
  if (type === "standings") {
    const regions: FunctionalRegion[] = [
      { name: "each standings row", selector: "[data-standings-row]", kind: "backing" },
    ];
    if (!["standings-strip", "standings-lmu", "standings-racelabs"].includes(templateId)) {
      regions.push({ name: "each class header", selector: "[data-class-header]", kind: "backing" });
    }
    return regions;
  }
  if (type === "relative") {
    const regions: FunctionalRegion[] = [
      { name: "each relative row", selector: "[data-relative-row]", kind: "backing" },
    ];
    if (templateId === "relative-redline-mirror") {
      regions.push({ name: "each relative axis", selector: ".ven-rel-axis", kind: "backing" });
    }
    return regions;
  }
  if (type === "delta") {
    if (templateId === "delta-strip") {
      return [
        { name: "delta reading", selector: ".ven-delta-value", kind: "backing" },
        { name: "delta track", selector: ".ven-delta-track", kind: "backing" },
      ];
    }
    if (templateId === "delta-block") {
      return [
        { name: "delta reading", selector: ".ven-delta-value", kind: "backing" },
        { name: "delta lap summaries", selector: ".ven-delta-laps", kind: "backing" },
      ];
    }
    if (templateId === "delta-neo") {
      return [
        { name: "Neo delta card", selector: ".ven-neod-card", kind: "backing" },
        { name: "Neo delta track", selector: ".ven-neod-track", kind: "backing" },
        { name: "each Neo lap well", selector: ".ven-neod-well", kind: "backing" },
      ];
    }
    return [
      { name: "Redline delta bar", selector: ".ven-dred-bar", kind: "backing" },
      { name: "Redline delta reference", selector: ".ven-dred-ref", kind: "backing" },
    ];
  }
  if (type === "pedals") {
    if (templateId === "pedals-redline") {
      return [
        { name: "each Redline pedal well", selector: ".ven-pred-well", kind: "backing" },
        { name: "each Redline pedal label", selector: ".ven-pred-slot", kind: "backing" },
      ];
    }
    if (templateId === "pedals-neo") {
      return [
        { name: "Neo pedals card", selector: ".ven-neop-card", kind: "backing" },
        { name: "each Neo pedal", selector: "[data-pedal]", kind: "backing" },
      ];
    }
    return [{ name: "each classic pedal", selector: "[data-pedal]", kind: "backing" }];
  }
  return [
    { name: "track outline", selector: ".ven-tm-outline", kind: "graphic" },
    { name: "track footer", selector: ".ven-tm-footer", kind: "backing" },
  ];
}

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
  if (entry.type === "relative" && runtime.overlayV2Frame) {
    const playerId = runtime.overlayV2Frame.player.id;
    runtime.overlayV2Frame = {
      ...runtime.overlayV2Frame,
      relative: [
        {
          id: "relative-ahead",
          gap: { v: -1.2, q: "fresh" },
          side: "ahead",
          authority: "official",
          name: "Ahead Driver",
          classId: "hypercar",
        },
        {
          id: playerId,
          gap: { v: 0, q: "fresh" },
          side: "player",
          authority: "official",
          name: "Player Driver",
          classId: "hypercar",
        },
        {
          id: "relative-behind",
          gap: { v: 0.8, q: "fresh" },
          side: "behind",
          authority: "official",
          name: "Behind Driver",
          classId: "hypercar",
        },
      ] as OverlayFrameV2["relative"],
    };
  }
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
    const violations: string[] = [];
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      for (const surface of ["desktop", "obs"] as const) {
        for (const entry of catalog) {
          for (const templateId of entry.templateIds) {
            await page.setContent(
              `<style>html,body{margin:0;background:transparent}${css}</style>`
                + renderWidget(entry, templateId, surface),
            );
            const regions = functionalRegions(entry.type, templateId);
            const result = await page.evaluate(({ regions }) => {
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
              const backgroundAlpha = (value: string) => {
                const match = value.match(/^rgba?\(([^)]+)\)$/);
                if (!match) return 0;
                const channels = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
                return channels.length >= 4 ? channels[3] : 1;
              };
              const hasEffectiveBackground = (computed: CSSStyleDeclaration) =>
                computed.backgroundImage !== "none" || backgroundAlpha(computed.backgroundColor) >= 0.45;
              const fillsFrame = (element: HTMLElement) => {
                const box = element.getBoundingClientRect();
                return box.width >= frameBox.width - 1 && box.height >= frameBox.height - 1;
              };
              const opaqueFrameFillers = elements
                .filter((element) =>
                  element !== root && fillsFrame(element))
                .filter((element) => hasOpaqueBackground(getComputedStyle(element)))
                .map((element) => {
                  const box = element.getBoundingClientRect();
                  return `${element.className || element.tagName} `
                    + `${box.width}x${box.height}/${frameBox.width}x${frameBox.height}`;
                });
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
                    || !hasOpaqueBackground(computed)
                  ) return [];
                  return [`${element.className || element.tagName}${pseudo}`];
                }),
              );
              const regionResults = regions.map((region) => {
                const nodes = [...root.querySelectorAll<HTMLElement>(region.selector)];
                const failures = nodes.flatMap((element, index) => {
                  const box = element.getBoundingClientRect();
                  if (box.width <= 0 || box.height <= 0) {
                    return [`${region.name}[${index}] has no visible geometry`];
                  }
                  if (region.kind === "graphic") {
                    const computed = getComputedStyle(element);
                    const graphicPaint = [computed.stroke, computed.fill]
                      .some((value) => value !== "none" && !transparent(value));
                    return graphicPaint ? [] : [`${region.name}[${index}] has no own graphic paint`];
                  }

                  const candidates = [element, ...element.querySelectorAll<HTMLElement>(":scope > *")];
                  const backing = candidates.find((candidate) => {
                    const candidateBox = candidate.getBoundingClientRect();
                    const coversRegion = candidateBox.width >= box.width - 1
                      && candidateBox.height >= box.height - 1;
                    return coversRegion && hasEffectiveBackground(getComputedStyle(candidate));
                  });
                  if (!backing) {
                    return [`${region.name}[${index}] has no local full-region backing`];
                  }
                  const textNodes = [element, ...element.querySelectorAll<HTMLElement>("*")]
                    .filter((candidate) => (candidate.textContent ?? "").trim() !== "")
                    .filter((candidate) => candidate.children.length === 0);
                  const invisibleText = textNodes.find((candidate) =>
                    transparent(getComputedStyle(candidate).color));
                  return invisibleText
                    ? [`${region.name}[${index}] has transparent text`]
                    : [];
                });
                return { name: region.name, count: nodes.length, failures };
              });
              const rootStyle = getComputedStyle(root);
              return {
                rootBackgroundColor: rootStyle.backgroundColor,
                rootBackgroundImage: rootStyle.backgroundImage,
                rootBorderWidth: rootStyle.borderTopWidth,
                rootBoxShadow: rootStyle.boxShadow,
                opaqueFrameFillers,
                opaqueFullPseudos,
                regionResults,
              };
            }, { regions });

            const context = `${surface}/${entry.type}/${templateId}`;
            if (result.rootBackgroundColor !== "rgba(0, 0, 0, 0)") {
              violations.push(`${context} opaque root color: ${result.rootBackgroundColor}`);
            }
            if (result.rootBackgroundImage !== "none") {
              violations.push(`${context} opaque root image: ${result.rootBackgroundImage}`);
            }
            if (result.rootBorderWidth !== "0px") {
              violations.push(`${context} root border: ${result.rootBorderWidth}`);
            }
            if (result.rootBoxShadow !== "none") {
              violations.push(`${context} root shadow: ${result.rootBoxShadow}`);
            }
            violations.push(...result.opaqueFrameFillers.map((item) =>
              `${context} opaque full-frame child: ${item}`));
            violations.push(...result.opaqueFullPseudos.map((item) =>
              `${context} opaque full-frame pseudo: ${item}`));
            for (const region of result.regionResults) {
              if (region.count === 0) violations.push(`${context} missing ${region.name}`);
              violations.push(...region.failures.map((failure) => `${context} ${failure}`));
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
    expect(violations).toEqual([]);
  });
});
