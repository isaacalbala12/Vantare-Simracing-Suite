import { describe, it, expect } from "vitest";
import { resolveWidgetDesignSystem } from "./widget-design-system";
import html from "../../../../docs/overlay-glassmorphism-pro.html?raw";

/**
 * Contract test: asserts that the runtime tokens for `vantare-crystal` match
 * the CSS variables defined in `docs/overlay-glassmorphism-pro.html` (`:root`).
 *
 * If the HTML changes, this test fails. The resolver is the "single source of
 * truth" for the runtime OBS, and it must stay in sync with the visual reference.
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

describe("widget-design-system contract with overlay-glassmorphism-pro.html", () => {
  it("vantare-crystal.background matches --bg-page", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.background).toBe(vars.get("--bg-page"));
  });

  it("vantare-crystal.text matches --text-main", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.text).toBe(vars.get("--text-main"));
  });

  it("vantare-crystal.textMuted matches --text-muted", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.textMuted).toBe(vars.get("--text-muted"));
  });

  it("vantare-crystal.textDim matches --text-dim", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.colors.textDim).toBe(vars.get("--text-dim"));
  });

  it("vantare-crystal.displayFont matches --font-display", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.typography.displayFont).toBe(vars.get("--font-display"));
  });

  it("vantare-crystal.bodyFont matches --font-sans", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.typography.bodyFont).toBe(vars.get("--font-sans"));
  });

  it("vantare-crystal.monoFont matches --font-mono", () => {
    const vars = readHtmlRootVariables();
    const tokens = resolveWidgetDesignSystem("vantare-crystal");
    expect(tokens.typography.monoFont).toBe(vars.get("--font-mono"));
  });
});
