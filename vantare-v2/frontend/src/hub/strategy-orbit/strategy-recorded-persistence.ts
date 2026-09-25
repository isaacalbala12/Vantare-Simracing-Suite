import { STRATEGY_APPLICATION_PROTOCOL_V1, type StrategyApplicationClient, type StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import { canonicalStrategyTimestamp, type PlanDraftV1 } from "../../strategy/strategy-contract-v1";
import { RECORDED_DRAFT_VERSION, parseRecordedDraftPayload, type RecordedDraftPayload } from "./strategy-recorded-payload";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";

type Client = StrategyApplicationClient<RecordedDraftPayload>;
type Clock = { id(): string; now(): string };
const clock: Clock = { id: () => globalThis.crypto.randomUUID(), now: () => canonicalStrategyTimestamp() };
export type StoredRecordedDraft = { readonly repositoryVersion: number; readonly document: PlanDraftV1<RecordedDraftPayload> };

function checkedResult(result: StrategyApplicationResultV1<RecordedDraftPayload>, draftId: string, eventId?: string): StoredRecordedDraft {
  const document = result.draft;
  if (!document || document.draftId !== draftId) throw new Error("Recorded draft response does not match the request");
  const payload = parseRecordedDraftPayload(document.payload);
  if (eventId !== undefined && payload.eventId !== eventId) throw new Error("Recorded draft response belongs to another event");
  return { repositoryVersion: result.repositoryVersion, document: { ...document, payload } };
}

function payloadFor(eventId: string, draft: RecordedWizardDraft): RecordedDraftPayload {
  const payload = parseRecordedDraftPayload({ contractVersion: RECORDED_DRAFT_VERSION, eventId, draft });
  const errors = recordedWizardErrors(payload.draft, "sessions");
  if (errors.length > 0) throw new Error(`Recorded draft configuration needs review: ${errors.join(", ")}`);
  return payload;
}

/** Writes only a draft. It neither creates a calculated revision nor activates a plan. */
export async function createRecordedDraft(client: Client, eventId: string, draft: RecordedWizardDraft, expectedRepositoryVersion: number, time: Clock = clock): Promise<StoredRecordedDraft> {
  const payload = payloadFor(eventId, draft);
  const document: PlanDraftV1<RecordedDraftPayload> = {
    contractVersion: "strategy.v1", draftId: `recorded-draft:${eventId}`, planId: `recorded-plan:${eventId}`, variantId: "recorded-main",
    name: draft.name.trim() || `${draft.combination?.trackName} · ${draft.combination?.carName}`,
    mode: draft.mode === "automatic" ? "assisted" : "manual", capabilities: ["manual_inputs", "telemetry_import"],
    provenance: { kind: "manual", sourceId: "strategy-recorded-wizard" }, confidence: { level: "unknown" },
    updatedAt: time.now(), payload,
  };
  const result = await client.execute({ protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1, commandId: `recorded-create:${time.id()}`, operation: "create", expectedRepositoryVersion, draft: document });
  return checkedResult(result, document.draftId, eventId);
}

/** Uses the version the caller actually opened; conflicts never silently overwrite newer work. */
export async function saveRecordedDraft(client: Client, stored: StoredRecordedDraft, draft: RecordedWizardDraft, time: Clock = clock): Promise<StoredRecordedDraft> {
  const eventId = stored.document.payload.eventId;
  const payload = payloadFor(eventId, draft);
  const timestamp = time.now();
  const id = time.id();
  const document: PlanDraftV1<RecordedDraftPayload> = { ...stored.document, name: draft.name.trim() || stored.document.name, updatedAt: timestamp, payload };
  // `edit` is deliberately memory-only in the native lifecycle. A revision is
  // durable configuration history; activation is a separate, unused operation.
  const result = await client.execute({ protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1, commandId: `recorded-save:${id}`, operation: "save_revision", expectedRepositoryVersion: stored.repositoryVersion, draft: document, revisionId: `recorded-configuration:${id}`, createdAt: timestamp });
  const saved = checkedResult(result, document.draftId, eventId);
  if (!saved.document.baseRevision) throw new Error("Recorded configuration was not captured as a revision");
  return saved;
}

export async function openRecordedDraft(client: Client, draftId: string, time: Clock = clock): Promise<StoredRecordedDraft> {
  const result = await client.execute({ protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1, commandId: `recorded-open:${time.id()}`, operation: "open", expectedRepositoryVersion: 0, draftId });
  return checkedResult(result, draftId);
}
