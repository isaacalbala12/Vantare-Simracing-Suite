import { useEffect, useRef, useState } from "react";
import type { StrategyApplicationClient, StrategyPlanSummaryV1 } from "../../strategy/strategy-application-client";
import { filterPlans, loadStrategyLibrary, sortPlans, type StrategyLibrary } from "../../strategy/strategy-library";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { openRecordedDraft, type StoredRecordedDraft } from "./strategy-recorded-persistence";

function recordedIdentity(plan: StrategyPlanSummaryV1): boolean {
  const prefix = "recorded-plan:";
  return plan.variantId === "recorded-main" && plan.planId.startsWith(prefix) && plan.planId.length > prefix.length;
}

function recordedDraft(plan: StrategyPlanSummaryV1): boolean {
  return recordedIdentity(plan) && plan.hasDraft
    && plan.draftId === `recorded-draft:${plan.planId.slice("recorded-plan:".length)}`;
}

/** Lists native summaries only. A selection opens and validates exactly one payload. */
export function useRecordedLibrary(application: StrategyApplicationClient<RecordedDraftPayload>) {
  const [library, setLibrary] = useState<StrategyLibrary>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    void loadStrategyLibrary(application, `recorded-list:${globalThis.crypto.randomUUID()}`).then(result => {
      if (!current) return;
      setLibrary(result); setStatus("ready"); setError("");
    }, failure => {
      if (!current) return;
      setStatus("error"); setError(failure instanceof Error ? failure.message : "recorded_library_unavailable");
    });
    return () => { current = false; };
  }, [application, retry]);
  const all = library?.plans.filter(recordedIdentity) ?? [];
  const drafts = all.filter(recordedDraft);
  return {
    status, error, opening, query, setQuery,
    plans: sortPlans(filterPlans(drafts, { query }), "recent"),
    savedPlans: sortPlans(filterPlans(all, { query, onlySaved: true }), "recent"),
    repositoryVersion: status === "ready" ? library?.repositoryVersion : undefined,
    recoveredFromBackup: library?.recoveredFromBackup ?? false,
    refresh: () => { if (!pending.current) { setStatus("loading"); setError(""); setRetry(value => value + 1); } },
    open: async (draftId: string): Promise<StoredRecordedDraft | undefined> => {
      const selected = drafts.find(plan => plan.draftId === draftId);
      if (pending.current || status !== "ready" || !selected) return undefined;
      pending.current = true; setOpening(true); setError("");
      try {
        const opened = await openRecordedDraft(application, draftId);
        if (opened.document.planId !== selected.planId || opened.document.variantId !== selected.variantId
          || opened.document.payload.eventId !== selected.planId.slice("recorded-plan:".length)) throw new Error("recorded_plan_identity_mismatch");
        return alive.current ? opened : undefined;
      } catch (failure) {
        if (alive.current) setError(failure instanceof Error ? failure.message : "recorded_open_failed");
        return undefined;
      } finally {
        pending.current = false;
        if (alive.current) setOpening(false);
      }
    },
  };
}
