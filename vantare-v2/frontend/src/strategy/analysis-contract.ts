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
export type AnalysisSnapshot = Readonly<{
  contractVersion: "analysis.sample-snapshot.v1";
  base: AnalysisBase;
  snapshotId: string;
  corrections: readonly AnalysisPreparedCorrection[];
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
  if (r.contractVersion !== "analysis.sample-snapshot.v1") {
    throw new AnalysisProtocolError("snapshot.contractVersion");
  }
  const base = parseAnalysisBase(r.base);
  digest(r.snapshotId, "snapshot.snapshotId");
  const corrections = list(r.corrections, "snapshot.corrections");
  if (corrections.length > 256) {
    throw new AnalysisProtocolError("snapshot.corrections");
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
