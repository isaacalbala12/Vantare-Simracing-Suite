import type { AnalysisClient, AnalysisSaveRequest } from "../../strategy/analysis-client";
import { analysisClassificationFieldForMetadataKey, analysisLapInstant, parseAnalysisClassificationCorrection, parseAnalysisClassificationCorrections, parseAnalysisClassificationOriginal, parseAnalysisFamilyCorrection, parseAnalysisFamilyCorrections, parseAnalysisLapTarget, type AnalysisClassificationCorrection, type AnalysisClassificationField, type AnalysisCorrectableFamily, type AnalysisFamilyCorrection, type AnalysisLapPage, type AnalysisLapTarget, parseAnalysisCorrection, parseAnalysisSaveCommand, sameAnalysisBase, type AnalysisCorrection, type AnalysisPage, type AnalysisScalar, type AnalysisStoreResult } from "../../strategy/analysis-contract";
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
  if (!session.editableChannelIds?.includes(page.channel_id)) throw new Error("recorded_channel_read_only");
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
 * snapshot's requests but still requires an explicitly loaded current head.
 * Classifications default to the loaded snapshot's requests so older callers
 * keep decisions; withdrawing or restoring passes the desired set explicitly
 * (including []). Output is fully cloned: later input edits cannot modify it. */
export function recordedCorrectionSave(session: RecordedSession, current: AnalysisStoreResult, corrections: readonly AnalysisCorrection[], reason: string, commandId = `recorded-correction:${globalThis.crypto.randomUUID()}`, familyUses: readonly AnalysisFamilyCorrection[] = current.revision.snapshot.familyUses?.map(item => item.request) ?? [], classifications: readonly AnalysisClassificationCorrection[] = current.revision.snapshot.classifications?.map(item => item.request) ?? []): AnalysisSaveRequest {
  if (!sameAnalysisBase(current.revision.snapshot.base, session.base)) throw new Error("recorded_correction_base_mismatch");
  if (current.revision.revisionId !== current.headId) throw new Error("recorded_revision_conflict");
  if (corrections.length + familyUses.length + classifications.length > 256) throw new Error("recorded_correction_limit");
  parseAnalysisFamilyCorrections(familyUses, session.base);
  parseAnalysisClassificationCorrections(classifications, session.base);
  const targets = new Set<string>();
  for (const correction of corrections) {
    parseAnalysisCorrection(correction);
    if (!sameAnalysisBase(correction.base, session.base)) throw new Error("recorded_correction_base_mismatch");
    const key = JSON.stringify([correction.target.channelId, correction.target.column, correction.target.sampleIndex]);
    if (targets.has(key)) throw new Error("recorded_overlapping_corrections");
    targets.add(key);
  }
  const command = parseAnalysisSaveCommand({ expectedRevision: current.headId, commandId, reason, localAuthorId: "local-user" });
  return structuredClone({ sessionId: session.opened.sessionId, base: session.base, corrections, familyUses, classifications, command });
}

/** Read the correctable original for one field from the OPEN session, never
 * from a revision's effective value; another missing metadata entry does not
 * block this field. Throws the same gates the builder enforces, without
 * fabricating a correction or a reason to probe availability. */
export function recordedClassificationOriginal(session: RecordedSession, current: AnalysisStoreResult, field: AnalysisClassificationField): string {
  if (field !== "SessionType" && field !== "WeatherConditions") throw new Error("recorded_classification_invalid");
  if (!sameAnalysisBase(current.revision.snapshot.base, session.base)) throw new Error("recorded_correction_base_mismatch");
  const matches = session.opened.session.metadata.filter(item => analysisClassificationFieldForMetadataKey(item.key) === field);
  if (matches.length === 0) throw new Error("recorded_target_unavailable");
  if (matches.length > 1) throw new Error("recorded_classification_ambiguous");
  const original = matches[0];
  if (original.present !== true || original.quality !== "valid" || original.sensitive !== false || original.redacted === true || typeof original.value !== "string") throw new Error("recorded_classification_read_only");
  return parseAnalysisClassificationOriginal(field, original.value);
}

/** Build one classification decision from the OPEN session's original metadata,
 * never from a revision's effective value; another missing metadata entry does
 * not block this field. The local gate is advisory: native Save revalidates
 * and authorizes the whole proposal before writing. */
export function recordedClassificationCorrection(session: RecordedSession, current: AnalysisStoreResult, field: AnalysisClassificationField, replacement: string, reason: string): AnalysisClassificationCorrection {
  const expectedOriginal = recordedClassificationOriginal(session, current, field);
  return structuredClone(parseAnalysisClassificationCorrection({ base: session.base, field, expectedOriginal, replacement, reason, provenance: "manual" }));
}

