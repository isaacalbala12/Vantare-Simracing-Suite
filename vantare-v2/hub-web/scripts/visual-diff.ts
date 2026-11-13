import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { windowText } from "../src/renderer/i18n/window.es.ts";
import {
  captureOnlyMode,
  captureUncompared,
} from "./visual-diff/capture-only.ts";
import { auditFontSources } from "./visual-diff/fonts.ts";
import { checkFrameParity } from "./visual-diff/frame-parity-check.ts";
import { compareImages } from "./visual-diff/image.ts";
import { observeProcessExit } from "./visual-diff/process-exit.ts";
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
const width = Number(option("--width", "1440"));
const height = Number(option("--height", "900"));
assert.ok(
  Number.isInteger(width) && width >= 640 && width <= 3840,
  "Invalid capture width",
);
assert.ok(
  Number.isInteger(height) && height >= 480 && height <= 2160,
  "Invalid capture height",
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
const captureMode = captureOnlyMode({
  enabled: captureOnly,
  scene: selected,
  current: currentOnly,
  invalidReason,
  themes: schemes.length,
});
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
    captureMode === "live"
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
      if (captureMode === "live") {
        const adapter = visualScenes[scene];
        assert.ok(adapter, `No explicit adapter for ${scene}`);
        const destination = join(output, scheme, scene);
        report.push(
          await captureUncompared({
            scene,
            scheme,
            destination,
            dimensions: [width, height],
            capture: () => capture(adapter, scheme, destination),
          }),
        );
        continue;
      }
      const entry = batch.find((item) => item.scene === scene);
      assert.ok(entry, `Reference manifest missing scene ${scene}`);
      assert.deepEqual(entry.size, [width, height]);
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
        report.push(
          await captureUncompared({
            scene,
            scheme,
            destination,
            dimensions: [width, height],
            capture: async () => current,
            invalidReason,
            suppliedCapture: Boolean(currentOnly),
          }),
        );
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
    ? `# Captura sin comparación\n\n${invalidReason ? `Referencia no válida: ${invalidReason}.` : "Comparación diferida al informe del barrido."} No se calculan porcentajes ni diferencias.\n\n| Tema | Escena | Estado |\n|---|---|---|\n${rows.join("\n")}\n`
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
  const exited = observeProcessExit(child);
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
  let cleanupFailed = false;
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
    const versionSession = await browser.newBrowserCDPSession();
    await writeFile(
      join(destination, "browser.json"),
      JSON.stringify(await versionSession.send("Browser.getVersion"), null, 2),
    );
    await versionSession.detach();
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
        "-Width",
        String(width),
        "-Height",
        String(height),
      ],
      { windowsHide: true },
    );
    await writeFile(join(destination, "window.json"), preparedWindow);
    await until(
      async () =>
        page.evaluate(
          ({ width, height }) => innerWidth === width && innerHeight === height,
          { width, height },
        ),
      5000,
      `${width}x${height} CSS client`,
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
          "-Width",
          String(width),
          "-Height",
          String(height),
        ],
        { windowsHide: true },
      );
    saveWindow("current.png");
    if (args.includes("--capture-sidebar-matrix")) {
      const nav = page.locator(".v-sidebar");
      const applicable = (await nav.count()) > 0;
      const matrix = [];
      const frameChecks = [];
      for (const expanded of [false, true]) {
        if (applicable) {
          const current = await nav.evaluate(
            (node) => !node.classList.contains("v-sidebar--collapsed"),
          );
          if (current !== expanded)
            await page
              .getByRole("button", {
                name: /^(Contraer o ampliar navegación|Contraer barra)$/,
                exact: true,
              })
              .first()
              .click();
          await until(
            async () =>
              (await nav.boundingBox())?.width === (expanded ? 272 : 76),
            5000,
            "sidebar matrix width",
          );
          await page.mouse.move(Math.min(1000, width - 10), height - 10);
        }
        const filename = expanded
          ? "sidebar-expanded.png"
          : "sidebar-collapsed.png";
        if (process.env.VANTARE_HUB_FRAME_ASSERT === "1")
          frameChecks.push(await checkFrameParity(page, expanded));
        saveWindow(filename);
        if (args.includes("--capture-focus")) {
          await page.keyboard.press("Tab");
          const focus = await page.evaluate(() => {
            const node = document.activeElement;
            if (!(node instanceof HTMLElement)) return null;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return {
              tag: node.tagName,
              label:
                node.getAttribute("aria-label") ?? node.textContent?.trim(),
              focusVisible: node.matches(":focus-visible"),
              outline: style.outline,
              shadow: style.boxShadow,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            };
          });
          saveWindow(`focus-${expanded ? "expanded" : "collapsed"}.png`);
          await writeFile(
            join(
              destination,
              `focus-${expanded ? "expanded" : "collapsed"}.json`,
            ),
            JSON.stringify(focus, null, 2),
          );
        }
        matrix.push({
          expanded,
          applicable,
          filename,
          width: applicable ? (await nav.boundingBox())?.width : null,
        });
      }
      await writeFile(
        join(destination, "frame-checks.json"),
        JSON.stringify(frameChecks, null, 2),
      );
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
            viewport: [width, height],
            reference: null,
            comparison:
              "Not compared: the scene reference has a collapsed sidebar",
          },
          null,
          2,
        ),
      );
    }
    const captured = await readFile(join(destination, "current.png"));
    // Scene checks exercise focus and keyboard navigation after the screenshot.
    // Run them before bounded teardown, and propagate failures to the report.
    cleanupFailed = true;
    await adapter.cleanup?.(page);
    cleanupFailed = false;
    return captured;
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
      if (child.exitCode === null) await exited;
      // CDP can already be disconnected after the process exits. Keep a
      // bounded, referenced timer rather than leaving an unsettled close await.
      if (browser) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          browser.close().catch(() => {}),
          new Promise<void>((accept) => {
            timer = setTimeout(accept, 1000);
          }),
        ]);
        clearTimeout(timer);
      }
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null) {
        stopTree();
        await exited;
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
