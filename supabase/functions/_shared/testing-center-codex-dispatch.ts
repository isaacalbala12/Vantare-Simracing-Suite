export const CODEX_DISPATCH_VERSION =
  "testing-center.codex-dispatch.v1" as const;
export const CODEX_FIX_PROMPT_VERSION =
  "testing-center.codex-fix-prompt.v1" as const;
export const CODEX_FIX_OUTPUT_VERSION =
  "testing-center.codex-fix-output.v1" as const;
export const PINNED_CODEX_ACTION_COMMIT =
  "b11346a6fa031e2e164ab4b7c7ea201afffd7d59" as const;
export const PINNED_CODEX_CLI_VERSION = "0.146.0" as const;

const MODULE_IDS = [
  "testing_center.presentation",
  "testing_center.local_state",
  "overlay_studio.presentation",
  "calendar.presentation",
] as const;

type ModuleId = (typeof MODULE_IDS)[number];

export type CodexDispatchPayload = {
  contractVersion: typeof CODEX_DISPATCH_VERSION;
  repositoryOwner: "isaacalbala12";
  repositoryName: "Vantare-Simracing-Suite";
  baseRef: "nightly";
  operation: "propose_patch";
  runId: string;
  technicalIssueId: string;
  requestDigest: string;
  analysisBaseSha: string;
  nightlyHeadSha: string;
  ancestryProofDigest: string;
  fencingToken: number;
  moduleId: ModuleId;
  promptVersion: typeof CODEX_FIX_PROMPT_VERSION;
  outputVersion: typeof CODEX_FIX_OUTPUT_VERSION;
  codexActionCommit: typeof PINNED_CODEX_ACTION_COMMIT;
  codexCliVersion: typeof PINNED_CODEX_CLI_VERSION;
  issuedAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
  nonce: string;
};

export type CodexDispatchEnvelope = {
  payload: CodexDispatchPayload;
  signature: string;
};

export type CodexDispatchInput = Omit<
  CodexDispatchPayload,
  | "contractVersion"
  | "repositoryOwner"
  | "repositoryName"
  | "baseRef"
  | "operation"
  | "promptVersion"
  | "outputVersion"
  | "codexActionCommit"
  | "codexCliVersion"
>;

export interface CodexDispatchReplayLedger {
  reserve(signature: string, runId: string): Promise<boolean>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function invalid(code: string): never {
  throw new Error(code);
}

function safeEpoch(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validateKey(key: Uint8Array) {
  if (key.byteLength < 32 || key.byteLength > 256) {
    invalid("codex_dispatch_key_invalid");
  }
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodePayload(value: unknown, nowEpochSeconds: number) {
  if (
    !record(value) ||
    !exact(value, [
      "contractVersion",
      "repositoryOwner",
      "repositoryName",
      "baseRef",
      "operation",
      "runId",
      "technicalIssueId",
      "requestDigest",
      "analysisBaseSha",
      "nightlyHeadSha",
      "ancestryProofDigest",
      "fencingToken",
      "moduleId",
      "promptVersion",
      "outputVersion",
      "codexActionCommit",
      "codexCliVersion",
      "issuedAtEpochSeconds",
      "expiresAtEpochSeconds",
      "nonce",
    ]) ||
    value.contractVersion !== CODEX_DISPATCH_VERSION ||
    value.repositoryOwner !== "isaacalbala12" ||
    value.repositoryName !== "Vantare-Simracing-Suite" ||
    value.baseRef !== "nightly" ||
    value.operation !== "propose_patch" ||
    typeof value.runId !== "string" ||
    !/^codex_run_[0-9a-f]{64}$/.test(value.runId) ||
    typeof value.technicalIssueId !== "string" ||
    !/^issue_[0-9a-f]{64}$/.test(value.technicalIssueId) ||
    typeof value.requestDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.requestDigest) ||
    typeof value.analysisBaseSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.analysisBaseSha) ||
    typeof value.nightlyHeadSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.nightlyHeadSha) ||
    typeof value.ancestryProofDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.ancestryProofDigest) ||
    !Number.isSafeInteger(value.fencingToken) ||
    (value.fencingToken as number) < 1 ||
    typeof value.moduleId !== "string" ||
    !MODULE_IDS.includes(value.moduleId as ModuleId) ||
    value.promptVersion !== CODEX_FIX_PROMPT_VERSION ||
    value.outputVersion !== CODEX_FIX_OUTPUT_VERSION ||
    value.codexActionCommit !== PINNED_CODEX_ACTION_COMMIT ||
    value.codexCliVersion !== PINNED_CODEX_CLI_VERSION ||
    !safeEpoch(value.issuedAtEpochSeconds) ||
    !safeEpoch(value.expiresAtEpochSeconds) ||
    !safeEpoch(nowEpochSeconds) ||
    (value.expiresAtEpochSeconds as number) -
          (value.issuedAtEpochSeconds as number) < 30 ||
    (value.expiresAtEpochSeconds as number) -
          (value.issuedAtEpochSeconds as number) > 300 ||
    (value.issuedAtEpochSeconds as number) > nowEpochSeconds + 30 ||
    (value.expiresAtEpochSeconds as number) <= nowEpochSeconds ||
    typeof value.nonce !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.nonce)
  ) invalid("codex_dispatch_payload_invalid");
  return value as CodexDispatchPayload;
}

