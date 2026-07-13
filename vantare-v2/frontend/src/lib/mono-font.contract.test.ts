/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import indexHtml from "../../index.html?raw";

const indexCss = readFileSync(
  join(process.cwd(), "src", "index.css"),
  "utf8",
);

describe("mono typography contract", () => {
  it("loads the canonical Space Mono weights used by the Hub", () => {
    expect(indexHtml).toContain(
      "family=Space+Mono:wght@400;700&display=swap",
    );
  });

  it("keeps Space Mono as the global mono fallback", () => {
    expect(indexCss).toMatch(
      /--v-font-mono:\s*'Space Mono',\s*monospace;/,
    );
  });
});
