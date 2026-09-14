import { useEffect, useRef, useState } from "react";
import type { AnalysisClient, AnalysisSaveRequest } from "../../strategy/analysis-client";
import type { AnalysisClassificationCorrection, AnalysisClassificationField, AnalysisCombination, AnalysisCorrectableFamily, AnalysisCorrection, AnalysisFamilyCorrection, AnalysisLapPage, AnalysisLapTarget, AnalysisPage, AnalysisScalar, AnalysisStintBoundary, AnalysisStintBoundaryAnchor, AnalysisStintBoundaryCorrection, AnalysisStintBoundaryTarget, AnalysisStoreResult, AnalysisTarget } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import { loadRecordedCorrection, loadRecordedLapPage, projectRecordedCorrection, recordedClassificationCorrection, recordedFamilyCorrection, recordedStintBoundaryCorrection, removeRecordedClassificationCorrection, removeRecordedFamilyCorrection, removeRecordedStintBoundaryCorrection, replaceRecordedClassificationCorrection, replaceRecordedFamilyCorrection, replaceRecordedIdentityClassifications, replaceRecordedStintBoundaryCorrection, recordedCorrectionSave, recordedSampleCorrection, replaceRecordedCorrection } from "./strategy-recorded-corrections";

type Editor = Readonly<{
  session: RecordedSession;
  current: AnalysisStoreResult;
  corrections: readonly AnalysisCorrection[];
  familyUses: readonly AnalysisFamilyCorrection[];
  classifications: readonly AnalysisClassificationCorrection[];
  stintBoundaries: readonly AnalysisStintBoundaryCorrection[];
  page?: AnalysisPage;
  lapPage?: AnalysisLapPage;
  dirty: boolean;
  request?: AnalysisSaveRequest;
  saved?: AnalysisStoreResult;
  projected?: RecordedSession;
}>;

/** View state only. The enclosing recorded-session owner retains file handles.
 * Keep mounted across tabs so pending edits and uncertain commands survive. */
