import { parseAnalysisLapPage, analysisCorrectableFamilies, analysisLapInstant, parseAnalysisFamilyCorrections, parseAnalysisLapTarget, sameAnalysisFamilyCorrections } from "./analysis-contract";
import { describe, expect, it } from "vitest";
import { analysisValue, parseAnalysisCandidates, parseAnalysisCommandResolution, parseAnalysisPreparation, parseCorrectionStoreResult, parseHistoricalValue } from "./analysis-contract";
import { analysisCanonicalSessionType, analysisClassificationFieldForMetadataKey, analysisSessionTypes, parseAnalysisClassificationCorrection, parseAnalysisClassificationCorrections, parseAnalysisClassificationOriginal, parseAnalysisPreparedClassification, sameAnalysisClassificationCorrections } from "./analysis-contract";
import type { AnalysisClassificationCorrection, AnalysisClassificationField } from "./analysis-contract";
describe("local discovery labels", () => {
  const candidate = { id: "opaque", state: "ready", size: 10, modifiedAt: "2026-09-10T00:00:00Z", walPresent: false };
  it("accepts optional sanitized names without deriving identity", () => {
    expect(parseAnalysisCandidates([candidate])).toEqual([candidate]);
    expect(parseAnalysisCandidates([{ ...candidate, displayName: "São_Paulo.duckdb" }])[0]).toMatchObject({ id: "opaque", displayName: "São_Paulo.duckdb" });
  });
  it.each([null, 1, "", "a/b.duckdb", "C:\\a.duckdb", "a\nb", "a\u202eb", "界".repeat(400)])("rejects unsafe local label %j", displayName => {
    expect(() => parseAnalysisCandidates([{ ...candidate, displayName }])).toThrow();
  });
});
const base = { sessionId: "session", contentSha256: "a".repeat(64), sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "lap-validity.v1", segmentationDigest: "b".repeat(64) };
const snapshotId = "c".repeat(64);
describe("prepared editable channels", () => {
  it("requires explicit capability and preserves an empty supported set", () => {
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId })).not.toHaveProperty("editableChannelIds");
    for (const editableChannelIds of [[], ["lap", "fuel"]]) {
      expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId, editableChannelIds })).toMatchObject({ editableChannelIds });
    }
  });
  it.each([null, "lap", [""], [1], ["lap", "lap"], ["界".repeat(100)]].map(editableChannelIds => ({ editableChannelIds })))("rejects malformed capability $editableChannelIds", ({ editableChannelIds }) => {
    expect(() => parseAnalysisPreparation({ base, baseRevisionId: snapshotId, editableChannelIds })).toThrow();
  });
});
const combination = { id: `lmu:${"d".repeat(64)}`, simId: "lmu", trackName: "Imola", trackLayout: "Grand Prix", carName: "Car", carClass: "Hypercar" };
describe("prepared combination identity", () => {
  it("preserves the canonical identity without requiring a preexisting catalog", () => {
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId, combination })).toMatchObject({ combination });
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId })).not.toHaveProperty("combination");
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId, combinationUnavailableReason: "metadata_unavailable" })).toMatchObject({ combinationUnavailableReason: "metadata_unavailable" });
  });
  it.each([
    { combination: null }, { combination: {} }, { combination: { ...combination, simId: "" } },
    { combination: { ...combination, trackName: 12 } }, { combination: { ...combination, carName: undefined } },
    { combination, combinationUnavailableReason: "metadata_unavailable" },
    { combinationUnavailableReason: "guessed" }, { combinationUnavailableReason: null },
  ])("rejects malformed or contradictory metadata: %j", fields => {
    expect(() => parseAnalysisPreparation({ base, baseRevisionId: snapshotId, ...fields })).toThrow();
  });
});
describe("prepared base digest", () => {
  const digest = "e".repeat(64);
  it("accepts a valid digest and preserves legacy responses without it", () => {
    const prepared = { base, baseRevisionId: snapshotId, baseDigest: digest };
    expect(parseAnalysisPreparation(prepared)).toBe(prepared);
    const legacy = { base, baseRevisionId: snapshotId };
    expect(parseAnalysisPreparation(legacy)).toBe(legacy);
    expect(parseAnalysisPreparation(legacy)).not.toHaveProperty("baseDigest");
  });
  it("accepts a digest alongside metadata_unavailable", () => {
    const prepared = { base, baseRevisionId: snapshotId, baseDigest: digest, combinationUnavailableReason: "metadata_unavailable" };
    expect(parseAnalysisPreparation(prepared)).toBe(prepared);
  });
  it.each([
    { baseDigest: null },
    { baseDigest: "" },
    { baseDigest: "  " },
    { baseDigest: "xyz" },
    { baseDigest: "E".repeat(64) },
    { baseDigest: "e".repeat(63) },
    { baseDigest: 12 },
  ])("rejects malformed digest %j", (fields) => {
    expect(() => parseAnalysisPreparation({ base, baseRevisionId: snapshotId, ...fields })).toThrow("preparation.baseDigest");
  });
});
const baseResult = () => ({ headId: snapshotId, revision: { revisionId: snapshotId, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId, corrections: [] } } });
describe("uncertain command resolution", () => {
  it("distinguishes confirmed absence from an actual revision", () => {
    expect(parseAnalysisCommandResolution({ found: false, headId: snapshotId })).toEqual({ found: false, headId: snapshotId });
    const saved = baseResult();
    saved.revision.parentRevisionId = "d".repeat(64);
    saved.revision.command = { expectedRevision: saved.revision.parentRevisionId, commandId: "saved", reason: "Reviewed", localAuthorId: "local" };
    saved.revision.createdAt = "2026-09-10T00:00:00Z";
    saved.revision.commandDigest = "e".repeat(64);
    expect(parseAnalysisCommandResolution({ found: true, ...saved }).found).toBe(true);
  });
  it.each([null, { found: false }, { found: "false", headId: snapshotId }, { found: false, ...baseResult() }, { found: true, headId: snapshotId }, { found: true, ...baseResult() }])("rejects ambiguous resolution %j", value => {
    expect(() => parseAnalysisCommandResolution(value)).toThrow();
  });
});
describe("Analysis correction wire contract", () => {
  it.each([
    [{ column: "v", present: true, quality: "unknown", scalar: { kind: "number" } }, 0],
    [{ column: "v", present: true, quality: "valid", scalar: { kind: "boolean" } }, false],
    [{ column: "v", present: false, quality: "missing", scalar: { kind: "number" } }, null],
    [{ column: "v", present: true, quality: "invalid", scalar: { kind: "number", number: 12 } }, 12],
  ])("preserves typed zero, false, absence and original quality", (wire, expected) => {
    const value = parseHistoricalValue(wire);
    expect(analysisValue(value)).toBe(expected);
    expect(value.quality).toBe(wire.quality);
  });
  it.each([{ kind: "integer", integer: Number.MAX_SAFE_INTEGER + 1 }, { kind: "number", number: NaN }, { kind: "number", number: null }, { kind: "boolean", integer: 1 }])("rejects ambiguous or unsafe scalars", (scalar) => {
    expect(() => parseHistoricalValue({ column: "v", present: true, quality: "valid", scalar })).toThrow();
  });
  it("accepts an explicit base revision and rejects fabricated metadata", () => {
    expect(parseAnalysisPreparation({ base, baseRevisionId: snapshotId }).base).toEqual(base);
    expect(parseCorrectionStoreResult(baseResult()).revision.snapshot.corrections).toEqual([]);
    const altered = baseResult();
    altered.revision.command.reason = "pretend saved";
    expect(() => parseCorrectionStoreResult(altered)).toThrow();
    expect(() => parseAnalysisPreparation({ base: { ...base, contentSha256: "A".repeat(64) }, baseRevisionId: snapshotId })).toThrow();
  });
  it("preserves a saved correction and rejects a quality promotion or foreign base", () => {
    const original = { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 10 } };
    const replacement = { kind: "number", number: 0 };
    const correction = { baseId: "d".repeat(64), correctionId: "e".repeat(64), request: { base, target: { channelId: "fuel", column: "v", sampleIndex: 4 }, unit: { symbol: "L", quality: "valid" }, expected: original, replacement, reason: "test" }, original, corrected: { ...original, scalar: replacement } };
    const result = { headId: "f".repeat(64), revision: { revisionId: "f".repeat(64), parentRevisionId: snapshotId, command: { expectedRevision: snapshotId, commandId: "save", reason: "test", localAuthorId: "local" }, commandDigest: "d".repeat(64), createdAt: "2026-09-08T12:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: "e".repeat(64), corrections: [correction] } } };
    expect(parseCorrectionStoreResult(result).revision.snapshot.corrections[0].corrected.quality).toBe("unknown");
    correction.corrected.quality = "valid";
    expect(() => parseCorrectionStoreResult(result)).toThrow();
    correction.corrected.quality = "unknown";
    correction.request.base = { ...base, sessionId: "foreign" };
    expect(() => parseCorrectionStoreResult(result)).toThrow();
  });
});

function mixedFamilyResult() {
  const request = { base, target: { number: 2, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z" }, family: "combined_stint_pace_curve" as const, expected: { family: "combined_stint_pace_curve", included: true, exclusionReasons: null }, included: false, reason: "Reviewed pace only" };
  const prepared = { baseId: "b".repeat(64), correctionId: "c".repeat(64), request, original: request.expected, corrected: { family: request.family, included: false, exclusionReasons: ["manual_exclusion"] } };
  const parent = "d".repeat(64);
  return { headId: snapshotId, revision: { revisionId: snapshotId, parentRevisionId: parent, command: { expectedRevision: parent, commandId: "mixed", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "e".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.observation-snapshot.v2", base, snapshotId, corrections: [], familyUses: [prepared] } } };
}
describe("mixed family correction contract", () => {
  it("retains complete mixed snapshots and scalar legacy", () => {
    const result = mixedFamilyResult();
    expect(parseCorrectionStoreResult(result)).toBe(result);
    expect(parseCorrectionStoreResult(baseResult()).revision.snapshot.familyUses).toBeUndefined();
  });
  it.each(["wrong version", "missing families", "changed original", "changed corrected", "overlap", "wrong base", "pretended original correction", "mixed base revision"])("rejects %s", mode => {
    const value = mixedFamilyResult();
    const snapshot = value.revision.snapshot;
    if (mode === "wrong version") snapshot.contractVersion = "analysis.sample-snapshot.v1";
    if (mode === "missing families") snapshot.familyUses = [];
    if (mode === "changed original") snapshot.familyUses[0].original = { ...snapshot.familyUses[0].original, included: false };
    if (mode === "changed corrected") snapshot.familyUses[0].corrected.included = true;
    if (mode === "overlap") snapshot.familyUses.push(structuredClone(snapshot.familyUses[0]));
    if (mode === "wrong base") snapshot.familyUses[0].request.base = { ...base, sessionId: "other" };
    if (mode === "pretended original correction") Object.assign(snapshot.familyUses[0].request.expected, { correctionId: "f".repeat(64) });
    if (mode === "mixed base revision") { value.revision.createdAt = ""; value.revision.parentRevisionId = ""; value.revision.commandDigest = ""; value.revision.command = { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }; }
    expect(() => parseCorrectionStoreResult(value)).toThrow();
  });
  it("preserves nanosecond ordering and canonical instant identity", () => {
    const item = mixedFamilyResult().revision.snapshot.familyUses[0].request;
    const first = { ...item, target: { number: 2, start: "2026-09-10T12:00:00.000000001Z", end: "2026-09-10T12:00:00.000000002Z" } };
    const adjacent = { ...item, target: { number: 3, start: first.target.end, end: "2026-09-10T12:00:00.000000003Z" } };
    expect(parseAnalysisFamilyCorrections([first, adjacent], base)).toEqual([first, adjacent]);
    expect(analysisLapInstant(adjacent.target.end) - analysisLapInstant(first.target.start)).toBe(2n);
    const local = { ...first, target: { ...first.target, start: "2026-09-10T14:00:00.000000001+02:00", end: "2026-09-10T14:00:00.000000002+02:00" } };
    expect(sameAnalysisFamilyCorrections([first], [local])).toBe(true);
    expect(() => parseAnalysisFamilyCorrections([first, local], base)).toThrow("overlap");
    expect(() => parseAnalysisLapTarget({ ...first.target, end: first.target.start })).toThrow();
    expect(() => analysisLapInstant("2026-02-30T00:00:00Z")).toThrow();
    expect(() => analysisLapInstant("2026-09-10T12:00:00.1234567891Z")).toThrow();
  });
});

function inspectedLapResult() {
  const original = { number: 2, start: "2026-09-10T12:00:00Z", end: "2026-09-10T12:01:30Z", complete: true, labels: [], familyUse: analysisCorrectableFamilies.map(family => ({ family, included: true, exclusionReasons: null })) };
  return { revisionId: "d".repeat(64), headId: "e".repeat(64), page: { base, snapshotId, start: 0, total: 1, laps: [{ original, effective: structuredClone(original), target: { number: original.number, start: original.start, end: original.end }, capabilities: analysisCorrectableFamilies.map(family => ({ family, automaticIncluded: true, effectiveIncluded: true, canInclude: true, canExclude: true })) }] } };
}
describe("recorded lap inspection contract", () => {
  it("preserves explicit false, zero and unknown recorded boundary quality", () => {
    const value = inspectedLapResult(), row = value.page.laps[0];
    row.effective.familyUse[0].included = false; row.capabilities[0].effectiveIncluded = false;
    Object.assign(row.effective, { lapTimeSeconds: 0 });
    Object.assign(row, { stintBoundary: { stintNumber: 2, timestamp: row.original.start, cause: "unknown", presence: "unknown", confidence: { sampleSize: 0, computationVersion: "" }, provenance: { kind: "unknown" } } });
    expect(parseAnalysisLapPage(value)).toBe(value);
    expect(parseAnalysisLapPage(value).page.laps[0].capabilities[0].effectiveIncluded).toBe(false);
  });
  it("keeps unresolved observations inspectable without inventing effective use", () => {
    const value = inspectedLapResult(), row = value.page.laps[0];
    Object.assign(row, { target: undefined, effective: undefined }); Object.assign(row.original, { start: undefined, complete: false });
    for (const capability of row.capabilities) Object.assign(capability, { canInclude: false, canExclude: false, effectiveIncluded: undefined, reason: "target_unresolved" });
    expect(parseAnalysisLapPage(value).page.laps[0].effective).toBeUndefined();
  });
  it.each(["other interval", "missing target", "duplicate family", "missing rule", "contradictory rule", "missing reason", "excess rows", "unknown revision", "future boundary"])("rejects %s", mode => {
    const value = inspectedLapResult(), row = value.page.laps[0];
    if (mode === "other interval") row.effective.end = "2026-09-10T12:01:31Z";
    if (mode === "missing target") Object.assign(row, { target: undefined });
    if (mode === "duplicate family") row.capabilities[1].family = row.capabilities[0].family;
    if (mode === "missing rule") Object.assign(row.capabilities[0], { effectiveIncluded: undefined });
    if (mode === "contradictory rule") row.effective.familyUse[0].included = false;
    if (mode === "missing reason") row.capabilities[0].canInclude = false;
    if (mode === "excess rows") value.page.total = 0;
    if (mode === "unknown revision") value.revisionId = "";
    if (mode === "future boundary") Object.assign(row, { stintBoundary: { stintNumber: 2, timestamp: row.original.end, cause: "pit", presence: "valid", confidence: { sampleSize: 1, computationVersion: "fixture" }, provenance: { kind: "derived" } } });
    expect(() => parseAnalysisLapPage(value)).toThrow();
  });
});

// Contract fixtures below are hand-built shapes, not real recorded data.
function classRequest(overrides: Record<string, unknown> = {}) {
  return { base, field: "SessionType", expectedOriginal: "race", replacement: "qualify", reason: "Reviewed", provenance: "manual", ...overrides };
}
function preparedClass(requestOverrides: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const request = classRequest(requestOverrides);
  const corrected = request.field === "SessionType" ? "qualify" : "Wet";
  return { baseId: "b".repeat(64), correctionId: "c".repeat(64), request, original: request.expectedOriginal, corrected, ...overrides };
}
function weatherPrepared(expectedOriginal: string, replacement: string, corrected: string) {
  return preparedClass({ field: "WeatherConditions", expectedOriginal, replacement }, { corrected });
}
function classSnapshot(contractVersion: string, corrections: unknown[], families: unknown[], classes: unknown[]) {
  return { contractVersion, base, snapshotId, corrections, familyUses: families.length > 0 || contractVersion !== "analysis.sample-snapshot.v1" ? families : undefined, classifications: classes.length > 0 ? classes : undefined };
}
function classRevision(snapshot: Record<string, unknown>) {
  return { headId: "f".repeat(64), revision: { revisionId: "f".repeat(64), parentRevisionId: snapshotId, command: { expectedRevision: snapshotId, commandId: "classify", reason: "Reviewed", localAuthorId: "local" }, commandDigest: "d".repeat(64), createdAt: "2026-09-10T00:00:00Z", snapshot } };
}
describe("classification correction contract", () => {
  it("parses v3 class-only and three-group snapshots by identity", () => {
    const solo = classRevision(classSnapshot("analysis.mixed-snapshot.v3", [], [], [preparedClass()]));
    expect(parseCorrectionStoreResult(solo)).toBe(solo);
    const family = mixedFamilyResult().revision.snapshot.familyUses[0];
    const scalar = { baseId: "b".repeat(64), correctionId: "c".repeat(64), request: { base, target: { channelId: "fuel", column: "v", sampleIndex: 4 }, unit: { symbol: "L", quality: "valid" }, expected: { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 10 } }, replacement: { kind: "number", number: 0 }, reason: "test" }, original: { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 10 } }, corrected: { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 0 } } };
    const mixed = classRevision(classSnapshot("analysis.mixed-snapshot.v3", [scalar], [family], [preparedClass(), weatherPrepared("Dry", "Wet", "Wet")]));
    expect(parseCorrectionStoreResult(mixed)).toBe(mixed);
    expect(parseCorrectionStoreResult(baseResult()).revision.snapshot.classifications).toBeUndefined();
  });
  it.each([
    ["v3 without classes", "analysis.mixed-snapshot.v3", [], [], []],
    ["v2 with classes", "analysis.observation-snapshot.v2", [], [], [preparedClass()]],
    ["v1 with classes", "analysis.sample-snapshot.v1", [], [], [preparedClass()]],
    ["unknown version", "analysis.mixed-snapshot.v9", [], [], [preparedClass()]],
  ])("rejects %s", (_label, contractVersion, corrections, families, classes) => {
    expect(() => parseCorrectionStoreResult(classRevision(classSnapshot(contractVersion as string, corrections as unknown[], families as unknown[], classes as unknown[])))).toThrow();
  });
  it("rejects empty base revision carrying classifications", () => {
    const empty = baseResult();
    Object.assign(empty.revision.snapshot, { contractVersion: "analysis.mixed-snapshot.v3", classifications: [preparedClass()] });
    expect(() => parseCorrectionStoreResult(empty)).toThrow();
  });
  it("rejects foreign base against the snapshot base", () => {
    const other = { ...base, sessionId: "other" };
    expect(() => parseAnalysisClassificationCorrections([classRequest()], other)).toThrow("classificationCorrections.base");
    expect(parseAnalysisClassificationCorrections([classRequest()], base)).toHaveLength(1);
  });
  it("validates request semantics directly", () => {
    expect(parseAnalysisClassificationCorrection(classRequest())).toBeDefined();
    const bad = [
      { expectedOriginal: "banana" },
      { expectedOriginal: "  " },
      { expectedOriginal: "ra\uD800ce" },
      { replacement: "sprint" },
      { replacement: "quali\uD800fy" },
      { field: "WeatherConditions", expectedOriginal: "Dry", replacement: "w".repeat(65) },
      { field: "WeatherConditions", expectedOriginal: "Dry", replacement: "Dry\nWet" },
      { reason: "  " },
    ];
    for (const overrides of bad) {
      expect(() => parseAnalysisClassificationCorrection(classRequest(overrides))).toThrow();
    }
  });
  it("compares every request field and both-side duplicates", () => {
    const first = parseAnalysisClassificationCorrection(classRequest());
    const second = parseAnalysisClassificationCorrection(classRequest({ field: "WeatherConditions", expectedOriginal: "Dry", replacement: "Wet" }));
    expect(sameAnalysisClassificationCorrections([first, second], [second, first])).toBe(true);
    const Alter = (patch: Record<string, unknown>) => ({ ...first, ...patch }) as AnalysisClassificationCorrection;
    const variants = [
      Alter({ base: { ...base, sessionId: "other" } }),
      Alter({ field: "WeatherConditions" }),
      Alter({ expectedOriginal: "practice" }),
      Alter({ replacement: "race" }),
      Alter({ reason: "other" }),
      Alter({ provenance: "auto" }),
    ];
    for (const variant of variants) {
      expect(sameAnalysisClassificationCorrections([first, second], [second, variant])).toBe(false);
    }
    expect(sameAnalysisClassificationCorrections([first, first], [first, second])).toBe(false);
    expect(sameAnalysisClassificationCorrections([first, second], [second, second])).toBe(false);
  });
  it("rejects duplicate fields in snapshot and set", () => {
    const dup = [preparedClass(), preparedClass()];
    expect(() => parseCorrectionStoreResult(classRevision(classSnapshot("analysis.mixed-snapshot.v3", [], [], dup)))).toThrow();
    expect(() => parseAnalysisClassificationCorrections(dup.map((item) => item.request), base)).toThrow();
    expect(parseAnalysisClassificationCorrections([preparedClass().request], base)).toHaveLength(1);
  });
  it.each([
    ["unknown field", { field: "TrackName" }, "classification.field"],
    ["unknown original enum", { expectedOriginal: "banana" }, "classification.sessionType"],
    ["empty original", { expectedOriginal: "  " }, "classification.expectedOriginal"],
    ["unknown replacement enum", { replacement: "sprint" }, "classification.sessionType"],
    ["expected trimmed mismatch", { expectedOriginal: "race " }, "classification.original", { original: "race" }],
    ["corrected mismatch", {}, "classification.corrected", { corrected: "race" }],
    ["weather too long", { field: "WeatherConditions", expectedOriginal: "Dry", replacement: "w".repeat(65) }, "classification.weather"],
    ["weather interior control", { field: "WeatherConditions", expectedOriginal: "Dry", replacement: "Dry\nWet" }, "classification.weather"],
    ["empty reason", { reason: "  " }, "classification.reason"],
    ["oversized reason", { reason: "m".repeat(1025) }, "classification.reason"],
    ["oversized raw replacement", { field: "WeatherConditions", expectedOriginal: "Dry", replacement: `${" ".repeat(2000)}Dry` }, "classification.replacement"],
    ["non-manual provenance", { provenance: "auto" }, "classification.provenance"],
    ["malformed baseId", {}, "classification.baseId", { baseId: "x" }],
    ["malformed correctionId", {}, "classification.correctionId", { correctionId: "y" }],
    ["lone surrogate reason", { reason: "ok\uD800" }, "classification.reason"],
  ])("rejects %s", (_label, requestOverrides, message, preparedOverrides = {}) => {
    const prepared = preparedClass(requestOverrides as Record<string, unknown>, preparedOverrides as Record<string, unknown>);
    expect(() => parseAnalysisPreparedClassification(prepared)).toThrow(message as string);
  });
  it("accepts long originals without trimming or 4096 cap", () => {
    const original = "w".repeat(5000);
    const prepared = weatherPrepared(original, "Dry", "Dry");
    expect(parseAnalysisPreparedClassification(prepared)).toBe(prepared);
    const spaced = preparedClass({ expectedOriginal: "  Race  " }, { original: "  Race  ", corrected: "qualify" });
    expect(parseAnalysisPreparedClassification(spaced)).toBe(spaced);
  });
  it("enforces raw replacement byte bounds", () => {
    expect(parseAnalysisPreparedClassification(weatherPrepared("Dry", `${" ".repeat(1021)}Dry`, "Dry"))).toBeDefined();
    expect(() => parseAnalysisPreparedClassification(weatherPrepared("Dry", `${" ".repeat(1022)}Dry`, "Dry"))).toThrow("classification.replacement");
  });
  it("parses 256 valid mixed targets and rejects 257", () => {
    const scalar = { baseId: "b".repeat(64), correctionId: "c".repeat(64), request: { base, target: { channelId: "fuel", column: "v", sampleIndex: 4 }, unit: { symbol: "L", quality: "valid" }, expected: { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 10 } }, replacement: { kind: "number", number: 0 }, reason: "test" }, original: { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 10 } }, corrected: { column: "v", present: true, quality: "unknown", scalar: { kind: "number", number: 0 } } };
    const scalars = Array.from({ length: 253 }, (_, i) => ({ ...structuredClone(scalar), request: { ...scalar.request, target: { ...scalar.request.target, sampleIndex: i } } }));
    const family = mixedFamilyResult().revision.snapshot.familyUses;
    const classes = [preparedClass(), weatherPrepared("Dry", "Wet", "Wet")];
    const ok = classRevision(classSnapshot("analysis.mixed-snapshot.v3", scalars, family, classes));
    expect(parseCorrectionStoreResult(ok)).toBe(ok);
    const last = { ...structuredClone(scalar), request: { ...scalar.request, target: { ...scalar.request.target, sampleIndex: 253 } } };
    const over = classRevision(classSnapshot("analysis.mixed-snapshot.v3", [...scalars, last], family, classes));
    expect(() => parseCorrectionStoreResult(over)).toThrow("snapshot.quota");
  });
  it("compares classification sets order-independently without mutating", () => {
    const first = parseAnalysisClassificationCorrection(classRequest());
    const second = parseAnalysisClassificationCorrection(classRequest({ field: "WeatherConditions", expectedOriginal: "Dry", replacement: "Wet" }));
    const before = structuredClone([first, second]);
    expect(sameAnalysisClassificationCorrections([first, second], [second, first])).toBe(true);
    expect(sameAnalysisClassificationCorrections([first], [first, second])).toBe(false);
    expect(sameAnalysisClassificationCorrections([first, second], [second, { ...first, reason: "other" }])).toBe(false);
    expect(sameAnalysisClassificationCorrections([first, first], [first, second])).toBe(false);
    expect([first, second]).toEqual(before);
    const snap = classRevision(classSnapshot("analysis.mixed-snapshot.v3", [], [], [preparedClass(), weatherPrepared("Dry", "Wet", "Wet")]));
    const frozen = structuredClone(snap);
    expect(parseCorrectionStoreResult(snap)).toBe(snap);
    expect(snap).toEqual(frozen);
  });
  it("resolves metadata keys to the closed fields without a general normalizer", () => {
    expect(analysisClassificationFieldForMetadataKey("SessionType")).toBe("SessionType");
    expect(analysisClassificationFieldForMetadataKey("  SESSIONTYPE  ")).toBe("SessionType");
    expect(analysisClassificationFieldForMetadataKey("SESS\u0130ONTYPE")).toBe("SessionType");
    expect(analysisClassificationFieldForMetadataKey("weatherconditions")).toBe("WeatherConditions");
    expect(analysisClassificationFieldForMetadataKey("WeatherConditions\u00A0")).toBe("WeatherConditions");
    expect(analysisClassificationFieldForMetadataKey("\u0085WeatherConditions\u0085")).toBe("WeatherConditions");
    for (const key of ["\uFEFFSessionType", "TrackName", "session_type", "sessiontypex", ""]) {
      expect(analysisClassificationFieldForMetadataKey(key)).toBeUndefined();
    }
  });
  it("matches Go whitespace and case edges exactly", () => {
    expect(parseAnalysisPreparedClassification(weatherPrepared("Dry", "D\u00A0ry", "D\u00A0ry")).corrected).toBe("D\u00A0ry");
    expect(() => parseAnalysisPreparedClassification(weatherPrepared("Dry", "D\u0085ry", "D\u0085ry"))).toThrow("classification.weather");
    expect(parseAnalysisPreparedClassification(weatherPrepared("Dry", "Dry\u0085", "Dry"))).toBeDefined();
    expect(parseAnalysisPreparedClassification(weatherPrepared("Dry", "D\u202Fry", "D\u202Fry")).corrected).toBe("D\u202Fry");
    const feff = weatherPrepared("Dry", "Dry\uFEFF", "Dry\uFEFF");
    expect(parseAnalysisPreparedClassification(feff).corrected).toBe("Dry\uFEFF");
    const turkish = preparedClass({ expectedOriginal: "PRACT\u0130CE", replacement: "PRACT\u0130CE" }, { original: "PRACT\u0130CE", corrected: "practice" });
    expect("PRACT\u0130CE".toLowerCase()).not.toBe("practice");
    expect(parseAnalysisPreparedClassification(turkish).corrected).toBe("practice");
    expect(parseAnalysisPreparedClassification(weatherPrepared("Dry", "😀".repeat(64), "😀".repeat(64)))).toBeDefined();
    expect(() => parseAnalysisPreparedClassification(weatherPrepared("Dry", "😀".repeat(65), "😀".repeat(65)))).toThrow("classification.weather");
    expect(new TextEncoder().encode(parseAnalysisClassificationCorrection(classRequest({ reason: "é".repeat(512) })).reason).length).toBe(1024);
    expect(() => parseAnalysisClassificationCorrection(classRequest({ reason: "é".repeat(513) }))).toThrow("classification.reason");
  });
});

describe("classification original query", () => {
  it("returns the raw original without trimming or a new limit", () => {
    expect(parseAnalysisClassificationOriginal("SessionType", "race ")).toBe("race ");
    expect(parseAnalysisClassificationOriginal("SessionType", "  Race  ")).toBe("  Race  ");
    const long = "w".repeat(5000);
    expect(parseAnalysisClassificationOriginal("WeatherConditions", long)).toBe(long);
  });
  it("requires the closed field, a valid Unicode string and a known enum", () => {
    expect(() => parseAnalysisClassificationOriginal("TrackName" as unknown as AnalysisClassificationField, "race")).toThrow("classification.field");
    for (const value of [undefined, 12, "", "  ", "ra" + String.fromCharCode(0xD800) + "ce"]) {
      expect(() => parseAnalysisClassificationOriginal("WeatherConditions", value)).toThrow();
    }
    expect(() => parseAnalysisClassificationOriginal("SessionType", "banana")).toThrow("classification.sessionType");
    expect(parseAnalysisClassificationOriginal("SessionType", "PRACTİCE")).toBe("PRACTİCE");
    expect(parseAnalysisClassificationOriginal("WeatherConditions", "banana")).toBe("banana");
  });
  it("matches the builder precondition exactly", () => {
    const spaced = classRequest({ expectedOriginal: "  Race  " });
    expect(parseAnalysisClassificationCorrection(spaced)).toBe(spaced);
    expect(() => parseAnalysisClassificationCorrection(classRequest({ expectedOriginal: "banana" }))).toThrow("classification.sessionType");
    const prepared = preparedClass({ expectedOriginal: "  Race  " }, { original: "  Race  ", corrected: "qualify" });
    expect(parseAnalysisPreparedClassification(prepared)).toBe(prepared);
  });
  it("shares the closed enum and Go canonicalization without a new normalizer", () => {
    expect(analysisSessionTypes).toEqual(["practice", "qualify", "race"]);
    expect(analysisCanonicalSessionType("  RACE ")).toBe("race");
    expect(analysisCanonicalSessionType("PRACTİCE")).toBe("practice");
    expect(analysisCanonicalSessionType("race")).toBe("race");
    expect(() => analysisCanonicalSessionType("sprint")).toThrow("classification.sessionType");
    expect(() => analysisCanonicalSessionType("﻿race")).toThrow("classification.sessionType");
  });
});
