// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { homeWidgetKinds } from "../src/contract/generated/home";
import { LayoutPreview } from "../src/renderer/ui/home/LayoutPreview";
import artwork from "../src/renderer/ui/home/widget-artwork.json";

beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(cleanup);
it("keeps artwork bounds tied to the unchanged widget SVG sources", () => {
  expect(Object.keys(artwork).sort()).toEqual([...homeWidgetKinds].sort());
  for (const kind of homeWidgetKinds) {
    const art = artwork[kind];
    const bytes = readFileSync(
      resolve("src/renderer/assets/widgets", `${kind}.svg`),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(art.sha256);
    expect(art.content[2]).toBeGreaterThan(0);
    expect(art.content[3]).toBeGreaterThan(0);
    expect(art.content[0]).toBeGreaterThanOrEqual(art.source[0]);
    expect(art.content[1]).toBeGreaterThanOrEqual(art.source[1]);
    expect(art.content[0] + art.content[2]).toBeLessThanOrEqual(
      art.source[0] + art.source[2],
    );
    expect(art.content[1] + art.content[3]).toBeLessThanOrEqual(
      art.source[1] + art.source[3],
    );
  }
});
it("fills each widget box with its artwork instead of fitting the thumbnail canvas", () => {
  render(
    <LayoutPreview
      layout={{
        state: "ready",
        width: 1920,
        height: 1080,
        widgets: [{ kind: "delta", x: 20, y: 20, w: 150, h: 36, opacity: 100 }],
      }}
    />,
  );
  const image = screen.getByRole("img", { name: "Delta" });
  expect(image.getAttribute("viewBox")).toBe(artwork.delta.content.join(" "));
  expect(image.getAttribute("preserveAspectRatio")).toBe("none");
  expect(
    image.querySelector("image")?.getAttribute("preserveAspectRatio"),
  ).toBe("none");
});
