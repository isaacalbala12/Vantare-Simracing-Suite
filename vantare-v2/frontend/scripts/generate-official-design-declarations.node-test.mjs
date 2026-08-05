import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkGeneratedBarrel,
  discoverDeclarationModules,
  generateOfficialDesignDeclarations,
  renderGeneratedBarrel,
} from "./generate-official-design-declarations.mjs";

async function withSandbox(run) {
  const root = await mkdtemp(path.join(tmpdir(), "vantare-official-designs-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function declaration(root, relativePath, source = "export const officialWidgetDesignDeclarations = [] as const;\n") {
  const target = path.join(root, "src", "overlay", "design-systems", ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source, "utf8");
}

test("discovers only conventional declaration modules in stable POSIX order", async () => {
  await withSandbox(async (root) => {
    await declaration(root, "vantare-original/zeta/official-designs.ts");
    await declaration(root, "vantare-crystal/alpha/windows/official-designs.ts");
    await declaration(root, "community/ignored/official-designs.ts");
    assert.deepEqual(await discoverDeclarationModules(root), [
      "./vantare-crystal/alpha/windows/official-designs",
      "./vantare-original/zeta/official-designs",
    ]);
    assert.match(renderGeneratedBarrel(await discoverDeclarationModules(root)), /\.\/vantare-crystal\/alpha\/windows\/official-designs/);
    assert.doesNotMatch(renderGeneratedBarrel(await discoverDeclarationModules(root)), /\\/);
  });
});

test("rejects a conventional module without the required readonly export", async () => {
  await withSandbox(async (root) => {
    await declaration(root, "vantare-crystal/delta/broken/official-designs.ts", "export const wrong = [];\n");
    await assert.rejects(() => discoverDeclarationModules(root), /missing export officialWidgetDesignDeclarations/);
  });
});

test("writes deterministic bytes and --check fails when the barrel is stale", async () => {
  await withSandbox(async (root) => {
    await declaration(root, "vantare-crystal/delta/official-designs.ts");
    const result = await generateOfficialDesignDeclarations(root);
    assert.equal(result.changed, true);
    assert.equal(await checkGeneratedBarrel(root), true);
    await writeFile(result.outputPath, "// stale\n", "utf8");
    await assert.rejects(() => checkGeneratedBarrel(root), /stale generated official design declarations/);
    await generateOfficialDesignDeclarations(root);
    assert.equal(await readFile(result.outputPath, "utf8"), result.content);
  });
});
