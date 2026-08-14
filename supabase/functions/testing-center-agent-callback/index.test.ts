// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createTestingCenterAgentCallbackStore,
  handleTestingCenterAgentCallbackRequest,
  type TestingCenterAgentCallbackDeps,
  testingCenterAgentCallbackDigest,
} from "./index.ts";

const JOB = "a".repeat(64);
const SHA = "b".repeat(40);
const DIGEST = "c".repeat(64);
const NOW = 1_800_000_000;
const RESERVED_TAG = "v0.1.0.7-nightly.43";
const EMPTY_RELEASE_EVIDENCE = {
  releaseVerified: false,
  releaseTag: null,
  releaseSourceSha: null,
  releaseAssetCount: 0,
  checksumsVerified: false,
};

function eligibleAgentJob() {
  return {
    contractVersion: "testing-center.agent-job.v2",
    jobKey: JOB,
    technicalIssueId: `issue_${"d".repeat(64)}`,
    reportDigest: "e".repeat(64),
    dossierDigest: "f".repeat(64),
    nightlyBaseSha: SHA,
    reservedNightlyHeadSha: SHA,
    executionGeneration: 1,
    classification: "bug",
    duplicateOf: null,
    family: "testing-center-ui-state",
    risk: "low",
    reproductionComplete: true,
    reproductionDeterministic: true,
    acceptanceCriteria: ["The control becomes available"],
    files: ["vantare-v2/frontend/src/hub/testing-center/state.ts"],
    redTestCommandId: "frontend.test.focal",
    baseMatchesNightly: true,
    blockingGatesAvailable: true,
    requiresDependency: false,
    requiresMigration: false,
    requiresAuth: false,
    requiresBilling: false,
    requiresSecrets: false,
    requiresPermissions: false,
    requiresWorkflow: false,
    requiresRelease: false,
    requiresGovernance: false,
    requiresArchitecture: false,
    requiresDeletion: false,
    activePathOverlap: false,
    visualChange: false,
    visualGate: "not_applicable",
    untrustedTesterText: "The control stays disabled",
    untrustedModelOutput: '{"classification":"bug"}',
  };
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://token.actions.githubusercontent.com",
    aud: "vantare-testing-center-agent-callback",
    repository_id: "1262053949",
    repository: "isaacalbala12/Vantare-Simracing-Suite",
    workflow_ref:
      "isaacalbala12/Vantare-Simracing-Suite/.github/workflows/testing-center-nightly-closeout.yml@refs/heads/master",
    ref: "refs/heads/master",
    sha: SHA,
    run_id: "12345",
    iat: NOW - 10,
    nbf: NOW - 10,
    exp: NOW + 120,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "testing-center.agent-callback.v1",
    deliveryId: `run-12345:${JOB}:merged_nightly`,
    jobKey: JOB,
    phase: "merged_nightly",
    headSha: SHA,
    reviewedHeadSha: SHA,
    workflowSha: SHA,
    payloadDigest: DIGEST,
    fencingToken: 12345,
    runId: 12345,
    evidence: {
      releaseVerified: false,
      releaseTag: RESERVED_TAG,
      releaseSourceSha: null,
      releaseAssetCount: 0,
      checksumsVerified: false,
    },
    result: null,
    ...overrides,
  };
}

async function signedBody(overrides: Record<string, unknown> = {}) {
  const value = body(overrides);
  value.payloadDigest = await testingCenterAgentCallbackDigest(value);
  return value;
}

function request(value: unknown, authorization = `Bearer ${"t".repeat(64)}`) {
  return new Request(
    "https://example.supabase.co/functions/v1/testing-center-agent-callback",
    {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(value),
    },
  );
}

function deps(options: {
  tokenClaims?: Record<string, unknown>;
  state?: string;
} = {}) {
  const recorded: unknown[] = [];
  const observations: unknown[] = [];
  const value: TestingCenterAgentCallbackDeps = {
    nowEpochSeconds: () => NOW,
    verifyOidc: () => Promise.resolve(options.tokenClaims ?? claims()),
    store: {
      apply(callback: unknown) {
        recorded.push(callback);
        return Promise.resolve({
          status: "applied" as const,
          state: options.state ?? "merged_nightly",
        });
      },
    },
    observe(value) {
      observations.push(value);
    },
  };
  return {
    value,
    recorded,
    observations,
  };
}

Deno.test("valid OIDC callback applies one closed server transition", async () => {
  const dependency = deps();
  const response = await handleTestingCenterAgentCallbackRequest(
    request(await signedBody()),
    dependency.value,
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    contractVersion: "testing-center.agent-callback-result.v1",
    status: "applied",
    state: "merged_nightly",
    visibleState: "verifying_nightly",
  });
  assertEquals(dependency.recorded.length, 1);
  assertEquals(dependency.observations, [{
    jobKey: JOB,
    phase: "merged_nightly",
    provider: "github-actions",
    model: null,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    result: "applied",
    reason: "merged_nightly",
  }]);
});

