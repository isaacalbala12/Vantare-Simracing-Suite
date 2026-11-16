import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  assertPackageBuild,
  inventoryPackage,
  packageBuild,
  packageSource,
  packageVersion,
  verifyPackageFiles,
} from "../scripts/package-inventory.ts";

const roots: string[] = [];
async function root() {
  const path = await mkdtemp(join(tmpdir(), "vantare-package-"));
  roots.push(path);
  return path;
}
afterEach(async () => {
  for (const path of roots.splice(0))
    await rm(path, { recursive: true, force: true });
});
it.each(["0.0.0", "1.2.3", "65535.65535.65535"])(
  "accepts installer version %s",
  (version) => {
    expect(packageVersion(version)).toBe(version);
  },
);
it.each(["", "1.2", "01.2.3", "65536.0.0", "1.2.3-beta", "1.2.3\n"])(
  "rejects invalid installer version %j",
  (version) => {
    expect(() => packageVersion(version)).toThrow();
  },
);
it("detects stale uncommitted and untracked sources without consulting ignored outputs", async () => {
  const directory = await root();
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: directory,
      windowsHide: true,
      stdio: "pipe",
    });
  git("init");
  await writeFile(
    join(directory, ".gitignore"),
    "out/\nelectron.vite.config.ts.*.mjs\n",
  );
  await writeFile(join(directory, "source.ts"), "first");
  git("add", ".");
  git(
    "-c",
    "user.name=QA",
    "-c",
    "user.email=qa@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "fixture",
  );
  const clean = packageBuild(directory);
  expect(clean.source_dirty).toBe(false);
  expect(clean.source_sha).toMatch(/^[a-f0-9]{40}$/);
  await mkdir(join(directory, "out"));
  await writeFile(join(directory, "out/build.js"), "ignored");
  await writeFile(
    join(directory, "electron.vite.config.ts.179-abc.mjs"),
    "temporary bundled config",
  );
  assertPackageBuild(packageBuild(directory), clean);
  await writeFile(join(directory, "source.ts"), "second");
  const dirty = packageBuild(directory);
  expect(dirty.source_dirty).toBe(true);
  expect(() => assertPackageBuild(clean, dirty)).toThrow();
  await writeFile(join(directory, "source.ts"), "third");
  expect(() => assertPackageBuild(packageBuild(directory), dirty)).toThrow();
  await writeFile(join(directory, "extra.ts"), "untracked");
  expect(packageBuild(directory).source_tree_sha256).not.toBe(
    dirty.source_tree_sha256,
  );
  expect(() =>
    assertPackageBuild({ ...dirty, version: "2.0.0" }, dirty),
  ).toThrow();
  expect(() =>
    assertPackageBuild({ ...dirty, qa: !dirty.qa }, dirty),
  ).toThrow();
  expect(() => assertPackageBuild(null, dirty)).toThrow();
  await writeFile(join(directory, ".env.private"), "never read");
  expect(() => packageSource(directory)).toThrow(/before reading/);
  await rm(join(directory, ".env.private"));
  await writeFile(join(directory, ".ENV.PRIVATE"), "never read");
  expect(() => packageSource(directory)).toThrow(/before reading/);
});
it("covers every resource and EXE sidecar and detects mutation, missing and extra files", async () => {
  const directory = await root();
  await mkdir(join(directory, "resources"));
  const contents = {
    "vantare-hub-ui.exe": "inert PE",
    "resources/app.asar": "archive",
    "chrome.dll": "dll",
  };
  for (const [path, bytes] of Object.entries(contents))
    await writeFile(join(directory, path), bytes);
  const files = await inventoryPackage(directory);
  expect(files.map((file) => file.path)).toEqual([
    "chrome.dll",
    "resources/app.asar",
    "vantare-hub-ui.exe",
    "vantare-hub-ui.exe.sha256",
  ]);
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  expect(
    await readFile(join(directory, "vantare-hub-ui.exe.sha256"), "utf8"),
  ).toBe(`${hash("inert PE")}  vantare-hub-ui.exe\n`);
  await verifyPackageFiles(directory, files);
  await writeFile(join(directory, "chrome.dll"), "bad");
  await expect(verifyPackageFiles(directory, files)).rejects.toThrow(
    /integrity/,
  );
  await writeFile(join(directory, "chrome.dll"), "dll");
  await writeFile(join(directory, "extra.dll"), "extra");
  await expect(verifyPackageFiles(directory, files)).rejects.toThrow(/members/);
  await rm(join(directory, "extra.dll"));
  await rm(join(directory, "resources/app.asar"));
  await expect(verifyPackageFiles(directory, files)).rejects.toThrow(/members/);
});
it("rejects links and .env before inventory reads outside the package", async () => {
  const directory = await root();
  const outside = await root();
  await writeFile(join(outside, "keep.txt"), "untouched");
  await symlink(
    outside,
    join(directory, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(inventoryPackage(directory)).rejects.toThrow(/links/);
  await rm(join(directory, "linked"));
  await writeFile(join(directory, ".env.local"), "never read");
  await expect(inventoryPackage(directory)).rejects.toThrow(/before reading/);
  await rm(join(directory, ".env.local"));
  await writeFile(join(directory, ".ENV.LOCAL"), "never read");
  await expect(inventoryPackage(directory)).rejects.toThrow(/before reading/);
  expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("untouched");
});
