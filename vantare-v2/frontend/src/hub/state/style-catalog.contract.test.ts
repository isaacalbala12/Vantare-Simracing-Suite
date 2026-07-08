import { describe, it, expect } from "vitest";
import { getDefaultAppearance } from "./style-catalog";
import html from "../../../../docs/overlay-glassmorphism-pro.html?raw";

/**
 * Contract test: asserts that the per-widget-type defaults for `vantare-crystal`
 * match the CSS variables defined in `docs/overlay-glassmorphism-pro.html` (`:root`).
 *
 * If the HTML changes, this test fails. The catalog is the "single source of
 * truth" for hub previews, and it must stay in sync with the visual reference.
 */

function readHtmlRootVariables(): Map<string, string> {
  const rootMatch = html.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) throw new Error("Could not find :root block in HTML");
  const block = rootMatch[1];
  const vars = new Map<string, string>();
  const regex = /--([\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(block)) !== null) {
    vars.set(`--${m[1]}`, m[2].trim());
  }
  return vars;
}

describe("style-catalog contract with overlay-glassmorphism-pro.html", () => {
  const widgetTypes = [
    "telemetry",
    "telemetry-vertical",
    "standings",
    "relative",
    "delta",
    "pedals",
  ];

  // `pedals` is intentionally transparent (it overlays the page), so it is
  // excluded from the --bg-page contract check. The HTML defines no
  // pedal-specific background.
  const bgPageTypes = widgetTypes.filter((t) => t !== "pedals");

  for (const type of bgPageTypes) {
    it(`${type} vantare-crystal.backgroundColor matches --bg-page`, () => {
      const vars = readHtmlRootVariables();
      const defaults = getDefaultAppearance(type, "vantare-crystal");
      expect(defaults.backgroundColor).toBe(vars.get("--bg-page"));
    });
  }

  for (const type of widgetTypes) {
    it(`${type} vantare-crystal.textColor matches --text-main`, () => {
      const vars = readHtmlRootVariables();
      const defaults = getDefaultAppearance(type, "vantare-crystal");
      expect(defaults.textColor).toBe(vars.get("--text-main"));
    });
  }

  it("telemetry vantare-crystal.accentColor matches --accent-red", () => {
    const vars = readHtmlRootVariables();
    const defaults = getDefaultAppearance("telemetry", "vantare-crystal");
    expect(defaults.accentColor).toBe(vars.get("--accent-red"));
  });
});
