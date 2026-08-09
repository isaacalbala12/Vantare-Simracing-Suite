/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import indexHtml from "../../index.html?raw";

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8");

const indexCss = read("src", "index.css");
const fontsCss = read("src", "fonts.css");

describe("typography contract", () => {
  // The contract is unchanged -- Space Mono 400 and 700 are the Hub's mono
  // weights -- but they now ship with the app instead of being fetched from
  // fonts.googleapis.com, so this checks the bundle rather than a <link>.
  it("declares the canonical Space Mono weights used by the Hub", () => {
    for (const weight of [400, 700]) {
      expect(fontsCss).toMatch(
        new RegExp(
          `font-family: 'Space Mono';[\\s\\S]*?font-weight: ${weight};`,
        ),
      );
    }
  });

  it("keeps Space Mono as the global mono fallback", () => {
    expect(indexCss).toMatch(/--v-font-mono:\s*'Space Mono',\s*monospace;/);
  });

  it("declares every family the tokens name", () => {
    for (const family of ["Inter", "Rajdhani", "Space Mono"]) {
      expect(fontsCss).toContain(`font-family: '${family}';`);
    }
  });

  it("serves the faces from the bundle", () => {
    expect(indexCss).toMatch(/^@import "\.\/fonts\.css";/);
    expect(fontsCss).toContain("url('/fonts/");
  });

  // This is the defect the vendoring fixed: WebView2 never fetched the
  // stylesheet, so the whole interface fell back to the monospace default --
  // and so did anyone offline. Nothing about drawing our own text may depend
  // on the network again.
  it("fetches no font over the network", () => {
    expect(indexHtml).not.toContain("fonts.googleapis.com");
    expect(indexHtml).not.toContain("fonts.gstatic.com");
    expect(fontsCss).not.toContain("https://");
  });
});
