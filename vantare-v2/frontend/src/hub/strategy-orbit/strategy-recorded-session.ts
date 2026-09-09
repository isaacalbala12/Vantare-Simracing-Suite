import type { AnalysisClient } from "../../strategy/analysis-client";
import type { AnalysisBase, AnalysisOpenedSession } from "../../strategy/analysis-contract";
import type { StrategyAnalysisRevisionRef } from "../../strategy/strategy-application-client";

export type RecordedSession = Readonly<{
  candidateId: string;
  opened: AnalysisOpenedSession;
  base: AnalysisBase;
  revision: StrategyAnalysisRevisionRef;
  combinationId: string;
}>;

// Open has a resource side effect. Keep its response even after cancellation
// so we can close the returned handle; subsequent reads are cancellable.
export async function openRecordedSession(
  client: AnalysisClient,
  candidateId: string,
  combinationId: string,
  expectedSelection?: StrategyAnalysisRevisionRef | readonly StrategyAnalysisRevisionRef[],
  signal?: AbortSignal,
): Promise<RecordedSession> {
  signal?.throwIfAborted();
  const opened = await client.open(candidateId, true);
  try {
    signal?.throwIfAborted();
    const prepared = await client.prepare(opened.sessionId, signal);
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
    if (projection.combinationId !== combinationId || !revision || projection.sourceRevisions?.length !== 1
      || revision.sessionId !== prepared.base.sessionId
      || revision.revisionId !== revisionId
      || (expected && (revision.baseDigest !== expected.baseDigest || revision.revisionId !== expected.revisionId || revision.snapshotId !== expected.snapshotId))) {
      throw new Error("recorded_revision_mismatch");
    }
    return { candidateId, opened, base: prepared.base, revision, combinationId };
  } catch (error) {
    try {
      await client.close(opened.sessionId);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "recorded_cleanup_failed", { cause: cleanupError });
    }
    throw error;
  }
}
