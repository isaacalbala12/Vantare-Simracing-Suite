// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTestingCenterRepositoryDispatch,
  createTestingCenterAgentEffectStore,
  createTestingCenterGitHubAppDispatcher,
  dispatchNextTestingCenterAgentEffect,
  parseTestingCenterGitHubAppConfig,
  signTestingCenterGitHubAppJwt,
  type TestingCenterAgentEffectClaim,
  type TestingCenterAgentEffectStore,
  type TestingCenterRepositoryDispatcher,
} from "./testing-center-github-dispatch.ts";

const now = 1_800_000_000;

function derElement(bytes: Uint8Array, offset: number) {
  const tag = bytes[offset];
  let cursor = offset + 1;
  let length = bytes[cursor++];
  if ((length & 0x80) !== 0) {
    const count = length & 0x7f;
    length = 0;
    for (let index = 0; index < count; index++) {
      length = (length << 8) | bytes[cursor++];
    }
  }
  return { tag, content: cursor, end: cursor + length };
}

function pkcs1FromPkcs8(pkcs8: Uint8Array): Uint8Array {
  const outer = derElement(pkcs8, 0);
  const version = derElement(pkcs8, outer.content);
  const algorithm = derElement(pkcs8, version.end);
  const privateKey = derElement(pkcs8, algorithm.end);
  if (outer.tag !== 0x30 || privateKey.tag !== 0x04) {
    throw new Error("test_pkcs8_invalid");
  }
  return pkcs8.slice(privateKey.content, privateKey.end);
}

function pem(label: "PRIVATE KEY" | "RSA PRIVATE KEY", bytes: Uint8Array) {
  return `-----BEGIN ${label}-----\n${
    btoa(String.fromCharCode(...bytes))
  }\n-----END ${label}-----`;
}

function claim(
  changed: Partial<TestingCenterAgentEffectClaim> = {},
): TestingCenterAgentEffectClaim {
  const target = changed.effectTarget ?? "triage";
  return {
    effectId: `${"a".repeat(64)}:${target}:1`,
    jobKey: "a".repeat(64),
    effectKind: "github_dispatch",
    effectTarget: "triage",
    payloadDigest: "b".repeat(64),
    fencingToken: 7,
    leaseExpiresAt: "2027-01-15T08:01:00.000Z",
    ...changed,
  };
}

class FakeStore implements TestingCenterAgentEffectStore {
  available: TestingCenterAgentEffectClaim | null = claim();
  calls: string[] = [];
  outcome: "delivered" | "ambiguous" | null = null;
  rejectReserve = false;
  rejectDeliveredComplete = false;

  claim(workerId: string, leaseSeconds: number) {
    this.calls.push(`claim:${workerId}:${leaseSeconds}`);
    const current = this.available;
    this.available = null;
    return Promise.resolve(current);
  }

  reserve(effectId: string, workerId: string, fencingToken: number) {
    this.calls.push(`reserve:${effectId}:${workerId}:${fencingToken}`);
    return this.rejectReserve
      ? Promise.reject(new Error("testing_center_agent_effect_fencing_stale"))
      : Promise.resolve();
  }

  complete(
    effectId: string,
    workerId: string,
    fencingToken: number,
    outcome: "delivered" | "ambiguous",
    outcomeDigest: string,
  ) {
    this.calls.push(
      `complete:${effectId}:${workerId}:${fencingToken}:${outcome}`,
    );
    assertEquals(/^[0-9a-f]{64}$/.test(outcomeDigest), true);
    this.outcome = outcome;
    if (outcome === "delivered" && this.rejectDeliveredComplete) {
      return Promise.reject(new Error("completion_response_lost"));
    }
    return Promise.resolve(
      outcome === "delivered" ? "completed" as const : "needs_owner" as const,
    );
  }
}

