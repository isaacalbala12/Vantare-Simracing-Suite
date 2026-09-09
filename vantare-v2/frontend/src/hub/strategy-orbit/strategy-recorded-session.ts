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
  expected?: StrategyAnalysisRevisionRef,
  signal?: AbortSignal,
): Promise<RecordedSession> {
  signal?.throwIfAborted();
  const opened = await client.open(candidateId, true);
  try {
    signal?.throwIfAborted();
    const prepared = await client.prepare(opened.sessionId, signal);
    if (expected && expected.sessionId !== prepared.base.sessionId) {
      throw new Error("recorded_source_mismatch");
    }
    const projection = await client.project({
      sessionId: opened.sessionId,
      base: prepared.base,
      revisionId: expected?.revisionId ?? prepared.baseRevisionId,
    }, signal);
    signal?.throwIfAborted();
    const revision = projection.sourceRevisions?.[0];
    if (projection.combinationId !== combinationId || !revision || projection.sourceRevisions?.length !== 1
      || revision.sessionId !== prepared.base.sessionId
      || (expected && (revision.baseDigest !== expected.baseDigest || revision.revisionId !== expected.revisionId || revision.snapshotId !== expected.snapshotId))) {
      throw new Error("recorded_revision_mismatch");
    }
    return { candidateId, opened, base: prepared.base, revision, combinationId };
  } catch (error) {
    try {
      await client.close(opened.sessionId);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "recorded_cleanup_failed");
    }
    throw error;
  }
}
