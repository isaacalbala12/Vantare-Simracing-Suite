import type { AnalysisClient } from "../../strategy/analysis-client";
import type { AnalysisBase, AnalysisCombination, AnalysisOpenedSession, AnalysisPreparation, AnalysisStintBoundary, AnalysisStintBoundaryAnchor } from "../../strategy/analysis-contract";
import { parseAnalysisPreparation, sameAnalysisBase } from "../../strategy/analysis-contract";
import type { StrategyAnalysisRevisionRef } from "../../strategy/strategy-application-client";

export type RecordedSession = Readonly<{
  candidateId: string;
  opened: AnalysisOpenedSession;
  base: AnalysisBase;
  revision: StrategyAnalysisRevisionRef;
  combinationId?: string;
  combination?: AnalysisCombination;
  projectionUnavailableReason?: "metadata_unavailable";
  editableChannelIds?: readonly string[];
  stintBoundaries?: readonly AnalysisStintBoundary[];
  stintAnchors?: readonly AnalysisStintBoundaryAnchor[];
}>;

// Inspection keeps the exact base and revision from Load plus the native
// baseDigest from Prepare. It never calls Project, never adopts the head and
// never carries a draft combination: the source is not race-selectable.
async function openInspectionSession(
  client: AnalysisClient,
  candidateId: string,
  opened: AnalysisOpenedSession,
  prepared: AnalysisPreparation,
  expectedSelection: StrategyAnalysisRevisionRef | readonly StrategyAnalysisRevisionRef[] | undefined,
  signal?: AbortSignal,
): Promise<RecordedSession> {
  const baseDigest = prepared.baseDigest;
  if (baseDigest === undefined) throw new Error("recorded_revision_mismatch");
  if (opened.session.id !== prepared.base.sessionId) throw new Error("recorded_source_mismatch");
  const expected = Array.isArray(expectedSelection)
    ? expectedSelection.find((ref) => ref.sessionId === prepared.base.sessionId)
    : expectedSelection as StrategyAnalysisRevisionRef | undefined;
  if (expected && expected.sessionId !== prepared.base.sessionId) {
    throw new Error("recorded_source_mismatch");
  }
  const revisionId = expected?.revisionId ?? prepared.baseRevisionId;
  if (revisionId === "") throw new Error("recorded_revision_mismatch");
  const loaded = await client.load({ sessionId: opened.sessionId, base: prepared.base, revisionId }, signal);
  signal?.throwIfAborted();
  if (!sameAnalysisBase(loaded.revision.snapshot.base, prepared.base)
    || loaded.revision.revisionId !== revisionId
    || (expected && (expected.baseDigest !== baseDigest || expected.snapshotId !== loaded.revision.snapshot.snapshotId))) {
    throw new Error("recorded_revision_mismatch");
  }
  const revision: StrategyAnalysisRevisionRef = {
    sessionId: prepared.base.sessionId,
    baseDigest,
    revisionId: loaded.revision.revisionId,
    snapshotId: loaded.revision.snapshot.snapshotId,
  };
  return { candidateId, opened, base: prepared.base, revision, projectionUnavailableReason: "metadata_unavailable", editableChannelIds: [...(prepared.editableChannelIds ?? [])], stintBoundaries: structuredClone(prepared.stintBoundaries ?? []), stintAnchors: structuredClone(prepared.stintAnchors ?? []) };
}

// Open has a resource side effect. Keep its response even after cancellation
// so we can close the returned handle; subsequent reads are cancellable.
export async function openRecordedSession(
  client: AnalysisClient,
  candidateId: string,
  combinationId: string | undefined,
  expectedSelection?: StrategyAnalysisRevisionRef | readonly StrategyAnalysisRevisionRef[],
  signal?: AbortSignal,
): Promise<RecordedSession> {
  signal?.throwIfAborted();
  const opened = await client.open(candidateId, true);
  try {
    signal?.throwIfAborted();
    // Reuse the preparation parser for format checks; no new digest validator here.
    const prepared = parseAnalysisPreparation(await client.prepare(opened.sessionId, signal));
    // A cancellation during Prepare closes the handle without starting Load/Project.
    signal?.throwIfAborted();
    if (prepared.combinationUnavailableReason === "metadata_unavailable") {
      return await openInspectionSession(client, candidateId, opened, prepared, expectedSelection, signal);
    }
    const resolvedCombinationId = combinationId ?? prepared.combination?.id;
    if (!resolvedCombinationId) throw new Error("recorded_combination_unavailable");
    if (prepared.combination && prepared.combination.id !== resolvedCombinationId) throw new Error("recorded_combination_mismatch");
    const expected = Array.isArray(expectedSelection)
      ? expectedSelection.find((ref) => ref.sessionId === prepared.base.sessionId)
      : expectedSelection as StrategyAnalysisRevisionRef | undefined;
    if (expected && expected.sessionId !== prepared.base.sessionId) {
      throw new Error("recorded_source_mismatch");
    }
    const revisionId = expected?.revisionId ?? prepared.baseRevisionId;
    const projection = await client.project({
      sessionId: opened.sessionId,
      base: prepared.base,
      revisionId,
    }, signal);
    signal?.throwIfAborted();
    const revision = projection.sourceRevisions?.[0];
    if (projection.combinationId !== resolvedCombinationId || !revision || projection.sourceRevisions?.length !== 1
      || revision.sessionId !== prepared.base.sessionId
      || revision.revisionId !== revisionId
      || (expected && (revision.baseDigest !== expected.baseDigest || revision.revisionId !== expected.revisionId || revision.snapshotId !== expected.snapshotId))) {
      throw new Error("recorded_revision_mismatch");
    }
    return { candidateId, opened, base: prepared.base, revision, combinationId: resolvedCombinationId, editableChannelIds: [...(prepared.editableChannelIds ?? [])], stintBoundaries: structuredClone(prepared.stintBoundaries ?? []), stintAnchors: structuredClone(prepared.stintAnchors ?? []), ...(prepared.combination ? { combination: prepared.combination } : {}) };
  } catch (error) {
    try {
      await client.close(opened.sessionId);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "recorded_cleanup_failed", { cause: cleanupError });
    }
    throw error;
  }
}
