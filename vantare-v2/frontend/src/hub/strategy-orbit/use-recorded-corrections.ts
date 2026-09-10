import { useEffect, useRef, useState } from "react";
import type { AnalysisClient, AnalysisSaveRequest } from "../../strategy/analysis-client";
import type { AnalysisCorrection, AnalysisPage, AnalysisScalar, AnalysisStoreResult, AnalysisTarget } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";
import { loadRecordedCorrection, projectRecordedCorrection, recordedCorrectionSave, recordedSampleCorrection, replaceRecordedCorrection } from "./strategy-recorded-corrections";

type Editor = Readonly<{
  session: RecordedSession;
  current: AnalysisStoreResult;
  corrections: readonly AnalysisCorrection[];
  page?: AnalysisPage;
  dirty: boolean;
  request?: AnalysisSaveRequest;
  saved?: AnalysisStoreResult;
  projected?: RecordedSession;
}>;

/** View state only. The enclosing recorded-session owner retains file handles.
 * Keep mounted across tabs so pending edits and uncertain commands survive. */
export function useRecordedCorrections(client: AnalysisClient, onAdopt: (session: RecordedSession) => Promise<void>, blocked = false) {
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
    if (pending.current || blocked) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError("");
    try { await operation(controller.signal); }
    catch (failure) { if (alive.current) setError(controller.signal.aborted ? "recorded_operation_cancelled" : failure instanceof Error ? failure.message : "recorded_operation_failed"); }
    finally { pending.current = null; if (alive.current) setBusy(false); }
  }
  function change(operation: (current: Editor) => Editor) {
    if (!editor || pending.current || blocked || editor.request) return;
    try { setEditor(operation(editor)); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "recorded_operation_failed"); }
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
    signal.throwIfAborted();
    if (!alive.current) return;
    setEditor({ ...current, current: saved, saved, request: undefined, dirty: false,
      corrections: saved.revision.snapshot.corrections.map(item => item.request), projected: undefined });
    await project(current.session, saved, signal);
  }
  function load(session: RecordedSession, revisionId = session.revision.revisionId) {
    return run(async signal => {
      if (editor?.dirty || editor?.request) throw new Error("recorded_pending_corrections");
      const current = await loadRecordedCorrection(client, session, revisionId, signal);
      signal.throwIfAborted();
      if (alive.current) setEditor({ session, current, corrections: current.revision.snapshot.corrections.map(item => item.request), dirty: false });
    });
  }
  return {
    editor, busy, error,
    unresolved: Boolean(editor?.dirty || editor?.request),
    load,
    cancel: () => pending.current?.abort(),
    page: (channelId: string, start: number) => run(async signal => {
      if (!editor) return;
      const page = await client.page({ sessionId: editor.session.opened.sessionId, channelId, start, limit: 50 }, signal);
      signal.throwIfAborted();
      if (alive.current) setEditor(current => current ? { ...current, page } : current);
    }),
    edit: (sampleIndex: number, column: string, replacement: AnalysisScalar, reason: string) => change(current => {
      if (!current.page) throw new Error("recorded_target_unavailable");
      const correction = recordedSampleCorrection(current.session, current.page, sampleIndex, column, replacement, reason);
      return { ...current, corrections: replaceRecordedCorrection(current.corrections, correction), dirty: true, projected: undefined };
    }),
    remove: (target: AnalysisTarget) => change(current => ({ ...current, dirty: true, projected: undefined,
      corrections: current.corrections.filter(item => item.target.channelId !== target.channelId || item.target.column !== target.column || item.target.sampleIndex !== target.sampleIndex) })),
    discard: () => change(current => ({ ...current, corrections: current.current.revision.snapshot.corrections.map(item => item.request), dirty: false, projected: undefined })),
    save: (reason: string) => run(async signal => {
      if (!editor?.dirty || editor.request) return;
      await persist(editor, recordedCorrectionSave(editor.session, editor.current, editor.corrections, reason), signal);
    }),
    retrySave: () => run(async signal => {
      if (editor?.request) await persist(editor, editor.request, signal);
    }),
    project: () => run(async signal => {
      if (editor && !editor.dirty && !editor.request) await project(editor.session, editor.current, signal);
    }),
    parent: () => editor?.current.revision.parentRevisionId ? load(editor.session, editor.current.revision.parentRevisionId) : Promise.resolve(),
    head: () => editor ? load(editor.session, editor.current.headId) : Promise.resolve(),
    restore: (reason: string) => run(async signal => {
      if (!editor || editor.dirty || editor.request) return;
      // Explicit restoration loads the advertised head, never silently rebases edits.
      const head = await loadRecordedCorrection(client, editor.session, editor.current.headId, signal);
      signal.throwIfAborted();
      const request = recordedCorrectionSave(editor.session, head, editor.current.revision.snapshot.corrections.map(item => item.request), reason);
      await persist(editor, request, signal);
    }),
    adopt: () => run(async signal => {
      if (!editor?.projected || editor.dirty || editor.request) return;
      await onAdopt(editor.projected);
      signal.throwIfAborted();
      if (alive.current) setEditor(current => current ? { ...current, session: editor.projected!, projected: undefined } : current);
    }),
  };
}
export type RecordedCorrectionsController = ReturnType<typeof useRecordedCorrections>;
