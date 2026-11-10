import { readdir } from "node:fs/promises";
import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  getCurrentFuseWire,
} from "@electron/fuses";
import { beforeEach, expect, it, vi } from "vitest";
import { verifyQaFuses } from "../scripts/qa-fuses.ts";

vi.mock("@electron/fuses", async (original) => ({
  ...(await original<typeof import("@electron/fuses")>()),
  getCurrentFuseWire: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ readdir: vi.fn() }));
const expected = [
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
] as const;
beforeEach(() => {
  vi.mocked(getCurrentFuseWire).mockResolvedValue({
    version: FuseVersion.V1,
    ...Object.fromEntries(expected),
  });
  // readdir's directory-entry overload is irrelevant to the production string call.
  vi.mocked(readdir).mockResolvedValue(["en-US.pak", "es.pak"] as never);
});
it("accepts all seven final fuse states and exactly the two approved locales", async () => {
  await expect(verifyQaFuses("QA")).resolves.toBeDefined();
});
it.each(expected)("rejects changed fuse %s", async (option, state) => {
  vi.mocked(getCurrentFuseWire).mockResolvedValue({
    version: FuseVersion.V1,
    ...Object.fromEntries(expected),
    [option]: state === FuseState.ENABLE ? FuseState.DISABLE : FuseState.ENABLE,
  });
  await expect(verifyQaFuses("QA")).rejects.toThrow();
});
it("rejects an extra locale", async () => {
  vi.mocked(readdir).mockResolvedValue([
    "en-US.pak",
    "es.pak",
    "de.pak",
  ] as never);
  await expect(verifyQaFuses("QA")).rejects.toThrow();
});
