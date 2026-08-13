export const TESTING_CENTER_GITHUB_DISPATCH_VERSION =
  "testing-center.github-dispatch.v2" as const;

const REPOSITORY_OWNER = "isaacalbala12" as const;
const REPOSITORY_NAME = "Vantare-Simracing-Suite" as const;
const WORKER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const EFFECT_ID = /^([0-9a-f]{64}):(triage|fix):1$/;
const ENCODER = new TextEncoder();

export type TestingCenterAgentEffectTarget = "triage" | "fix";

export type TestingCenterAgentEffectClaim = {
  effectId: string;
  jobKey: string;
  effectKind: "github_dispatch";
  effectTarget: TestingCenterAgentEffectTarget;
  payloadDigest: string;
  fencingToken: number;
  leaseExpiresAt: string;
};

export type TestingCenterRepositoryDispatch = {
  eventType: "testing-center-agent-triage" | "testing-center-agent-fix";
  clientPayload: {
    contractVersion: typeof TESTING_CENTER_GITHUB_DISPATCH_VERSION;
    repository: "isaacalbala12/Vantare-Simracing-Suite";
    baseRef: "nightly";
    effectId: string;
    jobKey: string;
    effectTarget: TestingCenterAgentEffectTarget;
    payloadDigest: string;
    fencingToken: number;
  };
};

export interface TestingCenterAgentEffectStore {
  claim(
    workerId: string,
    leaseSeconds: number,
  ): Promise<TestingCenterAgentEffectClaim | null>;
  reserve(
    effectId: string,
    workerId: string,
    fencingToken: number,
  ): Promise<void>;
  complete(
    effectId: string,
    workerId: string,
    fencingToken: number,
    outcome: "delivered" | "ambiguous",
    outcomeDigest: string,
  ): Promise<"completed" | "needs_owner">;
}

export interface TestingCenterPreparedRepositoryDispatcher {
  dispatch(
    request: TestingCenterRepositoryDispatch,
  ): Promise<{ requestDigest: string }>;
  dispose(): Promise<void>;
}

export interface TestingCenterRepositoryDispatcher {
  prepare(): Promise<TestingCenterPreparedRepositoryDispatcher>;
}

export type TestingCenterAgentDispatchResult =
  | { status: "idle" }
  | {
    status: "delivered" | "needs_owner";
    effectId: string;
    target: TestingCenterAgentEffectTarget;
  };

export interface TestingCenterAgentRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export type TestingCenterGitHubAppConfig = {
  appId: string;
  installationId: string;
  privateKeyPem: string;
};

type GitHubAppDispatcherRuntime = {
  fetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  nowEpochSeconds: () => number;
};

