import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { generateOfficialDesignDeclarations } from "./generate-official-design-declarations.mjs";
import { scaffoldOverlayDesign } from "./new-overlay-design.mjs";

const catalog = {
  designs: [{ id: "delta-crystal-simple", widgetType: "delta", systemId: "vantare-crystal" }],
  resolve(widget, system) {
    if (widget !== "delta" || system !== "vantare-crystal") {
      throw new Error(`unsupported widget/system registration: ${widget}/${system}`);
    }
    return {
      systemVersion: 1,
      configVersion: 2,
      defaultSettings: { templateId: "delta-bar", showHeader: true },
      parseSettings(input) {
        if (input.templateId === "invented") {
          return { templateId: "delta-bar", showHeader: true, templateDiagnostic: "unknown-template" };
        }
        return { templateId: input.templateId ?? "delta-bar", showHeader: input.showHeader !== false };
      },
      defaultSize: { width: 280, height: 96 },
    };
  },
};

async function withSandbox(run) {
  const root = await mkdtemp(path.join(tmpdir(), "vantare-overlay-new-"));
  try {
    const pilotDir = path.join(root, "src", "overlay", "design-systems", "vantare-crystal", "delta");
    await mkdir(pilotDir, { recursive: true });
    await writeFile(
      path.join(pilotDir, "official-designs.ts"),
      "export const officialWidgetDesignDeclarations = [] as const;\n",
      "utf8",
    );
    await generateOfficialDesignDeclarations(root);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const valid = {
  widget: "delta",
  system: "vantare-crystal",
  design: "delta-crystal-author-skeleton",
  name: "Delta Crystal Author Skeleton",
  settings: { templateId: "delta-simple", showHeader: true },
};

test("dry-run reports the exact file, barrel and Workshop URL without writing", async () => {
  await withSandbox(async (root) => {
    const result = await scaffoldOverlayDesign({ ...valid, frontendRoot: root, dryRun: true }, { catalog });
    assert.equal(result.written, false);
    assert.match(result.output, /DRY RUN/);
    assert.match(result.output.replaceAll("\\", "/"), /delta-crystal-author-skeleton\/official-designs\.ts/);
    assert.match(result.output, /official-design-declarations\.generated\.ts/);
    assert.equal(
      result.workshopUrl,
      "http://localhost:5173/workshop?widget=delta&system=vantare-crystal&design=delta-crystal-author-skeleton&state=ready&surface=studio&variant=default",
    );
    await assert.rejects(() => stat(result.declarationPath), { code: "ENOENT" });
  });
});

test("writes a co-located typed declaration and refreshes the deterministic barrel", async () => {
  await withSandbox(async (root) => {
    const result = await scaffoldOverlayDesign({ ...valid, frontendRoot: root }, { catalog });
    assert.equal(result.written, true);
    const source = await readFile(result.declarationPath, "utf8");
    assert.match(source, /defineOfficialWidgetDesign/);
    assert.match(source, /designSystemRegistry\.get\("vantare-crystal", 1\)/);
    assert.match(source, /widgetTypeRegistry\.get\("delta"\)/);
    assert.match(source, /"templateId": "delta-simple"/);
    assert.doesNotMatch(source, /Renderer|<section|className|\.css/);
    const barrel = await readFile(result.barrelPath, "utf8");
    assert.match(barrel, /vantare-crystal\/delta\/delta-crystal-author-skeleton\/official-designs/);
  });
});

test("fails closed for invalid IDs, missing registrations, catalog collisions and unsupported settings", async () => {
  await withSandbox(async (root) => {
    await assert.rejects(
      () => scaffoldOverlayDesign({ ...valid, design: "Not-Kebab", frontendRoot: root }, { catalog }),
      /design must be kebab-case/,
    );
    await assert.rejects(
      () => scaffoldOverlayDesign({ ...valid, design: "1-invalid-design", frontendRoot: root }, { catalog }),
      /design must be kebab-case/,
    );
    await assert.rejects(
      () => scaffoldOverlayDesign({ ...valid, widget: "standings", frontendRoot: root }, { catalog }),
      /unsupported widget\/system registration/,
    );
    await assert.rejects(
      () => scaffoldOverlayDesign({ ...valid, design: "delta-crystal-simple", frontendRoot: root }, { catalog }),
      /official design id already exists/,
    );
    await assert.rejects(
      () => scaffoldOverlayDesign({ ...valid, settings: { templateId: "invented" }, frontendRoot: root }, { catalog }),
      /unsupported visual form/,
    );
  });
});

test("preflight collisions and repeated execution leave every existing byte unchanged", async () => {
  await withSandbox(async (root) => {
    const first = await scaffoldOverlayDesign({ ...valid, frontendRoot: root }, { catalog });
    const declarationBefore = await readFile(first.declarationPath);
    const barrelBefore = await readFile(first.barrelPath);
    await assert.rejects(
      () => scaffoldOverlayDesign({ ...valid, frontendRoot: root }, { catalog }),
      /target already exists/,
    );
    assert.deepEqual(await readFile(first.declarationPath), declarationBefore);
    assert.deepEqual(await readFile(first.barrelPath), barrelBefore);
  });
});

test("rolls back only invocation-created files and restores the previous barrel after an induced failure", async () => {
  await withSandbox(async (root) => {
    const barrelPath = path.join(root, "src", "overlay", "design-systems", "official-design-declarations.generated.ts");
    const barrelBefore = await readFile(barrelPath);
    let declarationPath;
    await assert.rejects(
      async () => {
        const result = await scaffoldOverlayDesign(
          { ...valid, frontendRoot: root },
          { catalog, afterBarrelWrite: () => { throw new Error("induced failure"); } },
        );
        declarationPath = result.declarationPath;
      },
      /induced failure/,
    );
    declarationPath ??= path.join(root, "src", "overlay", "design-systems", "vantare-crystal", "delta", valid.design, "official-designs.ts");
    await assert.rejects(() => stat(declarationPath), { code: "ENOENT" });
    assert.deepEqual(await readFile(barrelPath), barrelBefore);
  });
});