class FakeDispatcher implements TestingCenterRepositoryDispatcher {
  calls = 0;
  prepares = 0;
  disposes = 0;
  rejectPrepare = false;
  rejectDispose = false;
  ambiguous = false;
  invalidDigest = false;
  requests: unknown[] = [];

  prepare() {
    this.prepares++;
    if (this.rejectPrepare) {
      return Promise.reject(new Error("github_app_configuration_invalid"));
    }
    return Promise.resolve({
      dispatch: (
        request: ReturnType<typeof buildTestingCenterRepositoryDispatch>,
      ) => {
        this.calls++;
        this.requests.push(request);
        return this.ambiguous
          ? Promise.reject(new Error("github_repository_dispatch_ambiguous"))
          : Promise.resolve({
            requestDigest: this.invalidDigest ? "invalid" : "c".repeat(64),
          });
      },
      dispose: () => {
        this.disposes++;
        return this.rejectDispose
          ? Promise.reject(new Error("github_token_revoke_failed"))
          : Promise.resolve();
      },
    });
  }
}

Deno.test("server-owned request maps each target to one fixed event", () => {
  const triage = buildTestingCenterRepositoryDispatch(claim());
  const fix = buildTestingCenterRepositoryDispatch(
    claim({ effectTarget: "fix" }),
  );
  assertEquals(triage, {
    eventType: "testing-center-agent-triage",
    clientPayload: {
      contractVersion: "testing-center.github-dispatch.v2",
      repository: "isaacalbala12/Vantare-Simracing-Suite",
      baseRef: "nightly",
      effectId: claim().effectId,
      jobKey: "a".repeat(64),
      effectTarget: "triage",
      payloadDigest: "b".repeat(64),
      fencingToken: 7,
    },
  });
  assertEquals(fix.eventType, "testing-center-agent-fix");
  assertEquals(fix.clientPayload.effectTarget, "fix");
  const serialized = JSON.stringify(triage);
  for (const forbidden of ["tester", "issue title", "authorization", "token"]) {
    assertEquals(serialized.includes(forbidden), false);
  }
});

Deno.test("claim reserve dispatch complete is replay safe and ordered", async () => {
  const store = new FakeStore();
  const github = new FakeDispatcher();
  assertEquals(
    await dispatchNextTestingCenterAgentEffect({
      store,
      github,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    }),
    { status: "delivered", effectId: claim().effectId, target: "triage" },
  );
  assertEquals(github.calls, 1);
  assertEquals(store.outcome, "delivered");
  assertEquals(store.calls[0], "claim:isa321-github-dispatch:60");
  assertEquals(store.calls[1].startsWith("reserve:"), true);
  assertEquals(store.calls[2].endsWith(":delivered"), true);
  assertEquals(github.disposes, 1);

  assertEquals(
    await dispatchNextTestingCenterAgentEffect({
      store,
      github,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    }),
    { status: "idle" },
  );
  assertEquals(github.calls, 1);
});

Deno.test("stale fencing stops before network and ambiguous delivery needs owner", async () => {
  const staleStore = new FakeStore();
  staleStore.rejectReserve = true;
  const staleGitHub = new FakeDispatcher();
  await assertRejects(() =>
    dispatchNextTestingCenterAgentEffect({
      store: staleStore,
      github: staleGitHub,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    })
  );
  assertEquals(staleGitHub.calls, 0);
  assertEquals(staleGitHub.disposes, 1);
  assertEquals(staleStore.outcome, null);

  const store = new FakeStore();
  const github = new FakeDispatcher();
  github.ambiguous = true;
  assertEquals(
    await dispatchNextTestingCenterAgentEffect({
      store,
      github,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    }),
    { status: "needs_owner", effectId: claim().effectId, target: "triage" },
  );
  assertEquals(github.calls, 1);
  assertEquals(store.outcome, "ambiguous");
});

