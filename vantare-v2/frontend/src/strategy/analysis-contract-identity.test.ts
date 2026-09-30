import { describe, expect, it } from "vitest";
import { analysisClassificationFields, analysisIdentityClassificationFields, analysisLegacyClassificationFields, parseAnalysisClassificationCorrection, parseAnalysisClassificationCorrections, parseAnalysisPreparedClassification, parseCorrectionStoreResult, sameAnalysisClassificationCorrections } from "./analysis-contract";
import snapshotV4 from "./testdata/analysis-identity-snapshot-v4.json";

// The committed snapshot comes from the native J2 constructor and is
// contrasted byte-for-byte by the Go wire test. The revision envelope below
// is a test wrapper with well-formed synthetic digests: it exercises the
// public store parser without claiming native revision authority.
const wrap = (snapshot: unknown) => ({
  headId: "f".repeat(64),
  revision: {
    revisionId: "f".repeat(64),
    parentRevisionId: "d".repeat(64),
    command: { expectedRevision: "d".repeat(64), commandId: "classify", reason: "Reviewed", localAuthorId: "local" },
    commandDigest: "e".repeat(64),
    createdAt: "2026-09-10T00:00:00Z",
    snapshot,
  },
});
const target = snapshotV4.canonicalCombination;
const identityRequest = { base: snapshotV4.base, field: "TrackName", expectedOriginal: "Imola", replacement: "Monza", reason: "Reviewed identity", provenance: "manual", canonicalCombinationId: target.id };
const preparedIdentity = (overrides: Record<string, unknown> = {}, request: Record<string, unknown> = {}) =>
  ({ baseId: "b".repeat(64), correctionId: "c".repeat(64), request: { ...identityRequest, ...request }, original: "Imola", corrected: "Monza", ...overrides });

