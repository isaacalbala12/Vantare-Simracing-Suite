import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { PNG } from "pngjs";

const project = resolve(import.meta.dirname, "..");
const repository = resolve(project, "../..");
const suite = resolve(project, "..");
const assets = join(project, "src/renderer/assets/widgets/thumbs");
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
interface Photo {
  kind: string;
  width: number;
  height: number;
  scale: 1;
  source: string;
  sourceSha256: string;
  format: "snapshot" | "sequence";
  ready: boolean;
  note: string;
  engineCommit: string | null;
  capturedAt: string | null;
  anonymousSha256?: string;
}
interface Manifest {
  version: 1;
  status: string;
  defaultsSha256: string;
  scale: 1;
  engineCommit: string | null;
  executableSha256: string | null;
  prerequisites: string[];
  widgets: Photo[];
}
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
export function pngDimensions(bytes: Buffer, width: number, height: number) {
  assert.equal(bytes[24], 8, "PNG must use 8-bit channels");
  assert.equal(bytes[25], 6, "PNG must have RGBA channels");
  const decoded = PNG.sync.read(bytes);
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
}
// Names are the sole changed fields. Identity mapping is stable across a sequence.
export function anonymize(snapshots: unknown[]) {
  const copies = structuredClone(snapshots) as Array<{
    state: {
      cars: Array<{ id: number; driver_name: string }>;
      player: { car: number | null };
    };
  }>;
  const ids = [
    ...new Set(
      copies.flatMap((photo) => photo.state.cars.map((car) => car.id)),
    ),
  ].sort((a, b) => a - b);
  for (const photo of copies)
    for (const car of photo.state.cars)
      car.driver_name =
        car.id === photo.state.player.car
          ? "Tú"
          : `Piloto de ejemplo ${ids.indexOf(car.id) + 1}`;
  return copies;
}
async function load() {
  const manifest = JSON.parse(
    await readFile(join(assets, "manifest.json"), "utf8"),
  ) as Manifest;
  assert.equal(manifest.version, 1);
  assert.equal(manifest.scale, 1);
  const defaultsBytes = await readFile(
    join(suite, "native/hub-host/data/widget-defaults.json"),
  );
  assert.equal(
    digest(defaultsBytes),
    manifest.defaultsSha256,
    "Defaults changed; refresh the recipe",
  );
  const defaults = JSON.parse(defaultsBytes.toString("utf8")).widgets as Record<
    string,
    { settings: unknown; size: { width: number; height: number } }
  >;
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.kind).sort(),
    Object.keys(defaults).sort(),
  );
  for (const item of manifest.widgets) {
    assert.match(item.kind, /^[a-z][a-z0-9-]*$/);
    assert.equal(item.scale, 1);
    assert.equal(item.width, defaults[item.kind].size.width);
    assert.equal(item.height, defaults[item.kind].size.height);
    assert.ok(
      item.source.startsWith("native/ui/fixtures/telemetry-real/") &&
        item.source.endsWith(".json"),
    );
    assert.equal(
      digest(await readFile(resolve(suite, item.source))),
      item.sourceSha256,
      `Corpus changed: ${item.kind}`,
    );
  }
  return { manifest, defaults };
}
function requirePushedWorktrees() {
  const paths = git("worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice(9));
  for (const path of paths) {
    const status = execFileSync(
      "git",
      ["-C", path, "status", "--porcelain", "--untracked-files=normal"],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    assert.equal(status, "", `Worktree has unsaved work: ${basename(path)}`);
    const ahead = execFileSync(
      "git",
      ["-C", path, "rev-list", "--count", "HEAD", "--not", "--remotes=origin"],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    assert.equal(
      ahead,
      "0",
      `Worktree has commits not pushed: ${basename(path)}`,
    );
  }
}
async function verifyExecutable(executable: string, receiptPath: string) {
  assert.ok(!basename(receiptPath).startsWith(".env"));
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const current = git("rev-parse", "origin/nightly");
  assert.equal(
    receipt.nativeTree,
    git("rev-parse", `${current}:vantare-v2/native`),
  );
  assert.ok(
    Array.isArray(receipt.features) &&
      receipt.features.includes("parity-capture"),
  );
  assert.equal(
    receipt.sourceCommit,
    current,
    "Receipt must verify origin/nightly",
  );
  assert.equal(
    receipt.uiTree,
    git("rev-parse", `${current}:vantare-v2/native/ui`),
  );
  assert.equal(
    receipt.assetsTree,
    git("rev-parse", `${current}:vantare-v2/native/assets`),
  );
  assert.ok(receipt.method === "compiled" || receipt.method === "verified");
  assert.ok(
    typeof receipt.evidence === "string" && receipt.evidence.length > 0,
    "Compilation/verification evidence required",
  );
  const sha = digest(await readFile(executable));
  assert.equal(receipt.binarySha256, sha);
  return { commit: current, sha };
}
async function capture(executable: string, batch: string) {
  const deaths =
    "D:/VantareServer/evidence/hub-web/diagnostico-capturas-20261111/muertes.md";
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = await new Promise<number>((resolveCode, reject) => {
      const child = spawn(executable, ["--capture-batch", batch], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stop = () => {
        child.kill();
        reject(new Error("Capture interrupted"));
      };
      const unlisten = () => {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      let idle: ReturnType<typeof setTimeout>;
      const arm = () => {
        clearTimeout(idle);
        idle = setTimeout(() => {
          child.kill();
          reject(new Error("Workshop made no progress for ten minutes"));
        }, 600_000);
      };
      arm();
      child.stdout.on("data", (chunk) => {
        arm();
        process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
      });
      child.once("error", (error) => {
        clearTimeout(idle);
        unlisten();
        reject(error);
      });
      child.once("exit", (value) => {
        clearTimeout(idle);
        unlisten();
        resolveCode(value ?? 1);
      });
    });
    if (code === 0) return;
    const hex = (code >>> 0).toString(16).toUpperCase().padStart(8, "0");
    if (!/^(C000|8013)/.test(hex)) throw new Error(`Workshop failed: ${code}`);
    const line = `${new Date().toISOString()} · vantare-workshop · 0x${hex} · receta de miniaturas, intento ${attempt + 1}\n`;
    await writeFile(deaths, line, { flag: "a" });
    if (attempt === 1)
      throw new Error(
        "Two consecutive native process deaths; report to the orchestrator",
      );
  }
}
export async function run(args: string[]) {
  const { manifest, defaults } = await load();
  if (!args.includes("--capture")) {
    console.log(
      JSON.stringify(
        {
          status: "deferred",
          prerequisites: manifest.prerequisites,
          widgets: manifest.widgets.map(({ kind, source, ready, note }) => ({
            kind,
            source,
            ready,
            note,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  assert.equal(process.platform, "win32", "GPUI capture requires Windows");
  const option = (name: string) => {
    const index = args.indexOf(name);
    assert.ok(index >= 0 && args[index + 1], `${name} required`);
    return args[index + 1];
  };
  const executable = resolve(option("--workshop")),
    receipt = resolve(option("--provenance"));
  const provenance = await verifyExecutable(executable, receipt);
  assert.ok(
    manifest.widgets.every((item) => item.ready),
    "Real active samples / longer histories still pending; keep the SVG fallback",
  );
  const tasks = execFileSync("tasklist", ["/FO", "CSV", "/NH"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.ok(
    !/"(?:cargo|rustc|clippy-driver|vantare-workshop)\.exe"/i.test(tasks),
    "Wait for Rust and other workshop processes to finish",
  );
  requirePushedWorktrees();
  const qa = resolve(option("--qa-root")),
    directory = join(qa, `thumbs-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const lock = "D:/VantareServer/qa/captura.lock";
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      console.log("Waiting for captura.lock");
      await new Promise((done) => setTimeout(done, 60_000));
    }
  }
  try {
    requirePushedWorktrees();
    const requests = [];
    for (const item of manifest.widgets) {
      const input = JSON.parse(
        await readFile(resolve(suite, item.source), "utf8"),
      );
      const snapshots = anonymize(item.format === "sequence" ? input : [input]);
      const bytes = Buffer.from(
        JSON.stringify(item.format === "sequence" ? snapshots : snapshots[0]),
      );
      const scene = join(directory, `${item.kind}.json`);
      await writeFile(scene, bytes);
      item.anonymousSha256 = digest(bytes);
      requests.push({
        scene,
        output: join(directory, `${item.kind}.png`),
        widget: item.kind,
        settings: defaults[item.kind].settings,
        until: snapshots.length,
        parameters: { language: "es" },
      });
    }
    const batch = join(directory, "batch.json");
    await writeFile(batch, JSON.stringify(requests, null, 2));
    await capture(executable, batch);
    for (const item of manifest.widgets)
      pngDimensions(
        await readFile(join(directory, `${item.kind}.png`)),
        item.width,
        item.height,
      );
    // Publish only after every PNG passes: a failed run keeps the checked-in assets.
    const date = new Date().toISOString();
    for (const item of manifest.widgets) {
      await copyFile(
        join(directory, `${item.kind}.png`),
        join(assets, `${item.kind}.png`),
      );
      item.engineCommit = provenance.commit;
      item.capturedAt = date;
    }
    manifest.status = "captured";
    manifest.engineCommit = provenance.commit;
    manifest.executableSha256 = provenance.sha;
    await writeFile(
      join(assets, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  } finally {
    await rmdir(lock);
  }
}
if (import.meta.main) await run(process.argv.slice(2));
