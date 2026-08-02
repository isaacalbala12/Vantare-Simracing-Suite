import {
  StrategyCanonicalInputError,
  canonicalizeAndHashStrategyJSONV1Internal,
  hashStrategyValueV1Internal,
  strictParseStrategyJSONV1Internal,
} from "./strategy-contract-v1-canonical";

export const STRATEGY_CONTRACT_MANIFEST_V1 = {
  contractVersion: "strategy.v1",
  maxSafeInteger: 9_007_199_254_740_991,
  canonicalLimits: {
    maxJsonBytes: 4 << 20,
    maxOutputBytes: 16 << 20,
    maxDepth: 64,
    maxContainerItems: 1 << 20,
  },
  hashAlgorithms: ["sha256:strategy-c14n-v1"],
  planModes: ["manual", "assisted", "live"],
  capabilities: [
    "manual_inputs",
    "telemetry_import",
    "live_updates",
    "tyre_inventory",
    "fuel_strategy",
    "virtual_energy_strategy",
    "plan_comparison",
    "replan",
  ],
  provenanceKinds: [
    "unknown",
    "observed",
    "corrected",
    "manual",
    "derived",
    "estimated",
    "range",
  ],
  confidenceLevels: ["unknown", "low", "medium", "high"],
  executionStatuses: [
    "idle",
    "monitoring",
    "deviated",
    "awaiting_decision",
    "completed",
    "stopped",
  ],
  replanStatuses: [
    "proposed",
    "accepted",
    "rejected",
    "expired",
    "superseded",
  ],
  unitNames: [
    "fuel_liters",
    "virtual_energy_percent",
    "duration_seconds",
    "lap_count",
    "distance_meters",
    "tyre_remaining_percent",
  ],
  errorCodes: [
    "invalid_identifier",
    "invalid_unit",
    "invalid_state",
    "invalid_provenance",
    "invalid_confidence",
    "unsupported_contract_version",
    "revision_hash_mismatch",
    "revision_conflict",
    "proposal_not_accepted",
    "proposal_expired",
    "non_monotonic_sequence",
    "incompatible_units",
    "invalid_document",
  ],
  documentRequiredFields: {
    planDraft: [
      "contractVersion",
      "draftId",
      "planId",
      "variantId",
      "name",
      "mode",
      "capabilities",
      "provenance",
      "confidence",
      "updatedAt",
      "payload",
    ],
    planRevision: [
      "contractVersion",
      "hashAlgorithm",
      "revisionId",
      "sourceDraftId",
      "planId",
      "variantId",
      "name",
      "mode",
      "capabilities",
      "provenance",
      "confidence",
      "createdAt",
      "payload",
      "contentHash",
    ],
    activePlan: ["contractVersion", "activationId", "revision", "activatedAt"],
    executionState: [
      "contractVersion",
      "executionId",
      "activePlan",
      "epoch",
      "sequence",
      "status",
      "capabilities",
      "provenance",
      "confidence",
      "updatedAt",
    ],
    replanProposal: [
      "contractVersion",
      "proposalId",
      "base",
      "candidate",
      "status",
      "reasonCode",
      "provenance",
      "confidence",
      "createdAt",
    ],
  },
} as const;

export type StrategyContractVersion =
  typeof STRATEGY_CONTRACT_MANIFEST_V1.contractVersion;
export type StrategyHashAlgorithm =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.hashAlgorithms)[number];
export type PlanMode =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.planModes)[number];
export type StrategyCapability =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.capabilities)[number];
export type ProvenanceKind =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.provenanceKinds)[number];
export type ConfidenceLevel =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.confidenceLevels)[number];
export type ExecutionStatus =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.executionStatuses)[number];
export type ReplanStatus =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.replanStatuses)[number];
export type StrategyContractErrorCode =
  (typeof STRATEGY_CONTRACT_MANIFEST_V1.errorCodes)[number];

declare const fuelLitersBrand: unique symbol;
declare const virtualEnergyPercentBrand: unique symbol;
declare const durationSecondsBrand: unique symbol;
declare const lapCountBrand: unique symbol;
declare const distanceMetersBrand: unique symbol;
declare const tyreRemainingPercentBrand: unique symbol;
declare const verifiedPlanRevisionBrand: unique symbol;