Deno.test("duplicate callback converges without claiming delivery", async () => {
  const dependency = deps({ state: "completed" });
  dependency.value.store.apply = () =>
    Promise.resolve({ status: "duplicate", state: "completed" });
  const response = await handleTestingCenterAgentCallbackRequest(
    request(
      await signedBody({
        phase: "completed",
        deliveryId: `run-12345:${JOB}:completed`,
        evidence: {
          releaseVerified: true,
          releaseTag: "v0.1.0.7-nightly.43",
          releaseSourceSha: SHA,
          releaseAssetCount: 6,
          checksumsVerified: true,
        },
      }),
    ),
    dependency.value,
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).status, "duplicate");
});

Deno.test("a later revert workflow presents the original fence for server verification", async () => {
  const dependency = deps({ state: "reverted" });
  const response = await handleTestingCenterAgentCallbackRequest(
    request(
      await signedBody({
        phase: "reverted",
        deliveryId: `run-12345:${JOB}:reverted`,
        fencingToken: 12000,
      }),
    ),
    dependency.value,
  );
  assertEquals(response.status, 200);
  assertEquals(dependency.recorded.length, 1);
  assertEquals(
    (dependency.recorded[0] as { fencingToken: number }).fencingToken,
    12000,
  );
});

Deno.test("invalid signature claims body and release evidence fail before storage", async () => {
  const invalidClaims = [
    claims({ iss: "https://evil.example" }),
    claims({ aud: "other" }),
    claims({ repository_id: "999" }),
    claims({ repository: "other/repo" }),
    claims({
      workflow_ref: "other/repo/.github/workflows/x.yml@refs/heads/master",
    }),
    claims({ ref: "refs/heads/nightly" }),
    claims({ sha: "d".repeat(40) }),
    claims({ run_id: "999" }),
    claims({ exp: NOW - 1 }),
  ];
  for (const tokenClaims of invalidClaims) {
    const dependency = deps({ tokenClaims });
    const response = await handleTestingCenterAgentCallbackRequest(
      request(await signedBody()),
      dependency.value,
    );
    assertEquals(response.status, 401);
    assertEquals(dependency.recorded.length, 0);
  }

  for (
    const value of [
      await signedBody({ extra: true }),
      await signedBody({ headSha: "D".repeat(40) }),
      await signedBody({ fencingToken: 0 }),
      await signedBody({ phase: "completed" }),
      await signedBody({
        phase: "completed",
        deliveryId: `run-12345:${JOB}:completed`,
        evidence: {
          releaseVerified: true,
          releaseTag: "v0.1.0.7-nightly.43",
          releaseSourceSha: SHA,
          releaseAssetCount: 5,
          checksumsVerified: true,
        },
      }),
    ]
  ) {
    const dependency = deps();
    const response = await handleTestingCenterAgentCallbackRequest(
      request(value),
      dependency.value,
    );
    assertEquals(response.status, 400);
    assertEquals(dependency.recorded.length, 0);
  }
  const wrongDigest = await signedBody();
  wrongDigest.payloadDigest = "0".repeat(64);
  const digestDependency = deps();
  assertEquals(
    (await handleTestingCenterAgentCallbackRequest(
      request(wrongDigest),
      digestDependency.value,
    )).status,
    400,
  );
  assertEquals(digestDependency.recorded.length, 0);
});

Deno.test("verification and store errors expose no token or raw diagnostics", async () => {
  const rejected = deps();
  rejected.value.verifyOidc = () => Promise.reject(new Error("private token"));
  const unauthorized = await handleTestingCenterAgentCallbackRequest(
    request(await signedBody()),
    rejected.value,
  );
  assertEquals(unauthorized.status, 401);
  assertEquals(await unauthorized.json(), { code: "unauthorized" });

  const broken = deps();
  broken.value.store.apply = () => Promise.reject(new Error("private path"));
  const unavailable = await handleTestingCenterAgentCallbackRequest(
    request(await signedBody()),
    broken.value,
  );
  assertEquals(unavailable.status, 503);
  assertEquals(await unavailable.json(), { code: "callback_unavailable" });
});

Deno.test("production verifier rejects malformed JWT without network", async () => {
  const module = await import("./index.ts");
  await assertRejects(
    () => module.verifyGitHubOidcToken("not-a-jwt", () => NOW, fetch),
    Error,
    "testing_center_oidc_invalid",
  );
});

