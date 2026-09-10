import type { AnalysisClient, AnalysisSaveRequest } from "../../strategy/analysis-client";
import { parseAnalysisCorrection, parseAnalysisSaveCommand, sameAnalysisBase, type AnalysisCorrection, type AnalysisPage, type AnalysisScalar, type AnalysisStoreResult } from "../../strategy/analysis-contract";
import type { RecordedSession } from "./strategy-recorded-session";

/** Explicit revision only. Reading a historical parent never changes the plan. */
export async function loadRecordedCorrection(client: AnalysisClient, session: RecordedSession, revisionId = session.revision.revisionId, signal?: AbortSignal): Promise<AnalysisStoreResult> {
  if (!revisionId) throw new Error("recorded_exact_revision_required");
  const loaded = await client.load({ sessionId: session.opened.sessionId, base: session.base, revisionId }, signal);
  if (!sameAnalysisBase(loaded.revision.snapshot.base, session.base) || loaded.revision.revisionId !== revisionId ||
    (revisionId === session.revision.revisionId && loaded.revision.snapshot.snapshotId !== session.revision.snapshotId)) throw new Error("recorded_revision_mismatch");
  return loaded;
}

/** The caller selects an actual page/sample; indices are never inferred from rows. */
export function recordedSampleCorrection(session: RecordedSession, page: AnalysisPage, sampleIndex: number, column: string, replacement: AnalysisScalar, reason: string): AnalysisCorrection {
  const channel = session.opened.session.channels.find(item => item.id === page.channel_id);
  const original = page.samples.find(sample => sample.index === sampleIndex)?.values.find(value => value.column === column);
  if (!channel || !channel.columns.some(item => item.name === column && item.type === original?.scalar.kind) || !original) throw new Error("recorded_target_unavailable");
  return structuredClone(parseAnalysisCorrection({ base: session.base, target: { channelId: channel.id, column, sampleIndex }, unit: channel.unit, expected: original, replacement, reason }));
}

function sameTarget(a: AnalysisCorrection, b: AnalysisCorrection): boolean {
  return a.target.channelId === b.target.channelId && a.target.column === b.target.column && a.target.sampleIndex === b.target.sampleIndex;
}

/** Replacing one scalar preserves every other active correction. */
export function replaceRecordedCorrection(active: readonly AnalysisCorrection[], correction: AnalysisCorrection): readonly AnalysisCorrection[] {
  parseAnalysisCorrection(correction);
  for (const item of active) {
    parseAnalysisCorrection(item);
    if (!sameAnalysisBase(item.base, correction.base)) throw new Error("recorded_correction_base_mismatch");
  }
  const next = [...active.filter(item => !sameTarget(item, correction)), correction];
  if (next.length > 256) throw new Error("recorded_correction_limit");
  return structuredClone(next);
}

/** Keep this exact request across uncertain saves. Restoring supplies an earlier
 * snapshot's requests but still requires an explicitly loaded current head. */
export function recordedCorrectionSave(session: RecordedSession, current: AnalysisStoreResult, corrections: readonly AnalysisCorrection[], reason: string, commandId = `recorded-correction:${globalThis.crypto.randomUUID()}`): AnalysisSaveRequest {
  if (!sameAnalysisBase(current.revision.snapshot.base, session.base)) throw new Error("recorded_correction_base_mismatch");
  if (current.revision.revisionId !== current.headId) throw new Error("recorded_revision_conflict");
  if (corrections.length > 256) throw new Error("recorded_correction_limit");
  const targets = new Set<string>();
  for (const correction of corrections) {
    parseAnalysisCorrection(correction);
    if (!sameAnalysisBase(correction.base, session.base)) throw new Error("recorded_correction_base_mismatch");
    const key = JSON.stringify([correction.target.channelId, correction.target.column, correction.target.sampleIndex]);
    if (targets.has(key)) throw new Error("recorded_overlapping_corrections");
    targets.add(key);
  }
  const command = parseAnalysisSaveCommand({ expectedRevision: current.headId, commandId, reason, localAuthorId: "local-user" });
  return structuredClone({ sessionId: session.opened.sessionId, base: session.base, corrections, command });
}

/** Saving and projection are separate: failure here must retain the durable
 * revision, not cause a second save. Adoption remains an explicit UI action. */
export async function projectRecordedCorrection(client: AnalysisClient, session: RecordedSession, saved: AnalysisStoreResult, signal?: AbortSignal): Promise<RecordedSession> {
  if (!sameAnalysisBase(saved.revision.snapshot.base, session.base)) throw new Error("recorded_correction_base_mismatch");
  const projection = await client.project({ sessionId: session.opened.sessionId, base: session.base, revisionId: saved.revision.revisionId }, signal);
  const ref = projection.sourceRevisions?.[0];
  if (projection.combinationId !== session.combinationId || projection.sourceRevisions?.length !== 1 || !ref ||
    ref.sessionId !== session.base.sessionId || ref.baseDigest !== session.revision.baseDigest ||
    ref.revisionId !== saved.revision.revisionId || ref.snapshotId !== saved.revision.snapshot.snapshotId) throw new Error("recorded_revision_mismatch");
  return { ...session, revision: ref };
}