export type FuelLiters = number & { readonly [fuelLitersBrand]: true };
export type VirtualEnergyPercent = number & {
  readonly [virtualEnergyPercentBrand]: true;
};
export type DurationSeconds = number & {
  readonly [durationSecondsBrand]: true;
};
export type LapCount = number & { readonly [lapCountBrand]: true };
export type DistanceMeters = number & {
  readonly [distanceMetersBrand]: true;
};
export type TyreRemainingPercent = number & {
  readonly [tyreRemainingPercentBrand]: true;
};

export class StrategyContractError extends Error {
  readonly code: StrategyContractErrorCode;
  readonly field: string;

  constructor(
    code: StrategyContractErrorCode,
    field: string,
    message: string,
  ) {
    super(`${code} (${field}): ${message}`);
    this.name = "StrategyContractError";
    this.code = code;
    this.field = field;
  }
}

export function asFuelLiters(value: number): FuelLiters {
  return asNonNegativeFinite(value, "fuelLiters") as FuelLiters;
}

export function addFuel(left: FuelLiters, right: FuelLiters): FuelLiters {
  return asFuelLiters(left + right);
}

export function asVirtualEnergyPercent(
  value: number,
): VirtualEnergyPercent {
  return asPercent(value, "virtualEnergyPercent") as VirtualEnergyPercent;
}

export function addVirtualEnergy(
  left: VirtualEnergyPercent,
  right: VirtualEnergyPercent,
): VirtualEnergyPercent {
  return asVirtualEnergyPercent(left + right);
}

export function asDurationSeconds(value: number): DurationSeconds {
  return asNonNegativeFinite(value, "durationSeconds") as DurationSeconds;
}

export function asLapCount(value: number): LapCount {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > STRATEGY_CONTRACT_MANIFEST_V1.maxSafeInteger
  ) {
    throw invalidUnit("lapCount", "must be a non-negative safe integer");
  }
  return value as LapCount;
}

export function asDistanceMeters(value: number): DistanceMeters {
  return asNonNegativeFinite(value, "distanceMeters") as DistanceMeters;
}

export function asTyreRemainingPercent(
  value: number,
): TyreRemainingPercent {
  return asPercent(value, "tyreRemainingPercent") as TyreRemainingPercent;
}

export interface ProvenanceV1 {
  readonly kind: ProvenanceKind;
  readonly sourceId?: string;
  readonly observedAt?: string;
}

export interface ConfidenceV1 {
  readonly level: ConfidenceLevel;
  readonly basis?: string;
}

export interface RevisionRefV1 {
  readonly planId: string;
  readonly variantId: string;
  readonly revisionId: string;
  readonly contentHash: string;
}

export interface PlanDraftV1<TPayload> {
  contractVersion: StrategyContractVersion;
  draftId: string;
  planId: string;
  variantId: string;
  baseRevision?: RevisionRefV1;
  name: string;
  mode: PlanMode;
  capabilities: StrategyCapability[];
  provenance: ProvenanceV1;
  confidence: ConfidenceV1;
  updatedAt: string;
  payload: TPayload;
}

export interface UnverifiedPlanRevisionV1<TPayload> {
  readonly contractVersion: StrategyContractVersion;
  readonly hashAlgorithm: StrategyHashAlgorithm;
  readonly revisionId: string;
  readonly sourceDraftId: string;
  readonly planId: string;
  readonly variantId: string;
  readonly baseRevision?: RevisionRefV1;
  readonly name: string;
  readonly mode: PlanMode;
  readonly capabilities: readonly StrategyCapability[];
  readonly provenance: ProvenanceV1;
  readonly confidence: ConfidenceV1;
  readonly createdAt: string;
  readonly payload: Readonly<TPayload>;
  readonly contentHash: string;
}

export interface PlanRevisionV1<TPayload>
  extends UnverifiedPlanRevisionV1<TPayload> {
  readonly [verifiedPlanRevisionBrand]: true;
}

export interface ActivePlanV1 {
  readonly contractVersion: StrategyContractVersion;
  readonly activationId: string;
  readonly revision: RevisionRefV1;
  readonly previousRevision?: RevisionRefV1;
  readonly activatedAt: string;
}

export interface StrategyExecutionStateV1 {
  readonly contractVersion: StrategyContractVersion;
  readonly executionId: string;
  readonly activePlan: ActivePlanV1;
  readonly epoch: number;
  readonly sequence: number;
  readonly status: ExecutionStatus;
  readonly capabilities: readonly StrategyCapability[];
  readonly provenance: ProvenanceV1;
  readonly confidence: ConfidenceV1;
  readonly updatedAt: string;
}

