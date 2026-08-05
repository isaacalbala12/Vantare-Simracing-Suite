import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

function comparable(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function assertCanonicalContainment(canonicalRoot, candidate, label = "path") {
  const root = comparable(canonicalRoot);
  const target = comparable(path.resolve(candidate));
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`unsafe path outside canonical frontend root (${label}): ${candidate}`);
}

function rejectLink(stats, candidate) {
  if (stats.isSymbolicLink()) {
    throw new Error(`unsafe symbolic link or reparse point: ${candidate}`);
  }
}

export async function canonicalizeFrontendRoot(frontendRoot) {
  const requested = path.resolve(frontendRoot);
  const requestedStats = await lstat(requested);
  rejectLink(requestedStats, requested);
  if (!requestedStats.isDirectory()) throw new Error(`frontend root is not a directory: ${requested}`);
  return realpath(requested);
}

export async function inspectSafePath(canonicalRoot, candidate, { allowMissing = false } = {}) {
  const target = path.resolve(candidate);
  assertCanonicalContainment(canonicalRoot, target);
  const relative = path.relative(canonicalRoot, target);
  const components = relative === "" ? [] : relative.split(path.sep);
  let current = canonicalRoot;
  let currentStats = await lstat(current);
  rejectLink(currentStats, current);

  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    try {
      currentStats = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) {
        return { exists: false, path: target, existingParent: path.dirname(current) };
      }
      throw error;
    }
    rejectLink(currentStats, current);
    const canonicalCurrent = await realpath(current);
    assertCanonicalContainment(canonicalRoot, canonicalCurrent, current);
  }

  return { exists: true, path: target, stats: currentStats, canonicalPath: await realpath(target) };
}

export async function assertSafeDirectory(canonicalRoot, candidate) {
  const inspected = await inspectSafePath(canonicalRoot, candidate);
  if (!inspected.stats.isDirectory()) throw new Error(`expected safe directory: ${candidate}`);
  return inspected;
}

export async function assertSafeFile(canonicalRoot, candidate) {
  const inspected = await inspectSafePath(canonicalRoot, candidate);
  if (!inspected.stats.isFile()) throw new Error(`expected safe file: ${candidate}`);
  return inspected;
}
