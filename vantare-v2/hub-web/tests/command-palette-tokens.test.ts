import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import tokens from "../design/tokens.json";

const theme = readFileSync("../native/hub/src/orbit/theme.rs", "utf8");
function color(pattern: RegExp) {
  const match = pattern.exec(theme);
  if (!match)
    throw new Error("GPUI palette source changed; review its exported token");
  return match[1].replaceAll("_", "");
}
it("uses GPUI's light canvas veil and dark veil for every palette", () => {
  const pastel = new Set(["rose", "grove", "ocean", "ember", "iris"]);
  for (const [palette, schemes] of Object.entries(tokens.themes)) {
    const light = pastel.has(palette)
      ? color(
          new RegExp(
            `\\(Palette::${palette[0].toUpperCase()}${palette.slice(1)}, Scheme::Light\\)\\s*=>\\s*self.set_palette\\(\\s*\\[\\s*0x([0-9a-f_]+)`,
          ),
        )
      : color(
          new RegExp(
            `fn ${palette === "mono" ? "set_mono_light" : "apply_light_defaults"}\\([^)]*\\)\\s*\\{\\s*self.canvas = 0x([0-9a-f_]+)`,
          ),
        );
    const dark =
      palette === "mono"
        ? color(
            /fn set_mono_dark\([^)]*\)[\s\S]*?self.palette_backdrop = 0x([0-9a-f_]+)/,
          )
        : color(/palette_backdrop: 0x([0-9a-f_]+)/);
    expect(schemes.light["command-backdrop"], `${palette}/light`).toBe(
      `#${light}9e`,
    );
    expect(schemes.dark["command-backdrop"], `${palette}/dark`).toBe(
      `#${dark}`,
    );
  }
  expect(theme).toMatch(
    /theme\.palette_backdrop = \(theme\.canvas << 8\) \| 0x9e/,
  );
});
it("keeps the panel dimensions from GPUI", () => {
  const source = readFileSync("../native/hub/src/orbit.rs", "utf8");
  expect(tokens.primitives["command-radius"]).toBe(
    Number(/FEATURED_RADIUS: f32 = ([\d.]+)/.exec(source)?.[1]),
  );
  expect(tokens.primitives["palette-w"]).toBe(
    Number(/PALETTE_W: f32 = ([\d.]+)/.exec(source)?.[1]),
  );
});