export function useRecordedCorrections(client: AnalysisClient, onAdopt: (session: RecordedSession, signal: AbortSignal) => Promise<void>, isBlocked: () => boolean = () => false) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; pending.current?.abort(); };
  }, []);

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current || isBlocked()) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError("");
    try { await operation(controller.signal); }
    catch (failure) { if (alive.current) setError(controller.signal.aborted ? "recorded_operation_cancelled" : failure instanceof Error ? failure.message : "recorded_operation_failed"); }
    finally { pending.current = null; if (alive.current) setBusy(false); }
  }
  function change(operation: (current: Editor) => Editor) {
    if (!editor || pending.current || isBlocked() || editor.request) return false;
    try {
      const next = operation(editor);
      if (next.corrections.length + next.familyUses.length + next.classifications.length + next.stintBoundaries.length > 256) throw new Error("recorded_correction_limit");
      setEditor(next); setError(""); return true;
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : "recorded_operation_failed"); return false; }
  }
  async function project(session: RecordedSession, saved: AnalysisStoreResult, signal: AbortSignal) {
    const projected = await projectRecordedCorrection(client, session, saved, signal);
    signal.throwIfAborted();
    if (alive.current) setEditor(current => current ? { ...current, projected } : current);
  }
  async function persist(current: Editor, request: AnalysisSaveRequest, signal: AbortSignal) {
    // Freeze edits before dispatch. Failure/cancellation retains this exact command.
    setEditor({ ...current, request, projected: undefined });
    const saved = await client.save(request, signal);
    await client.acknowledge(request, signal);
    await retainSaved(current, saved, signal);
  }
  async function retainSaved(current: Editor, saved: AnalysisStoreResult, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!alive.current) return;
    setEditor({ ...current, current: saved, saved, request: undefined, dirty: false,
      corrections: saved.revision.snapshot.corrections.map(item => item.request),
      familyUses: saved.revision.snapshot.familyUses?.map(item => item.request) ?? [],
      classifications: saved.revision.snapshot.classifications?.map(item => item.request) ?? [],
      stintBoundaries: saved.revision.snapshot.stintBoundaries?.map(item => item.request) ?? [], lapPage: undefined, projected: undefined });
    // An inspection source is explicitly not projectable: keep the confirmed
    // save without attempting an automatic projection. Explicit project/adopt
    // and their guards are unchanged.
    if (current.session.combinationId && !current.session.projectionUnavailableReason) {
      await project(current.session, saved, signal);
    }
  }
  function load(session: RecordedSession, revisionId = session.revision.revisionId) {
    return run(async signal => {
      if (editor?.dirty || editor?.request) throw new Error("recorded_pending_corrections");
      const current = await loadRecordedCorrection(client, session, revisionId, signal);
      const request = await client.pending(session.opened.sessionId, session.base, signal);
      signal.throwIfAborted();
      if (alive.current) setEditor({ session, current,
        corrections: request?.corrections ?? current.revision.snapshot.corrections.map(item => item.request),
        familyUses: request?.familyUses ?? current.revision.snapshot.familyUses?.map(item => item.request) ?? [],
        classifications: request?.classifications ?? current.revision.snapshot.classifications?.map(item => item.request) ?? [],
        stintBoundaries: request?.stintBoundaries ?? current.revision.snapshot.stintBoundaries?.map(item => item.request) ?? [],
        dirty: Boolean(request), request });
    });
  }
  return {
    editor, busy, error,
    isBusy: () => pending.current !== null,
    unresolved: Boolean(editor?.dirty || editor?.request),
    load,
    cancel: () => pending.current?.abort(),
    page: (channelId: string, start: number) => run(async signal => {
      if (!editor) return;
      const page = await client.page({ sessionId: editor.session.opened.sessionId, channelId, start, limit: 50 }, signal);
      signal.throwIfAborted();
      if (alive.current) setEditor(current => current ? { ...current, page } : current);
    }),
    laps: (start = 0) => run(async signal => {
      if (!editor) return;
      const lapPage = await loadRecordedLapPage(client, editor.session, editor.current, start, signal);
      signal.throwIfAborted();
      if (alive.current) setEditor(current => current ? { ...current, lapPage,
        current: { ...current.current, headId: lapPage.headId } } : current);
    }),
    editClassification: (field: AnalysisClassificationField, replacement: string, reason: string) => change(current => {
      const correction = recordedClassificationCorrection(current.session, current.current, field, replacement, reason);
      return { ...current, classifications: replaceRecordedClassificationCorrection(current.classifications, correction), dirty: true, projected: undefined };
    }),
    removeClassification: (field: AnalysisClassificationField) => change(current => ({ ...current,
      classifications: removeRecordedClassificationCorrection(current.classifications, field), dirty: true, projected: undefined })),
    // One atomic identity proposal: the whole four-field set is replaced at
    // once against the catalog-supplied combination, preserving legacy
    // decisions. No catalog lookup, ID/hash work, save or projection here.
    editIdentity: (target: AnalysisCombination, reason: string) => change(current => ({ ...current,
      classifications: replaceRecordedIdentityClassifications(current.classifications, current.session, current.current, target, reason), dirty: true, projected: undefined })),
    editFamily: (target: AnalysisLapTarget, family: AnalysisCorrectableFamily, included: boolean, reason: string) => change(current => {
      if (!current.lapPage) throw new Error("recorded_target_unavailable");
      const correction = recordedFamilyCorrection(current.session, current.current, current.lapPage, target, family, included, reason);
      return { ...current, familyUses: replaceRecordedFamilyCorrection(current.familyUses, correction), dirty: true, projected: undefined };
    }),
    removeFamily: (target: AnalysisLapTarget, family: AnalysisCorrectableFamily) => change(current => ({ ...current,
      familyUses: removeRecordedFamilyCorrection(current.familyUses, target, family), dirty: true, projected: undefined })),
    editStint: (expected: AnalysisStintBoundary, operation: "set_stint_boundary" | "remove_stint_boundary", reason: string, anchor?: AnalysisStintBoundaryAnchor, cause?: AnalysisStintBoundary["cause"]) => change(current => ({ ...current,
      stintBoundaries: replaceRecordedStintBoundaryCorrection(current.stintBoundaries, recordedStintBoundaryCorrection(current.session, current.current, expected, operation, reason, anchor, cause)), dirty: true, projected: undefined })),
    restoreStint: (target: AnalysisStintBoundaryTarget) => change(current => ({ ...current,
      stintBoundaries: removeRecordedStintBoundaryCorrection(current.stintBoundaries, target), dirty: true, projected: undefined })),
    edit: (sampleIndex: number, column: string, replacement: AnalysisScalar, reason: string) => change(current => {
      if (!current.page) throw new Error("recorded_target_unavailable");
      const correction = recordedSampleCorrection(current.session, current.page, sampleIndex, column, replacement, reason);
      return { ...current, corrections: replaceRecordedCorrection(current.corrections, correction), dirty: true, projected: undefined };
    }),
    remove: (target: AnalysisTarget) => change(current => ({ ...current, dirty: true, projected: undefined,
      corrections: current.corrections.filter(item => item.target.channelId !== target.channelId || item.target.column !== target.column || item.target.sampleIndex !== target.sampleIndex) })),
    discard: () => change(current => ({ ...current, corrections: current.current.revision.snapshot.corrections.map(item => item.request), familyUses: current.current.revision.snapshot.familyUses?.map(item => item.request) ?? [], classifications: current.current.revision.snapshot.classifications?.map(item => item.request) ?? [], stintBoundaries: current.current.revision.snapshot.stintBoundaries?.map(item => item.request) ?? [], dirty: false, projected: undefined })),
    save: (reason: string) => run(async signal => {
      if (!editor?.dirty || editor.request) return;
      await persist(editor, recordedCorrectionSave(editor.session, editor.current, editor.corrections, reason, undefined, editor.familyUses, editor.classifications, editor.stintBoundaries), signal);
    }),
    retrySave: () => run(async signal => {
      if (editor?.request) await persist(editor, editor.request, signal);
    }),
    resolveSave: () => run(async signal => {
      if (!editor?.request) return;
      const resolved = await client.resolve(editor.request, signal);
      signal.throwIfAborted();
      if (!alive.current) return;
      if (resolved.found) {
        await client.acknowledge(editor.request, signal);
        await retainSaved(editor, { headId: resolved.headId, revision: resolved.revision }, signal);
      } else {
        await client.acknowledge(editor.request, signal);
        // Confirmed absence unfreezes the proposal; a changed head still blocks
        // saving until the user explicitly reviews/discards the old proposal.
        setEditor({ ...editor, request: undefined, dirty: true, corrections: editor.request.corrections, familyUses: editor.request.familyUses ?? [], classifications: editor.request.classifications ?? [], stintBoundaries: editor.request.stintBoundaries ?? [],
          current: { ...editor.current, headId: resolved.headId } });
        setError(resolved.headId === editor.current.revision.revisionId ? "recorded_save_not_committed" : "recorded_revision_conflict");
      }
    }),
    project: () => run(async signal => {
      if (editor && !editor.dirty && !editor.request) await project(editor.session, editor.current, signal);
    }),
    parent: () => editor?.current.revision.parentRevisionId ? load(editor.session, editor.current.revision.parentRevisionId) : Promise.resolve(),
    head: () => editor ? load(editor.session, editor.current.headId) : Promise.resolve(),
    restore: (reason: string) => run(async signal => {
      if (!editor || editor.dirty || editor.request) return;
      // Explicit restoration loads the advertised head, never silently rebases edits.
      // All four sets come from the chosen ancestor, even empty ones:
      // a v1/v2 ancestor restores no classifications against a v3 head.
      const head = await loadRecordedCorrection(client, editor.session, editor.current.headId, signal);
      signal.throwIfAborted();
      const ancestor = editor.current.revision.snapshot;
      const request = recordedCorrectionSave(editor.session, head, ancestor.corrections.map(item => item.request), reason, undefined, ancestor.familyUses?.map(item => item.request) ?? [], ancestor.classifications?.map(item => item.request) ?? [], ancestor.stintBoundaries?.map(item => item.request) ?? []);
      await persist(editor, request, signal);
    }),
    adopt: () => run(async signal => {
      if (!editor?.projected || editor.dirty || editor.request) return;
      await onAdopt(editor.projected, signal);
      signal.throwIfAborted();
      if (alive.current) setEditor(current => current ? { ...current, session: editor.projected!, projected: undefined } : current);
    }),
    clear: (sessionId?: string) => {
      if (pending.current || editor?.dirty || editor?.request) return false;
      if (!sessionId || editor?.session.opened.sessionId === sessionId) { setEditor(null); setError(""); }
      return true;
    },
  };
}
export type RecordedCorrectionsController = ReturnType<typeof useRecordedCorrections>;
