import assert from "node:assert/strict";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(frontendRoot, "..");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

test("generated declaration compiles and its exact URL resolves from a cleaned temporary tree", { timeout: 180_000 }, async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "vantare-isa267-integration-"));
  const sandbox = path.join(sandboxRoot, "frontend");
  try {
    await cp(frontendRoot, sandbox, {
      recursive: true,
      filter(source) {
        const relative = path.relative(frontendRoot, source);
        const first = relative.split(path.sep)[0];
        return !["node_modules", "dist", ".tmp"].includes(first);
      },
    });
    await cp(path.join(repositoryRoot, "docs"), path.join(sandboxRoot, "docs"), { recursive: true });
    await symlink(path.join(frontendRoot, "node_modules"), path.join(sandbox, "node_modules"), "junction");
    await run(process.execPath, [
      path.join(sandbox, "scripts", "new-overlay-design.mjs"),
      "--root", sandbox,
      "--widget", "delta",
      "--system", "vantare-crystal",
      "--design", "isa-267-sandbox-design",
      "--name", "ISA 267 Sandbox Design",
    ], sandbox);
    await run(process.execPath, [path.join(frontendRoot, "node_modules", "typescript", "bin", "tsc"), "-b"], sandbox);
    await run(process.execPath, [path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js"), "build"], sandbox);

    const server = await createServer({
      root: sandbox,
      logLevel: "error",
      appType: "custom",
      server: { middlewareMode: true },
    });
    try {
      const designs = await server.ssrLoadModule("/src/overlay/design-systems/official-designs.ts");
      const query = await server.ssrLoadModule("/src/overlay/authoring/overlay-workshop-query.ts");
      const id = "isa-267-sandbox-design";
      assert.equal(designs.getOfficialDesign(id)?.id, id);
      assert.deepEqual(
        query.parseOverlayWorkshopQuery(`?widget=delta&system=vantare-crystal&design=${id}&state=ready&surface=studio&variant=default`),
        expectWorkshopQuery(id),
      );
    } finally {
      await server.close();
    }
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

function expectWorkshopQuery(designId) {
  return {
    widget: "delta",
    system: "vantare-crystal",
    designId,
    state: "ready",
    surface: "studio",
    variant: "default",
    session: "race",
    location: "track",
    background: "grid",
    scale: 1,
    preset: "1080p",
  };
}
