import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { compareImages } from "./visual-diff/image.ts";
import { until } from "./wait-for.ts";

const args = process.argv.slice(2);
function option(name: string, fallback?: string) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
assert.equal(
  process.platform,
  "win32",
  "Compare on the same Windows Chromium as the product capture",
);
const prototype = resolve(option("--prototype") ?? "");
const current = resolve(option("--current") ?? "");
const output = resolve(option("--output") ?? "");
assert.ok(
  option("--prototype") && option("--current") && option("--output"),
  "--prototype, --current and --output required",
);
const state = option("--state", "delta");
assert.ok(state, "Prototype state required");
const theme = option("--theme", "dark");
const sidebar = option("--sidebar", "closed");
const size = option("--size", "1440");
assert.ok(theme === "dark" || theme === "light");
assert.ok(sidebar === "closed" || sidebar === "open");
assert.ok(size === "1440" || size === "1280" || size === "z125");
assert.ok(process.env.VANTARE_HUB_QA_ROOT, "VANTARE_HUB_QA_ROOT required");
const captureLock = process.env.VANTARE_HUB_CAPTURE_LOCK ?? "D:/VantareServer/qa/captura.lock";
assert.ok((await stat(captureLock)).isDirectory(), "Acquire the global capture lock before launching the prototype viewer");
const dimensions = size === "1280" ? [1280, 720] : [1440, 900];
const require = createRequire(import.meta.url);
const executable: unknown = require("electron");
assert.equal(typeof executable, "string");
const productVersion = JSON.parse(
  await readFile(join(dirname(current), "browser.json"), "utf8"),
);
const source = await readFile(prototype);
await mkdir(output, { recursive: true });
const profile = join(
  resolve(process.env.VANTARE_HUB_QA_ROOT),
  `prototype-${randomBytes(8).toString("hex")}`,
);
await mkdir(profile, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  executable as string,
  [
    resolve("scripts/studio-reference/main.cjs"),
    prototype,
    profile,
    ...dimensions.map(String),
  ],
  {
    env,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let stderr = "";
let spawnError: Error | undefined;
child.once("error", (error) => {
  spawnError = error;
});
child.stderr.on("data", (data) => {
  stderr += data.toString();
});
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let forcedKill = false;
try {
  let endpoint = "";
  await until(
    () => {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null)
        throw Error(`Prototype viewer exited ${child.exitCode}: ${stderr}`);
      endpoint =
        stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
      return Boolean(endpoint);
    },
    60000,
    "prototype Chromium endpoint",
  );
  browser = await chromium.connectOverCDP(endpoint);
  const session = await browser.newBrowserCDPSession();
  const version = await session.send("Browser.getVersion");
  await session.detach();
  assert.equal(
    version.product,
    productVersion.product,
    "Prototype and product Chromium versions differ",
  );
  assert.equal(
    version.jsVersion,
    productVersion.jsVersion,
    "Prototype and product engines differ",
  );
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page.locator("#mq-state").selectOption(state);
  await page.locator("#mq-size").selectOption(size);
  await page.evaluate(
    ({ theme, sidebar }) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.sidebar = sidebar;
    },
    { theme, sidebar },
  );
  // The prototype toolbar is outside the application's window, not part of it.
  await page.addStyleTag({
    content:
      ".mq{display:none!important}.win{margin:0!important;box-shadow:none!important}body{min-width:0!important}",
  });
  const fontCss = await readFile(
    resolve("src/renderer/design/fonts.css"),
    "utf8",
  );
  const fonts = await Promise.all(
    [...fontCss.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(async ([, rule]) => {
      const family = rule
        .match(/font-family:\s*([^;]+)/)?.[1]
        .trim()
        .replace(/^"|"$/g, "");
      const path = rule.match(/url\("([^"]+)"\)/)?.[1];
      const weight = rule.match(/font-weight:\s*(\d+)/)?.[1];
      assert.ok(
        family && path && weight,
        "Unsupported product font declaration",
      );
      const bytes = await readFile(resolve("src/renderer/design", path));
      return {
        family,
        weight,
        data: bytes.toString("base64"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  );
  await page.evaluate(async (fonts) => {
    for (const font of fonts) {
      const face = new FontFace(
        font.family,
        `url(data:font/ttf;base64,${font.data})`,
        { weight: font.weight },
      );
      await face.load();
      document.fonts.add(face);
    }
    await document.fonts.ready;
  }, fonts);
  const rectangle = await page.locator(".win").boundingBox();
  assert.ok(rectangle);
  assert.deepEqual(
    [rectangle.width, rectangle.height],
    dimensions,
    "Prototype window dimensions differ",
  );
  await page.locator(".win").screenshot({
    path: join(output, "reference.png"),
    animations: "disabled",
  });
  const reference = await readFile(join(output, "reference.png"));
  const candidate = await readFile(current);
  const comparison = compareImages(reference, candidate);
  await writeFile(join(output, "diff.png"), comparison.diff);
  const left = PNG.sync.read(reference),
    right = PNG.sync.read(candidate);
  const pair = new PNG({ width: left.width * 2, height: left.height });
  const row = left.width * 4;
  for (let y = 0; y < left.height; y++) {
    left.data.copy(pair.data, y * row * 2, y * row, (y + 1) * row);
    right.data.copy(pair.data, y * row * 2 + row, y * row, (y + 1) * row);
  }
  await writeFile(
    join(output, "comparison-reference-left.png"),
    PNG.sync.write(pair),
  );
  await writeFile(
    join(output, "reference.json"),
    JSON.stringify(
      {
        prototype,
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        state,
        theme,
        sidebar,
        size,
        dimensions,
        current,
        chromium: version,
        productChromium: productVersion,
        fonts: fonts.map(({ data: _data, ...metadata }) => metadata),
        exactPercent: comparison.exactPercent,
        perceptualPercent: comparison.perceptualPercent,
        comparison:
          "Prototype left; product right. Metrics describe the full window, including any unfinished phases.",
      },
      null,
      2,
    ),
  );
} finally {
  if (browser && child.exitCode === null) {
    const closing = await browser.newBrowserCDPSession().catch(() => undefined);
    await closing?.send("Browser.close").catch(() => {});
  }
  await until(
    () => child.exitCode !== null,
    5000,
    "prototype viewer exit",
  ).catch(() => {
    forcedKill = true;
    child.kill();
  });
  await browser?.close().catch(() => {});
  await writeFile(
    join(output, "teardown.json"),
    JSON.stringify({ forcedKill, exitCode: child.exitCode, stderr }, null, 2),
  );
  assert.equal(forcedKill, false, "Prototype viewer did not close cleanly");
  assert.equal(child.exitCode, 0, "Prototype viewer failed");
}
