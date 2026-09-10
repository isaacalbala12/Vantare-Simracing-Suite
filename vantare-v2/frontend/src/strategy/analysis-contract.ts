export type AnalysisQuality = "valid" | "stale" | "missing" | "invalid" | "unknown";
export type AnalysisScalar = Readonly<{
  kind: "number" | "integer" | "boolean" | "text" | "unknown";
  number?: number;
  integer?: number;
  boolean?: boolean;
  text?: string;
}>;
export type AnalysisValue = Readonly<{
  column: string;
  present: boolean;
  quality: AnalysisQuality;
  scalar: AnalysisScalar;
}>;
export type AnalysisUnit = Readonly<{
  symbol?: string;
  quality: AnalysisQuality;
}>;
export type AnalysisBase = Readonly<{
  sessionId: string;
  contentSha256: string;
  sizeBytes: number;
  parserId: string;
  parserVersion: string;
  schemaFingerprint: string;
  analysisVersion: string;
  segmentationDigest: string;
}>;
export type AnalysisTarget = Readonly<{
  channelId: string;
  column: string;
  sampleIndex: number;
}>;
export type AnalysisCorrection = Readonly<{
  base: AnalysisBase;
  target: AnalysisTarget;
  unit: AnalysisUnit;
  expected: AnalysisValue;
  replacement: AnalysisScalar;
  reason: string;
}>;
export type AnalysisPreparedCorrection = Readonly<{
  baseId: string;
  correctionId: string;
  request: AnalysisCorrection;
  original: AnalysisValue;
  corrected: AnalysisValue;
}>;
export const analysisCorrectableFamilies = ["fuel_consumption", "virtual_energy_consumption", "combined_stint_pace_curve", "tyre_degradation", "saving_cost"] as const;
export type AnalysisCorrectableFamily = typeof analysisCorrectableFamilies[number];
export type AnalysisFamilyUse = Readonly<{ family: string; included: boolean; exclusionReasons: readonly string[] | null; correctionId?: string }>;
export type AnalysisLapTarget = Readonly<{ number: number; start: string; end: string }>;
export type AnalysisFamilyCorrection = Readonly<{ base: AnalysisBase; target: AnalysisLapTarget; family: AnalysisCorrectableFamily; expected: AnalysisFamilyUse; included: boolean; reason: string }>;
export type AnalysisPreparedFamilyCorrection = Readonly<{ baseId: string; correctionId: string; request: AnalysisFamilyCorrection; original: AnalysisFamilyUse; corrected: AnalysisFamilyUse }>;
export type AnalysisSnapshot = Readonly<{
  contractVersion: "analysis.sample-snapshot.v1" | "analysis.observation-snapshot.v2" | "analysis.mixed-snapshot.v3";
  base: AnalysisBase;
  snapshotId: string;
  corrections: readonly AnalysisPreparedCorrection[];
  familyUses?: readonly AnalysisPreparedFamilyCorrection[];
  classifications?: readonly AnalysisPreparedClassificationCorrection[];
}>;
export type AnalysisSaveCommand = Readonly<{
  expectedRevision: string;
  commandId: string;
  reason: string;
  localAuthorId: string;
}>;
export type AnalysisRevision = Readonly<{
  revisionId: string;
  parentRevisionId: string;
  command: AnalysisSaveCommand;
  commandDigest: string;
  createdAt: string;
  snapshot: AnalysisSnapshot;
}>;
export type AnalysisStoreResult = Readonly<{
  headId: string;
  revision: AnalysisRevision;
}>;
export type AnalysisCommandResolution = Readonly<{ found: false; headId: string }> | Readonly<{ found: true; headId: string; revision: AnalysisRevision }>;
export type AnalysisPreparation = Readonly<{
  base: AnalysisBase;
  baseRevisionId: string;
  baseDigest?: string;
  editableChannelIds?: readonly string[];
  combination?: AnalysisCombination;
  combinationUnavailableReason?: "metadata_unavailable";
}>;
export type AnalysisCombination = Readonly<{
  id: string;
  simId: string;
  trackName: string;
  trackLayout: string;
  carName: string;
  carClass: string;
}>;
export type AnalysisSampling = Readonly<{
  kind: "continuous_implicit_frequency" | "event_timestamped";
  frequency_hz?: number;
  origin: "unknown" | "source_timestamp";
}>;
export type AnalysisChannel = Readonly<{
  id: string;
  source_name: string;
  unit: AnalysisUnit;
  sampling: AnalysisSampling;
  columns: readonly Readonly<{
    name: string;
    type: AnalysisScalar["kind"];
  }>[];
}>;
export type AnalysisMetadata = Readonly<{
  key: string;
  sensitive: boolean;
  redacted?: boolean;
  present: boolean;
  value?: string;
  quality: AnalysisQuality;
}>;
export type AnalysisSession = Readonly<{
  schema_version: 1;
  id: string;
  metadata: readonly AnalysisMetadata[];
  channels: readonly AnalysisChannel[];
}>;
export type AnalysisOpenedSession = Readonly<{
  sessionId: string;
  session: AnalysisSession;
}>;
export type AnalysisSample = Readonly<{
  index: number;
  relative_time_seconds?: number;
  timestamp_seconds?: number;
  values: readonly AnalysisValue[];
}>;
export type AnalysisPage = Readonly<{
  channel_id: string;
  start: number;
  sampling: AnalysisSampling;
  samples: readonly AnalysisSample[];
}>;
export type AnalysisCandidate = Readonly<{
  displayName?: string;
  id: string;
  state: string;
  size: number;
  modifiedAt: string;
  walPresent: boolean;
}>;
export class AnalysisProtocolError extends Error {
  constructor(field: string) {
    super(`Invalid Analysis response: ${field}`);
    this.name = "AnalysisProtocolError";
  }
}
const qualities = ["valid", "stale", "missing", "invalid", "unknown"] as const;
const scalarKinds = ["number", "integer", "boolean", "text", "unknown"] as const;
const baseKeys = ["sessionId", "contentSha256", "sizeBytes", "parserId", "parserVersion", "schemaFingerprint", "analysisVersion", "segmentationDigest"] as const;
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalysisProtocolError(field);
  }
  return value as Record<string, unknown>;
}
function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new AnalysisProtocolError(field);
  }
  return value;
}
function text(value: unknown, field: string, max = 4096): asserts value is string {
  if (typeof value !== "string" || value.trim() === "" || new TextEncoder().encode(value).length > max) {
    throw new AnalysisProtocolError(field);
  }
}
function flag(value: unknown, field: string): void {
  if (typeof value !== "boolean") {
    throw new AnalysisProtocolError(field);
  }
}
function integer(value: unknown, field: string, min = 0): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new AnalysisProtocolError(field);
  }
}
function number(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AnalysisProtocolError(field);
  }
}
function oneOf(value: unknown, options: readonly string[], field: string): void {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new AnalysisProtocolError(field);
  }
}
function digest(value: unknown, field: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new AnalysisProtocolError(field);
  }
}
function timestamp(value: unknown, field: string): void {
  text(value, field);
  if (!Number.isFinite(Date.parse(value))) {
    throw new AnalysisProtocolError(field);
  }
}
export function sameAnalysisBase(a: AnalysisBase, b: AnalysisBase): boolean {
  return baseKeys.every((key) => a[key] === b[key]);
}
export function parseAnalysisBase(value: unknown): AnalysisBase {
  const r = record(value, "base");
  for (const key of ["sessionId", "parserId", "parserVersion", "schemaFingerprint", "analysisVersion"])
    text(r[key], `base.${key}`, 256);
  digest(r.contentSha256, "base.contentSha256");
  digest(r.segmentationDigest, "base.segmentationDigest");
  integer(r.sizeBytes, "base.sizeBytes", 1);
  return r as unknown as AnalysisBase;
}
export function parseAnalysisScalar(value: unknown): AnalysisScalar {
  const r = record(value, "scalar");
  oneOf(r.kind, scalarKinds, "scalar.kind");
  for (const key of ["number", "integer", "boolean", "text"]) {
    if (r[key] === undefined) {
      continue;
    }
    if (key !== r.kind) {
      throw new AnalysisProtocolError("scalar.inactiveField");
    }
    if (key === "number") {
      number(r[key], "scalar.number");
    }
    if (key === "integer" && (typeof r[key] !== "number" || !Number.isSafeInteger(r[key]))) {
      throw new AnalysisProtocolError("scalar.integer");
    }
    if (key === "boolean") {
      flag(r[key], "scalar.boolean");
    }
    if (key === "text" && (typeof r[key] !== "string" || new TextEncoder().encode(r[key]).length > 4096)) {
      throw new AnalysisProtocolError("scalar.text");
    }
  }
  return r as unknown as AnalysisScalar;
}
export function parseHistoricalValue(value: unknown): AnalysisValue {
  const r = record(value, "value");
  text(r.column, "value.column");
  flag(r.present, "value.present");
  oneOf(r.quality, qualities, "value.quality");
  parseAnalysisScalar(r.scalar);
  return r as unknown as AnalysisValue;
}
// Go omits inactive/zero scalar fields. The kind gives those zeros meaning;
// the separate presence flag always takes priority over that representation.
export function analysisValue(value: AnalysisValue): number | boolean | string | null {
  if (!value.present) {
    return null;
  }
  const s = value.scalar;
  switch (s.kind) {
    case "number": return s.number ?? 0;
    case "integer": return s.integer ?? 0;
    case "boolean": return s.boolean ?? false;
    case "text": return s.text ?? "";
    default: return null;
  }
}
function unit(value: unknown): AnalysisUnit {
  const r = record(value, "unit");
  oneOf(r.quality, qualities, "unit.quality");
  if (r.symbol !== undefined && typeof r.symbol !== "string") {
    throw new AnalysisProtocolError("unit.symbol");
  }
  return r as unknown as AnalysisUnit;
}
export function parseAnalysisCorrection(value: unknown): AnalysisCorrection {
  const r = record(value, "correction");
  parseAnalysisBase(r.base);
  const t = record(r.target, "target");
  text(t.channelId, "target.channelId", 256);
  text(t.column, "target.column", 256);
  integer(t.sampleIndex, "target.sampleIndex");
  const correctionUnit = unit(r.unit);
  if (correctionUnit.quality !== "valid" || new TextEncoder().encode(correctionUnit.symbol ?? "").length > 256) {
    throw new AnalysisProtocolError("correction.unit");
  }
  const expected = parseHistoricalValue(r.expected);
  const replacement = parseAnalysisScalar(r.replacement);
  text(r.reason, "correction.reason", 1024);
  if (!expected.present || expected.column !== t.column || replacement.kind !== expected.scalar.kind || replacement.kind === "unknown") {
    throw new AnalysisProtocolError("correction.value");
  }
  return r as unknown as AnalysisCorrection;
}
export function parseAnalysisPreparation(value: unknown): AnalysisPreparation {
  const r = record(value, "preparation");
  parseAnalysisBase(r.base);
  digest(r.baseRevisionId, "baseRevisionId");
  if (r.baseDigest !== undefined) {
    digest(r.baseDigest, "preparation.baseDigest");
  }
  if (r.editableChannelIds !== undefined) {
    const channels = list(r.editableChannelIds, "preparation.editableChannelIds");
    const seen = new Set<string>();
    for (const channel of channels) {
      text(channel, "preparation.editableChannelIds", 256);
      if (seen.has(channel)) throw new AnalysisProtocolError("preparation.editableChannelIds");
      seen.add(channel);
    }
  }
  if (r.combination !== undefined) {
    const combination = record(r.combination, "preparation.combination");
    for (const field of ["id", "simId", "trackName", "trackLayout", "carName", "carClass"]) text(combination[field], `preparation.combination.${field}`);
    if (r.combinationUnavailableReason !== undefined) throw new AnalysisProtocolError("preparation.combinationUnavailableReason");
  }
  if (r.combinationUnavailableReason !== undefined && r.combinationUnavailableReason !== "metadata_unavailable") {
    throw new AnalysisProtocolError("preparation.combinationUnavailableReason");
  }
  return r as unknown as AnalysisPreparation;
}
function snapshot(value: unknown): AnalysisSnapshot {
  const r = record(value, "snapshot");
  if (r.contractVersion !== "analysis.sample-snapshot.v1" && r.contractVersion !== "analysis.observation-snapshot.v2" && r.contractVersion !== "analysis.mixed-snapshot.v3") {
    throw new AnalysisProtocolError("snapshot.contractVersion");
  }
  const base = parseAnalysisBase(r.base);
  digest(r.snapshotId, "snapshot.snapshotId");
  const corrections = list(r.corrections, "snapshot.corrections");
  const families = r.familyUses === undefined ? [] : list(r.familyUses, "snapshot.familyUses");
  const classes = r.classifications === undefined ? [] : list(r.classifications, "snapshot.classifications");
  if (corrections.length + families.length + classes.length > 256) {
    throw new AnalysisProtocolError("snapshot.quota");
  }
  if (r.contractVersion === "analysis.sample-snapshot.v1" && (families.length > 0 || classes.length > 0)) {
    throw new AnalysisProtocolError("snapshot.contractVersion");
  }
  if (r.contractVersion === "analysis.observation-snapshot.v2" && (families.length === 0 || classes.length > 0)) {
    throw new AnalysisProtocolError("snapshot.contractVersion");
  }
  if (r.contractVersion === "analysis.mixed-snapshot.v3" && classes.length === 0) {
    throw new AnalysisProtocolError("snapshot.contractVersion");
  }
  const targets = new Set<string>();
  for (const item of corrections) {
    const c = record(item, "preparedCorrection");
    digest(c.baseId, "correction.baseId");
    digest(c.correctionId, "correction.correctionId");
    const request = parseAnalysisCorrection(c.request);
    const original = parseHistoricalValue(c.original);
    const corrected = parseHistoricalValue(c.corrected);
    const key = JSON.stringify([request.target.channelId, request.target.column, request.target.sampleIndex]);
    if (targets.has(key)) {
      throw new AnalysisProtocolError("correction.duplicateTarget");
    }
    targets.add(key);
    if (!sameAnalysisBase(base, request.base)
      || original.present !== corrected.present
      || original.quality !== corrected.quality
      || original.column !== corrected.column
      || original.scalar.kind !== corrected.scalar.kind
      || original.quality !== request.expected.quality
      || original.column !== request.expected.column
      || original.present !== request.expected.present
      || original.scalar.kind !== request.expected.scalar.kind
      || analysisValue(original) !== analysisValue(request.expected)
      || analysisValue(corrected) !== analysisValue({ ...corrected, scalar: request.replacement })) {
      throw new AnalysisProtocolError("correction.original");
    }
  }
  const familyRequests: AnalysisFamilyCorrection[] = [];
  for (const item of families) {
    const prepared = record(item, "preparedFamilyCorrection");
    digest(prepared.baseId, "family.baseId"); digest(prepared.correctionId, "family.correctionId");
    const request = parseAnalysisFamilyCorrection(prepared.request);
    const original = parseAnalysisFamilyUse(prepared.original), corrected = parseAnalysisFamilyUse(prepared.corrected);
    const reasons = request.included ? [] : [...(original.exclusionReasons ?? [])];
    if (!request.included && !reasons.includes("manual_exclusion")) reasons.push("manual_exclusion");
    if (!sameAnalysisFamilyUse(original, request.expected) || corrected.correctionId || corrected.family !== request.family || corrected.included !== request.included || JSON.stringify(corrected.exclusionReasons ?? []) !== JSON.stringify(reasons)) throw new AnalysisProtocolError("family.original");
    familyRequests.push(request);
  }
  parseAnalysisFamilyCorrections(familyRequests, base);
  const classRequests: AnalysisClassificationCorrection[] = [];
  for (const item of classes) {
    const parsed = parseAnalysisPreparedClassification(item);
    classRequests.push(parsed.request);
  }
  checkClassificationSet(classRequests, base, "snapshot.classifications");
  return r as unknown as AnalysisSnapshot;
}
export function parseAnalysisSaveCommand(value: unknown): AnalysisSaveCommand {
  const r = record(value, "command");
  digest(r.expectedRevision, "command.expectedRevision");
  text(r.commandId, "command.commandId", 256);
  text(r.localAuthorId, "command.localAuthorId", 256);
  text(r.reason, "command.reason", 1024);
  return r as unknown as AnalysisSaveCommand;
}
export function parseCorrectionStoreResult(value: unknown): AnalysisStoreResult {
  const r = record(value, "storeResult");
  digest(r.headId, "headId");
  const rev = record(r.revision, "revision");
  digest(rev.revisionId, "revision.revisionId");
  const s = snapshot(rev.snapshot);
  if (rev.createdAt === "") {
    const command = record(rev.command, "revision.command");
    if (rev.revisionId !== s.snapshotId
      || rev.parentRevisionId !== ""
      || rev.commandDigest !== ""
      || s.corrections.length !== 0
      || (s.familyUses?.length ?? 0) !== 0
      || (s.classifications?.length ?? 0) !== 0
      || ["expectedRevision", "commandId", "reason", "localAuthorId"].some((key) => command[key] !== "")) {
      throw new AnalysisProtocolError("revision.base");
    }
  }
  else {
    timestamp(rev.createdAt, "revision.createdAt");
    digest(rev.parentRevisionId, "revision.parentRevisionId");
    digest(rev.commandDigest, "revision.commandDigest");
    const command = parseAnalysisSaveCommand(rev.command);
    if (command.expectedRevision !== rev.parentRevisionId) {
      throw new AnalysisProtocolError("revision.parent");
    }
  }
  return r as unknown as AnalysisStoreResult;
}
export function parseAnalysisCommandResolution(value: unknown): AnalysisCommandResolution {
  const r = record(value, "commandResolution");
  flag(r.found, "commandResolution.found");
  digest(r.headId, "commandResolution.headId");
  if (r.found) {
    const result = parseCorrectionStoreResult(r);
    if (!result.revision.command.commandId) throw new AnalysisProtocolError("commandResolution.baseHasNoCommand");
  }
  else if (r.revision !== undefined) throw new AnalysisProtocolError("commandResolution.absentRevision");
  return r as unknown as AnalysisCommandResolution;
}
function sampling(value: unknown): void {
  const r = record(value, "sampling");
  oneOf(r.kind, ["continuous_implicit_frequency", "event_timestamped"], "sampling.kind");
  oneOf(r.origin, ["unknown", "source_timestamp"], "sampling.origin");
  if (r.frequency_hz !== undefined) {
    integer(r.frequency_hz, "sampling.frequency", 1);
  }
}
export function parseAnalysisOpenedSession(value: unknown): AnalysisOpenedSession {
  const r = record(value, "opened");
  text(r.sessionId, "opened.sessionId", 256);
  const s = record(r.session, "session");
  if (s.schema_version !== 1) {
    throw new AnalysisProtocolError("session.schema_version");
  }
  text(s.id, "session.id", 256);
  const ids = new Set<string>();
  for (const item of list(s.channels, "channels")) {
    const c = record(item, "channel");
    text(c.id, "channel.id", 256);
    if (ids.has(c.id)) {
      throw new AnalysisProtocolError("channel.duplicate");
    }
    ids.add(c.id);
    text(c.source_name, "channel.source_name");
    unit(c.unit);
    sampling(c.sampling);
    for (const item of list(c.columns, "channel.columns")) {
      const column = record(item, "column");
      text(column.name, "column.name");
      oneOf(column.type, scalarKinds, "column.type");
    }
  }
  for (const item of list(s.metadata, "metadata")) {
    const m = record(item, "metadata");
    text(m.key, "metadata.key");
    flag(m.sensitive, "metadata.sensitive");
    flag(m.present, "metadata.present");
    oneOf(m.quality, qualities, "metadata.quality");
    if (m.redacted !== undefined) {
      flag(m.redacted, "metadata.redacted");
    }
    if (m.value !== undefined && typeof m.value !== "string") {
      throw new AnalysisProtocolError("metadata.value");
    }
    if ((m.sensitive || m.redacted) && m.value !== undefined && m.value !== "") {
      throw new AnalysisProtocolError("metadata.redactedValue");
    }
  }
  return r as unknown as AnalysisOpenedSession;
}
export function parseAnalysisPage(value: unknown): AnalysisPage {
  const r = record(value, "page");
  text(r.channel_id, "page.channel_id");
  integer(r.start, "page.start");
  sampling(r.sampling);
  for (const [i, item] of list(r.samples, "page.samples").entries()) {
    const s = record(item, "sample");
    integer(s.index, "sample.index");
    if (s.index !== (r.start as number) + i) {
      throw new AnalysisProtocolError("sample.order");
    }
    if (s.relative_time_seconds !== undefined) {
      number(s.relative_time_seconds, "sample.relativeTime");
    }
    if (s.timestamp_seconds !== undefined) {
      number(s.timestamp_seconds, "sample.timestamp");
    }
    for (const v of list(s.values, "sample.values"))
      parseHistoricalValue(v);
  }
  return r as unknown as AnalysisPage;
}
export function parseAnalysisCandidates(value: unknown): readonly AnalysisCandidate[] {
  const candidates = list(value, "candidates");
  const ids = new Set<string>();
  for (const item of candidates) {
    const r = record(item, "candidate");
    if (r.displayName !== undefined) {
      text(r.displayName, "candidate.displayName", 1024);
      if (/[\p{Cc}\p{Cf}/\\]/u.test(r.displayName)) throw new AnalysisProtocolError("candidate.displayName");
    }
    text(r.id, "candidate.id", 256);
    if (ids.has(r.id)) {
      throw new AnalysisProtocolError("candidate.duplicate");
    }
    ids.add(r.id);
    text(r.state, "candidate.state");
    integer(r.size, "candidate.size");
    timestamp(r.modifiedAt, "candidate.modifiedAt");
    flag(r.walPresent, "candidate.walPresent");
  }
  return candidates as readonly AnalysisCandidate[];
}
export function parseAnalysisStatus(value: unknown): Readonly<{
  available: boolean;
  code: string;
}> {
  const r = record(value, "status");
  flag(r.available, "status.available");
  text(r.code, "status.code");
  return r as {
    available: boolean;
    code: string;
  };
}

