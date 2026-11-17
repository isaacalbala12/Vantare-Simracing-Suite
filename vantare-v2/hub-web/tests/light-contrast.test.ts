import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import source from "../design/tokens.json";
import type { Tokens } from "../scripts/tokens";

const tokens: Tokens = source;
const controlEdges = {
  vantare: "#7a7073",
  classic: "#7d7676",
  deepseek: "#747476",
  rose: "#7c787b",
  grove: "#7a7e7b",
  ocean: "#787b7c",
  ember: "#7c7978",
  iris: "#78787c",
  mono: "#7b7b7b",
} as const;

function channels(color: string) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
}
function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(foreground: string, background: string) {
  const bg = channels(background);
  const alpha =
    foreground.length === 9
      ? Number.parseInt(foreground.slice(7), 16) / 255
      : 1;
  const fg = channels(foreground).map(
    (c, i) => c * alpha + bg[i] * (1 - alpha),
  );
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

it.each(Object.entries(controlEdges))(
  "%s light matches the contrast proposal",
  (name, edge) => {
    const { light } = tokens.themes[name];
    expect(light["control-edge"]).toBe(edge);
    expect(light["warn-text"]).toBe("#8a4c00");
    expect(light.warn).toBe("#f59e0b");
    // Calendar badges still use the bright warning on the opaque dark tint.
    expect(contrast(light.warn, light["warn-tint"])).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const surface of ["bg-base", "surface-1", "surface-2"]) {
      expect(
        contrast(light["control-edge"], light[surface]),
        surface,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(light["warn-text"], light[surface]),
        surface,
      ).toBeGreaterThanOrEqual(4.5);
    }
  },
);

it("matches the approved Vantare decoration and the Launcher hero exception", () => {
  const { light } = tokens.themes.vantare;
  expect(light).toMatchObject({
    "line-1": "#1a101014",
    "line-2": "#1a101021",
    "line-3": "#1a101033",
    edge: "#1a101021",
    hover: "#1a10100f",
    active: "#1a10101a",
  });
  expect(contrast(light["text-3"], "#e9a9b1")).toBeGreaterThanOrEqual(3);
  expect(contrast(light["warn-text"], "#eee1d0")).toBeGreaterThanOrEqual(4.5);
});

it("preserves every existing dark token and aliases the current border and warning", () => {
  const existing = Object.entries(tokens.themes).map(([name, { dark }]) => {
    expect(dark["control-edge"], name).toBe(dark["line-3"]);
    expect(dark["warn-text"], name).toBe(dark.warn);
    return [
      name,
      Object.entries(dark).filter(
        ([key]) => key !== "control-edge" && key !== "warn-text",
      ),
    ];
  });
  // SHA-256 of the existing dark token entries from nightly 5d552c04b.
  expect(
    createHash("sha256").update(JSON.stringify(existing)).digest("hex"),
  ).toBe("7c358765d7570e8f3732e9eccd8394a623295de87f319d461d9eefef5a42dd52");
});
