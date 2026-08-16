import { describe, expect, it } from "vitest";
import { TestingCenterContractError } from "./contracts";
import {
  SCREENSHOT_EVIDENCE_VERSION,
  decodeScreenshotEvidenceBatch,
} from "./screenshot-evidence-contracts";

const digest = "c".repeat(64);

function validBatch() {
  return {
    contractVersion: "testing-center.screenshot-evidence.v1",
    batchId: "batch-opaque-1",
    channel: "nightly",
    state: "ready",
    screenshots: [{
      evidenceId: "evidence-opaque-1",
      position: 1,
      mediaType: "image/png",
      byteSize: 1024,
      sha256: digest,
      width: 1280,
      height: 720,
      state: "ready",
    }],
  };
}

describe("screenshot evidence contracts", () => {
  it("decodes the exact v1 batch", () => {
    expect(SCREENSHOT_EVIDENCE_VERSION).toBe("testing-center.screenshot-evidence.v1");
    expect(decodeScreenshotEvidenceBatch(validBatch())).toEqual(validBatch());
  });

  it("rejects unknown, missing and private fields", () => {
    expect(() => decodeScreenshotEvidenceBatch({ ...validBatch(), objectPath: "private" }))
      .toThrow(TestingCenterContractError);
    const missing = validBatch() as Record<string, unknown>;
    delete missing.batchId;
    expect(() => decodeScreenshotEvidenceBatch(missing)).toThrow(TestingCenterContractError);
    const nested = validBatch();
    Object.assign(nested.screenshots[0], { originalName: "secret.png" });
    expect(() => decodeScreenshotEvidenceBatch(nested)).toThrow(TestingCenterContractError);
  });

  it("enforces identity, channel, count, positions and media types", () => {
    const invalid = [
      { ...validBatch(), contractVersion: "testing-center.screenshot-evidence.v2" },
      { ...validBatch(), batchId: "" },
      { ...validBatch(), batchId: " batch-1" },
      { ...validBatch(), channel: "master" },
      { ...validBatch(), screenshots: [] },
      { ...validBatch(), screenshots: Array.from({ length: 11 }, (_, index) => ({
        ...validBatch().screenshots[0], evidenceId: `evidence-${index + 1}`, position: index + 1,
      })) },
      { ...validBatch(), screenshots: [{ ...validBatch().screenshots[0], evidenceId: "" }] },
      { ...validBatch(), screenshots: [{ ...validBatch().screenshots[0], position: 2 }] },
      { ...validBatch(), screenshots: [{ ...validBatch().screenshots[0], mediaType: "image/gif" }] },
    ];
    for (const value of invalid) {
      expect(() => decodeScreenshotEvidenceBatch(value)).toThrow(TestingCenterContractError);
    }
  });

  it("enforces byte, digest and dimension boundaries with safe integers", () => {
    const screenshot = validBatch().screenshots[0];
    const invalidScreenshots = [
      { ...screenshot, byteSize: 0 },
      { ...screenshot, byteSize: 10 * 1024 * 1024 + 1 },
      { ...screenshot, byteSize: 1.5 },
      { ...screenshot, byteSize: Number.MAX_SAFE_INTEGER + 1 },
      { ...screenshot, sha256: digest.toUpperCase() },
      { ...screenshot, sha256: digest.slice(1) },
      { ...screenshot, width: 0 },
      { ...screenshot, height: 16385 },
      { ...screenshot, width: 10000, height: 4001 },
      { ...screenshot, width: 1.5 },
    ];
    for (const value of invalidScreenshots) {
      expect(() => decodeScreenshotEvidenceBatch({ ...validBatch(), screenshots: [value] }))
        .toThrow(TestingCenterContractError);
    }

    const maximum = Array.from({ length: 10 }, (_, index) => ({
      ...screenshot,
      evidenceId: `evidence-${index + 1}`,
      position: index + 1,
      mediaType: index % 2 === 0 ? "image/png" : "image/jpeg",
      byteSize: 10 * 1024 * 1024,
      width: index === 0 ? 10000 : 16384,
      height: index === 0 ? 4000 : 1,
    }));
    expect(decodeScreenshotEvidenceBatch({ ...validBatch(), screenshots: maximum }).screenshots)
      .toHaveLength(10);
  });

  it("accepts only closed states and rejected failure codes", () => {
    const batchStates = [
      ["prepared", "prepared"], ["uploading", "uploading"], ["validating", "validating"],
      ["ready", "ready"], ["attached", "ready"], ["expired", "expired"],
    ];
    for (const [state, evidenceState] of batchStates) {
      const value = {
        ...validBatch(), state,
        screenshots: [{ ...validBatch().screenshots[0], state: evidenceState }],
      };
      expect(decodeScreenshotEvidenceBatch(value).state).toBe(state);
    }
    const evidenceStates = [
      ["uploading", "prepared"], ["uploading", "uploading"], ["uploading", "uploaded"],
      ["validating", "validating"], ["validating", "ready"],
      ["expired", "removed"], ["expired", "expired"],
    ];
    for (const [batchState, state] of evidenceStates) {
      const value = {
        ...validBatch(), state: batchState,
        screenshots: [{ ...validBatch().screenshots[0], state }],
      };
      expect(decodeScreenshotEvidenceBatch(value).screenshots[0].state).toBe(state);
    }
    const failureCodes = [
      "invalid_size", "invalid_media_type", "digest_mismatch", "invalid_signature",
      "invalid_dimensions", "object_missing", "validation_failed",
    ];
    for (const failureCode of failureCodes) {
      const value = {
        ...validBatch(), state: "validating",
        screenshots: [{ ...validBatch().screenshots[0], state: "rejected", failureCode }],
      };
      expect(decodeScreenshotEvidenceBatch(value).screenshots[0].failureCode).toBe(failureCode);
    }

    const invalid = [
      { ...validBatch(), state: "unknown" },
      { ...validBatch(), screenshots: [{ ...validBatch().screenshots[0], state: "unknown" }] },
      { ...validBatch(), screenshots: [{ ...validBatch().screenshots[0], state: "rejected" }] },
      { ...validBatch(), screenshots: [{ ...validBatch().screenshots[0], failureCode: "invalid_size" }] },
      { ...validBatch(), screenshots: [{ ...validBatch().screenshots[0], state: "rejected", failureCode: "unknown" }] },
    ];
    for (const value of invalid) {
      expect(() => decodeScreenshotEvidenceBatch(value)).toThrow(TestingCenterContractError);
    }
  });

  it("rejects duplicate evidence ids within a batch", () => {
    const screenshot = validBatch().screenshots[0];
    const value = {
      ...validBatch(),
      screenshots: [screenshot, { ...screenshot, position: 2 }],
    };
    expect(() => decodeScreenshotEvidenceBatch(value)).toThrow(TestingCenterContractError);
  });

  it("enforces batch and evidence state invariants", () => {
    const invalidStates = [
      ["prepared", "uploaded"],
      ["ready", "validating"],
      ["attached", "uploading"],
      ["expired", "ready"],
      ["uploading", "validating"],
      ["validating", "prepared"],
    ];
    for (const [state, evidenceState] of invalidStates) {
      const value = {
        ...validBatch(), state,
        screenshots: [{ ...validBatch().screenshots[0], state: evidenceState }],
      };
      expect(() => decodeScreenshotEvidenceBatch(value)).toThrow(TestingCenterContractError);
    }

    const validStates = [
      ["prepared", "prepared"],
      ["uploading", "prepared"], ["uploading", "uploading"], ["uploading", "uploaded"],
      ["validating", "uploaded"], ["validating", "validating"], ["validating", "ready"],
      ["ready", "ready"], ["attached", "ready"],
      ["expired", "expired"], ["expired", "removed"],
    ];
    for (const [state, evidenceState] of validStates) {
      const value = {
        ...validBatch(), state,
        screenshots: [{ ...validBatch().screenshots[0], state: evidenceState }],
      };
      expect(decodeScreenshotEvidenceBatch(value).state).toBe(state);
    }

    const rejected = {
      ...validBatch(), state: "validating",
      screenshots: [{
        ...validBatch().screenshots[0], state: "rejected", failureCode: "validation_failed",
      }],
    };
    expect(decodeScreenshotEvidenceBatch(rejected).screenshots[0].state).toBe("rejected");
  });
});
