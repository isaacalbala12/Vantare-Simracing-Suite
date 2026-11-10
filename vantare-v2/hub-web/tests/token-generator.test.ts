import { describe, expect, it } from "vitest";
import { render, type Tokens } from "../scripts/tokens";

const minimal: Tokens = {
  version: 1,
  semantic: ["bg-window"],
  primitives: { space: [4, 6], "control-h": 36 },
  themes: { vantare: { dark: { "bg-window": "#161314" } } },
};
describe("token generator", () => {
  it("emits semantic variables and clears Tailwind defaults", () => {
    const result = render(minimal);
    expect(result.css).toContain("--bg-window: #161314");
    expect(result.theme).toContain("--*: initial");
    expect(result.theme).toContain("--color-bg-window: var(--bg-window)");
  });
  it("rejects missing semantics instead of silently using a different theme", () => {
    expect(() =>
      render({ ...minimal, semantic: ["bg-window", "text-1"] }),
    ).toThrow("Missing semantics");
  });
});