// Native RFC3339 instants can carry nanoseconds. Date is for display only;
// interval identity/order must not collapse distinct sub-millisecond boundaries.
export function analysisLapInstant(value: string): bigint {
  text(value, "lap.instant", 64);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new AnalysisProtocolError("lap.instant");
  const local = Date.parse(`${match[1]}Z`), zoned = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(local) || !Number.isFinite(zoned) || new Date(local).toISOString().slice(0, 19) !== match[1]) throw new AnalysisProtocolError("lap.instant");
  return BigInt(zoned) * 1000000n + BigInt((match[2] ?? "").padEnd(9, "0"));
}
export function parseAnalysisLapTarget(value: unknown): AnalysisLapTarget {
  const r = record(value, "lap.target"); integer(r.number, "lap.number");
  text(r.start, "lap.start", 64); text(r.end, "lap.end", 64);
  const start = analysisLapInstant(r.start), end = analysisLapInstant(r.end);
  if (start === -62135596800000000000n || end === -62135596800000000000n || start >= end) throw new AnalysisProtocolError("lap.interval");
  return r as unknown as AnalysisLapTarget;
}
export function parseAnalysisFamilyUse(value: unknown): AnalysisFamilyUse {
  const r = record(value, "familyUse");
  oneOf(r.family, [...analysisCorrectableFamilies, "session_classification", "lap_validity", "pit", "climate_buckets", "observed_strategy"], "familyUse.family");
  flag(r.included, "familyUse.included");
  const reasons = r.exclusionReasons === null ? [] : list(r.exclusionReasons, "familyUse.exclusionReasons");
  if (reasons.length > 7 || new Set(reasons).size !== reasons.length) throw new AnalysisProtocolError("familyUse.exclusionReasons");
  for (const reason of reasons) oneOf(reason, ["incomplete", "out_lap", "in_lap", "pit", "incident_offtrack", "pace_outlier", "manual_exclusion"], "familyUse.reason");
  if (r.correctionId !== undefined && r.correctionId !== "") digest(r.correctionId, "familyUse.correctionId");
  return r as unknown as AnalysisFamilyUse;
}
function sameAnalysisFamilyUse(a: AnalysisFamilyUse, b: AnalysisFamilyUse): boolean {
  return a.family === b.family && a.included === b.included && (a.correctionId ?? "") === (b.correctionId ?? "") && JSON.stringify(a.exclusionReasons ?? []) === JSON.stringify(b.exclusionReasons ?? []);
}
export function parseAnalysisFamilyCorrection(value: unknown): AnalysisFamilyCorrection {
  const r = record(value, "familyCorrection"); parseAnalysisBase(r.base); parseAnalysisLapTarget(r.target);
  oneOf(r.family, analysisCorrectableFamilies, "familyCorrection.family"); flag(r.included, "familyCorrection.included"); text(r.reason, "familyCorrection.reason", 1024);
  const expected = parseAnalysisFamilyUse(r.expected);
  if (expected.family !== r.family || expected.correctionId || (r.included && expected.exclusionReasons?.includes("incomplete"))) throw new AnalysisProtocolError("familyCorrection.expected");
  return r as unknown as AnalysisFamilyCorrection;
}
export function parseAnalysisFamilyCorrections(value: unknown, base: AnalysisBase): readonly AnalysisFamilyCorrection[] {
  const items = list(value, "familyCorrections"); if (items.length > 256) throw new AnalysisProtocolError("familyCorrections.limit");
  const parsed = items.map(parseAnalysisFamilyCorrection);
  for (const item of parsed) if (!sameAnalysisBase(item.base, base)) throw new AnalysisProtocolError("familyCorrections.base");
  const intervals = parsed.map(item => ({ family: item.family, start: analysisLapInstant(item.target.start), end: analysisLapInstant(item.target.end) }));
  intervals.sort((a, b) => a.family.localeCompare(b.family) || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (let i = 1; i < intervals.length; i++) if (intervals[i].family === intervals[i - 1].family && intervals[i].start < intervals[i - 1].end) throw new AnalysisProtocolError("familyCorrections.overlap");
  return parsed;
}
export function sameAnalysisFamilyCorrections(a: readonly AnalysisFamilyCorrection[], b: readonly AnalysisFamilyCorrection[]): boolean {
  const key = (item: AnalysisFamilyCorrection) => JSON.stringify([item.family, item.target.number, String(analysisLapInstant(item.target.start)), String(analysisLapInstant(item.target.end))]);
  const right = new Map(b.map(item => [key(item), item]));
  return a.length === b.length && a.every(item => { const other = right.get(key(item)); return Boolean(other && sameAnalysisBase(item.base, other.base) && item.reason === other.reason && item.included === other.included && sameAnalysisFamilyUse(item.expected, other.expected)); });
}

export const analysisClassificationFields = ["SessionType", "WeatherConditions"] as const;
export type AnalysisClassificationField = typeof analysisClassificationFields[number];
export type AnalysisClassificationCorrection = Readonly<{ base: AnalysisBase; field: AnalysisClassificationField; expectedOriginal: string; replacement: string; reason: string; provenance: "manual" }>;
export type AnalysisPreparedClassificationCorrection = Readonly<{ baseId: string; correctionId: string; request: AnalysisClassificationCorrection; original: string; corrected: string }>;
const sessionTypes = ["practice", "qualify", "race"] as const;
export const analysisSessionTypes = sessionTypes;
// Go strings.TrimSpace trims Unicode White_Space: NEL yes, FEFF no.
// JS trim differs on both, so classification canonicalization uses this exact set.
const goWhiteSpace = "\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000";
function goTrim(value: string): string {
  return value.replace(new RegExp(`^[${goWhiteSpace}]+|[${goWhiteSpace}]+$`, "g"), "");
}
// Go strings.ToLower is a simple mapping. For the three closed session-type
// tokens only ASCII case plus U+0130 to i can matter; JS toLowerCase would
// turn PRACTİCE into pract+i+dot and wrongly reject what Go accepts.
function goLowerSimple(value: string): string {
  return value.replace(/[A-Z\u0130]/g, (ch) => (ch === "İ" ? "i" : ch.toLowerCase()));
}
// Open sessions carry many metadata keys in mixed case. This maps the two
// correctable ones to their closed field the way native builds its lookup
// with strings.ToLower(strings.TrimSpace(entry.Key)); any other key yields
// undefined and stays uncorrectable. It is not a request parser: the closed
// wire field itself keeps its exact spelling.
export function analysisClassificationFieldForMetadataKey(value: string): AnalysisClassificationField | undefined {
  const key = goLowerSimple(goTrim(value));
  if (key === "sessiontype") {
    return "SessionType";
  }
  if (key === "weatherconditions") {
    return "WeatherConditions";
  }
  return undefined;
}
function unicodeValid(value: string, field: string): void {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    throw new AnalysisProtocolError(field);
  }
}
function canonicalSessionType(value: string): string {
  const lowered = goLowerSimple(goTrim(value));
  if (!(sessionTypes as readonly string[]).includes(lowered)) {
    throw new AnalysisProtocolError("classification.sessionType");
  }
  return lowered;
}
export const analysisCanonicalSessionType = canonicalSessionType;
function canonicalWeatherReplacement(value: string): string {
  const trimmed = goTrim(value);
  if (trimmed === "" || [...trimmed].length > 64 || /[\p{Cc}]/u.test(trimmed)) {
    throw new AnalysisProtocolError("classification.weather");
  }
  return trimmed;
}
function classificationText(value: unknown, field: string, maxBytes: number, allowBlank: boolean): asserts value is string {
  if (typeof value !== "string") {
    throw new AnalysisProtocolError(field);
  }
  unicodeValid(value, field);
  if (new TextEncoder().encode(value).length > maxBytes) {
    throw new AnalysisProtocolError(field);
  }
  if (!allowBlank && goTrim(value) === "") {
    throw new AnalysisProtocolError(field);
  }
}
// The original is validated but returned RAW: Go applies no length limit to
// originals and no trimming to the precondition; the exact comparison decides.
// A SessionType original must already name the closed enum.
export function parseAnalysisClassificationOriginal(field: AnalysisClassificationField, value: unknown): string {
  if (field !== "SessionType" && field !== "WeatherConditions") {
    throw new AnalysisProtocolError("classification.field");
  }
  if (typeof value !== "string") {
    throw new AnalysisProtocolError("classification.expectedOriginal");
  }
  unicodeValid(value, "classification.expectedOriginal");
  if (goTrim(value) === "") {
    throw new AnalysisProtocolError("classification.expectedOriginal");
  }
  if (field === "SessionType") {
    canonicalSessionType(value);
  }
  return value;
}
export function parseAnalysisClassificationCorrection(value: unknown): AnalysisClassificationCorrection {
  const r = record(value, "classificationCorrection");
  parseAnalysisBase(r.base);
  if (r.field !== "SessionType" && r.field !== "WeatherConditions") {
    throw new AnalysisProtocolError("classification.field");
  }
  // No length limit on originals in Go and no trimming of the precondition:
  // the exact comparison decides. The original itself must be Go-nonempty,
  // and a SessionType original must already name the closed enum.
  parseAnalysisClassificationOriginal(r.field, r.expectedOriginal);
  // The replacement is validated normalized but kept raw in the request;
  // the prepared form derives the canonical corrected value from it.
  classificationText(r.replacement, "classification.replacement", 1024, true);
  if (r.field === "SessionType") {
    canonicalSessionType(r.replacement);
  } else {
    canonicalWeatherReplacement(r.replacement);
  }
  classificationText(r.reason, "classification.reason", 1024, false);
  if (r.provenance !== "manual") {
    throw new AnalysisProtocolError("classification.provenance");
  }
  return r as unknown as AnalysisClassificationCorrection;
}
export function parseAnalysisPreparedClassification(value: unknown): AnalysisPreparedClassificationCorrection {
  const r = record(value, "preparedClassificationCorrection");
  digest(r.baseId, "classification.baseId");
  digest(r.correctionId, "classification.correctionId");
  const request = parseAnalysisClassificationCorrection(r.request);
  if (typeof r.original !== "string") {
    throw new AnalysisProtocolError("classification.original");
  }
  unicodeValid(r.original, "classification.original");
  if (goTrim(r.original) === "") {
    throw new AnalysisProtocolError("classification.original");
  }
  if (request.expectedOriginal !== r.original) {
    throw new AnalysisProtocolError("classification.original");
  }
  const corrected = request.field === "SessionType" ? canonicalSessionType(request.replacement) : canonicalWeatherReplacement(request.replacement);
  if (r.corrected !== corrected) {
    throw new AnalysisProtocolError("classification.corrected");
  }
  return r as unknown as AnalysisPreparedClassificationCorrection;
}
function checkClassificationSet(requests: AnalysisClassificationCorrection[], base: AnalysisBase, field: string): void {
  const seen = new Set<string>();
  for (const request of requests) {
    if (!sameAnalysisBase(request.base, base)) {
      throw new AnalysisProtocolError(`${field}.base`);
    }
    if (seen.has(request.field)) {
      throw new AnalysisProtocolError(`${field}.duplicate`);
    }
    seen.add(request.field);
  }
}
export function parseAnalysisClassificationCorrections(value: unknown, base: AnalysisBase): readonly AnalysisClassificationCorrection[] {
  const items = list(value, "classificationCorrections");
  if (items.length > 256) {
    throw new AnalysisProtocolError("classificationCorrections.limit");
  }
  const parsed = items.map(parseAnalysisClassificationCorrection);
  checkClassificationSet(parsed, base, "classificationCorrections");
  return parsed;
}
export function sameAnalysisClassificationCorrections(a: readonly AnalysisClassificationCorrection[], b: readonly AnalysisClassificationCorrection[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const fields = (items: readonly AnalysisClassificationCorrection[]) => items.map((item) => item.field);
  const unique = (items: readonly AnalysisClassificationCorrection[]) => new Set(fields(items)).size === items.length;
  if (!unique(a) || !unique(b)) {
    return false;
  }
  const right = new Map(b.map(item => [item.field, item]));
  return a.every(item => {
    const other = right.get(item.field);
    return Boolean(other && sameAnalysisBase(item.base, other.base) && item.expectedOriginal === other.expectedOriginal && item.replacement === other.replacement && item.reason === other.reason && item.provenance === other.provenance);
  });
}

export type AnalysisLap = Readonly<{ number: number; start?: string; end: string; lapTimeSeconds?: number; complete: boolean; labels: readonly string[] | null; familyUse: readonly AnalysisFamilyUse[] | null }>;
export type AnalysisStintBoundary = Readonly<{
  stintNumber: number; timestamp: string; cause: "pit" | "fuel_jump" | "tyre_change" | "driver_change" | "unknown";
  presence: AnalysisQuality | "unsupported";
  confidence: Readonly<{ sampleSize: number; computationVersion: string; rangeLower?: number; rangeUpper?: number; variance?: number }>;
  provenance: Readonly<{ kind: string; sourceId?: string; observedAt?: string }>;
}>;
export type AnalysisLapCapability = Readonly<{ family: AnalysisCorrectableFamily; automaticIncluded: boolean; effectiveIncluded?: boolean; canInclude: boolean; canExclude: boolean; reason?: "target_unresolved" | "inclusion_requires_complete_coverage" }>;
export type AnalysisLapInspection = Readonly<{ original: AnalysisLap; effective?: AnalysisLap; target?: AnalysisLapTarget; stintBoundary?: AnalysisStintBoundary; capabilities: readonly AnalysisLapCapability[] }>;
export type AnalysisLapPage = Readonly<{ revisionId: string; headId: string; page: Readonly<{ base: AnalysisBase; snapshotId: string; start: number; total: number; laps: readonly AnalysisLapInspection[] }> }>;

function parseInspectedLap(value: unknown, original: boolean): AnalysisLap {
  const r = record(value, "lap"); integer(r.number, "lap.number"); flag(r.complete, "lap.complete");
  text(r.end, "lap.end", 64); analysisLapInstant(r.end);
  if (r.start !== undefined) { text(r.start, "lap.start", 64); analysisLapInstant(r.start); }
  if (r.lapTimeSeconds !== undefined) number(r.lapTimeSeconds, "lap.lapTimeSeconds");
  const labels = r.labels === null ? [] : list(r.labels, "lap.labels");
  if (labels.length > 7) throw new AnalysisProtocolError("lap.labels");
  for (const label of labels) oneOf(label, ["incomplete", "out_lap", "in_lap", "pit", "incident_offtrack", "traffic", "pace_outlier"], "lap.label");
  const uses = r.familyUse === null ? [] : list(r.familyUse, "lap.familyUse");
  if (uses.length > 10) throw new AnalysisProtocolError("lap.familyUse");
  for (const use of uses) { const parsed = parseAnalysisFamilyUse(use); if (original && parsed.correctionId) throw new AnalysisProtocolError("lap.originalCorrection"); }
  return r as unknown as AnalysisLap;
}
function parseInspectedStint(value: unknown): AnalysisStintBoundary {
  const r = record(value, "stintBoundary"); integer(r.stintNumber, "stintBoundary.number", 1);
  text(r.timestamp, "stintBoundary.timestamp", 64); analysisLapInstant(r.timestamp);
  oneOf(r.cause, ["pit", "fuel_jump", "tyre_change", "driver_change", "unknown"], "stintBoundary.cause");
  oneOf(r.presence, [...qualities, "unsupported"], "stintBoundary.presence");
  const confidence = record(r.confidence, "stintBoundary.confidence"); integer(confidence.sampleSize, "stintBoundary.sampleSize");
  if (typeof confidence.computationVersion !== "string" || confidence.computationVersion.length > 256) throw new AnalysisProtocolError("stintBoundary.computationVersion");
  for (const field of ["rangeLower", "rangeUpper", "variance"]) if (confidence[field] !== undefined) number(confidence[field], `stintBoundary.${field}`);
  const provenance = record(r.provenance, "stintBoundary.provenance");
  oneOf(provenance.kind, ["unknown", "observed", "corrected", "manual", "derived", "estimated", "range", "reference"], "stintBoundary.provenance.kind");
  if (provenance.sourceId !== undefined) text(provenance.sourceId, "stintBoundary.sourceId");
  if (provenance.observedAt !== undefined) { text(provenance.observedAt, "stintBoundary.observedAt", 64); analysisLapInstant(provenance.observedAt); }
  return r as unknown as AnalysisStintBoundary;
}
export function parseAnalysisLapPage(value: unknown): AnalysisLapPage {
  const r = record(value, "lapPage"); digest(r.revisionId, "lapPage.revisionId"); digest(r.headId, "lapPage.headId");
  const page = record(r.page, "lapPage.page"); parseAnalysisBase(page.base); digest(page.snapshotId, "lapPage.snapshotId");
  integer(page.start, "lapPage.start"); integer(page.total, "lapPage.total");
  const rows = list(page.laps, "lapPage.laps");
  if (rows.length > 50 || rows.length > Math.max(0, (page.total as number) - (page.start as number))) throw new AnalysisProtocolError("lapPage.bounds");
  for (const value of rows) {
    const row = record(value, "lapPage.row"); const original = parseInspectedLap(row.original, true);
    const effective = row.effective === undefined ? undefined : parseInspectedLap(row.effective, false);
    const target = row.target === undefined ? undefined : parseAnalysisLapTarget(row.target);
    const matches = (lap: AnalysisLap) => target && lap.start !== undefined && target.number === lap.number && analysisLapInstant(target.start) === analysisLapInstant(lap.start) && analysisLapInstant(target.end) === analysisLapInstant(lap.end);
    if ((target && !matches(original)) || (effective && !matches(effective))) throw new AnalysisProtocolError("lapPage.targetMismatch");
    if (row.stintBoundary !== undefined) { const boundary = parseInspectedStint(row.stintBoundary); if (original.start === undefined || analysisLapInstant(boundary.timestamp) > analysisLapInstant(original.start)) throw new AnalysisProtocolError("lapPage.stintBoundary"); }
    const capabilities = list(row.capabilities, "lapPage.capabilities"), seen = new Set<string>();
    if (capabilities.length !== analysisCorrectableFamilies.length) throw new AnalysisProtocolError("lapPage.capabilities");
    for (const value of capabilities) {
      const capability = record(value, "lapPage.capability"); oneOf(capability.family, analysisCorrectableFamilies, "lapPage.family");
      const family = capability.family as string; if (seen.has(family)) throw new AnalysisProtocolError("lapPage.duplicateFamily"); seen.add(family);
      for (const field of ["automaticIncluded", "canInclude", "canExclude"]) flag(capability[field], `lapPage.${field}`);
      if (effective) flag(capability.effectiveIncluded, "lapPage.effectiveIncluded");
      else if (capability.effectiveIncluded !== undefined) throw new AnalysisProtocolError("lapPage.unresolvedRule");
      if (capability.reason !== undefined) oneOf(capability.reason, ["target_unresolved", "inclusion_requires_complete_coverage"], "lapPage.reason");
      if ((capability.canInclude && !capability.canExclude) || ((capability.canInclude || capability.canExclude) && (!target || !effective)) || (!capability.canInclude && capability.reason === undefined)) throw new AnalysisProtocolError("lapPage.capabilityContradiction");
      if ((capability.automaticIncluded && original.familyUse?.some(use => use.family === family && !use.included)) || (capability.effectiveIncluded && effective?.familyUse?.some(use => use.family === family && !use.included))) throw new AnalysisProtocolError("lapPage.ruleContradiction");
    }
  }
  return r as unknown as AnalysisLapPage;
}