describe("canonical identity snapshot v4 contract", () => {
  it("accepts the committed v4 fixture with shared target reference", () => {
    const wire = wrap(snapshotV4);
    const parsed = parseCorrectionStoreResult(wire);
    expect(parsed).toBe(wire);
    expect(parsed.revision.snapshot.contractVersion).toBe("analysis.mixed-snapshot.v4");
    expect(parsed.revision.snapshot.canonicalCombination?.id).toBe(target.id);
  });
  it("splits the wire field union into explicit legacy and identity lists", () => {
    expect(analysisLegacyClassificationFields).toEqual(["SessionType", "WeatherConditions"]);
    expect(analysisIdentityClassificationFields).toEqual(["TrackName", "TrackLayout", "CarName", "CarClass"]);
    expect(analysisClassificationFields).toEqual([...analysisLegacyClassificationFields, ...analysisIdentityClassificationFields]);
  });
  it.each(["TrackName", "TrackLayout", "CarName", "CarClass"])("accepts identity field %s with its target reference", (field) => {
    expect(parseAnalysisClassificationCorrection({ ...identityRequest, field }).canonicalCombinationId).toBe(target.id);
  });
  it("treats an identity field without reference as an invalid field", () => {
    expect(() => parseAnalysisClassificationCorrection({ ...identityRequest, canonicalCombinationId: undefined })).toThrow("classification.field");
  });
  it.each([null, "", "lmu:", `lmu:${"z".repeat(64)}`, `other:${"a".repeat(64)}`, `lmu:${"A".repeat(64)}`, `lmu:${"a".repeat(63)}`, `lmu:${"a".repeat(65)}`, 12])(
    "rejects identity request reference %j", (canonicalCombinationId) => {
      expect(() => parseAnalysisClassificationCorrection({ ...identityRequest, canonicalCombinationId })).toThrow("classification.canonicalCombinationId");
    });
  it.each([null, "", `lmu:${"a".repeat(64)}`])("rejects a legacy field carrying reference %j", (canonicalCombinationId) => {
    expect(() => parseAnalysisClassificationCorrection({ base: snapshotV4.base, field: "SessionType", expectedOriginal: "race", replacement: "qualify", reason: "Reviewed", provenance: "manual", canonicalCombinationId })).toThrow("classification.canonicalCombinationId");
  });
  it("keeps the identity original RAW without enum or invented length limits", () => {
    expect(parseAnalysisClassificationCorrection({ ...identityRequest, expectedOriginal: "  Imola  " }).expectedOriginal).toBe("  Imola  ");
    expect(parseAnalysisClassificationCorrection({ ...identityRequest, expectedOriginal: "w".repeat(5000) }).expectedOriginal).toHaveLength(5000);
    for (const expectedOriginal of ["", "  ", "ra\uD800ce", 12]) {
      expect(() => parseAnalysisClassificationCorrection({ ...identityRequest, expectedOriginal })).toThrow("classification.expectedOriginal");
    }
  });
  it("bounds the identity replacement to 1024 raw UTF-8 bytes, goTrim non-empty", () => {
    expect(parseAnalysisClassificationCorrection({ ...identityRequest, replacement: `${" ".repeat(1019)}Monza` })).toBeDefined();
    expect(() => parseAnalysisClassificationCorrection({ ...identityRequest, replacement: `${" ".repeat(1020)}Monza` })).toThrow("classification.replacement");
    expect(() => parseAnalysisClassificationCorrection({ ...identityRequest, replacement: "   " })).toThrow("classification.replacement");
    expect(() => parseAnalysisClassificationCorrection({ ...identityRequest, replacement: "Monza\uD800" })).toThrow("classification.replacement");
  });
  it("derives identity corrected by goTrim only: no casefold, no weather limits", () => {
    expect(parseAnalysisPreparedClassification(preparedIdentity({ corrected: "MONZA" }, { replacement: "  MONZA  " })).corrected).toBe("MONZA");
    expect(parseAnalysisPreparedClassification(preparedIdentity({ corrected: "Monza" }, { replacement: "\u0085Monza\u0085" })).corrected).toBe("Monza");
    expect(parseAnalysisPreparedClassification(preparedIdentity({ corrected: "w".repeat(300) }, { replacement: "w".repeat(300) })).corrected).toHaveLength(300);
    expect(() => parseAnalysisPreparedClassification(preparedIdentity({ corrected: "  Monza  " }, { replacement: "  Monza  " }))).toThrow("classification.corrected");
    expect(() => parseAnalysisPreparedClassification(preparedIdentity({ original: "imola" }))).toThrow("classification.original");
  });
  it("requires one common reference across identity requests in a set", () => {
    const other = { ...identityRequest, field: "CarClass", expectedOriginal: "LMP2", replacement: "LMP2", canonicalCombinationId: `lmu:${"9".repeat(64)}` };
    expect(() => parseAnalysisClassificationCorrections([identityRequest, other], snapshotV4.base)).toThrow("classificationCorrections.reference");
    expect(parseAnalysisClassificationCorrections([identityRequest, { ...other, canonicalCombinationId: target.id }], snapshotV4.base)).toHaveLength(2);
    expect(() => parseAnalysisClassificationCorrections([identityRequest], { ...snapshotV4.base, sessionId: "other" })).toThrow("classificationCorrections.base");
  });
  it("compares the canonical reference when deciding whether sets match", () => {
    const first = parseAnalysisClassificationCorrection(identityRequest);
    const second = parseAnalysisClassificationCorrection({ ...identityRequest, field: "CarClass", expectedOriginal: "LMP2", replacement: "LMP2" });
    expect(sameAnalysisClassificationCorrections([first, second], [second, first])).toBe(true);
    expect(sameAnalysisClassificationCorrections([first, second], [second, { ...first, canonicalCombinationId: `lmu:${"9".repeat(64)}` }])).toBe(false);
  });
  it.each([
    "v4 missing target",
    "v4 target extra key",
    "v4 target wrong sim",
    "v4 target malformed id",
    "v4 target untrimmed field",
    "v4 target empty field",
    "v4 target lone surrogate",
    "v4 without identity activity",
    "v3 carrying target",
    "v3 carrying null target",
    "v3 identity request",
    "reference diverges from target",
    "identity corrected outside target",
    "foreign request base",
    "joint quota exceeded",
  ])("rejects %s", (mode) => {
    const wire = wrap(structuredClone(snapshotV4));
    const snap = wire.revision.snapshot as {
      contractVersion: string;
      canonicalCombination?: Record<string, unknown> | null;
      classifications: { request: Record<string, unknown>; corrected: string }[];
    };
    const identity = snap.classifications[1];
    const combination = snap.canonicalCombination as Record<string, unknown>;
    if (mode === "v4 missing target") delete snap.canonicalCombination;
    if (mode === "v4 target extra key") combination.extra = "x";
    if (mode === "v4 target wrong sim") combination.simId = "acc";
    if (mode === "v4 target malformed id") combination.id = `lmu:${"a".repeat(63)}`;
    if (mode === "v4 target untrimmed field") combination.trackName = " Monza";
    if (mode === "v4 target empty field") combination.carClass = "";
    if (mode === "v4 target lone surrogate") combination.carName = "Ore\uD800ca";
    if (mode === "v4 without identity activity") snap.classifications = [snap.classifications[0]];
    if (mode === "v3 carrying target") snap.contractVersion = "analysis.mixed-snapshot.v3";
    if (mode === "v3 carrying null target") { snap.contractVersion = "analysis.mixed-snapshot.v3"; snap.canonicalCombination = null; }
    if (mode === "v3 identity request") { snap.contractVersion = "analysis.mixed-snapshot.v3"; delete snap.canonicalCombination; }
    if (mode === "reference diverges from target") identity.request.canonicalCombinationId = `lmu:${"9".repeat(64)}`;
    if (mode === "identity corrected outside target") { identity.request.replacement = "Other"; identity.corrected = "Other"; }
    if (mode === "foreign request base") identity.request.base = { ...snapshotV4.base, sessionId: "other" };
    if (mode === "joint quota exceeded") snap.classifications = Array.from({ length: 257 }, () => snap.classifications[0]);
    expect(() => parseCorrectionStoreResult(wire)).toThrow();
  });
});
