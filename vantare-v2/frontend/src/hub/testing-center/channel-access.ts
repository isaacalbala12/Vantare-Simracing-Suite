import type { Capability } from "../../lib/license-types";
import type { TestingCenterChannel, VantareBuildChannel } from "./contracts";

export function resolveTestingCenterChannel(
  buildChannel: VantareBuildChannel | null | undefined,
  capabilities: readonly Capability[] | undefined,
): TestingCenterChannel | null {
  if (
    buildChannel === "nightly" &&
    hasAnyCapability(capabilities, [
      "vantare.channel.nightly",
      "vantare.operational.nightly_tester",
      "vantare.operational.owner",
    ])
  ) return "nightly";
  if (
    buildChannel === "testers" &&
    hasAnyCapability(capabilities, [
      "vantare.channel.testers",
      "vantare.operational.tester",
      "vantare.operational.nightly_tester",
      "vantare.operational.owner",
    ])
  ) return "testers";
  return null;
}

function hasAnyCapability(
  capabilities: readonly Capability[] | undefined,
  wanted: readonly Capability[],
): boolean {
  return wanted.some((capability) => capabilities?.includes(capability));
}