function canonical(payload: CodexDispatchPayload) {
  return JSON.stringify({
    contractVersion: payload.contractVersion,
    repositoryOwner: payload.repositoryOwner,
    repositoryName: payload.repositoryName,
    baseRef: payload.baseRef,
    operation: payload.operation,
    runId: payload.runId,
    technicalIssueId: payload.technicalIssueId,
    requestDigest: payload.requestDigest,
    analysisBaseSha: payload.analysisBaseSha,
    nightlyHeadSha: payload.nightlyHeadSha,
    ancestryProofDigest: payload.ancestryProofDigest,
    fencingToken: payload.fencingToken,
    moduleId: payload.moduleId,
    promptVersion: payload.promptVersion,
    outputVersion: payload.outputVersion,
    codexActionCommit: payload.codexActionCommit,
    codexCliVersion: payload.codexCliVersion,
    issuedAtEpochSeconds: payload.issuedAtEpochSeconds,
    expiresAtEpochSeconds: payload.expiresAtEpochSeconds,
    nonce: payload.nonce,
  });
}

async function hmac(value: string, key: Uint8Array) {
  validateKey(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    copyBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      copyBuffer(new TextEncoder().encode(value)),
    ),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function sameSignature(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function signCodexDispatch(
  input: CodexDispatchInput,
  key: Uint8Array,
  nowEpochSeconds: number,
): Promise<CodexDispatchEnvelope> {
  const payload = decodePayload({
    contractVersion: CODEX_DISPATCH_VERSION,
    repositoryOwner: "isaacalbala12",
    repositoryName: "Vantare-Simracing-Suite",
    baseRef: "nightly",
    operation: "propose_patch",
    ...input,
    promptVersion: CODEX_FIX_PROMPT_VERSION,
    outputVersion: CODEX_FIX_OUTPUT_VERSION,
    codexActionCommit: PINNED_CODEX_ACTION_COMMIT,
    codexCliVersion: PINNED_CODEX_CLI_VERSION,
  }, nowEpochSeconds);
  return { payload, signature: await hmac(canonical(payload), key) };
}

export async function verifyCodexDispatch(
  value: unknown,
  key: Uint8Array,
  nowEpochSeconds: number,
): Promise<CodexDispatchPayload> {
  if (
    !record(value) || !exact(value, ["payload", "signature"]) ||
    typeof value.signature !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.signature)
  ) invalid("codex_dispatch_envelope_invalid");
  const payload = decodePayload(value.payload, nowEpochSeconds);
  const expected = await hmac(canonical(payload), key);
  if (!sameSignature(value.signature, expected)) {
    invalid("codex_dispatch_signature_invalid");
  }
  return payload;
}

export async function consumeCodexDispatch(
  value: unknown,
  key: Uint8Array,
  nowEpochSeconds: number,
  ledger: CodexDispatchReplayLedger,
) {
  const payload = await verifyCodexDispatch(value, key, nowEpochSeconds);
  const signature = (value as CodexDispatchEnvelope).signature;
  if (!await ledger.reserve(signature, payload.runId)) {
    invalid("codex_dispatch_replayed");
  }
  return payload;
}