/** Replacing one classification preserves every other active decision. The whole
 * active set validates against the new base before filtering, so a foreign
 * base or duplicates hiding in the replaced field cannot slip through. */
export function replaceRecordedClassificationCorrection(active: readonly AnalysisClassificationCorrection[], correction: AnalysisClassificationCorrection): readonly AnalysisClassificationCorrection[] {
  const parsed = parseAnalysisClassificationCorrection(correction);
  parseAnalysisClassificationCorrections(active, parsed.base);
  const next = [...active.filter(item => item.field !== parsed.field), parsed];
  if (next.length > 256) throw new Error("recorded_correction_limit");
  return structuredClone(parseAnalysisClassificationCorrections(next, parsed.base));
}

export function removeRecordedClassificationCorrection(active: readonly AnalysisClassificationCorrection[], field: AnalysisClassificationField): readonly AnalysisClassificationCorrection[] {
  if (field !== "SessionType" && field !== "WeatherConditions") throw new Error("recorded_classification_invalid");
  const items = active.map(item => parseAnalysisClassificationCorrection(item));
  if (items.length === 0) return [];
  const validated = parseAnalysisClassificationCorrections(items, items[0].base);
  return structuredClone(validated.filter(item => item.field !== field));
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

function sameLapTarget(a: AnalysisLapTarget, b: AnalysisLapTarget): boolean {
  return a.number === b.number && analysisLapInstant(a.start) === analysisLapInstant(b.start) && analysisLapInstant(a.end) === analysisLapInstant(b.end);
}

/** Reading pages never adopts their newer head or changes the selected revision. */
export async function loadRecordedLapPage(client: AnalysisClient, session: RecordedSession, current: AnalysisStoreResult, start = 0, signal?: AbortSignal): Promise<AnalysisLapPage> {
  if (!sameAnalysisBase(current.revision.snapshot.base, session.base)) throw new Error("recorded_correction_base_mismatch");
  const page = await client.laps({ sessionId: session.opened.sessionId, base: session.base, revisionId: current.revision.revisionId, start, limit: 25 }, signal);
  if (!sameAnalysisBase(page.page.base, session.base) || page.revisionId !== current.revision.revisionId || page.page.snapshotId !== current.revision.snapshot.snapshotId || page.page.start !== start) throw new Error("recorded_revision_mismatch");
  return page;
}

/** A native capability is advisory; saving still revalidates the whole proposal. */
export function recordedFamilyCorrection(session: RecordedSession, current: AnalysisStoreResult, page: AnalysisLapPage, target: AnalysisLapTarget, family: AnalysisCorrectableFamily, included: boolean, reason: string): AnalysisFamilyCorrection {
  parseAnalysisLapTarget(target);
  if (!sameAnalysisBase(current.revision.snapshot.base, session.base) || !sameAnalysisBase(page.page.base, session.base) || page.revisionId !== current.revision.revisionId || page.page.snapshotId !== current.revision.snapshot.snapshotId) throw new Error("recorded_revision_mismatch");
  const rows = page.page.laps.filter(row => row.target && sameLapTarget(row.target, target));
  if (rows.length !== 1) throw new Error("recorded_target_unavailable");
  const row = rows[0], capabilities = row.capabilities.filter(item => item.family === family), originals = (row.original.familyUse ?? []).filter(item => item.family === family);
  if (!row.effective || capabilities.length !== 1 || originals.length !== 1 || !(included ? capabilities[0].canInclude : capabilities[0].canExclude)) throw new Error("recorded_family_read_only");
  return structuredClone(parseAnalysisFamilyCorrection({ base: session.base, target: row.target, family, expected: originals[0], included, reason }));
}

export function replaceRecordedFamilyCorrection(active: readonly AnalysisFamilyCorrection[], correction: AnalysisFamilyCorrection): readonly AnalysisFamilyCorrection[] {
  parseAnalysisFamilyCorrection(correction);
  parseAnalysisFamilyCorrections(active, correction.base);
  const next = [...active.filter(item => item.family !== correction.family || !sameLapTarget(item.target, correction.target)), correction];
  if (next.length > 256) throw new Error("recorded_correction_limit");
  return structuredClone(parseAnalysisFamilyCorrections(next, correction.base));
}

export function removeRecordedFamilyCorrection(active: readonly AnalysisFamilyCorrection[], target: AnalysisLapTarget, family: AnalysisCorrectableFamily): readonly AnalysisFamilyCorrection[] {
  parseAnalysisLapTarget(target);
  return structuredClone(active.filter(item => item.family !== family || !sameLapTarget(item.target, target)));
}