Deno.test("production verifier accepts only a JWKS-backed RS256 signature", async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const header = encoded({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const payload = encoded(claims());
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  const token = `${signingInput}.${base64url(signature)}`;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const fetcher = () => {
    const response = Response.json({
      keys: [{ ...jwk, kid: "test-key", use: "sig", alg: "RS256" }],
    });
    Object.defineProperty(response, "url", {
      value: "https://token.actions.githubusercontent.com/.well-known/jwks",
    });
    return Promise.resolve(response);
  };
  assertEquals(
    (await (await import("./index.ts")).verifyGitHubOidcToken(
      token,
      () => NOW,
      fetcher,
    )).repository,
    "isaacalbala12/Vantare-Simracing-Suite",
  );
  const tampered = `${header}.${
    encoded({ ...claims(), repository: "other/repo" })
  }.${base64url(signature)}`;
  await assertRejects(
    () =>
      (import("./index.ts")).then((module) =>
        module.verifyGitHubOidcToken(tampered, () => NOW, fetcher)
      ),
    Error,
    "testing_center_oidc_signature_invalid",
  );
});

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

function encoded(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

Deno.test("store reapplies server-owned triage policy once and uses the existing idempotent RPC", async () => {
  let state = "triage_queued";
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const store = createTestingCenterAgentCallbackStore({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { state }, error: null }),
        }),
      }),
    }),
    rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === "testing_center_transition_agent_job") {
        state = "needs_owner";
        return Promise.resolve({ data: state, error: null });
      }
      state = "eligible";
      return Promise.resolve({
        data: [{ callback_status: "applied", job_state: state }],
        error: null,
      });
    },
  });
  const callback = body({
    phase: "triaged",
    reviewedHeadSha: null,
    fencingToken: 7,
    deliveryId: `run-12345:${JOB}:triaged`,
    result: eligibleAgentJob(),
  });
  const first = await store.apply(callback as never);
  assertEquals(first, { status: "applied", state: "eligible" });
  assertEquals(rpcCalls.length, 1);
  assertEquals(
    rpcCalls[0].name,
    "testing_center_record_fenced_agent_callback",
  );
  assertEquals(rpcCalls[0].args.p_outcome, "eligible");
  assertEquals(rpcCalls[0].args.p_fencing_token, 7);
  assertEquals(
    await store.apply({
      ...callback,
      result: { classification: "bug" },
    } as never),
    { status: "needs_owner", state: "needs_owner" },
  );
  assertEquals(rpcCalls.length, 2);
  assertEquals(rpcCalls[1].args.p_to_state, "needs_owner");
});

Deno.test("phase callback delegates ordering fencing and replay to the atomic RPC", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const store = createTestingCenterAgentCallbackStore({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { state: "eligible" }, error: null }),
        }),
      }),
    }),
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: [{ callback_status: "needs_owner", job_state: "needs_owner" }],
        error: null,
      });
    },
  });
  const result = await store.apply(body({ phase: "merged_nightly" }) as never);
  assertEquals(result, { status: "needs_owner", state: "needs_owner" });
  assertEquals(
    rpcCalls[0].name,
    "testing_center_record_agent_phase_callback",
  );
  assertEquals(rpcCalls[0].args.p_fencing_token, 12345);
  assertEquals(rpcCalls[0].args.p_reviewed_head_sha, SHA);
  assertEquals(rpcCalls[0].args.p_release_tag, RESERVED_TAG);
});

Deno.test("first RED completion records fenced fix acceptance before its phase", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const store = createTestingCenterAgentCallbackStore({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { state: "eligible" }, error: null }),
        }),
      }),
    }),
    rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === "testing_center_record_fenced_agent_callback") {
        return Promise.resolve({
          data: [{ callback_status: "applied", job_state: "red_running" }],
          error: null,
        });
      }
      return Promise.resolve({
        data: [{ callback_status: "applied", job_state: "red_verified" }],
        error: null,
      });
    },
  });
  const result = await store.apply(body({
    phase: "red_verified",
    reviewedHeadSha: null,
    fencingToken: 7,
    deliveryId: "a".repeat(256),
    evidence: EMPTY_RELEASE_EVIDENCE,
  }) as never);
  assertEquals(result, { status: "applied", state: "red_verified" });
  assertEquals(rpcCalls.map((call) => call.name), [
    "testing_center_record_fenced_agent_callback",
    "testing_center_record_agent_phase_callback",
  ]);
  assertEquals(
    rpcCalls[0].args.p_delivery_id,
    `fix-${JOB.slice(0, 12)}-${DIGEST}`,
  );
  assertEquals(String(rpcCalls[0].args.p_delivery_id).length <= 256, true);
});
