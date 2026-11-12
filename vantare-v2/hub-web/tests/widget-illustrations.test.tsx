// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import tokens from "../design/tokens.json";
import {
  studioKinds,
  studioWidgetOptions,
} from "../src/contract/generated/studio";
import {
  choiceIllustrations,
  illustrationSizes,
  widgetIllustrations,
} from "../src/renderer/ui/widgets/illustrations";
import { WidgetThumb } from "../src/renderer/ui/widgets/WidgetThumb";

const assets = vi.hoisted(() => ({
  widgetIcons: {} as Record<string, string>,
  widgetRasters: {} as Record<string, string>,
}));
vi.mock("../src/renderer/ui/widgets/widget-assets", () => assets);
beforeEach(() => {
  for (const key of Object.keys(assets.widgetIcons))
    delete assets.widgetIcons[key];
  for (const key of Object.keys(assets.widgetRasters))
    delete assets.widgetRasters[key];
});
afterEach(cleanup);
const source = resolve("src/renderer/assets/widgets/illustrations");
const components = resolve("src/renderer/ui/widgets/illustrations");
function parse(text: string) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc.documentElement;
}
function geometry(node: Element): unknown {
  return {
    tag: node.localName,
    attributes: Object.fromEntries(
      Array.from(node.attributes)
        .filter(
          (a) =>
            !["xmlns", "role", "aria-label", "aria-hidden"].includes(a.name),
        )
        .map((attribute) => {
          if (attribute.name !== "style")
            return [attribute.name, attribute.value];
          const entries = attribute.value
            .split(";")
            .filter(Boolean)
            .map((declaration) => {
              const colon = declaration.indexOf(":");
              const key = declaration.slice(0, colon).trim();
              let value = declaration
                .slice(colon + 1)
                .trim()
                .replace(/var\((--[a-z0-9-]+),[^)]+\)/g, "var($1)")
                .replace(
                  /var\(--([a-z0-9-]+)\)/g,
                  (_, role: string) =>
                    (tokens.themes.vantare.dark as Record<string, string>)[
                      role
                    ],
                )
                .replace(/^#fff$/, "#ffffff");
              if (/^-?\d*\.?\d+$/.test(value)) value = String(Number(value));
              return [key, value];
            });
          return ["style", Object.fromEntries(entries)];
        }),
    ),
    children: Array.from(node.children).map(geometry),
  };
}
it("covers every native kind and every native choice", () => {
  expect(Object.keys(widgetIllustrations).sort()).toEqual(
    [...studioKinds].sort(),
  );
  const expected = [
    ...studioWidgetOptions.delta.sizes.map((s) => `delta-${s}`),
    ...studioWidgetOptions.tableSizes.flatMap((s) => [
      `fuel-${s}`,
      `table-${s}`,
    ]),
    ...studioWidgetOptions.looks.map((s) => `look-${s}`),
    ...[
      ...studioWidgetOptions.standings.templates,
      ...studioWidgetOptions.delta.templates,
    ].map((s) => `design-${s}`),
  ];
  expect(Object.keys(choiceIllustrations).sort()).toEqual(expected.sort());
});
for (const [folder, drawings] of [
  ["", widgetIllustrations],
  ["opciones", choiceIllustrations],
] as const) {
  for (const [kind, Drawing] of Object.entries(drawings)) {
    it(`keeps all geometry and token styles of the designer's ${folder}/${kind}`, () => {
      const path = resolve(source, folder, `${kind}.svg`);
      const data = readFileSync(path);
      const expected = parse(data.toString("utf8"));
      const actual = parse(renderToStaticMarkup(createElement(Drawing)));
      expect(geometry(actual)).toEqual(geometry(expected));
      expect(actual.getAttribute("aria-hidden")).toBe("true");
      expect(actual.querySelector("image,script,foreignObject")).toBeNull();
      const hash = createHash("sha256").update(data).digest("hex");
      expect(
        readFileSync(
          resolve(components, folder ? "options" : "", `${kind}.tsx`),
          "utf8",
        ),
      ).toContain(hash);
      if (!folder) {
        const [, , width, height] =
          expected.getAttribute("viewBox")?.split(" ").map(Number) ?? [];
        expect(
          illustrationSizes[kind as keyof typeof illustrationSizes],
        ).toEqual({ width, height });
      }
    });
  }
}
it("renders an inline decorative drawing when no PNG exists", () => {
  const fallback = vi.fn();
  const { container } = render(
    <WidgetThumb kind="delta" onFallback={fallback} />,
  );
  expect(container.querySelector("img,image")).toBeNull();
  expect(container.querySelector("svg rect")).toBeTruthy();
  expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
    "true",
  );
  expect(fallback).toHaveBeenLastCalledWith(true);
});
it("keeps the real PNG first and recovers the inline drawing on error", () => {
  assets.widgetRasters["../../assets/widgets/thumbs/delta.png"] =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxmQAAAAASUVORK5CYII=";
  const fallback = vi.fn();
  const { container } = render(
    <WidgetThumb kind="delta" onFallback={fallback} />,
  );
  const image = container.querySelector("img");
  if (!image) throw Error("Missing raster");
  fireEvent.load(image);
  expect(container.querySelector("svg")).toBeNull();
  expect(image.style.visibility).toBe("");
  expect(fallback).toHaveBeenLastCalledWith(false);
  fireEvent.error(image);
  expect(container.querySelector("img,image")).toBeNull();
  expect(container.querySelector("svg rect")).toBeTruthy();
  expect(fallback).toHaveBeenLastCalledWith(true);
});
it("retains the monochrome icon path", () => {
  assets.widgetIcons["../../assets/widgets/w-delta.svg"] = "icon.svg";
  const { container } = render(<WidgetThumb kind="delta" icon />);
  expect(container.querySelector("svg,img")).toBeNull();
  expect(
    container.querySelector(".v-widget-icon")?.getAttribute("aria-hidden"),
  ).toBe("true");
});
