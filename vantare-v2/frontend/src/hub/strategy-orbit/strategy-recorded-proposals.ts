import type { RecordedSession } from "./strategy-recorded-session";
import { selectRecordedCombination, selectRecordedSessions, type RecordedCombination, type RecordedWizardDraft } from "./strategy-recorded-wizard";

/** Merge only verified identity fields; preparation is not a session statistics catalog. */
export function recordedCombinationOptions(catalog: readonly RecordedCombination[], sessions: readonly RecordedSession[], saved?: RecordedCombination): RecordedCombination[] {
  const choices = new Map<string, RecordedCombination>();
  const add = (identity: RecordedCombination) => {
    const previous = choices.get(identity.combinationId);
    if (previous && (previous.simId !== identity.simId || previous.trackName !== identity.trackName || previous.trackLayout !== identity.trackLayout || previous.carName !== identity.carName || previous.carClass !== identity.carClass)) {
      throw new Error("recorded_combination_conflict");
    }
    const { combinationId, simId, trackName, trackLayout, carName, carClass } = identity;
    choices.set(combinationId, { combinationId, simId, trackName, trackLayout, carName, carClass });
  };
  catalog.forEach(add);
  if (saved) add(saved);
  for (const session of sessions) {
    if (!session.combination || session.projectionUnavailableReason) continue;
    const { id, simId, trackName, trackLayout, carName, carClass } = session.combination;
    if (id !== session.combinationId) throw new Error("recorded_combination_mismatch");
    add({ combinationId: id, simId, trackName, trackLayout, carName, carClass });
  }
  return [...choices.values()];
}

/** Only the explicit Use action accepts sources and their combination proposal. */
export function applyRecordedSourceSelection(draft: RecordedWizardDraft, sessions: readonly RecordedSession[], catalog: readonly RecordedCombination[]): RecordedWizardDraft {
  if (sessions.length === 0 || sessions.length > 4) throw new Error("recorded_selection_required");
  // Inspection handles carry no race-selectable identity: reject every one
  // before selecting instead of filtering a subset or inferring an identity.
  // The combination object itself stays optional: a projected session with a
  // valid combinationId resolves against the existing catalog as before.
  for (const session of sessions) {
    if (!session.combinationId || session.projectionUnavailableReason) {
      throw new Error("recorded_combination_unavailable");
    }
  }
  const id = sessions[0].combinationId;
  if (id === undefined) throw new Error("recorded_combination_unavailable");
  if (sessions.some(session => session.combinationId !== id) || (draft.combination && draft.combination.combinationId !== id)) throw new Error("recorded_combination_mismatch");
  const choices = recordedCombinationOptions(catalog, sessions, draft.combination);
  const selected = selectRecordedCombination(draft, id, choices);
  return { ...selectRecordedSessions(selected, id, sessions.map(session => session.revision)), step: draft.step };
}
