import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const evidence = process.env.VANTARE_HUB_EVIDENCE ?? resolve("test-results");
await mkdir(evidence, { recursive: true });
const child = spawn(
  resolve("release/package/vantare-hub-ui-win32-x64/vantare-hub-ui.exe"),
  ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
  {
    env: {
      ...process.env,
      VANTARE_HUB_HOST: "mock",
      VANTARE_HUB_DATA_DIR:
        process.env.VANTARE_HUB_DATA_DIR ?? resolve("test-results/qa"),
    },
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  },
);
const endpoint = await new Promise<string>((accept, reject) => {
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("Electron CDP startup timed out"));
  }, 20000);
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      clearTimeout(timer);
      accept(match[1]);
    }
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`Electron exited ${code}`));
  });
});
const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = browser.contexts()[0];
  const window = context.pages()[0] ?? (await context.waitForEvent("page"));
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  window.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await window
    .getByRole("status")
    .filter({ hasText: "Núcleo simulado" })
    .waitFor();
  const result = await window.evaluate(() => ({
    node: typeof (globalThis as Record<string, unknown>).require,
    bridge: Object.keys(globalThis.window.vantare ?? {}),
  }));
  if (
    result.node !== "undefined" ||
    result.bridge.join(",") !== "platform,connect"
  )
    throw new Error("Renderer isolation failed");
  await window.screenshot({ path: resolve(evidence, "esqueleto.png") });
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    resolve(evidence, "smoke.json"),
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
} finally {
  await browser.close();
  child.kill();
}
