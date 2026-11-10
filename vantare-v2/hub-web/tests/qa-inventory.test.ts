import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { sealQaGeneration } from "../scripts/qa-inventory";

it("binds every UI resource and executable sidecar to the QA manifest", async () => {
  const namespace = resolve("test-results/inventory");
  const root = join(namespace, randomBytes(8).toString("hex"));
  if (!root.startsWith(`${namespace}\\`) && !root.startsWith(`${namespace}/`))
    throw new Error("outside own QA namespace");
  const generation = "0123456789abcdef0123456789abcdef";
  const folder = join(root, "generations", generation);
  try {
    await mkdir(join(folder, "hub-ui/resources"), { recursive: true });
    await mkdir(join(folder, "bin"));
    await mkdir(join(folder, "data"));
    await writeFile(join(folder, "data/private.json"), "unhashed mutable data");
    for (const path of [
      "hub-ui/resources/app.asar",
      "hub-ui/vantare-hub-ui.exe",
      "bin/vantare-hub.exe",
    ])
      await writeFile(join(folder, path), path);
    const members = await sealQaGeneration(root, generation, "0".repeat(40));
    expect(members.map((member) => member.path)).toEqual([
      "bin/vantare-hub.exe",
      "bin/vantare-hub.exe.sha256",
      "hub-ui/resources/app.asar",
      "hub-ui/vantare-hub-ui.exe",
      "hub-ui/vantare-hub-ui.exe.sha256",
    ]);
    for (const member of members) {
      const bytes = await readFile(join(folder, member.path));
      expect(member.size).toBe(bytes.length);
      expect(member.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
    const manifest = await readFile(join(folder, "manifest.json"));
    const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
    expect(state.active.manifest_sha256).toBe(
      createHash("sha256").update(manifest).digest("hex"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