function invalid(code: string): never {
  throw new Error(code);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function validClaim(value: TestingCenterAgentEffectClaim): boolean {
  const match = EFFECT_ID.exec(value.effectId);
  return match !== null && match[1] === value.jobKey &&
    match[2] === value.effectTarget && value.effectKind === "github_dispatch" &&
    HEX_64.test(value.jobKey) && HEX_64.test(value.payloadDigest) &&
    Number.isSafeInteger(value.fencingToken) && value.fencingToken > 0 &&
    Number.isFinite(Date.parse(value.leaseExpiresAt));
}

export function buildTestingCenterRepositoryDispatch(
  claim: TestingCenterAgentEffectClaim,
): TestingCenterRepositoryDispatch {
  if (!validClaim(claim)) invalid("testing_center_agent_claim_invalid");
  return {
    eventType: claim.effectTarget === "triage"
      ? "testing-center-agent-triage"
      : "testing-center-agent-fix",
    clientPayload: {
      contractVersion: TESTING_CENTER_GITHUB_DISPATCH_VERSION,
      repository: `${REPOSITORY_OWNER}/${REPOSITORY_NAME}`,
      baseRef: "nightly",
      effectId: claim.effectId,
      jobKey: claim.jobKey,
      effectTarget: claim.effectTarget,
      payloadDigest: claim.payloadDigest,
      fencingToken: claim.fencingToken,
    },
  };
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", ENCODER.encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function dispatchNextTestingCenterAgentEffect(deps: {
  store: TestingCenterAgentEffectStore;
  github: TestingCenterRepositoryDispatcher;
  workerId: string;
  leaseSeconds: number;
}): Promise<TestingCenterAgentDispatchResult> {
  if (
    !WORKER_ID.test(deps.workerId) ||
    !Number.isSafeInteger(deps.leaseSeconds) ||
    deps.leaseSeconds < 10 || deps.leaseSeconds > 300
  ) invalid("testing_center_agent_dispatch_configuration_invalid");

  const claim = await deps.store.claim(deps.workerId, deps.leaseSeconds);
  if (claim === null) return { status: "idle" };
  const request = buildTestingCenterRepositoryDispatch(claim);

  const prepared = await deps.github.prepare();
  try {
    await deps.store.reserve(
      claim.effectId,
      deps.workerId,
      claim.fencingToken,
    );
    let delivered: { requestDigest: string };
    try {
      delivered = await prepared.dispatch(request);
    } catch {
      const outcomeDigest = await sha256(
        `${JSON.stringify(request)}:ambiguous`,
      );
      await deps.store.complete(
        claim.effectId,
        deps.workerId,
        claim.fencingToken,
        "ambiguous",
        outcomeDigest,
      );
      return {
        status: "needs_owner",
        effectId: claim.effectId,
        target: claim.effectTarget,
      };
    }
    if (!HEX_64.test(delivered.requestDigest)) {
      invalid("testing_center_github_dispatch_result_invalid");
    }
    await deps.store.complete(
      claim.effectId,
      deps.workerId,
      claim.fencingToken,
      "delivered",
      delivered.requestDigest,
    );
    return {
      status: "delivered",
      effectId: claim.effectId,
      target: claim.effectTarget,
    };
  } finally {
    try {
      await prepared.dispose();
    } catch {
      // Revocation failure cannot change a durable dispatch outcome.
    }
  }
}

function claimedRow(value: unknown): TestingCenterAgentEffectClaim {
  if (
    !record(value) ||
    !exact(value, [
      "effect_id",
      "job_key",
      "effect_kind",
      "effect_target",
      "payload_digest",
      "fencing_token",
      "lease_expires_at",
    ])
  ) invalid("testing_center_agent_claim_result_invalid");
  const claim = {
    effectId: value.effect_id,
    jobKey: value.job_key,
    effectKind: value.effect_kind,
    effectTarget: value.effect_target,
    payloadDigest: value.payload_digest,
    fencingToken: Number(value.fencing_token),
    leaseExpiresAt: value.lease_expires_at,
  } as TestingCenterAgentEffectClaim;
  if (!validClaim(claim)) invalid("testing_center_agent_claim_result_invalid");
  return claim;
}

