import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { until } from "./wait-for.ts";

const root = process.env.VANTARE_HUB_QA_ROOT;
assert.ok(
  root && isAbsolute(root),
  "VANTARE_HUB_QA_ROOT must be an absolute QA directory",
);
const data = join(root, `window-${randomBytes(8).toString("hex")}`);
const evidence = resolve(
  process.env.VANTARE_HUB_EVIDENCE ?? "test-results/window-controls",
);
const executable = resolve(
  process.env.VANTARE_HUB_UI_BINARY ??
    "release/package-qa/vantare-hub-ui-win32-x64/vantare-hub-ui.exe",
);
await mkdir(data, { recursive: true });
await mkdir(evidence, { recursive: true });
const errorMode = process.argv.includes("--error");
const light = process.argv.includes("--light");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  VANTARE_HUB_HOST: "mock",
  VANTARE_HUB_SCENE: errorMode
    ? light
      ? "componentes-incompatibles-light"
      : "componentes-incompatibles"
    : "ajustes-error",
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
let log = "";
let spawnError: Error | undefined;
child.once("error", (error) => {
  spawnError = error;
});
child.stderr.on("data", (chunk) => {
  log += chunk.toString();
});
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
const state = (action = "state", x = 0, y = 0) =>
  JSON.parse(
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        resolve("scripts/window-state.ps1"),
        "-ProcessId",
        String(child.pid),
        "-Executable",
        executable,
        "-Action",
        action,
        "-X",
        String(x),
        "-Y",
        String(y),
      ],
      { windowsHide: true, encoding: "utf8" },
    ),
  ) as {
    minimized: boolean;
    maximized: boolean;
    left: number;
    top: number;
    hit: number | null;
  };
try {
  let endpoint = "";
  await until(
    () => {
      if (spawnError) throw spawnError;
      assert.equal(child.exitCode, null, log);
      endpoint = log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
      return !!endpoint;
    },
    60000,
    "isolated QA window endpoint",
  );
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page.getByRole("button", { name: "Maximizar", exact: true }).waitFor();
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
  const snapshots = [state()];
  async function titlePoint() {
    const caption = await page.locator(".v-section-title").boundingBox();
    assert.ok(caption);
    return [
      Math.round(caption.x + caption.width / 2),
      Math.round(caption.y + caption.height / 2),
    ] as const;
  }
  for (const interactive of [
    page.getByRole("button", { name: "Cerrar ventana", exact: true }),
    ...(!errorMode
      ? [page.getByRole("tab", { name: "General", exact: true })]
      : []),
  ]) {
    const bounds = await interactive.boundingBox();
    assert.ok(bounds);
    assert.equal(
      state(
        "hitTest",
        Math.round(bounds.x + bounds.width / 2),
        Math.round(bounds.y + bounds.height / 2),
      ).hit,
      1,
      "interactive chrome stays HTCLIENT, never caption dragging",
    );
  }
  state("drag", ...(await titlePoint()));
  const dragged = state();
  assert.ok(
    dragged.left !== snapshots[0].left || dragged.top !== snapshots[0].top,
    "real caption dragging moves the HWND",
  );
  state("doubleClick", ...(await titlePoint()));
  await until(
    () => state().maximized,
    10000,
    "native title double click maximizes",
  );
  state("doubleClick", ...(await titlePoint()));
  await until(
    () => !state().maximized,
    10000,
    "native title double click restores",
  );
  if (errorMode) {
    await page.getByRole("alert").waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
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
        join(evidence, "error.png"),
      ],
      { windowsHide: true },
    );
  }

  // DOM clicks address only this isolated window; no desktop activation or input.
  await page
    .getByRole("button", { name: "Maximizar", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.getByRole("button", { name: "Restaurar", exact: true }).waitFor();
  snapshots.push(state());
  assert.equal(snapshots.at(-1)?.maximized, true);
  await page
    .getByRole("button", { name: "Restaurar", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.getByRole("button", { name: "Maximizar", exact: true }).waitFor();
  snapshots.push(state());
  assert.equal(snapshots.at(-1)?.maximized, false);
  if (!errorMode) {
    await page
      .getByRole("switch", { name: "Empezar minimizado", exact: true })
      .evaluate((button) => (button as HTMLElement).click());
    const discard = page.getByRole("button", {
      name: "Descartar cambio pendiente",
      exact: true,
    });
    await discard.waitFor();
    await page
      .getByRole("button", { name: "Cerrar ventana", exact: true })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await until(
      () => log.includes("HUB_QA_CLOSE_BLOCKED"),
      10000,
      "failed save vetoes custom close",
    );
    assert.equal(child.exitCode, null);
    await discard.evaluate((button) => (button as HTMLButtonElement).click());
    await discard.waitFor({ state: "detached" });
  }
  await page
    .getByRole("button", { name: "Minimizar", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await until(() => state().minimized, 15000, "Win32 confirms minimized");
  snapshots.push(state());
  const closeDeadline = performance.now() + 10000;
  const closed = page.waitForEvent("close", { timeout: 10000 });
  await page
    .getByRole("button", { name: "Cerrar ventana", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await closed;
  // connectOverCDP's close implementation only detaches the debugger transport.
  // The application must still exit itself with code 0 within the same deadline.
  await browser.close();
  browser = undefined;
  await until(
    () => child.exitCode !== null,
    Math.max(1, closeDeadline - performance.now()),
    "guarded close after discard",
  );
  assert.equal(child.exitCode, 0);
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        pid: child.pid,
        data,
        snapshots,
        dragged,
        interactiveHitTest: true,
        captionDrag: true,
        captionDoubleClick: true,
        errorMode,
        theme: light ? "light" : "dark",
        closeVeto: !errorMode,
        closedAfterDiscard: !errorMode,
        exitCode: child.exitCode,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null) {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      if (child.exitCode === null) child.kill();
    }
  }
  await writeFile(join(evidence, "stderr.log"), log);
}