Deno.test("credential preparation fails before durable reservation", async () => {
  const store = new FakeStore();
  const github = new FakeDispatcher();
  github.rejectPrepare = true;
  await assertRejects(() =>
    dispatchNextTestingCenterAgentEffect({
      store,
      github,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    })
  );
  assertEquals(store.calls, ["claim:isa321-github-dispatch:60"]);
  assertEquals(github.calls, 0);
  assertEquals(github.disposes, 0);
});

Deno.test("a delivered dispatch is never reclassified when completion fails", async () => {
  const store = new FakeStore();
  store.rejectDeliveredComplete = true;
  const github = new FakeDispatcher();
  await assertRejects(() =>
    dispatchNextTestingCenterAgentEffect({
      store,
      github,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    })
  );
  assertEquals(github.calls, 1);
  assertEquals(
    store.calls.filter((call) => call.includes("complete:")).length,
    1,
  );
  assertEquals(store.calls.at(-1)?.endsWith(":delivered"), true);
  assertEquals(github.disposes, 1);
});

Deno.test("post-dispatch validation and token disposal never invent ambiguity", async () => {
  const invalidStore = new FakeStore();
  const invalidGitHub = new FakeDispatcher();
  invalidGitHub.invalidDigest = true;
  await assertRejects(() =>
    dispatchNextTestingCenterAgentEffect({
      store: invalidStore,
      github: invalidGitHub,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    })
  );
  assertEquals(invalidStore.outcome, null);
  assertEquals(invalidGitHub.disposes, 1);

  const deliveredStore = new FakeStore();
  const revokeFailure = new FakeDispatcher();
  revokeFailure.rejectDispose = true;
  assertEquals(
    await dispatchNextTestingCenterAgentEffect({
      store: deliveredStore,
      github: revokeFailure,
      workerId: "isa321-github-dispatch",
      leaseSeconds: 60,
    }),
    { status: "delivered", effectId: claim().effectId, target: "triage" },
  );
  assertEquals(deliveredStore.outcome, "delivered");
  assertEquals(revokeFailure.disposes, 1);
});

Deno.test("malformed or non-GitHub claims fail before reserve and network", async () => {
  for (
    const changed of [
      { effectKind: "supabase_callback" },
      { effectTarget: "release" },
      { fencingToken: 0 },
      { payloadDigest: "bad" },
      { jobKey: "bad" },
      { leaseExpiresAt: "not-a-date" },
    ]
  ) {
    const store = new FakeStore();
    store.available = claim(changed as Partial<TestingCenterAgentEffectClaim>);
    const github = new FakeDispatcher();
    await assertRejects(() =>
      dispatchNextTestingCenterAgentEffect({
        store,
        github,
        workerId: "isa321-github-dispatch",
        leaseSeconds: 60,
      })
    );
    assertEquals(store.calls.length, 1);
    assertEquals(github.calls, 0);
  }
});

Deno.test("Supabase store maps only closed fenced RPC results", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const rpc = (name: string, args: Record<string, unknown>) => {
    calls.push([name, args]);
    if (name === "testing_center_claim_agent_effect") {
      return Promise.resolve({
        data: [{
          effect_id: claim().effectId,
          job_key: claim().jobKey,
          effect_kind: claim().effectKind,
          effect_target: claim().effectTarget,
          payload_digest: claim().payloadDigest,
          fencing_token: claim().fencingToken,
          lease_expires_at: claim().leaseExpiresAt,
        }],
        error: null,
      });
    }
    if (name === "testing_center_reserve_agent_effect") {
      return Promise.resolve({ data: "reserved", error: null });
    }
    return Promise.resolve({ data: "completed", error: null });
  };
  const store = createTestingCenterAgentEffectStore({ rpc });
  assertEquals(await store.claim("isa321-github-dispatch", 60), claim());
  await store.reserve(claim().effectId, "isa321-github-dispatch", 7);
  assertEquals(
    await store.complete(
      claim().effectId,
      "isa321-github-dispatch",
      7,
      "delivered",
      "c".repeat(64),
    ),
    "completed",
  );
  assertEquals(calls.map(([name]) => name), [
    "testing_center_claim_agent_effect",
    "testing_center_reserve_agent_effect",
    "testing_center_complete_agent_effect",
  ]);
});

