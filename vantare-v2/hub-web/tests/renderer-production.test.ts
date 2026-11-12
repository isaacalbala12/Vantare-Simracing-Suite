import { resolve } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";

it("omits mock modules and frozen Hub fixtures from the production renderer", async () => {
  const result = await build({
    configFile: resolve("vite.web.config.ts"),
    logLevel: "silent",
    define: { __VANTARE_RENDERER_MOCK__: "false" },
    build: { write: false, emptyOutDir: false, minify: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  let code = "";
  let css = "";
  const modules: string[] = [];
  for (const output of outputs) {
    if (!("output" in output))
      throw new Error("Expected a completed renderer build");
    for (const chunk of output.output) {
      if (chunk.type !== "chunk") {
        if (chunk.fileName.endsWith(".css"))
          css +=
            typeof chunk.source === "string"
              ? chunk.source
              : new TextDecoder().decode(chunk.source);
        continue;
      }
      code += chunk.code;
      modules.push(
        ...Object.keys(chunk.modules).map((id) => id.replaceAll("\\", "/")),
      );
    }
  }
  expect(code).toContain("Host preload unavailable");
  expect(css.length).toBeGreaterThan(0);
  expect(css).not.toContain(".v-dialog-audit-fixture");
  for (const marker of [
    "DialogAuditFixtures",
    "dialog-audit",
    "dialog-fixture",
  ])
    expect(code).not.toContain(marker);
  expect(modules.length).toBeGreaterThan(0);
  expect(
    modules.some(
      (id) =>
        id.includes("/src/mock/") ||
        id.includes("/native/hub/reference/fixtures/") ||
        /DialogAuditFixtures|dialog-audit/.test(id),
    ),
  ).toBe(false);
}, 15000);
