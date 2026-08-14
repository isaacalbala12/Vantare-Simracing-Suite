import { readJsonObject } from "../_shared/request.ts";
import {
  agentVisibleState,
  sanitizeAgentObservation,
  type TestingCenterAgentObservation,
} from "../_shared/testing-center-agent-observability.ts";
import {
  decideEligibility,
  parseAgentJob,
} from "../_shared/testing-center-autofix-policy.ts";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "vantare-testing-center-agent-callback";
const REPOSITORY = "isaacalbala12/Vantare-Simracing-Suite";
const REPOSITORY_ID = "1262053949";
const OIDC_JWKS = `${ISSUER}/.well-known/jwks`;
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const TAG = /^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$/;
const WORKFLOWS = new Set([
  `${REPOSITORY}/.github/workflows/testing-center-agent-triage.yml@refs/heads/master`,
  `${REPOSITORY}/.github/workflows/testing-center-agent-fix.yml@refs/heads/master`,
  `${REPOSITORY}/.github/workflows/testing-center-nightly-closeout.yml@refs/heads/master`,
]);
const TRIAGE_WORKFLOW =
  `${REPOSITORY}/.github/workflows/testing-center-agent-triage.yml@refs/heads/master`;
const FIX_WORKFLOW =
  `${REPOSITORY}/.github/workflows/testing-center-agent-fix.yml@refs/heads/master`;
const CLOSEOUT_WORKFLOW =
  `${REPOSITORY}/.github/workflows/testing-center-nightly-closeout.yml@refs/heads/master`;
const BODY_KEYS = [
  "contractVersion",
  "deliveryId",
  "jobKey",
  "phase",
  "headSha",
  "reviewedHeadSha",
  "workflowSha",
  "payloadDigest",
  "fencingToken",
  "runId",
  "evidence",
  "result",
] as const;
const EVIDENCE_KEYS = [
  "releaseVerified",
  "releaseTag",
  "releaseSourceSha",
  "releaseAssetCount",
  "checksumsVerified",
] as const;
const PHASE_EXPECTED_STATE: Record<string, string> = {
  red_verified: "red_running",
  green_running: "red_verified",
  diff_verified: "green_running",
  review_approved: "diff_verified",
  ci_running: "review_approved",
  merge_queued: "ci_running",
  merged_nightly: "merge_queued",
  smoke_running: "merged_nightly",
  nightly_tagged: "smoke_running",
  completed: "nightly_tagged",
  smoke_failed: "smoke_running",
  revert_pr_open: "smoke_failed",
  reverted: "revert_pr_open",
  closeout_failed: "__current__",
};

type JsonRecord = Record<string, unknown>;

export type TestingCenterAgentCallback = {
  deliveryId: string;
  jobKey: string;
  phase: string;
  headSha: string;
  reviewedHeadSha: string | null;
  workflowSha: string;
  payloadDigest: string;
  fencingToken: number;
  runId: number;
  evidence: {
    releaseVerified: boolean;
    releaseTag: string | null;
    releaseSourceSha: string | null;
    releaseAssetCount: number;
    checksumsVerified: boolean;
  };
  result: unknown;
};

export interface TestingCenterAgentCallbackStore {
  apply(callback: TestingCenterAgentCallback): Promise<{
    status: "applied" | "duplicate" | "needs_owner";
    state: string;
  }>;
}

export type TestingCenterAgentCallbackDeps = {
  nowEpochSeconds(): number;
  verifyOidc(token: string): Promise<JsonRecord>;
  store: TestingCenterAgentCallbackStore;
  observe(value: TestingCenterAgentObservation): void;
};