Deno.test("Supabase RPC mapping rejects open or contradictory results", async () => {
  const validRow = {
    effect_id: claim().effectId,
    job_key: claim().jobKey,
    effect_kind: claim().effectKind,
    effect_target: claim().effectTarget,
    payload_digest: claim().payloadDigest,
    fencing_token: claim().fencingToken,
    lease_expires_at: claim().leaseExpiresAt,
  };
  for (
    const data of [{}, [validRow, validRow], [{ ...validRow, extra: true }]]
  ) {
    const store = createTestingCenterAgentEffectStore({
      rpc: () => Promise.resolve({ data, error: null }),
    });
    await assertRejects(() => store.claim("isa321-github-dispatch", 60));
  }
  const badReserve = createTestingCenterAgentEffectStore({
    rpc: () => Promise.resolve({ data: "busy", error: null }),
  });
  await assertRejects(() =>
    badReserve.reserve(claim().effectId, "isa321-github-dispatch", 7)
  );
  const badComplete = createTestingCenterAgentEffectStore({
    rpc: () => Promise.resolve({ data: "needs_owner", error: null }),
  });
  await assertRejects(() =>
    badComplete.complete(
      claim().effectId,
      "isa321-github-dispatch",
      7,
      "delivered",
      "c".repeat(64),
    )
  );
});

Deno.test("GitHub App JWT is valid, tampering fails, and token is minted just in time", async () => {
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
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  const privateKeyPem = pem("PRIVATE KEY", pkcs8);
  const jwt = await signTestingCenterGitHubAppJwt(
    "12345",
    privateKeyPem,
    now,
  );
  const [header, payload, signature] = jwt.split(".");
  assertEquals(
    JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))).iss,
    "12345",
  );
  const signatureBytes = Uint8Array.from(
    atob(signature.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.charCodeAt(0),
  );
  assertEquals(
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      pair.publicKey,
      signatureBytes,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
    true,
  );
  signatureBytes[0] ^= 1;
  assertEquals(
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      pair.publicKey,
      signatureBytes,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
    false,
  );

  const calls: Array<{ url: string; init: RequestInit }> = [];
  const dispatcher = createTestingCenterGitHubAppDispatcher({
    appId: "12345",
    installationId: "67890",
    privateKeyPem,
  }, {
    nowEpochSeconds: () => now,
    fetch: (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/access_tokens")) {
        return Promise.resolve(Response.json({
          token: `ghs_${"x".repeat(36)}`,
          expires_at: new Date((now + 3600) * 1000).toISOString(),
        }, { status: 201 }));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });
  const prepared = await dispatcher.prepare();
  const result = await prepared.dispatch(
    buildTestingCenterRepositoryDispatch(claim()),
  );
  await prepared.dispose();
  assertEquals(/^[0-9a-f]{64}$/.test(result.requestDigest), true);
  assertEquals(calls.map((call) => call.url), [
    "https://api.github.com/app/installations/67890/access_tokens",
    "https://api.github.com/repos/isaacalbala12/Vantare-Simracing-Suite/dispatches",
    "https://api.github.com/installation/token",
  ]);
  assertEquals(
    String(new Headers(calls[1].init.headers).get("authorization")),
    `Bearer ghs_${"x".repeat(36)}`,
  );
  const body = String(calls[1].init.body);
  assertEquals(body.includes("PRIVATE KEY"), false);
  assertEquals(body.includes("ghs_"), false);
  assertEquals(
    JSON.parse(String(calls[0].init.body)),
    {
      repositories: ["Vantare-Simracing-Suite"],
      permissions: { contents: "write" },
    },
  );
  assertEquals(
    calls.every((call) => call.init.signal instanceof AbortSignal),
    true,
  );
});

