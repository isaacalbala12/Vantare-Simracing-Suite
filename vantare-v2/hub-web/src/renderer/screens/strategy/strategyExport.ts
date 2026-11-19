import type {
  StrategyExportTarget,
  StrategyPlanView,
} from "../../../contract/generated/strategy";
import { strategy } from "../../i18n/strategy";
import { canAccept, isAcceptedOnly, isAcceptedOnView } from "./planText";

// What the person sees when they export, as one state of the screen.
export type ExportState =
  | { status: "idle" }
  | { status: "copied" }
  // the window to save the file is open; only the person can close it
  | { status: "waiting" }
  | { status: "saved"; name: string }
  // the window stayed open too long and the host voided it: nothing was written
  | { status: "expired" }
  | { status: "failed"; kind: string; via: "text" | "file" };

export const exportIdle: ExportState = { status: "idle" };

// Which plan an export is about, by what the tab shows: the plan accepted when that
// is what is on view (alone, or the proposal that is that same plan), the proposal
// with its calculation otherwise. `null` when there is nothing to export: no plan,
// no solution, a calculation running or adjustments that are not recalculated.
export function exportTarget(
  plan: StrategyPlanView,
): StrategyExportTarget | null {
  if (isAcceptedOnly(plan) || isAcceptedOnView(plan))
    return { kind: "accepted" };
  if (canAccept(plan) && plan.computeId !== null)
    return { kind: "proposal", computeId: plan.computeId };
  return null;
}

type Texts =
  (typeof strategy.calc.export.errors)[keyof typeof strategy.calc.export.errors];

// The words for a refusal: what happened and, when trying again can help, the
// button. A typed error with no entry of its own says the generic one.
export function exportFailure(
  kind: string,
  via: "text" | "file",
): { title: string; detail: string; retry?: string } {
  const t = strategy.calc.export;
  const known = (t.errors as Record<string, Texts>)[kind];
  // copying only fails in the clipboard: say it, and let the person try again
  const found: Texts =
    known ??
    (via === "text" && kind === "io" ? t.errors.copyFailed : t.errors.other);
  return {
    title: via === "text" ? t.failed.copyTitle : t.failed.title,
    detail: found.detail,
    retry: "retry" in found ? found.retry : undefined,
  };
}