export interface ReplanProposalV1 {
  readonly contractVersion: StrategyContractVersion;
  readonly proposalId: string;
  readonly base: RevisionRefV1;
  readonly candidate: RevisionRefV1;
  readonly status: ReplanStatus;
  readonly reasonCode: string;
  readonly provenance: ProvenanceV1;
  readonly confidence: ConfidenceV1;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly decidedAt?: string;
}

export function parsePlanRevisionV1(
  value: unknown,
): UnverifiedPlanRevisionV1<unknown> {
  const document = requireRecord(value, "");
  requireDeclaredVersion(document);
  requireFields(
    document,
    STRATEGY_CONTRACT_MANIFEST_V1.documentRequiredFields.planRevision,
  );
  requireOnlyFields(
    document,
    STRATEGY_CONTRACT_MANIFEST_V1.documentRequiredFields.planRevision,
    ["baseRevision"],
  );
  requireVersion(document.contractVersion);
  requireMember(
    document.hashAlgorithm,
    STRATEGY_CONTRACT_MANIFEST_V1.hashAlgorithms,
    "hashAlgorithm",
  );
  requireIdentifier(document.revisionId, "revisionId");
  requireIdentifier(document.sourceDraftId, "sourceDraftId");
  requireIdentifier(document.planId, "planId");
  requireIdentifier(document.variantId, "variantId");
  requireNonEmptyString(document.name, "name");
  requirePlanMode(document.mode);
  requireCapabilities(document.capabilities);
  requireProvenance(document.provenance);
  requireConfidence(document.confidence);
  requireTimestamp(document.createdAt, "createdAt");
  if (document.baseRevision !== undefined) {
    requireRevisionRef(document.baseRevision, "baseRevision");
    const base = document.baseRevision as RevisionRefV1;
    if (base.planId !== document.planId || base.variantId !== document.variantId) {
      throw new StrategyContractError(
        "revision_conflict",
        "baseRevision",
        "base revision belongs to another plan variant",
      );
    }
  }
  if (document.payload === null || document.payload === undefined) {
    throw invalidDocument("payload", "is required");
  }
  requireHash(document.contentHash, "contentHash");

  return deepFreeze(
    structuredClone(document),
  ) as unknown as UnverifiedPlanRevisionV1<unknown>;
}

export async function decodePlanRevisionV1(
  document: string,
): Promise<PlanRevisionV1<unknown>> {
  const revision = parsePlanRevisionV1(strictParseStrategyJSONV1(document));
  if (!(await verifyPlanRevisionHash(revision))) {
    throw new StrategyContractError(
      "revision_hash_mismatch",
      "contentHash",
      "plan revision content does not match its hash",
    );
  }
  return revision as PlanRevisionV1<unknown>;
}

export function decodeReplanProposalV1(document: string): ReplanProposalV1 {
  return parseReplanProposalV1(strictParseStrategyJSONV1(document));
}

export function decodeStrategyExecutionStateV1(
  document: string,
): StrategyExecutionStateV1 {
  return parseStrategyExecutionStateV1(strictParseStrategyJSONV1(document));
}

export function parseStrategyExecutionStateV1(
  value: unknown,
): StrategyExecutionStateV1 {
  const state = requireRecord(value, "");
  requireDeclaredVersion(state);
  const required =
    STRATEGY_CONTRACT_MANIFEST_V1.documentRequiredFields.executionState;
  requireFields(state, required);
  requireOnlyFields(state, required, []);
  requireVersion(state.contractVersion);
  requireIdentifier(state.executionId, "executionId");
  parseActivePlanV1(state.activePlan);
  requirePositiveSafeInteger(state.epoch, "epoch");
  requirePositiveSafeInteger(state.sequence, "sequence");
  requireExecutionStatus(state.status);
  requireCapabilities(state.capabilities);
  requireProvenance(state.provenance);
  requireConfidence(state.confidence);
  requireTimestamp(state.updatedAt, "updatedAt");
  return deepFreeze(
    structuredClone(state),
  ) as unknown as StrategyExecutionStateV1;
}

