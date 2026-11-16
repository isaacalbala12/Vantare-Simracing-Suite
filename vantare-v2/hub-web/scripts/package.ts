import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { packager } from "@electron/packager";
import {
  assertPackageBuild,
  inventoryPackage,
  packageBuild,
  verifyPackageFiles,
} from "./package-inventory.ts";
import { verifyQaFuses } from "./qa-fuses.ts";

const project = resolve(import.meta.dirname, "..");
const build = packageBuild(project);
const qa = build.qa;
const input = join(project, qa ? "out-qa" : "out");
const release = join(project, "release");
const output = join(release, qa ? "package-qa" : "package");
const receipt = join(output, "package-inventory.json");
// A failed attempt must not leave a previous successful receipt.
await rm(receipt, { force: true });
assertPackageBuild(
  JSON.parse(await readFile(join(input, "main/package-build.json"), "utf8")),
  build,
);
const staging = join(release, qa ? "staging-qa" : "staging");
if (dirname(staging) !== release)
  throw new Error("Staging must remain inside the project release directory");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(input, join(staging, "out"), { recursive: true });
await writeFile(
  join(staging, "package.json"),
  JSON.stringify({
    name: "vantare-hub-ui",
    version: build.version,
    main: "out/main/index.js",
    type: "module",
  }),
);
const paths = await packager({
  dir: staging,
  out: output,
  name: "vantare-hub-ui",
  appVersion: build.version,
  buildVersion: build.version,
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
  await verifyQaFuses(folder);
  const files = await inventoryPackage(folder);
  await verifyPackageFiles(folder, files);
  assertPackageBuild(packageBuild(project), build);
  await writeFile(
    receipt,
    JSON.stringify(
      {
        ...build,
        electron_version: "45.2.3",
        architecture: "windows-x64",
        files,
        bytes: files.reduce((sum, file) => sum + file.size, 0),
        asar_bytes: files.find((file) => file.path === "resources/app.asar")
          ?.size,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ folder, receipt, version: build.version }));
}
