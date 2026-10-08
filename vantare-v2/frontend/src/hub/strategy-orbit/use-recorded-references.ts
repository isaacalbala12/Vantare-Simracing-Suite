import { useEffect, useState } from "react";
import type { StrategyApplicationClient, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import { prepareRecordedPlanningInputs } from "./strategy-recorded-planning-inputs";
import type { RecordedSession } from "./strategy-recorded-session";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";

export type RecordedReferencesState =
  | { readonly status: "manual" | "no_sources" | "no_combination" | "repository_unavailable" | "open_sources" | "loading" }
  | { readonly status: "ready"; readonly planning: StrategyPlanningInputsV2 }
  | { readonly status: "error"; readonly message: string };

type Response = { readonly key: string; readonly planning?: StrategyPlanningInputsV2; readonly error?: string };

/** A read-only preview of the draft's pinned revisions. It never creates an event. */
export function useRecordedReferences(
  draft: RecordedWizardDraft,
  repositoryVersion: number | undefined,
  sessions: readonly RecordedSession[],
  application: StrategyApplicationClient<unknown>,
) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<Response>();
  // A live source handle may have a newer head. The command still requests the
  // exact four-field revision pinned in the draft, and validates that response.
  const handles = draft.sessions.map(ref => sessions.find(item => item.revision.sessionId === ref.sessionId
    && item.revision.baseDigest === ref.baseDigest)?.opened.sessionId ?? null);
  const selectionKey = JSON.stringify([draft.mode, repositoryVersion, draft.combination, draft.sessions, handles]);
  const key = `${selectionKey}:${attempt}`;
  const prerequisite: RecordedReferencesState | undefined = draft.mode === "manual" ? { status: "manual" }
    : draft.sessions.length === 0 ? { status: "no_sources" }
      : !draft.combination ? { status: "no_combination" }
        : repositoryVersion === undefined ? { status: "repository_unavailable" }
          : handles.some(handle => !handle) ? { status: "open_sources" } : undefined;
  const canRequest = prerequisite === undefined;

  useEffect(() => {
    if (!canRequest) return;
    const [, version, combination, refs] = JSON.parse(selectionKey) as [RecordedWizardDraft["mode"], number, RecordedWizardDraft["combination"], RecordedWizardDraft["sessions"]];
    let current = true;
    let pending = true;
    const commandId = `recorded-reference-${globalThis.crypto.randomUUID()}`;
    void prepareRecordedPlanningInputs(application, { combination, sessions: refs }, version, commandId, new Date().toISOString())
      .then(planning => { if (current) setResponse({ key, planning }); }, error => {
        if (current) setResponse({ key, error: error instanceof Error ? error.message : String(error) });
      }).finally(() => { pending = false; });
    return () => { current = false; if (pending) application.cancel(commandId); };
  }, [application, canRequest, key, selectionKey]);

  const state: RecordedReferencesState = prerequisite ?? (response?.key !== key ? { status: "loading" }
    : response.planning ? { status: "ready", planning: response.planning }
      : { status: "error", message: response.error ?? "recorded_reference_unavailable" });
  return { state, retry: () => setAttempt(value => value + 1) };
}