function parseActivePlanV1(value: unknown): ActivePlanV1 {
  const active = requireRecord(value, "activePlan");
  const required = STRATEGY_CONTRACT_MANIFEST_V1.documentRequiredFields.activePlan;
  requireFields(active, required, "activePlan");
  requireOnlyFields(active, required, ["previousRevision"], "activePlan");
  requireVersion(active.contractVersion, "activePlan.contractVersion");
  requireIdentifier(active.activationId, "activePlan.activationId");
  requireRevisionRef(active.revision, "activePlan.revision");
  const revision = active.revision as RevisionRefV1;
  if (active.previousRevision !== undefined) {
    requireRevisionRef(active.previousRevision, "activePlan.previousRevision");
    const previous = active.previousRevision as RevisionRefV1;
    if (
      previous.planId !== revision.planId ||
      previous.variantId !== revision.variantId
    ) {
      throw new StrategyContractError(
        "revision_conflict",
        "previousRevision",
        "previous revision belongs to another plan variant",
      );
    }
  }
  requireTimestamp(active.activatedAt, "activePlan.activatedAt");
  return active as unknown as ActivePlanV1;
}

function parseReplanProposalV1(value: unknown): ReplanProposalV1 {
  const proposal = requireRecord(value, "");
  requireDeclaredVersion(proposal);
  const required =
    STRATEGY_CONTRACT_MANIFEST_V1.documentRequiredFields.replanProposal;
  requireFields(proposal, required);
  requireOnlyFields(proposal, required, ["expiresAt", "decidedAt"]);
  requireVersion(proposal.contractVersion);
  requireIdentifier(proposal.proposalId, "proposalId");
  requireRevisionRef(proposal.base, "base");
  requireRevisionRef(proposal.candidate, "candidate");
  const base = proposal.base as RevisionRefV1;
  const candidate = proposal.candidate as RevisionRefV1;
  if (base.planId !== candidate.planId || base.variantId !== candidate.variantId) {
    throw new StrategyContractError(
      "revision_conflict",
      "candidate",
      "candidate belongs to another plan variant",
    );
  }
  if (
    base.revisionId === candidate.revisionId &&
    base.contentHash === candidate.contentHash
  ) {
    throw new StrategyContractError(
      "revision_conflict",
      "candidate",
      "candidate must differ from the base revision",
    );
  }
  requireReplanStatus(proposal.status);
  requireIdentifier(proposal.reasonCode, "reasonCode");
  requireProvenance(proposal.provenance);
  requireConfidence(proposal.confidence);
  requireTimestamp(proposal.createdAt, "createdAt");
  if (proposal.expiresAt !== undefined) {
    requireTimestamp(proposal.expiresAt, "expiresAt");
    if (Date.parse(proposal.expiresAt) <= Date.parse(proposal.createdAt as string)) {
      throw invalidState("expiresAt", "must be after proposal creation");
    }
  }
  if (proposal.decidedAt !== undefined) {
    requireTimestamp(proposal.decidedAt, "decidedAt");
    if (Date.parse(proposal.decidedAt) < Date.parse(proposal.createdAt as string)) {
      throw invalidState("decidedAt", "cannot predate proposal creation");
    }
  }
  if (proposal.status === "proposed" && proposal.decidedAt !== undefined) {
    throw invalidState("decidedAt", "proposed replan cannot have a decision");
  }
  if (proposal.status !== "proposed" && proposal.decidedAt === undefined) {
    throw invalidState("decidedAt", "resolved replan requires a decision");
  }
  if (
    proposal.status === "accepted" &&
    proposal.expiresAt !== undefined &&
    proposal.decidedAt !== undefined &&
    Date.parse(proposal.decidedAt) >= Date.parse(proposal.expiresAt)
  ) {
    throw new StrategyContractError(
      "proposal_expired",
      "expiresAt",
      "proposal expired before acceptance",
    );
  }
  return deepFreeze(
    structuredClone(proposal),
  ) as unknown as ReplanProposalV1;
}

// This verifier is intentionally read-only: Go owns revision creation. The
// frontend verifies Go's versioned canonical representation before it presents
// a revision as trusted; JSON object insertion order and escaping are irrelevant.
export async function verifyPlanRevisionHash(
  revision: UnverifiedPlanRevisionV1<unknown>,
): Promise<boolean> {
  const hashInput = {
    contractVersion: revision.contractVersion,
    hashAlgorithm: revision.hashAlgorithm,
    revisionId: revision.revisionId,
    sourceDraftId: revision.sourceDraftId,
    planId: revision.planId,
    variantId: revision.variantId,
    ...(revision.baseRevision === undefined
      ? {}
      : { baseRevision: revision.baseRevision }),
    name: revision.name,
    mode: revision.mode,
    capabilities: revision.capabilities,
    provenance: revision.provenance,
    confidence: revision.confidence,
    createdAt: revision.createdAt,
    payload: revision.payload,
  };
  const actual = await hashStrategyValueV1(hashInput);
  return actual === revision.contentHash;
}

