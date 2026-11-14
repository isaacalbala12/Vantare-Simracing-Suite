import { prepareResidentRemoval } from "../check-resident-removal.ts";
import type { VisualScene } from "./scenes.ts";
export const residentRemovalScenes: Record<string, VisualScene> = {};
for (const state of [
  "ready",
  "owned",
  "unknown",
  "unsupported",
  "accepted",
  "rejected",
  "failed",
  "finished",
  "timeout",
  "gap",
  "restart",
]) {
  residentRemovalScenes[`launcher-removal-${state}`] = {
    mock: `launcher-removal-${state}`,
    prepare: (page) => prepareResidentRemoval(page, state),
  };
}