function invalid(code = "testing_center_agent_callback_invalid"): never {
  throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function parseCallback(value: JsonRecord): TestingCenterAgentCallback {
  if (!exact(value, BODY_KEYS) || !record(value.evidence)) invalid();
  const evidence = value.evidence;
  if (!exact(evidence, EVIDENCE_KEYS)) invalid();
  const callback: TestingCenterAgentCallback = {
    deliveryId: String(value.deliveryId),
    jobKey: String(value.jobKey),
    phase: String(value.phase),
    headSha: String(value.headSha),
    reviewedHeadSha: value.reviewedHeadSha === null
      ? null
      : String(value.reviewedHeadSha),
    workflowSha: String(value.workflowSha),
    payloadDigest: String(value.payloadDigest),
    fencingToken: Number(value.fencingToken),
    runId: Number(value.runId),
    evidence: {
      releaseVerified: evidence.releaseVerified === true,
      releaseTag: evidence.releaseTag === null
        ? null
        : String(evidence.releaseTag),
      releaseSourceSha: evidence.releaseSourceSha === null
        ? null
        : String(evidence.releaseSourceSha),
      releaseAssetCount: Number(evidence.releaseAssetCount),
      checksumsVerified: evidence.checksumsVerified === true,
    },
    result: value.result,
  };
  if (
    value.contractVersion !== "testing-center.agent-callback.v1" ||
    !/^[a-z0-9][a-z0-9:._-]{0,255}$/.test(callback.deliveryId) ||
    !HEX_64.test(callback.jobKey) || !HEX_40.test(callback.headSha) ||
    (callback.reviewedHeadSha !== null &&
      !HEX_40.test(callback.reviewedHeadSha)) ||
    !HEX_40.test(callback.workflowSha) ||
    !HEX_64.test(callback.payloadDigest) ||
    !Number.isSafeInteger(callback.fencingToken) || callback.fencingToken < 1 ||
    !Number.isSafeInteger(callback.runId) || callback.runId < 1 ||
    !(callback.phase === "triaged" || callback.phase in PHASE_EXPECTED_STATE) ||
    !Number.isSafeInteger(callback.evidence.releaseAssetCount) ||
    callback.evidence.releaseAssetCount < 0
  ) invalid();
  const closeoutPhase = [
    "merged_nightly",
    "smoke_running",
    "nightly_tagged",
    "completed",
    "smoke_failed",
    "revert_pr_open",
    "reverted",
    "closeout_failed",
  ].includes(callback.phase);
  if (
    (closeoutPhase && callback.reviewedHeadSha === null) ||
    (!closeoutPhase && callback.reviewedHeadSha !== null) ||
    (closeoutPhase &&
      (callback.evidence.releaseTag === null ||
        !TAG.test(callback.evidence.releaseTag))) ||
    (!closeoutPhase && callback.evidence.releaseTag !== null) ||
    (closeoutPhase &&
      !["reverted", "closeout_failed"].includes(callback.phase) &&
      callback.fencingToken !== callback.runId)
  ) invalid();
  const releasePhase = callback.phase === "completed";
  if (releasePhase) {
    if (
      callback.evidence.releaseVerified !== true ||
      callback.evidence.releaseSourceSha !== callback.headSha ||
      callback.evidence.releaseAssetCount !== 6 ||
      callback.evidence.checksumsVerified !== true ||
      callback.evidence.releaseTag === null ||
      !TAG.test(callback.evidence.releaseTag)
    ) invalid("testing_center_agent_release_evidence_invalid");
  } else if (
    callback.evidence.releaseVerified ||
    callback.evidence.releaseSourceSha !== null ||
    callback.evidence.releaseAssetCount !== 0 ||
    callback.evidence.checksumsVerified
  ) invalid("testing_center_agent_early_release_evidence");
  if (callback.phase !== "triaged" && callback.result !== null) invalid();
  return callback;
}

function parseNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    invalid("testing_center_oidc_claims_invalid");
  }
  return number;
}