const CANONICAL_LIMITS_V1 = STRATEGY_CONTRACT_MANIFEST_V1.canonicalLimits;

export async function canonicalizeAndHashStrategyJSONV1(
  document: string,
): Promise<{ canonicalHex: string; sha256: string }> {
  try {
    return await canonicalizeAndHashStrategyJSONV1Internal(
      document,
      CANONICAL_LIMITS_V1,
    );
  } catch (error) {
    return mapCanonicalInputError(error);
  }
}

async function hashStrategyValueV1(value: unknown): Promise<string> {
  try {
    return await hashStrategyValueV1Internal(value, CANONICAL_LIMITS_V1);
  } catch (error) {
    return mapCanonicalInputError(error);
  }
}

function strictParseStrategyJSONV1(document: string): unknown {
  try {
    return strictParseStrategyJSONV1Internal(document, CANONICAL_LIMITS_V1);
  } catch (error) {
    return mapCanonicalInputError(error);
  }
}

function mapCanonicalInputError(error: unknown): never {
  if (error instanceof StrategyCanonicalInputError) {
    throw invalidDocument(error.field, error.message);
  }
  throw error;
}

function asNonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw invalidUnit(field, "must be finite and equal to or greater than zero");
  }
  return value;
}

function asPercent(value: number, field: string): number {
  asNonNegativeFinite(value, field);
  if (value > 100) {
    throw invalidUnit(field, "must be between zero and 100");
  }
  return value;
}

function invalidUnit(field: string, message: string): StrategyContractError {
  return new StrategyContractError("invalid_unit", field, message);
}

function invalidDocument(
  field: string,
  message: string,
): StrategyContractError {
  return new StrategyContractError("invalid_document", field, message);
}

function invalidState(field: string, message: string): StrategyContractError {
  return new StrategyContractError("invalid_state", field, message);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidDocument(field, "must be an object");
  }
  return value as Record<string, unknown>;
}

function requireFields(
  document: Record<string, unknown>,
  fields: readonly string[],
  prefix = "",
): void {
  for (const field of fields) {
    if (!(field in document)) {
      throw invalidDocument(fieldPath(prefix, field), "is required");
    }
  }
}

function requireOnlyFields(
  document: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  prefix = "",
): void {
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(document).sort()) {
    if (!allowed.has(field)) {
      throw invalidDocument(
        fieldPath(prefix, field),
        "is not part of this contract version",
      );
    }
  }
}

function fieldPath(prefix: string, field: string): string {
  return prefix === "" ? field : `${prefix}.${field}`;
}

function requireVersion(value: unknown, field = "contractVersion"): void {
  if (value !== STRATEGY_CONTRACT_MANIFEST_V1.contractVersion) {
    throw new StrategyContractError(
      "unsupported_contract_version",
      field,
      "unsupported strategy contract version",
    );
  }
}

function requireDeclaredVersion(document: Record<string, unknown>): void {
  if (Object.hasOwn(document, "contractVersion")) {
    requireVersion(document.contractVersion);
  }
}

function requirePositiveSafeInteger(value: unknown, field: string): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > STRATEGY_CONTRACT_MANIFEST_V1.maxSafeInteger
  ) {
    throw new StrategyContractError(
      "invalid_state",
      field,
      "must be between one and the shared safe integer maximum",
    );
  }
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function requireIdentifier(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    throw new StrategyContractError(
      "invalid_identifier",
      field,
      "must be 1-128 safe identifier characters",
    );
  }
}

function requireNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidDocument(field, "must be a non-empty string");
  }
}

function requireMember<const T extends readonly string[]>(
  value: unknown,
  values: T,
  field: string,
): asserts value is T[number] {
  if (typeof value !== "string" || !values.includes(value as T[number])) {
    throw invalidDocument(field, "contains an unknown contract value");
  }
}

function requireCapabilities(value: unknown): void {
  if (!Array.isArray(value)) {
    throw invalidDocument("capabilities", "must be an array");
  }
  const known = STRATEGY_CONTRACT_MANIFEST_V1.capabilities;
  for (const capability of value) {
    requireMember(capability, known, "capabilities");
  }
  const sorted = [...value].sort();
  if (
    sorted.length !== new Set(sorted).size ||
    sorted.some((item, index) => item !== value[index])
  ) {
    throw invalidDocument("capabilities", "must be sorted and unique");
  }
}

