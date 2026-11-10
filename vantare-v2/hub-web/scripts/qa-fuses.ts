import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  getCurrentFuseWire,
} from "@electron/fuses";

export async function verifyQaFuses(folder: string) {
  const wire = await getCurrentFuseWire(join(folder, "vantare-hub-ui.exe"));
  assert.equal(wire.version, FuseVersion.V1);
  for (const [option, enabled] of [
    [FuseV1Options.RunAsNode, false],
    [FuseV1Options.EnableCookieEncryption, true],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
    [FuseV1Options.EnableNodeCliInspectArguments, false],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true],
    [FuseV1Options.OnlyLoadAppFromAsar, true],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, false],
  ] as const)
    assert.equal(
      wire[option],
      enabled ? FuseState.ENABLE : FuseState.DISABLE,
      `Fuse ${option}`,
    );
  assert.deepEqual((await readdir(join(folder, "locales"))).sort(), [
    "en-US.pak",
    "es.pak",
  ]);
  return wire;
}
