import { useEffect, useRef, useState } from "react";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { createRecordedDraft, saveRecordedDraft, type StoredRecordedDraft } from "./strategy-recorded-persistence";
import { applyRecordedSourceSelection, recordedCombinationOptions } from "./strategy-recorded-proposals";
import { createRecordedWizardDraft, type RecordedCombination, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { useRecordedSessions } from "./use-recorded-sessions";

/** One owner per event, retained while preparation and editor views change. */
export function useRecordedWorkflow({ eventId, repositoryVersion, initial, catalog, application, analysis, onCleanupError }: {
  readonly eventId: string;
  readonly repositoryVersion?: number;
  readonly initial?: StoredRecordedDraft;
  readonly catalog: readonly RecordedCombination[];
  readonly application: StrategyApplicationClient<RecordedDraftPayload>;
  readonly analysis?: AnalysisClient;
  readonly onCleanupError: () => void;
}) {
  const [draft, setDraft] = useState<RecordedWizardDraft>(() => initial ? structuredClone(initial.document.payload.draft) : createRecordedWizardDraft());
  const [stored, setStored] = useState(initial);
  const [view, setView] = useState<"preparation" | "editor">(initial ? "editor" : "preparation");
  const [dirty, setDirty] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const sessions = useRecordedSessions({
    combinationId: draft.combination?.combinationId, revisions: draft.sessions, client: analysis, onCleanupError,
    onApply: async (selected, signal) => {
      signal.throwIfAborted();
      if (pending.current) throw new Error("recorded_save_in_progress");
      const next = applyRecordedSourceSelection(draft, selected, catalog);
      setDraft(next);
      setDirty(true);
    },
  });
  let choices: readonly RecordedCombination[] = [];
  let proposalError = "";
  try { choices = recordedCombinationOptions(catalog, sessions.sessions, draft.combination); }
  catch (failure) { proposalError = failure instanceof Error ? failure.message : "recorded_combination_conflict"; }

  async function save(openEditor: boolean) {
    if (pending.current || sessions.busy) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      if (proposalError) throw new Error(proposalError);
      if (!stored && repositoryVersion === undefined) throw new Error("recorded_repository_unavailable");
      if (initial && initial.document.payload.eventId !== eventId) throw new Error("recorded_event_mismatch");
      const saved = stored
        ? await saveRecordedDraft(application, stored, draft)
        : await createRecordedDraft(application, eventId, draft, repositoryVersion as number);
      if (!alive.current) return;
      setStored(saved);
      setDirty(false);
      if (openEditor) setView("editor");
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : "recorded_save_failed");
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return {
    draft, stored, view, dirty, sessions, choices, proposalError, error, saving,
    busy: saving || sessions.busy,
    change: (next: RecordedWizardDraft) => {
      if (pending.current || sessions.busy) return;
      setDraft(next); setDirty(true); setError("");
    },
    prepare: () => { if (!pending.current && !sessions.busy) setView("preparation"); },
    save: () => save(false),
    openEditor: () => save(true),
  };
}
