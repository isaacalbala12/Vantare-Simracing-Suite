import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function packageVersion(value = process.env.VANTARE_VERSION ?? "0.0.0") {
  if (
    value.trim() !== value ||
    !/^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$/.test(
      value,
    ) ||
    value.split(".").some((part) => Number(part) > 65535)
  )
    throw new Error("Invalid VANTARE_VERSION");
  return value;
}

export function packageSource(project: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: project,
      encoding: "utf8",
      windowsHide: true,
    });
  const paths = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    ".",
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const source = createHash("sha256");
  for (const path of paths) {
    if (path.split(/[\\/]/).some((part) => part.startsWith(".env")))
      throw new Error("Source provenance rejects .env before reading");
    const file = join(project, path);
    const metadata = lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error("Source provenance requires regular files");
    source.update(`${path}\0${digest(readFileSync(file))}\0`);
  }
  return {
    source_sha: git("rev-parse", "HEAD").trim(),
    source_dirty:
      git("status", "--porcelain", "--untracked-files=normal").trim().length >
      0,
    // Includes uncommitted and untracked Hub sources, excluding ignored outputs.
    source_tree_sha256: source.digest("hex"),
  };
}

export function packageBuild(project: string) {
  return {
    version: packageVersion(),
    qa: process.env.VANTARE_HUB_QA_BUILD === "1",
    ...packageSource(project),
  };
}
export function assertPackageBuild(
  found: unknown,
  expected: ReturnType<typeof packageBuild>,
) {
  if (
    !found ||
    typeof found !== "object" ||
    JSON.stringify(Object.entries(found).sort()) !==
      JSON.stringify(Object.entries(expected).sort())
  )
    throw new Error(
      "Stale or incompatible Hub build; rebuild before packaging",
    );
}

export async function packageFiles(directory: string) {
  const paths: string[] = [];
  async function visit(folder: string) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".env"))
        throw new Error("Package rejects .env before reading");
      if (entry.isSymbolicLink()) throw new Error("Package rejects links");
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error("Package requires regular files");
    }
  }
  await visit(directory);
  return paths.sort();
}
export async function inventoryPackage(directory: string) {
  for (const path of await packageFiles(directory)) {
    if (path.toLowerCase().endsWith(".exe"))
      await writeFile(
        `${path}.sha256`,
        `${digest(await readFile(path))}  ${basename(path)}\n`,
      );
  }
  const files = [];
  for (const path of await packageFiles(directory)) {
    const bytes = await readFile(path);
    files.push({
      path: relative(directory, path).replaceAll("\\", "/"),
      size: bytes.length,
      sha256: digest(bytes),
    });
  }
  return files;
}

export async function verifyPackageFiles(
  directory: string,
  expected: Awaited<ReturnType<typeof inventoryPackage>>,
) {
  const paths = (await packageFiles(directory)).map((path) =>
    relative(directory, path).replaceAll("\\", "/"),
  );
  if (
    JSON.stringify(paths) !== JSON.stringify(expected.map((file) => file.path))
  )
    throw new Error("Package members changed");
  for (const file of expected) {
    const bytes = await readFile(join(directory, file.path));
    if (bytes.length !== file.size || digest(bytes) !== file.sha256)
      throw new Error(`Package integrity failed: ${file.path}`);
  }
}
