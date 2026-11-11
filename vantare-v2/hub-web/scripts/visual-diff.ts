import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { PNG } from "pngjs";
import { windowText } from "../src/renderer/i18n/window.es.ts";
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
const captureOnly = args.includes("--capture-only");
const invalidReason = option("--invalid-reference-reason");
const selected = option("--scene");
const captureOnly = args.includes("--capture-only");
assert.ok(
  !captureOnly || (selected && !currentOnly),
  "Capture-only requires a live named scene",
);
assert.ok(
  !args.includes("--capture-expanded-sidebar") || !currentOnly,
  "Expanded sidebar requires a live capture",
);
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
assert.ok(
  !captureOnly || (selected && schemes.length === 1 && invalidReason?.trim()),
  "--capture-only requires one scene, one theme and --invalid-reference-reason",
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
    captureOnly
      ? "[]"
      : await readFile(join(directory, "capture-batch.json"), "utf8"),
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
      if (captureOnly) {
        const adapter = visualScenes[scene];
        assert.ok(adapter, `No explicit adapter for ${scene}`);
        const destination = join(output, scheme, scene);
        await mkdir(destination, { recursive: true });
        const current = await capture(adapter, scheme, destination);
        await writeFile(join(destination, "current.png"), current);
        report.push({
          scene,
          scheme,
          status: "captured-without-comparison",
          currentPngSha256: digest(current),
        });
        continue;
      }
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
      if (captureOnly) {
        const png = PNG.sync.read(current);
        assert.deepEqual([png.width, png.height], [1440, 900]);
        await writeFile(join(destination, "current.png"), current);
        report.push({
          scene,
          scheme,
          status: "captured",
          referenceStatus: "invalid",
          reason: invalidReason,
          currentPngSha256: digest(current),
          suppliedCapture: Boolean(currentOnly),
        });
        continue;
      }
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
        additionalCaptures: args.includes("--capture-expanded-sidebar")
          ? ["expanded-sidebar.png"]
          : [],
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
const rows = report.map((item) =>
  captureOnly
    ? `| ${item.scheme} | ${item.scene} | ${item.status} |`
    : `| ${item.scheme} | ${item.scene} | ${item.status} | ${typeof item.exactPercent === "number" ? item.exactPercent.toFixed(4) : "—"} | ${typeof item.perceptualPercent === "number" ? item.perceptualPercent.toFixed(4) : "—"} |`,
);
await writeFile(
  join(output, "report.md"),
  captureOnly
    ? `# Captura sin comparación\n\nReferencia no válida: ${invalidReason}. No se calculan porcentajes ni diferencias.\n\n| Tema | Escena | Estado |\n|---|---|---|\n${rows.join("\n")}\n`
    : `# Paridad visual\n\nPíxeles RGBA distintos, sin máscaras ni alineado, es la cifra principal. Pixelmatch (umbral 0,1, antialias incluido) es complementario. La revisión humana sigue siendo obligatoria.\n\n| Tema | Escena | Estado | Exacto % | Perceptual % |\n|---|---|---|---:|---:|\n${rows.join("\n")}\n`,
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
  let cleanupPage: Page | undefined;
  try {
    await writeFile(
      join(destination, "instance.json"),
      JSON.stringify(
        {
          pid: child.pid,
          dataDirectory: data,
          userDataDirectory: join(data, "hub-ui"),
          executable,
        },
        null,
        2,
      ),
    );
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
    cleanupPage = page;
    await page
      .getByRole("button", { name: windowText.close, exact: true })
      .waitFor();
    const session = await context.newCDPSession(page);
    const preparedWindow = execFileSync(
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
    await writeFile(join(destination, "window.json"), preparedWindow);
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
    const saveWindow = (filename: string) =>
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
          join(destination, filename),
        ],
        { windowsHide: true },
      );
    saveWindow("current.png");
    if (args.includes("--capture-sidebar-matrix")) {
      const nav = page.locator(".v-sidebar");
      const applicable = (await nav.count()) > 0;
      const matrix = [];
      for (const expanded of [false, true]) {
        if (applicable) {
          const current = await nav.evaluate(
            (node) => !node.classList.contains("v-sidebar--collapsed"),
          );
          if (current !== expanded)
            await page
              .getByRole("button", {
                name: "Contraer o ampliar navegación",
                exact: true,
              })
              .click();
          await until(
            async () =>
              (await nav.boundingBox())?.width === (expanded ? 272 : 76),
            5000,
            "sidebar matrix width",
          );
          await page.mouse.move(1000, 890);
        }
        const filename = expanded
          ? "sidebar-expanded.png"
          : "sidebar-collapsed.png";
        saveWindow(filename);
        matrix.push({
          expanded,
          applicable,
          filename,
          width: applicable ? (await nav.boundingBox())?.width : null,
        });
      }
      await writeFile(
        join(destination, "sidebar-matrix.json"),
        JSON.stringify(matrix, null, 2),
      );
    }
    if (args.includes("--capture-expanded-sidebar")) {
      const nav = page.locator(".v-sidebar");
      await nav.waitFor();
      if (
        await nav.evaluate((node) =>
          node.classList.contains("v-sidebar--collapsed"),
        )
      )
        await page.keyboard.press("Control+b");
      await until(
        async () => (await nav.boundingBox())?.width === 272,
        5000,
        "expanded sidebar",
      );
      await page
        .getByRole("region", { name: "Perfiles", exact: true })
        .waitFor();
      await page.mouse.move(600, 890);
      saveWindow("expanded-sidebar.png");
      await writeFile(
        join(destination, "expanded-sidebar.json"),
        JSON.stringify(
          {
            sidebarWidth: 272,
            viewport: [1440, 900],
            reference: null,
            comparison:
              "Not compared: the scene reference has a collapsed sidebar",
          },
          null,
          2,
        ),
      );
    }
    return await readFile(join(destination, "current.png"));
  } catch (error) {
    if (cleanupPage && !cleanupPage.isClosed()) {
      await cleanupPage
        .screenshot({
          path: join(destination, "failed-diagnostic.png"),
          timeout: 3000,
        })
        .catch(() => {});
      await writeFile(
        join(destination, "failed-dom.txt"),
        (await cleanupPage
          .locator("body")
          .textContent({ timeout: 3000 })
          .catch(() => "DOM unavailable")) ?? "DOM unavailable",
      );
    }
    throw error;
  } finally {
    // A dirty native close guard can veto Browser.close. Bound QA teardown and
    // kill only this spawned process tree if scene cleanup cannot release it.
    let forcedKill = false;
    let cleanupFailed = false;
    const stopTree = () => {
      if (child.pid && child.exitCode === null) {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
          forcedKill = true;
        } catch {
          forcedKill = child.kill() || forcedKill;
        }
      }
    };
    const deadline = setTimeout(stopTree, 5000);
    try {
      if (cleanupPage && !cleanupPage.isClosed())
        await adapter.cleanup?.(cleanupPage).catch(() => {
          cleanupFailed = true;
        });
      const close = cleanupPage?.getByRole("button", {
        name: windowText.close,
        exact: true,
      });
      if (close && (await close.count()) && (await close.isEnabled())) {
        // Keep the renderer alive until its normal close guards have answered.
        await close.click({ timeout: 1000 }).catch(() => {});
      } else if (browser && child.exitCode === null) {
        const closing = await browser.newBrowserCDPSession();
        await closing.send("Browser.close").catch(() => {});
      }
      if (child.exitCode === null)
        await new Promise<void>((accept) => child.once("exit", () => accept()));
      await browser?.close().catch(() => {});
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null) {
        const stopped = new Promise<void>((accept) =>
          child.once("exit", () => accept()),
        );
        stopTree();
        await stopped;
      }
      await writeFile(
        join(destination, "teardown.json"),
        JSON.stringify(
          { forcedKill, cleanupFailed, exitCode: child.exitCode },
          null,
          2,
        ),
      );
      await writeFile(join(destination, "stderr.log"), stderr);
    }
  }
}
