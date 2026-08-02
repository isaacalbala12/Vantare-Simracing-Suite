import type { Capability } from "../../lib/license-types";
import type { TestingCenterChannel, VantareBuildChannel } from "./contracts";

export function resolveTestingCenterChannel(
  buildChannel: VantareBuildChannel | null | undefined,
  capabilities: readonly Capability[] | undefined,
): TestingCenterChannel | null {
  if (buildChannel === "nightly" && capabilities?.includes("vantare.channel.nightly")) return "nightly";
  if (buildChannel === "testers" && capabilities?.includes("vantare.channel.testers")) return "testers";
  return null;
}
