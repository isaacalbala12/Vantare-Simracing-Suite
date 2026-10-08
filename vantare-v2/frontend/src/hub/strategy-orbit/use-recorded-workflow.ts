import { useEffect, useRef, useState } from "react";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { createRecordedDraft, saveRecordedDraft, type StoredRecordedDraft } from "./strategy-recorded-persistence";
import { applyRecordedSourceSelection, recordedCombinationOptions } from "./strategy-recorded-proposals";
import { createRecordedWizardDraft, type RecordedCombination, type RecordedWizardDraft } from "./strategy-recorded-wizard";
import { useRecordedSessions } from "./use-recorded-sessions";
import type { RecordedSession } from "./strategy-recorded-session";

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
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const sessions = useRecordedSessions({
    combinationId: draft.combination?.combinationId, revisions: draft.sessions, client: analysis, onCleanupError,
    onRevision: async (session, signal) => {
      signal.throwIfAborted();
      if (pending.current) throw new Error("recorded_save_in_progress");
      if (!session.combinationId || session.projectionUnavailableReason) throw new Error("recorded_combination_unavailable");
      const previous = draft.sessions.find(ref => ref.sessionId === session.revision.sessionId);
      if (!previous || previous.baseDigest !== session.revision.baseDigest || draft.combination?.combinationId !== session.combinationId) throw new Error("recorded_source_not_selected");
      setDraft({ ...draft, sessions: draft.sessions.map(ref => ref === previous ? session.revision : ref) });
      setDirty(true);
    },
    onApply: async (selected, signal, replace = false) => {
      signal.throwIfAborted();
      if (pending.current) throw new Error("recorded_save_in_progress");
      const sameCombination = draft.combination?.combinationId === selected[0]?.combinationId;
      const base = replace ? { ...draft, combination: sameCombination ? draft.combination : undefined, sessions: [], manualInputs: undefined, mode: "automatic" as const } : { ...draft, manualInputs: undefined, mode: "automatic" as const };
      const next = applyRecordedSourceSelection(base, selected, catalog);
      signal.throwIfAborted();
      setDraft(next);
      setDirty(true);
    },
  });
  let choices: readonly RecordedCombination[] = [];
  let proposalError = "";
  try { choices = recordedCombinationOptions(catalog, sessions.sessions, draft.combination); }
  catch (failure) { proposalError = failure instanceof Error ? failure.message : "recorded_combination_conflict"; }

  async function save(openEditor: boolean) {
    if (pending.current || sessions.busy || sessions.corrections.unresolved) return false;
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
      if (!alive.current) return false;
      setStored(saved);
      setDirty(false);
      if (openEditor) setView("editor");
      return true;
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : "recorded_save_failed");
      return false;
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return {
    draft, stored, view, dirty: dirty || sessions.corrections.unresolved, sessions, choices, proposalError, error, saving,
    busy: saving || sessions.busy,
    change: (next: RecordedWizardDraft) => {
      if (pending.current || sessions.busy || sessions.corrections.unresolved) return;
      setDraft(next); setDirty(true); setError("");
    },
    startManual: async () => {
      if (pending.current || sessions.busy || sessions.corrections.unresolved) return false;
      if (!await sessions.clear()) return false;
      setDraft({ ...draft, mode: "manual", combination: undefined, sessions: [], invalidatedSessionCount: draft.invalidatedSessionCount + draft.sessions.length });
      setDirty(true); setError(""); setView("preparation");
      return true;
    },
    prepare: () => { if (!pending.current && !sessions.busy && !sessions.corrections.unresolved) setView("preparation"); },
    // Inspection opens the same editor without drafting, saving or calculating.
    // View changes only on acceptance; a pending race write blocks the action.
    inspect: (session: RecordedSession) => {
      if (pending.current) return false;
      if (!sessions.inspect(session)) return false;
      setView("editor");
      return true;
    },
    save: () => save(false),
    openEditor: () => save(true),
  };
}
