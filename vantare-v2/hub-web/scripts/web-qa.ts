import { resolve } from "node:path";
import { build, preview } from "vite";

/** Browser-only QA stays outside out/, which is copied into the product package. */
export async function webQaPreview() {
  const project = resolve(import.meta.dirname, "..");
  const output = resolve(project, "test-results/web-renderer");
  await build({
    configFile: resolve(project, "vite.web.config.ts"),
    logLevel: "error",
    build: { outDir: output, emptyOutDir: true },
  });
  return preview({
    configFile: false,
    root: resolve(project, "src/renderer"),
    build: { outDir: output },
    preview: { host: "127.0.0.1", port: 0 },
  });
}
