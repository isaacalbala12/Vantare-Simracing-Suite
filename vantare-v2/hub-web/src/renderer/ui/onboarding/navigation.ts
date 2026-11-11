import type { OnboardingStep } from "./Frame";
export type OnboardingMotion =
  | { kind: "blocked" }
  | { kind: "page"; step: OnboardingStep }
  | { kind: "finish"; show: true };
export function canAdvance(
  step: OnboardingStep,
  simulators: readonly boolean[],
  styles: readonly boolean[],
): boolean {
  if (step === 1) return simulators.some(Boolean);
  if (step === 2) return styles.some(Boolean);
  return true;
}
/** Requests navigation only: the controller must save consent before committing page 7. */
export function onboardingMotion(
  action: "next" | "back" | "skip",
  step: OnboardingStep,
  allowed: boolean,
): OnboardingMotion {
  if (action === "back")
    return step === 0
      ? { kind: "blocked" }
      : { kind: "page", step: (step - 1) as OnboardingStep };
  if (action === "skip")
    return step < 6 ? { kind: "page", step: 6 } : { kind: "blocked" };
  if (step === 7) return { kind: "finish", show: true };
  return allowed
    ? { kind: "page", step: (step + 1) as OnboardingStep }
    : { kind: "blocked" };
}
