import assert from "node:assert/strict";
import { resolve } from "node:path";
import { build } from "vite";

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
  assert.ok("output" in output, "Expected a completed renderer build");
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
assert.ok(
  code.includes("Host preload unavailable"),
  "Production renderer misses the host preload fallback",
);
assert.ok(css.length > 0, "Production renderer emitted no CSS");
assert.ok(
  !css.includes(".v-dialog-audit-fixture"),
  "Production renderer kept the dialog audit fixture CSS",
);
for (const marker of ["DialogAuditFixtures", "dialog-audit", "dialog-fixture"])
  assert.ok(
    !code.includes(marker),
    `Production renderer kept the ${marker} marker`,
  );
assert.ok(modules.length > 0, "Production renderer emitted no modules");
assert.ok(
  !modules.some(
    (id) =>
      id.includes("/src/mock/") ||
      id.includes("/native/hub/reference/fixtures/") ||
      /DialogAuditFixtures|dialog-audit/.test(id),
  ),
  "Production renderer includes mock modules or frozen Hub fixtures",
);
console.log(
  `Production renderer isolation verified: ${modules.length} modules, no mocks or frozen fixtures.`,
);
