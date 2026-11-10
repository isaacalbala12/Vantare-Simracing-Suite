import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { packager } from "@electron/packager";

const qa = process.env.VANTARE_HUB_QA_BUILD === "1";
const project = resolve(import.meta.dirname, "..");
const release = join(project, "release");
const staging = join(release, qa ? "staging-qa" : "staging");
if (dirname(staging) !== release)
  throw new Error("Staging must remain inside the project release directory");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(join(project, qa ? "out-qa" : "out"), join(staging, "out"), {
  recursive: true,
});
await writeFile(
  join(staging, "package.json"),
  JSON.stringify({
    name: "vantare-hub-ui",
    version: "0.0.0",
    main: "out/main/index.js",
    type: "module",
  }),
);
const paths = await packager({
  dir: staging,
  out: join(release, qa ? "package-qa" : "package"),
  name: "vantare-hub-ui",
  platform: "win32",
  arch: "x64",
  electronVersion: "45.2.3",
  asar: true,
  overwrite: true,
  prune: false,
  tmpdir: false,
});
for (const folder of paths) {
  for (const locale of await readdir(join(folder, "locales"))) {
    if (locale !== "es.pak" && locale !== "en-US.pak")
      await rm(join(folder, "locales", locale));
  }
  await flipFuses(join(folder, "vantare-hub-ui.exe"), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  console.log(folder);
}
