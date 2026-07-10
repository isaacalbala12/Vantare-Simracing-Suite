import type { StudioSaveResult } from "./studio-profile-client";

export type DirtyDecision = "save" | "discard" | "cancel";

export async function resolveDirtyNavigation(input: {
  dirty: boolean;
  decide: () => Promise<DirtyDecision>;
  save: () => Promise<StudioSaveResult>;
  discard: () => void;
  continueNavigation: () => void;
}): Promise<"continued" | "cancelled"> {
  if (!input.dirty) {
    input.continueNavigation();
    return "continued";
  }

  const decision = await input.decide();
  if (decision === "cancel") {
    return "cancelled";
  }
  if (decision === "discard") {
    input.discard();
    input.continueNavigation();
    return "continued";
  }

  const saveResult = await input.save();
  if (saveResult.status === "saved") {
    input.continueNavigation();
    return "continued";
  }
  return "cancelled";
}