export function createTestingCenterAgentEffectStore(
  admin: TestingCenterAgentRpcClient,
): TestingCenterAgentEffectStore {
  return {
    async claim(workerId, leaseSeconds) {
      const { data, error } = await admin.rpc(
        "testing_center_claim_agent_effect",
        { p_worker_id: workerId, p_lease_seconds: leaseSeconds },
      );
      if (error) throw error;
      if (!Array.isArray(data)) {
        invalid("testing_center_agent_claim_result_invalid");
      }
      if (data.length === 0) return null;
      if (data.length !== 1) {
        invalid("testing_center_agent_claim_result_invalid");
      }
      return claimedRow(data[0]);
    },
    async reserve(effectId, workerId, fencingToken) {
      const { data, error } = await admin.rpc(
        "testing_center_reserve_agent_effect",
        {
          p_effect_id: effectId,
          p_worker_id: workerId,
          p_fencing_token: fencingToken,
        },
      );
      if (error) throw error;
      if (data !== "reserved") {
        invalid("testing_center_agent_reservation_result_invalid");
      }
    },
    async complete(effectId, workerId, fencingToken, outcome, outcomeDigest) {
      const { data, error } = await admin.rpc(
        "testing_center_complete_agent_effect",
        {
          p_effect_id: effectId,
          p_worker_id: workerId,
          p_fencing_token: fencingToken,
          p_outcome: outcome,
          p_outcome_digest: outcomeDigest,
        },
      );
      if (error) throw error;
      const expected = outcome === "delivered" ? "completed" : "needs_owner";
      if (data !== expected) {
        invalid("testing_center_agent_completion_result_invalid");
      }
      return expected;
    },
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

function base64UrlText(value: string): string {
  return base64Url(ENCODER.encode(value));
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let value = length; value > 0; value >>= 8) bytes.unshift(value & 0xff);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, value: Uint8Array): Uint8Array {
  const length = derLength(value.length);
  const result = new Uint8Array(1 + length.length + value.length);
  result[0] = tag;
  result.set(length, 1);
  result.set(value, 1 + length.length);
  return result;
}

function concat(...values: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    values.reduce((sum, value) => sum + value.length, 0),
  );
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function wrapPkcs1AsPkcs8(pkcs1: Uint8Array): Uint8Array {
  const rsaAlgorithmIdentifier = Uint8Array.from([
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  ]);
  return der(
    0x30,
    concat(
      Uint8Array.from([0x02, 0x01, 0x00]),
      rsaAlgorithmIdentifier,
      der(0x04, pkcs1),
    ),
  );
}

function privateKeyBytes(pem: string): Uint8Array {
  const normalized = pem.replaceAll("\\n", "\n").replaceAll("\r\n", "\n")
    .trim();
  if (normalized.length > 16_384) {
    invalid("testing_center_github_app_private_key_invalid");
  }
  const match =
    /^-----BEGIN (RSA )?PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END (RSA )?PRIVATE KEY-----$/
      .exec(normalized);
  if (match === null) {
    invalid("testing_center_github_app_private_key_invalid");
  }
  if ((match[1] ?? "") !== (match[3] ?? "")) {
    invalid("testing_center_github_app_private_key_invalid");
  }
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return match[1] === "RSA " ? wrapPkcs1AsPkcs8(bytes) : bytes;
  } catch {
    return invalid("testing_center_github_app_private_key_invalid");
  }
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function validNumericId(value: string): boolean {
  return /^[1-9][0-9]{0,19}$/.test(value);
}

export async function signTestingCenterGitHubAppJwt(
  appId: string,
  privateKeyPem: string,
  nowEpochSeconds: number,
): Promise<string> {
  if (!validNumericId(appId) || !Number.isSafeInteger(nowEpochSeconds)) {
    invalid("testing_center_github_app_configuration_invalid");
  }
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlText(JSON.stringify({
    iat: nowEpochSeconds - 60,
    exp: nowEpochSeconds + 540,
    iss: appId,
  }));
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      copyBuffer(privateKeyBytes(privateKeyPem)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    return invalid("testing_center_github_app_private_key_invalid");
  }
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      ENCODER.encode(`${header}.${payload}`),
    ),
  );
  return `${header}.${payload}.${base64Url(signature)}`;
}

export function parseTestingCenterGitHubAppConfig(
  environment: Record<string, string | undefined>,
): TestingCenterGitHubAppConfig {
  const config = {
    appId: environment.TESTING_CENTER_GITHUB_APP_ID ?? "",
    installationId: environment.TESTING_CENTER_GITHUB_APP_INSTALLATION_ID ?? "",
    privateKeyPem: environment.TESTING_CENTER_GITHUB_APP_PRIVATE_KEY ?? "",
  };
  if (
    !validNumericId(config.appId) || !validNumericId(config.installationId) ||
    config.privateKeyPem.length < 64 || config.privateKeyPem.length > 16_384
  ) invalid("testing_center_github_app_configuration_invalid");
  privateKeyBytes(config.privateKeyPem);
  return config;
}

