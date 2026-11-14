// CPU-only export of the existing Electron mock; run with Bun after QA generation.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [root, scene, output] = process.argv.slice(2);
if (!root || !["inicio-base", "studio-base", "launcher-base"].includes(scene) || !output)
  throw new Error("Owned hub-web root, closed base scene and output path required");
const { createMockHost } = await import(pathToFileURL(resolve(root, "src/mock/host.ts")).href);
const host = createMockHost(`visual-dark:${scene}`);
const messages = [];
for (const [index, method] of ["core.get", "home.get", "studio.get", "launcher.get", "launcher.resident.get", "launcher.catalog"].entries()) {
  const reply = host({kind:"request", id:index+1, request:{method}});
  if(reply?.kind !== "response") throw new Error(`Cannot export ${method}`);
  messages.push(reply);
}
for (const topic of ["core", "simStatus", "home", "studio", "launcher", "launcherResident"]) {
  const reply = host({kind:"subscribe", topic});
  if(reply?.kind !== "event") throw new Error(`Cannot export ${topic}`);
  messages.push(reply);
}
await writeFile(output, JSON.stringify(messages, null, 2));
