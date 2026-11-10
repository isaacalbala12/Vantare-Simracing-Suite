import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { auditFontSources } from "./visual-diff/fonts.ts";
import { compareImages } from "./visual-diff/image.ts";
import { referenceReceiptHash } from "./visual-diff/reference-hash.ts";
import { visualScenes } from "./visual-diff/scenes.ts";
import { until } from "./wait-for.ts";

const digest = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const args = process.argv.slice(2);
function option(name: string, fallback?: string) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const reference = resolve(
  option("--references", process.env.VANTARE_HUB_REFERENCE_ROOT) ?? "",
);
assert.ok(
  option("--references", process.env.VANTARE_HUB_REFERENCE_ROOT),
  "--references is required",
);
const output = resolve(
  option("--output", process.env.VANTARE_HUB_EVIDENCE) ?? "",
);
assert.ok(
  option("--output", process.env.VANTARE_HUB_EVIDENCE),
  "--output is required",
);
const currentOnly = option("--current");
const selected = option("--scene");
const schemes =
  option("--theme", "both") === "both"
    ? ["dark", "light"]
    : [option("--theme")];
assert.ok(schemes.every((scheme) => scheme === "dark" || scheme === "light"));
assert.ok(selected || args.includes("--all"), "Use --scene <name> or --all");
assert.ok(
  !currentOnly || (selected && schemes.length === 1),
  "--current requires one scene and theme",
);
await mkdir(output, { recursive: true });
await writeFile(
  join(output, "font-sources.json"),
  JSON.stringify(await auditFontSources(), null, 2),
);
const report: Record<string, unknown>[] = [];
for (const scheme of schemes) {
  assert.ok(scheme === "dark" || scheme === "light");
  const directory = join(reference, scheme);
  const batch = JSON.parse(
    await readFile(join(directory, "capture-batch.json"), "utf8"),
  ) as {
    scene: string;
    appearance: string;
    size: number[];
  }[];
  const scenes = selected
    ? [selected]
    : (await readdir(directory))
        .filter((name) => name.endsWith(".png"))
        .map((name) => name.slice(0, -4));
  for (const scene of scenes) {
    try {
      assert.match(scene, /^[a-z0-9-]+$/);
      const entry = batch.find((item) => item.scene === scene);
      assert.ok(entry, `Reference manifest missing scene ${scene}`);
      assert.deepEqual(entry.size, [1440, 900]);
      assert.equal(
        entry.appearance,
        `vantare-${scheme}`,
        "Register an explicit palette adapter before comparing another palette",
      );
      const old = await readFile(join(directory, `${scene}.png`));
      const metadata = JSON.parse(
        await readFile(join(directory, `${scene}.png.capture.json`), "utf8"),
      );
      assert.equal(
        referenceReceiptHash(old),
        metadata.png,
        "Reference PNG changed after capture",
      );
      const destination = join(output, scheme, scene);
      await mkdir(destination, { recursive: true });
      const adapter = visualScenes[scene];
      if (!currentOnly && !adapter) {
        report.push({
          scene,
          scheme,
          status: "unimplemented",
          reason:
            "No explicit scene/data adapter; no unrelated fallback captured",
        });
        continue;
      }
      const current = currentOnly
        ? await readFile(resolve(currentOnly))
        : await capture(adapter, scheme, destination);
      await writeFile(join(destination, "reference.png"), old);
      await writeFile(join(destination, "current.png"), current);
      const { diff, ...metrics } = compareImages(old, current);
      await writeFile(join(destination, "diff.png"), diff);
      report.push({
        scene,
        scheme,
        status: "compared",
        ...metrics,
        referencePngSha256: digest(old),
        referenceReceiptHash: metadata.png,
        referenceInputsHash: metadata.inputs,
        capture: entry,
        currentPngSha256: digest(current),
        suppliedCapture: Boolean(currentOnly),
      });
    } catch (error) {
      report.push({ scene, scheme, status: "failed", reason: String(error) });
    }
    await writeFile(
      join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
  }
}
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
const rows = report.map(
  (item) =>
    `| ${item.scheme} | ${item.scene} | ${item.status} | ${typeof item.exactPercent === "number" ? item.exactPercent.toFixed(4) : "—"} | ${typeof item.perceptualPercent === "number" ? item.perceptualPercent.toFixed(4) : "—"} |`,
);
await writeFile(
  join(output, "report.md"),
  `# Paridad visual\n\nPíxeles RGBA distintos, sin máscaras ni alineado, es la cifra principal. Pixelmatch (umbral 0,1, antialias incluido) es complementario. La revisión humana sigue siendo obligatoria.\n\n| Tema | Escena | Estado | Exacto % | Perceptual % |\n|---|---|---|---:|---:|\n${rows.join("\n")}\n`,
);
console.log(join(output, "report.json"));
if (report.some((item) => item.status === "failed")) process.exitCode = 1;

async function capture(
  adapter: (typeof visualScenes)[string],
  scheme: string,
  destination: string,
) {
  assert.equal(
    process.platform,
    "win32",
    "Real Electron HWND capture requires Windows",
  );
  const qaRoot = process.env.VANTARE_HUB_QA_ROOT;
  assert.ok(qaRoot, "VANTARE_HUB_QA_ROOT required");
  const data = join(
    resolve(qaRoot),
    `visual-${randomBytes(8).toString("hex")}`,
  );
  await mkdir(data, { recursive: true });
  const executable = resolve(
    process.env.VANTARE_HUB_UI_BINARY ??
      "release/package-qa/vantare-hub-ui-win32-x64/vantare-hub-ui.exe",
  );
  const env: Record<string, string | undefined> = {
    ...process.env,
    VANTARE_HUB_HOST: "mock",
    VANTARE_HUB_SCENE: `visual-${scheme}:${adapter.mock}`,
    VANTARE_HUB_DATA_DIR: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    [
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      "--force-device-scale-factor=1",
    ],
    { env, windowsHide: false, stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  let spawnError: Error | undefined;
  child.once("error", (error) => {
    spawnError = error;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    let endpoint = "";
    await until(
      () => {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null)
          throw new Error(`Electron exited ${child.exitCode}: ${stderr}`);
        endpoint =
          stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
        return Boolean(endpoint);
      },
      60000,
      "QA Electron endpoint",
    );
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.waitForEvent("page"));
    await page.getByRole("tab", { name: "General", exact: true }).waitFor();
    const session = await context.newCDPSession(page);
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        resolve("scripts/visual-diff/capture.ps1"),
        "-ProcessId",
        String(child.pid),
        "-Executable",
        executable,
        "-Prepare",
      ],
      { windowsHide: true },
    );
    await until(
      async () =>
        page.evaluate(() => innerWidth === 1440 && innerHeight === 900),
      5000,
      "1440x900 CSS client",
    );
    await adapter.prepare(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await until(
      async () =>
        page.evaluate(
          (expected) => document.documentElement.dataset.scheme === expected,
          scheme,
        ),
      5000,
      "theme ready",
    );
    const fonts = await page.evaluate(() => ({
      scheme: document.documentElement.dataset.scheme,
      palette: document.documentElement.dataset.palette,
      scale: window.devicePixelRatio,
      zoom: getComputedStyle(document.documentElement).zoom,
      sans: getComputedStyle(document.documentElement).fontFamily,
      loaded: [...document.fonts].map((font) => ({
        family: font.family,
        weight: font.weight,
        status: font.status,
      })),
    }));
    assert.equal(fonts.scheme, scheme);
    assert.equal(fonts.palette, "vantare");
    assert.equal(fonts.scale, 1);
    await session.send("DOM.enable");
    const platform = await session.send("DOM.getDocument");
    await session.send("CSS.enable");
    const nodes = await session.send("DOM.querySelectorAll", {
      nodeId: platform.root.nodeId,
      selector: "h1, p, button, label, kbd",
    });
    const platformFonts = await Promise.all(
      nodes.nodeIds.slice(0, 30).map(async (nodeId) => ({
        nodeId,
        ...(await session.send("CSS.getPlatformFontsForNode", { nodeId })),
      })),
    );
    await writeFile(
      join(destination, "fonts.json"),
      JSON.stringify({ ...fonts, platformFonts }, null, 2),
    );
    await session.detach();
    // PrintWindow includes window controls; CDP screenshots omit native titleBarOverlay.
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        resolve("scripts/visual-diff/capture.ps1"),
        "-ProcessId",
        String(child.pid),
        "-Executable",
        executable,
        "-Output",
        join(destination, "current.png"),
      ],
      { windowsHide: true },
    );
    return await readFile(join(destination, "current.png"));
  } finally {
    if (browser && child.exitCode === null) {
      const closing = await browser.newBrowserCDPSession();
      await closing.send("Browser.close").catch(() => {}); // Expected CDP disconnect on close.
    }
    await browser?.close();
    if (child.pid && child.exitCode === null) {
      const stopped = new Promise<void>((accept) =>
        child.once("exit", () => accept()),
      );
      child.kill();
      await stopped;
    }
    await writeFile(join(destination, "stderr.log"), stderr);
  }
}