async function discardResponse(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Error bodies are intentionally never buffered or exposed.
  }
}

async function readBoundedText(response: Response, maxBytes: number) {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        invalid("testing_center_github_response_invalid");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(concat(...chunks));
}

export function createTestingCenterGitHubAppDispatcher(
  config: TestingCenterGitHubAppConfig,
  runtime: GitHubAppDispatcherRuntime = {
    fetch: globalThis.fetch,
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
  },
): TestingCenterRepositoryDispatcher {
  if (!validNumericId(config.appId) || !validNumericId(config.installationId)) {
    invalid("testing_center_github_app_configuration_invalid");
  }
  return {
    async prepare() {
      const now = runtime.nowEpochSeconds();
      if (!Number.isSafeInteger(now)) {
        invalid("testing_center_github_app_configuration_invalid");
      }
      const jwt = await signTestingCenterGitHubAppJwt(
        config.appId,
        config.privateKeyPem,
        now,
      );
      const tokenResponse = await runtime.fetch(
        `https://api.github.com/app/installations/${config.installationId}/access_tokens`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${jwt}`,
            "x-github-api-version": "2022-11-28",
            "user-agent": "vantare-testing-center-agent-dispatch",
          },
          body: JSON.stringify({
            repositories: [REPOSITORY_NAME],
            permissions: { contents: "write" },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (tokenResponse.status !== 201) {
        await discardResponse(tokenResponse);
        invalid("testing_center_github_app_token_rejected");
      }
      let tokenValue: unknown;
      try {
        const raw = await readBoundedText(tokenResponse, 16_384);
        tokenValue = JSON.parse(raw);
      } catch {
        return invalid("testing_center_github_app_token_invalid");
      }
      if (!record(tokenValue)) {
        invalid("testing_center_github_app_token_invalid");
      }
      const token = tokenValue.token;
      const expiresAt = Date.parse(String(tokenValue.expires_at));
      if (
        typeof token !== "string" || !/^ghs_[A-Za-z0-9]{20,255}$/.test(token) ||
        !Number.isFinite(expiresAt) || expiresAt <= (now + 30) * 1000 ||
        expiresAt > (now + 3_700) * 1000
      ) invalid("testing_center_github_app_token_invalid");
      return {
        async dispatch(request) {
          const body = JSON.stringify({
            event_type: request.eventType,
            client_payload: request.clientPayload,
          });
          const requestDigest = await sha256(body);
          let dispatchResponse: Response;
          try {
            dispatchResponse = await runtime.fetch(
              `https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/dispatches`,
              {
                method: "POST",
                headers: {
                  accept: "application/vnd.github+json",
                  authorization: `Bearer ${token}`,
                  "content-type": "application/json",
                  "x-github-api-version": "2022-11-28",
                  "user-agent": "vantare-testing-center-agent-dispatch",
                },
                body,
                signal: AbortSignal.timeout(10_000),
              },
            );
          } catch {
            return invalid(
              "testing_center_github_repository_dispatch_ambiguous",
            );
          }
          if (dispatchResponse.status !== 204) {
            await discardResponse(dispatchResponse);
            invalid("testing_center_github_repository_dispatch_ambiguous");
          }
          return { requestDigest };
        },
        async dispose() {
          try {
            const response = await runtime.fetch(
              "https://api.github.com/installation/token",
              {
                method: "DELETE",
                headers: {
                  accept: "application/vnd.github+json",
                  authorization: `Bearer ${token}`,
                  "x-github-api-version": "2022-11-28",
                  "user-agent": "vantare-testing-center-agent-dispatch",
                },
                signal: AbortSignal.timeout(10_000),
              },
            );
            await discardResponse(response);
          } catch {
            // The one-hour token expiry remains the final revocation bound.
          }
        },
      };
    },
  };
}