function validateClaims(
  claims: JsonRecord,
  callback: TestingCenterAgentCallback,
  now: number,
) {
  const issuedAt = parseNumber(claims.iat);
  const notBefore = parseNumber(claims.nbf);
  const expiresAt = parseNumber(claims.exp);
  if (
    claims.iss !== ISSUER || claims.aud !== AUDIENCE ||
    claims.repository_id !== REPOSITORY_ID ||
    claims.repository !== REPOSITORY ||
    typeof claims.workflow_ref !== "string" ||
    !WORKFLOWS.has(claims.workflow_ref) || claims.ref !== "refs/heads/master" ||
    claims.sha !== callback.workflowSha ||
    String(claims.run_id) !== String(callback.runId) ||
    issuedAt > now + 30 || notBefore > now + 30 || expiresAt <= now ||
    expiresAt > now + 600 || issuedAt < now - 600
  ) invalid("testing_center_oidc_claims_invalid");
  const workflowRef = String(claims.workflow_ref);
  if (
    (callback.phase === "triaged" && workflowRef !== TRIAGE_WORKFLOW) ||
    ([
      "red_verified",
      "green_running",
      "diff_verified",
      "review_approved",
      "ci_running",
      "merge_queued",
    ].includes(callback.phase) && workflowRef !== FIX_WORKFLOW) ||
    ([
      "merged_nightly",
      "smoke_running",
      "nightly_tagged",
      "completed",
      "smoke_failed",
      "revert_pr_open",
      "reverted",
      "closeout_failed",
    ].includes(callback.phase) && workflowRef !== CLOSEOUT_WORKFLOW)
  ) invalid("testing_center_oidc_workflow_phase_invalid");
}

function base64UrlBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) invalid("testing_center_oidc_invalid");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - value.length % 4) % 4);
  try {
    return Uint8Array.from(
      atob(padded),
      (character) => character.charCodeAt(0),
    );
  } catch {
    return invalid("testing_center_oidc_invalid");
  }
}

function copyBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function decodePart(value: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(base64UrlBytes(value)),
    );
    if (!record(parsed)) invalid("testing_center_oidc_invalid");
    return parsed;
  } catch {
    return invalid("testing_center_oidc_invalid");
  }
}

async function boundedText(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    invalid("testing_center_oidc_jwks_invalid");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) invalid("testing_center_oidc_jwks_invalid");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function verifyGitHubOidcToken(
  token: string,
  nowEpochSeconds: () => number,
  fetcher: typeof fetch,
): Promise<JsonRecord> {
  if (token.length < 64 || token.length > 16_384) {
    invalid("testing_center_oidc_invalid");
  }
  const parts = token.split(".");
  if (parts.length !== 3) invalid("testing_center_oidc_invalid");
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (
    header.alg !== "RS256" || typeof header.kid !== "string" ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(header.kid)
  ) invalid("testing_center_oidc_invalid");
  const now = nowEpochSeconds();
  if (!Number.isSafeInteger(now)) invalid("testing_center_oidc_invalid");
  let response: Response;
  try {
    response = await fetcher(OIDC_JWKS, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return invalid("testing_center_oidc_jwks_unavailable");
  }
  if (!response.ok || response.url !== OIDC_JWKS) {
    return invalid("testing_center_oidc_jwks_invalid");
  }
  let jwks: unknown;
  try {
    jwks = JSON.parse(await boundedText(response, 65_536));
  } catch {
    return invalid("testing_center_oidc_jwks_invalid");
  }
  if (!record(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length > 20) {
    invalid("testing_center_oidc_jwks_invalid");
  }
  const candidates = jwks.keys.filter((key) =>
    record(key) && key.kid === header.kid && key.kty === "RSA" &&
    key.use === "sig" && key.alg === "RS256"
  );
  if (candidates.length !== 1) invalid("testing_center_oidc_jwks_invalid");
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      candidates[0] as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return invalid("testing_center_oidc_jwks_invalid");
  }
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    copyBuffer(base64UrlBytes(parts[2])),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) invalid("testing_center_oidc_signature_invalid");
  return claims;
}