Deno.test("GitHub key parser accepts GitHub PKCS1 and CRLF before any claim", async () => {
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
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  const candidates = [
    pem("PRIVATE KEY", pkcs8).replaceAll("\n", "\r\n"),
    pem("PRIVATE KEY", pkcs8).replaceAll("\n", "\\n"),
    pem("RSA PRIVATE KEY", pkcs1FromPkcs8(pkcs8)),
  ];
  for (const privateKeyPem of candidates) {
    const config = parseTestingCenterGitHubAppConfig({
      TESTING_CENTER_GITHUB_APP_ID: "12345",
      TESTING_CENTER_GITHUB_APP_INSTALLATION_ID: "67890",
      TESTING_CENTER_GITHUB_APP_PRIVATE_KEY: privateKeyPem,
    });
    const jwt = await signTestingCenterGitHubAppJwt(
      config.appId,
      config.privateKeyPem,
      now,
    );
    assertEquals(jwt.split(".").length, 3);
  }
  for (const invalid of ["not a key", pem("PRIVATE KEY", new Uint8Array(64))]) {
    await assertRejects(async () => {
      const config = parseTestingCenterGitHubAppConfig({
        TESTING_CENTER_GITHUB_APP_ID: "12345",
        TESTING_CENTER_GITHUB_APP_INSTALLATION_ID: "67890",
        TESTING_CENTER_GITHUB_APP_PRIVATE_KEY: invalid,
      });
      await signTestingCenterGitHubAppJwt(
        config.appId,
        config.privateKeyPem,
        now,
      );
    });
  }
});

Deno.test("token preparation is bounded and dispatch failures remain ambiguous", async () => {
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
  const privateKeyPem = pem(
    "PRIVATE KEY",
    new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  );
  const config = { appId: "12345", installationId: "67890", privateKeyPem };
  const rejected = createTestingCenterGitHubAppDispatcher(config, {
    nowEpochSeconds: () => now,
    fetch: (_input, init = {}) => {
      assertEquals(init.signal instanceof AbortSignal, true);
      return Promise.resolve(new Response(null, { status: 401 }));
    },
  });
  await assertRejects(() => rejected.prepare());

  for (
    const response of [
      new Response("not-json", { status: 201 }),
      Response.json({ token: "bad", expires_at: "bad" }, { status: 201 }),
    ]
  ) {
    const invalidToken = createTestingCenterGitHubAppDispatcher(config, {
      nowEpochSeconds: () => now,
      fetch: () => Promise.resolve(response.clone()),
    });
    await assertRejects(() => invalidToken.prepare());
  }

  let oversizedCancelled = false;
  const oversizedToken = createTestingCenterGitHubAppDispatcher(config, {
    nowEpochSeconds: () => now,
    fetch: () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(16_385));
            },
            cancel() {
              oversizedCancelled = true;
            },
          }),
          { status: 201 },
        ),
      ),
  });
  await assertRejects(() => oversizedToken.prepare());
  assertEquals(oversizedCancelled, true);

  for (
    const dispatchFailure of [
      () => Promise.resolve(new Response(null, { status: 500 })),
      () => Promise.reject(new Error("network")),
    ]
  ) {
    let calls = 0;
    const dispatcher = createTestingCenterGitHubAppDispatcher(config, {
      nowEpochSeconds: () => now,
      fetch: (_input, init = {}) => {
        assertEquals(init.signal instanceof AbortSignal, true);
        calls++;
        if (calls === 1) {
          return Promise.resolve(Response.json({
            token: `ghs_${"x".repeat(36)}`,
            expires_at: new Date((now + 3600) * 1000).toISOString(),
          }, { status: 201 }));
        }
        return dispatchFailure();
      },
    });
    const prepared = await dispatcher.prepare();
    await assertRejects(() =>
      prepared.dispatch(buildTestingCenterRepositoryDispatch(claim()))
    );
  }
});