function requireProvenance(value: unknown): void {
  const provenance = requireRecord(value, "provenance");
  requireFields(provenance, ["kind"], "provenance");
  requireOnlyFields(provenance, ["kind"], ["sourceId", "observedAt"], "provenance");
  if (
    typeof provenance.kind !== "string" ||
    !STRATEGY_CONTRACT_MANIFEST_V1.provenanceKinds.includes(
      provenance.kind as ProvenanceKind,
    )
  ) {
    throw new StrategyContractError(
      "invalid_provenance",
      "provenance.kind",
      "unknown provenance kind",
    );
  }
  if (provenance.kind === "unknown") {
    if (provenance.sourceId !== undefined || provenance.observedAt !== undefined) {
      throw new StrategyContractError(
        "invalid_provenance",
        "provenance",
        "unknown provenance cannot claim a source",
      );
    }
    return;
  }
  if (
    typeof provenance.sourceId !== "string" ||
    provenance.sourceId.trim() === ""
  ) {
    throw new StrategyContractError(
      "invalid_provenance",
      "provenance.sourceId",
      "source is required",
    );
  }
  if (provenance.observedAt !== undefined) {
    requireTimestamp(provenance.observedAt, "provenance.observedAt");
  }
}

function requireConfidence(value: unknown): void {
  const confidence = requireRecord(value, "confidence");
  requireFields(confidence, ["level"], "confidence");
  requireOnlyFields(confidence, ["level"], ["basis"], "confidence");
  if (
    typeof confidence.level !== "string" ||
    !STRATEGY_CONTRACT_MANIFEST_V1.confidenceLevels.includes(
      confidence.level as ConfidenceLevel,
    )
  ) {
    throw new StrategyContractError(
      "invalid_confidence",
      "confidence.level",
      "unknown confidence level",
    );
  }
  if (confidence.level === "unknown") {
    if (confidence.basis !== undefined && confidence.basis !== "") {
      throw new StrategyContractError(
        "invalid_confidence",
        "confidence.basis",
        "unknown confidence cannot claim a basis",
      );
    }
    return;
  }
  if (typeof confidence.basis !== "string" || confidence.basis.trim() === "") {
    throw new StrategyContractError(
      "invalid_confidence",
      "confidence.basis",
      "basis is required",
    );
  }
}

function requireExecutionStatus(value: unknown): void {
  if (
    typeof value !== "string" ||
    !STRATEGY_CONTRACT_MANIFEST_V1.executionStatuses.includes(
      value as ExecutionStatus,
    )
  ) {
    throw new StrategyContractError(
      "invalid_state",
      "status",
      "unknown execution status",
    );
  }
}

function requirePlanMode(value: unknown): void {
  if (
    typeof value !== "string" ||
    !STRATEGY_CONTRACT_MANIFEST_V1.planModes.includes(value as PlanMode)
  ) {
    throw invalidState("mode", "unknown plan mode");
  }
}

function requireReplanStatus(value: unknown): void {
  if (
    typeof value !== "string" ||
    !STRATEGY_CONTRACT_MANIFEST_V1.replanStatuses.includes(
      value as ReplanStatus,
    )
  ) {
    throw invalidState("status", "unknown replan status");
  }
}

function requireRevisionRef(value: unknown, field: string): void {
  const revision = requireRecord(value, field);
  requireFields(
    revision,
    ["planId", "variantId", "revisionId", "contentHash"],
    field,
  );
  requireOnlyFields(
    revision,
    ["planId", "variantId", "revisionId", "contentHash"],
    [],
    field,
  );
  requireIdentifier(revision.planId, `${field}.planId`);
  requireIdentifier(revision.variantId, `${field}.variantId`);
  requireIdentifier(revision.revisionId, `${field}.revisionId`);
  requireHash(revision.contentHash, `${field}.contentHash`);
}

function requireHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw invalidDocument(field, "must be a SHA-256 hexadecimal digest");
  }
}

function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw invalidDocument(field, "must be a canonical RFC3339 UTC timestamp");
  }
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/,
  );
  if (!match) {
    throw invalidDocument(field, "must be a canonical RFC3339 UTC timestamp");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw invalidDocument(field, "must be a valid RFC3339 timestamp");
  }
  const iso = parsed.toISOString();
  const milliseconds = iso.slice(20, 23).replace(/0+$/, "");
  const canonical = `${iso.slice(0, 19)}${milliseconds === "" ? "" : `.${milliseconds}`}Z`;
  if (canonical !== value) {
    throw invalidDocument(field, "must use canonical UTC millisecond precision");
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}