function json(body: JsonRecord, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function canonicalJson(value: unknown): string {
  if (
    value === null || typeof value === "boolean" || typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (record(value)) {
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      ).join(",")
    }}`;
  }
  return invalid();
}

export async function testingCenterAgentCallbackDigest(
  value: JsonRecord,
): Promise<string> {
  const digestInput = { ...value };
  delete digestInput.payloadDigest;
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalJson(digestInput)),
    ),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function handleTestingCenterAgentCallbackRequest(
  request: Request,
  deps: TestingCenterAgentCallbackDeps,
): Promise<Response> {
  const startedAt = deps.nowEpochSeconds();
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._-]{64,16384})$/.exec(authorization);
  if (match === null) return json({ code: "unauthorized" }, 401);
  const parsed = await readJsonObject(request, 32_768);
  if (!parsed.ok) return json({ code: "invalid_request" }, 400);
  let callback: TestingCenterAgentCallback;
  try {
    callback = parseCallback(parsed.value);
    if (
      callback.payloadDigest !==
        await testingCenterAgentCallbackDigest(parsed.value)
    ) invalid();
  } catch {
    return json({ code: "invalid_request" }, 400);
  }
  try {
    const claims = await deps.verifyOidc(match[1]);
    validateClaims(claims, callback, deps.nowEpochSeconds());
  } catch {
    return json({ code: "unauthorized" }, 401);
  }
  try {
    const result = await deps.store.apply(callback);
    deps.observe(sanitizeAgentObservation({
      jobKey: callback.jobKey,
      phase: callback.phase,
      provider: "github-actions",
      model: null,
      durationMs: Math.max(0, (deps.nowEpochSeconds() - startedAt) * 1_000),
      inputTokens: 0,
      outputTokens: 0,
      result: result.status,
      reason: result.state,
    }));
    return json({
      contractVersion: "testing-center.agent-callback-result.v1",
      status: result.status,
      state: result.state,
      visibleState: agentVisibleState(result.state),
    });
  } catch {
    return json({ code: "callback_unavailable" }, 503);
  }
}

type RpcClient = {
  rpc(
    name: string,
    args: JsonRecord,
  ): PromiseLike<{ data: unknown; error: unknown }>;
  from(name: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

function createRestRpcClient(options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
}): RpcClient {
  let base: URL;
  try {
    base = new URL(options.supabaseUrl);
  } catch {
    return invalid("testing_center_callback_supabase_url_invalid");
  }
  if (
    base.protocol !== "https:" || base.username !== "" ||
    base.password !== "" ||
    base.search !== "" || base.hash !== "" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname) ||
    options.serviceRoleKey.length < 32 || options.serviceRoleKey.length > 4096
  ) invalid("testing_center_callback_supabase_configuration_invalid");
  const fetcher = options.fetcher ?? globalThis.fetch;
  const call = async (path: string, init: RequestInit) => {
    const response = await fetcher(new URL(path, base), {
      ...init,
      headers: {
        apikey: options.serviceRoleKey,
        authorization: `Bearer ${options.serviceRoleKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(5_000),
    });
    const raw = await boundedText(response, 65_536);
    if (!response.ok) return { data: null, error: { code: "rpc_failed" } };
    try {
      return { data: raw === "" ? null : JSON.parse(raw), error: null };
    } catch {
      return { data: null, error: { code: "rpc_invalid" } };
    }
  };
  return {
    rpc(name, args) {
      if (!/^[a-z0-9_]{1,96}$/.test(name)) {
        invalid("testing_center_callback_rpc_invalid");
      }
      return call(`/rest/v1/rpc/${name}`, {
        method: "POST",
        body: JSON.stringify(args),
      });
    },
    from(name) {
      if (name !== "testing_center_agent_jobs") {
        invalid("testing_center_callback_table_invalid");
      }
      return {
        select(columns) {
          if (columns !== "state") {
            invalid("testing_center_callback_columns_invalid");
          }
          return {
            eq(column, value) {
              if (column !== "job_key" || !HEX_64.test(value)) {
                invalid("testing_center_callback_filter_invalid");
              }
              return {
                async maybeSingle() {
                  const response = await call(
                    `/rest/v1/${name}?select=state&job_key=eq.${value}`,
                    {
                      method: "GET",
                      headers: { accept: "application/vnd.pgrst.object+json" },
                    },
                  );
                  return response;
                },
              };
            },
          };
        },
      };
    },
  };
}

