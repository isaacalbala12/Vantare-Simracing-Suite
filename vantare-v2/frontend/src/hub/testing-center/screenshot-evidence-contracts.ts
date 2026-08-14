import {
  TestingCenterContractError,
  type TestingCenterChannel,
} from "./contracts";

export const SCREENSHOT_EVIDENCE_VERSION = "testing-center.screenshot-evidence.v1" as const;

export const SCREENSHOT_BATCH_STATES = [
  "prepared", "uploading", "validating", "ready", "attached", "expired",
] as const;

export const SCREENSHOT_EVIDENCE_STATES = [
  "prepared", "uploading", "uploaded", "validating", "ready", "rejected", "removed", "expired",
] as const;

export const SCREENSHOT_FAILURE_CODES = [
  "invalid_size", "invalid_media_type", "digest_mismatch", "invalid_signature",
  "invalid_dimensions", "object_missing", "validation_failed",
] as const;

export type ScreenshotBatchState = (typeof SCREENSHOT_BATCH_STATES)[number];
export type ScreenshotEvidenceState = (typeof SCREENSHOT_EVIDENCE_STATES)[number];
export type ScreenshotFailureCode = (typeof SCREENSHOT_FAILURE_CODES)[number];
export type ScreenshotMediaType = "image/png" | "image/jpeg";

export type ScreenshotEvidence = {
  evidenceId: string;
  position: number;
  mediaType: ScreenshotMediaType;
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
  state: ScreenshotEvidenceState;
  failureCode?: ScreenshotFailureCode;
};

export type ScreenshotEvidenceBatch = {
  contractVersion: typeof SCREENSHOT_EVIDENCE_VERSION;
  batchId: string;
  channel: TestingCenterChannel;
  state: ScreenshotBatchState;
  screenshots: ScreenshotEvidence[];
};

const MAX_SCREENSHOTS = 10;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const MAX_DIMENSION = 16384;
const MAX_PIXELS = 40_000_000;

function invalid(): never {
  throw new TestingCenterContractError("screenshot evidence contract is invalid");
}

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result);
  const allowed = new Set([...required, ...optional]);
  if (actual.some((key) => !allowed.has(key)) || required.some((key) => !actual.includes(key))) {
    invalid();
  }
  return result;
}

function opaque(value: unknown): string {
  if (
    typeof value !== "string" || value.trim() !== value || value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 256 || value.includes("\0")
  ) invalid();
  return value;
}

function safeInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid();
  }
  return value as number;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function decodeScreenshot(value: unknown, expectedPosition: number): ScreenshotEvidence {
  const item = exact(
    value,
    ["evidenceId", "position", "mediaType", "byteSize", "sha256", "width", "height", "state"],
    ["failureCode"],
  );
  if (
    item.position !== expectedPosition ||
    (item.mediaType !== "image/png" && item.mediaType !== "image/jpeg") ||
    typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(item.sha256) ||
    !includes(SCREENSHOT_EVIDENCE_STATES, item.state)
  ) invalid();

  const byteSize = safeInteger(item.byteSize, 1, MAX_SCREENSHOT_BYTES);
  const width = safeInteger(item.width, 1, MAX_DIMENSION);
  const height = safeInteger(item.height, 1, MAX_DIMENSION);
  if (width * height > MAX_PIXELS) invalid();

  const hasFailureCode = Object.keys(item).includes("failureCode");
  if (
    item.state === "rejected"
      ? !hasFailureCode || !includes(SCREENSHOT_FAILURE_CODES, item.failureCode)
      : hasFailureCode
  ) invalid();

  const screenshot: ScreenshotEvidence = {
    evidenceId: opaque(item.evidenceId),
    position: item.position,
    mediaType: item.mediaType,
    byteSize,
    sha256: item.sha256,
    width,
    height,
    state: item.state,
  };
  if (item.state === "rejected") screenshot.failureCode = item.failureCode as ScreenshotFailureCode;
  return screenshot;
}

export function decodeScreenshotEvidenceBatch(value: unknown): ScreenshotEvidenceBatch {
  const root = exact(value, ["contractVersion", "batchId", "channel", "state", "screenshots"]);
  if (
    root.contractVersion !== SCREENSHOT_EVIDENCE_VERSION ||
    (root.channel !== "nightly" && root.channel !== "testers") ||
    !includes(SCREENSHOT_BATCH_STATES, root.state) ||
    !Array.isArray(root.screenshots) ||
    root.screenshots.length < 1 || root.screenshots.length > MAX_SCREENSHOTS
  ) invalid();

  const screenshots = root.screenshots.map((item, index) => decodeScreenshot(item, index + 1));
  if (screenshots.reduce((total, screenshot) => total + screenshot.byteSize, 0) > MAX_BATCH_BYTES) {
    invalid();
  }
  return {
    contractVersion: SCREENSHOT_EVIDENCE_VERSION,
    batchId: opaque(root.batchId),
    channel: root.channel,
    state: root.state,
    screenshots,
  };
}
