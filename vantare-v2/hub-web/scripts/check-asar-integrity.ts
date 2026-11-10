import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { requiredPath } from "./qa-paths.ts";

const root = join(
  requiredPath("VANTARE_HUB_QA_ROOT"),
  `asar-${randomBytes(8).toString("hex")}`,
);
await mkdir(root, { recursive: true });
const results = [];
for (const mode of ["original", "header", "payload"] as const) {
  const folder = join(root, mode);
  await cp(requiredPath("VANTARE_HUB_UI_PACKAGE"), folder, { recursive: true });
  const path = join(folder, "resources/app.asar");
  const bytes = await readFile(path);
  if (mode === "header") {
    const headerLength = bytes.readUInt32LE(12);
    const header = bytes.subarray(16, 16 + headerLength).toString();
    const hash = header.indexOf('"hash":"') + 8;
    assert.ok(hash >= 8);
    bytes[16 + hash] = bytes[16 + hash] === 48 ? 49 : 48;
  } else if (mode === "payload") {
    const header = JSON.parse(
      bytes.subarray(16, 16 + bytes.readUInt32LE(12)).toString(),
    );
    const main = header.files.out.files.main.files["index.js"];
    bytes[8 + bytes.readUInt32LE(4) + Number(main.offset)] ^= 1;
  }
  if (mode !== "original") await writeFile(path, bytes);
  const env: Record<string, string | undefined> = {
    ...process.env,
    VANTARE_HUB_HOST: "mock",
    VANTARE_HUB_DATA_DIR: join(root, `data-${mode}`),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    join(folder, "vantare-hub-ui.exe"),
    ["--remote-debugging-port=0"],
    { env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`asar ${mode} deadline: ${stderr}`)),
      30000,
    );
  });
  try {
    if (mode === "original") {
      const endpoint = await Promise.race([
        deadline,
        new Promise<string>((accept, reject) => {
          child.stderr.on("data", () => {
            const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) accept(match[1]);
          });
          child.once("exit", (code) =>
            reject(new Error(`original exited ${code}: ${stderr}`)),
          );
          child.once("error", reject);
        }),
      ]);
      const browser = await chromium.connectOverCDP(endpoint);
      try {
        const context = browser.contexts()[0];
        const page = context.pages()[0] ?? (await context.waitForEvent("page"));
        await page
          .getByText("Núcleo simulado", { exact: false })
          .first()
          .waitFor();
      } finally {
        await browser.close();
      }
    } else {
      const code = await Promise.race([
        deadline,
        new Promise<number | null>((accept, reject) => {
          child.once("exit", accept);
          child.once("error", reject);
        }),
      ]);
      assert.notEqual(code, 0);
      assert.match(stderr, /integrity|hash/i);
    }
    results.push({ mode, passed: true, stderr });
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null) child.kill();
  }
}
await writeFile(join(root, "result.json"), JSON.stringify(results, null, 2));
console.log(join(root, "result.json"));