export function createTestingCenterAgentCallbackStore(
  admin: RpcClient,
): TestingCenterAgentCallbackStore {
  return {
    async apply(callback) {
      const current = await admin.from("testing_center_agent_jobs").select(
        "state",
      )
        .eq("job_key", callback.jobKey).maybeSingle();
      if (
        current.error || !record(current.data) ||
        typeof current.data.state !== "string"
      ) {
        invalid("testing_center_agent_job_state_unavailable");
      }
      if (callback.phase === "triaged") {
        let decision;
        try {
          decision = decideEligibility(parseAgentJob(callback.result));
        } catch {
          const owner = await admin.rpc("testing_center_transition_agent_job", {
            p_job_key: callback.jobKey,
            p_expected_state: current.data.state,
            p_to_state: "needs_owner",
            p_actor: "oidc-callback",
            p_operation_digest: callback.payloadDigest,
          });
          if (owner.error || owner.data !== "needs_owner") {
            invalid("testing_center_agent_callback_invalid_result");
          }
          return { status: "needs_owner", state: "needs_owner" };
        }
        const outcome = decision.eligible ? "eligible" : "ineligible";
        const response = await admin.rpc(
          "testing_center_record_fenced_agent_callback",
          {
            p_delivery_id: callback.deliveryId,
            p_job_key: callback.jobKey,
            p_head_sha: callback.headSha,
            p_callback_kind: "triage",
            p_outcome: outcome,
            p_payload_digest: callback.payloadDigest,
            p_fencing_token: callback.fencingToken,
          },
        );
        if (
          response.error || !Array.isArray(response.data) ||
          response.data.length !== 1 ||
          !record(response.data[0])
        ) invalid("testing_center_agent_callback_result_invalid");
        return {
          status: String(response.data[0].callback_status) as
            | "applied"
            | "duplicate"
            | "needs_owner",
          state: String(response.data[0].job_state),
        };
      }
      if (
        callback.phase === "red_verified" && current.data.state === "eligible"
      ) {
        const accepted = await admin.rpc(
          "testing_center_record_fenced_agent_callback",
          {
            p_delivery_id: `fix-${
              callback.jobKey.slice(0, 12)
            }-${callback.payloadDigest}`,
            p_job_key: callback.jobKey,
            p_head_sha: callback.headSha,
            p_callback_kind: "fix",
            p_outcome: "accepted",
            p_payload_digest: callback.payloadDigest,
            p_fencing_token: callback.fencingToken,
          },
        );
        if (
          accepted.error || !Array.isArray(accepted.data) ||
          accepted.data.length !== 1 || !record(accepted.data[0])
        ) invalid("testing_center_agent_fix_acceptance_invalid");
        if (accepted.data[0].job_state === "needs_owner") {
          return { status: "needs_owner", state: "needs_owner" };
        }
      }
      const response = await admin.rpc(
        "testing_center_record_agent_phase_callback",
        {
          p_delivery_id: callback.deliveryId,
          p_job_key: callback.jobKey,
          p_head_sha: callback.headSha,
          p_reviewed_head_sha: callback.reviewedHeadSha,
          p_phase: callback.phase,
          p_payload_digest: callback.payloadDigest,
          p_fencing_token: callback.fencingToken,
          p_run_id: callback.runId,
          p_release_tag: callback.evidence.releaseTag,
        },
      );
      if (
        response.error || !Array.isArray(response.data) ||
        response.data.length !== 1 || !record(response.data[0])
      ) {
        invalid("testing_center_agent_callback_transition_failed");
      }
      const status = response.data[0].callback_status;
      const state = response.data[0].job_state;
      if (
        !["applied", "duplicate", "needs_owner"].includes(String(status)) ||
        typeof state !== "string"
      ) invalid("testing_center_agent_callback_transition_invalid");
      return {
        status: String(status) as "applied" | "duplicate" | "needs_owner",
        state,
      };
    },
  };
}

function productionDependencies(): TestingCenterAgentCallbackDeps {
  return {
    nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
    verifyOidc: (token) =>
      verifyGitHubOidcToken(
        token,
        () => Math.floor(Date.now() / 1_000),
        globalThis.fetch,
      ),
    store: createTestingCenterAgentCallbackStore(createRestRpcClient({
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    })),
    observe: (value) =>
      console.log(JSON.stringify({
        event: "testing_center_agent_callback",
        ...value,
      })),
  };
}

export function handleRequest(request: Request): Promise<Response> {
  try {
    return handleTestingCenterAgentCallbackRequest(
      request,
      productionDependencies(),
    );
  } catch {
    return Promise.resolve(
      json({ code: "callback_configuration_invalid" }, 503),
    );
  }
}

if (import.meta.main) Deno.serve(handleRequest);
