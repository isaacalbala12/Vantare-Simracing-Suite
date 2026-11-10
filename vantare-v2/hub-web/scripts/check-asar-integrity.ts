import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { chromium } from "playwright-core";
import { shellText } from "../src/renderer/i18n/shell.es.ts";
import { verifyQaFuses } from "./qa-fuses.ts";
import { requiredPath } from "./qa-paths.ts";

const candidate = requiredPath("VANTARE_HUB_CANDIDATE_ROOT");
await readFile(join(candidate, "QA-ONLY.txt"));
const state = JSON.parse(await readFile(join(candidate, "state.json"), "utf8"));
const generation = state.active.generation;
assert.match(generation, /^[a-f0-9]{32}$/);
const directory = join(candidate, "generations", generation);
const manifestBytes = await readFile(join(directory, "manifest.json"));
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
assert.equal(digest(manifestBytes), state.active.manifest_sha256);
const source = join(directory, "hub-ui");
await verifyQaFuses(source);
const asarSha256 = digest(await readFile(join(source, "resources/app.asar")));
const manifest = JSON.parse(manifestBytes.toString());
assert.equal(
  manifest.files.find(
    (file: { path: string }) => file.path === "hub-ui/resources/app.asar",
  )?.sha256,
  asarSha256,
);

const root = join(
  requiredPath("VANTARE_HUB_QA_ROOT"),
  `asar-${randomBytes(8).toString("hex")}`,
);
await mkdir(root, { recursive: true });
const results = [];
for (const mode of ["original", "header", "payload"] as const) {
  const folder = join(root, mode);
  await cp(source, folder, { recursive: true });
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
          .getByText(shellText.waitingSimulator, { exact: false })
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
    if (child.exitCode === null) {
      const exited = new Promise<void>((accept) =>
        child.once("exit", () => accept()),
      );
      child.kill();
      await exited;
    }
    for (const owned of [folder, join(root, `data-${mode}`)]) {
      assert.ok(resolve(owned).startsWith(resolve(root) + sep));
      await rm(owned, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  }
}
await writeFile(
  join(root, "result.json"),
  JSON.stringify(
    {
      candidate,
      generation,
      manifestSha256: digest(manifestBytes),
      asarSha256,
      tests: results,
    },
    null,
    2,
  ),
);
console.log(join(root, "result.json"));
