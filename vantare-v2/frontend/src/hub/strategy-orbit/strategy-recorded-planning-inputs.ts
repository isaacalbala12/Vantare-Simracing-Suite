import type {
  StrategyAnalysisRevisionRef,
  StrategyApplicationClient,
  StrategyPlanningInputsV2,
} from "../../strategy/strategy-application-client";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";

/** Requests Analysis' joint projection for the exact recorded selection. */
export async function prepareRecordedPlanningInputs(
  application: StrategyApplicationClient<unknown>,
  draft: Pick<RecordedWizardDraft, "combination" | "sessions">,
  repositoryVersion: number,
  commandId: string,
  generatedAt: string,
): Promise<StrategyPlanningInputsV2> {
  const combinationId = draft.combination?.combinationId;
  const sourceRevisions = draft.sessions.map(ref => ({ ...ref }));
  const timestamp = Date.parse(generatedAt);
  const canonicalGeneratedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
  if (!combinationId || sourceRevisions.length === 0 || !Number.isSafeInteger(repositoryVersion)
    || repositoryVersion < 0 || !commandId || canonicalGeneratedAt !== generatedAt
    || new Set(sourceRevisions.map(ref => ref.sessionId)).size !== sourceRevisions.length) invalid();

  const result = await application.execute({
    protocolVersion: "strategy.application.v1",
    commandId,
    operation: "get_revision_planning_inputs",
    expectedRepositoryVersion: repositoryVersion,
    combinationId,
    sourceRevisions,
    generatedAt: canonicalGeneratedAt,
  });
  const planning = result.planningInputs;
  const projection = planning?.projection;
  if (result.planningInputStatus !== "available" || !planning || !projection
    || projection.combinationId !== combinationId
    || projection.generatedAt !== canonicalGeneratedAt
    || !sameRevisionSelection(sourceRevisions, projection.sourceRevisions)) invalid();
  return planning;
}

function sameRevisionSelection(expected: readonly StrategyAnalysisRevisionRef[], actual?: readonly StrategyAnalysisRevisionRef[]): boolean {
  if (!actual || actual.length !== expected.length || new Set(actual.map(ref => ref.sessionId)).size !== actual.length) return false;
  const bySession = new Map(expected.map(ref => [ref.sessionId, ref]));
  return actual.every(ref => {
    const match = bySession.get(ref.sessionId);
    return match?.baseDigest === ref.baseDigest && match.revisionId === ref.revisionId && match.snapshotId === ref.snapshotId;
  });
}

function invalid(): never {
  throw new Error("Invalid recorded planning inputs");
}
