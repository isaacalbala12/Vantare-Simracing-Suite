import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { render, type Tokens } from "../scripts/tokens";

const tokens: Tokens = JSON.parse(
  await readFile(new URL("../design/tokens.json", import.meta.url), "utf8"),
);
function luminance(hex: string) {
  const values = hex.slice(1, 7).match(/../g);
  if (!values) throw new Error("Invalid color");
  const linear = values.map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe("exported Vantare tokens", () => {
  it("contains all nine palettes in both schemes with complete semantic roles", () => {
    expect(Object.keys(tokens.themes)).toHaveLength(9);
    for (const schemes of Object.values(tokens.themes)) {
      expect(Object.keys(schemes).sort()).toEqual(["dark", "light"]);
      for (const values of Object.values(schemes))
        expect(Object.keys(values).sort()).toEqual([...tokens.semantic].sort());
    }
  });
  it("retains official graphite and brand red", () => {
    expect(tokens.themes.vantare.dark["bg-window"]).toBe("#161314");
    for (const palette of ["vantare", "classic"])
      for (const scheme of ["light", "dark"])
        expect(tokens.themes[palette][scheme].accent).toBe("#d80000");
  });
  it("retains AA text on both reading surfaces for all eighteen themes", () => {
    for (const [palette, schemes] of Object.entries(tokens.themes))
      for (const [scheme, values] of Object.entries(schemes))
        for (const foreground of [
          "text-1",
          "text-2",
          "text-3",
          "text-caption",
          "focus-ring",
        ])
          for (const background of ["surface-1", "surface-3"])
            expect(
              contrast(values[foreground], values[background]),
              `${palette}/${scheme}: ${foreground}/${background}`,
            ).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps control indicators and primary button labels distinguishable in every theme", () => {
    for (const [palette, schemes] of Object.entries(tokens.themes))
      for (const [scheme, values] of Object.entries(schemes)) {
        for (const role of ["accent", "accent-bright"])
          expect(
            contrast(values[role], values["surface-1"]),
            `${palette}/${scheme}: ${role}`,
          ).toBeGreaterThanOrEqual(3);
        for (const stop of values["grad-button"].match(/#[0-9a-f]{6}/gi) ?? [])
          expect(
            contrast(values["text-on-accent"], stop),
            `${palette}/${scheme}: button label`,
          ).toBeGreaterThanOrEqual(3);
      }
    expect(Number(tokens.primitives["z-popover"])).toBeGreaterThan(
      Number(tokens.primitives["z-modal"]),
    );
    expect(Number(tokens.primitives["z-popover"])).toBeLessThan(
      Number(tokens.primitives["z-toast"]),
    );
  });
  it("keeps generated CSS synchronized", async () => {
    const result = render(tokens);
    expect(
      await readFile(
        new URL("../src/renderer/design/generated/tokens.css", import.meta.url),
        "utf8",
      ),
    ).toBe(result.css);
    expect(
      await readFile(
        new URL("../src/renderer/design/generated/tokens.ts", import.meta.url),
        "utf8",
      ),
    ).toBe(result.typescript);
    expect(
      await readFile(
        new URL("../src/renderer/design/generated/theme.css", import.meta.url),
        "utf8",
      ),
    ).toBe(result.theme);
  });
});
