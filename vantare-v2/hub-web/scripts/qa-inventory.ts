import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
/** Existing installer schema, confined to a caller-owned QA generation. */
export async function sealQaGeneration(
  root: string,
  generation: string,
  sourceSha: string,
  buildProfile: "Debug" | "Release" = "Debug",
) {
  const directory = join(root, "generations", generation);
  async function files(folder: string): Promise<string[]> {
    const result: string[] = [];
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (
        folder === directory &&
        ["data", "manifest.json"].includes(entry.name)
      )
        continue;
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error("QA inventory rejects links");
      if (entry.isDirectory()) result.push(...(await files(path)));
      else result.push(path);
    }
    return result.sort();
  }
  for (const path of await files(directory)) {
    if (path.toLowerCase().endsWith(".exe"))
      await writeFile(
        `${path}.sha256`,
        `${hash(await readFile(path))}  ${basename(path)}\n`,
      );
  }
  const members = [];
  for (const path of await files(directory)) {
    const bytes = await readFile(path);
    members.push({
      path: relative(directory, path).replaceAll("\\", "/"),
      size: bytes.length,
      sha256: hash(bytes),
    });
  }
  const manifest = JSON.stringify({
    schema: 1,
    product: "vantare-native",
    candidate: true,
    architecture: "windows-x64",
    version: "0.0.989",
    channel: "nightly",
    data_schema: "opaque-v1",
    source_sha: sourceSha,
    source_dirty: false,
    build_profile: buildProfile,
    files: members,
  });
  await writeFile(join(directory, "manifest.json"), manifest);
  await writeFile(
    join(root, "state.json"),
    JSON.stringify({
      schema: 1,
      product: "vantare-native",
      channel: "nightly",
      active: { generation, manifest_sha256: hash(Buffer.from(manifest)) },
      previous: null,
    }),
  );
  return members;
}
