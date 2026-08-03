// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CODEX_DISPATCH_VERSION,
  CODEX_FIX_OUTPUT_VERSION,
  CODEX_FIX_PROMPT_VERSION,
  type CodexDispatchInput,
  type CodexDispatchReplayLedger,
  consumeCodexDispatch,
  PINNED_CODEX_ACTION_COMMIT,
  PINNED_CODEX_CLI_VERSION,
  signCodexDispatch,
  verifyCodexDispatch,
} from "./testing-center-codex-dispatch.ts";

const now = 1_785_708_000;
const key = new TextEncoder().encode("k".repeat(32));

function input(
  overrides: Partial<CodexDispatchInput> = {},
): CodexDispatchInput {
  return {
    runId: `codex_run_${"a".repeat(64)}`,
    technicalIssueId: `issue_${"b".repeat(64)}`,
    requestDigest: "c".repeat(64),
    analysisBaseSha: "d".repeat(40),
    nightlyHeadSha: "e".repeat(40),
    ancestryProofDigest: "f".repeat(64),
    fencingToken: 7,
    moduleId: "testing_center.presentation",
    issuedAtEpochSeconds: now - 1,
    expiresAtEpochSeconds: now + 59,
    nonce: "1".repeat(64),
    ...overrides,
  };
}

class Ledger implements CodexDispatchReplayLedger {
  readonly reserved = new Set<string>();
  reserve(signature: string, runId: string): Promise<boolean> {
    const key = `${signature}:${runId}`;
    if (this.reserved.has(key)) return Promise.resolve(false);
    this.reserved.add(key);
    return Promise.resolve(true);
  }
}

Deno.test("dispatch signs a closed server-owned payload and verifies it", async () => {
  const envelope = await signCodexDispatch(input(), key, now);
  const verified = await verifyCodexDispatch(envelope, key, now);
  assertEquals(verified.contractVersion, CODEX_DISPATCH_VERSION);
  assertEquals(verified.promptVersion, CODEX_FIX_PROMPT_VERSION);
  assertEquals(verified.outputVersion, CODEX_FIX_OUTPUT_VERSION);
  assertEquals(verified.codexActionCommit, PINNED_CODEX_ACTION_COMMIT);
  assertEquals(verified.codexCliVersion, PINNED_CODEX_CLI_VERSION);
  assertEquals(verified.repositoryOwner, "isaacalbala12");
  assertEquals(verified.repositoryName, "Vantare-Simracing-Suite");
  assertEquals(verified.baseRef, "nightly");
});

Deno.test("critical identity digest SHA scope and fencing tampering fails", async () => {
  const envelope = await signCodexDispatch(input(), key, now);
  const mutations: Array<[string, unknown]> = [
    ["technicalIssueId", `issue_${"0".repeat(64)}`],
    ["requestDigest", "0".repeat(64)],
    ["analysisBaseSha", "0".repeat(40)],
    ["nightlyHeadSha", "0".repeat(40)],
    ["ancestryProofDigest", "0".repeat(64)],
    ["fencingToken", 8],
    ["moduleId", "calendar.presentation"],
    ["nonce", "0".repeat(64)],
  ];
  for (const [field, value] of mutations) {
    await assertRejects(() =>
      verifyCodexDispatch(
        {
          ...envelope,
          payload: { ...envelope.payload, [field]: value },
        },
        key,
        now,
      )
    );
  }
});

Deno.test("unknown fields malformed values and wrong keys fail closed", async () => {
  const envelope = await signCodexDispatch(input(), key, now);
  await assertRejects(() =>
    verifyCodexDispatch({ ...envelope, extra: true }, key, now)
  );
  await assertRejects(() =>
    verifyCodexDispatch(
      {
        ...envelope,
        payload: { ...envelope.payload, extra: true },
      },
      key,
      now,
    )
  );
  await assertRejects(() =>
    verifyCodexDispatch(envelope, new TextEncoder().encode("x".repeat(32)), now)
  );
  await assertRejects(() =>
    signCodexDispatch(input(), new Uint8Array(31), now)
  );
  await assertRejects(() =>
    signCodexDispatch(input({ fencingToken: 0 }), key, now)
  );
});

Deno.test("signature verification is independent from received JSON key order", async () => {
  const envelope = await signCodexDispatch(input(), key, now);
  const reversedPayload = Object.fromEntries(
    Object.entries(envelope.payload).reverse(),
  );
  assertEquals(
    (await verifyCodexDispatch(
      {
        signature: envelope.signature,
        payload: reversedPayload,
      },
      key,
      now,
    )).requestDigest,
    envelope.payload.requestDigest,
  );
});

Deno.test("expiry future issuance and TTL outside 30 to 300 seconds fail", async () => {
  for (
    const changed of [
      input({ expiresAtEpochSeconds: now }),
      input({
        issuedAtEpochSeconds: now + 31,
        expiresAtEpochSeconds: now + 61,
      }),
      input({ issuedAtEpochSeconds: now, expiresAtEpochSeconds: now + 29 }),
      input({ issuedAtEpochSeconds: now, expiresAtEpochSeconds: now + 301 }),
    ]
  ) {
    await assertRejects(() => signCodexDispatch(changed, key, now));
  }
  const expired = await signCodexDispatch(input(), key, now);
  await assertRejects(() => verifyCodexDispatch(expired, key, now + 60));
});

Deno.test("a valid signed dispatch can be consumed only once by its ledger", async () => {
  const envelope = await signCodexDispatch(input(), key, now);
  const ledger = new Ledger();
  assertEquals(
    (await consumeCodexDispatch(envelope, key, now, ledger)).runId,
    envelope.payload.runId,
  );
  await assertRejects(() => consumeCodexDispatch(envelope, key, now, ledger));
});

Deno.test("tester prose prompt injection paths URLs and logs are absent", async () => {
  const envelope = await signCodexDispatch(input(), key, now);
  const serialized = JSON.stringify(envelope);
  for (
    const forbidden of [
      "ignore previous instructions",
      "tester@example.com",
      "C:\\Users\\tester\\session.log",
      "https://example.invalid/replay",
      "log message",
      "issue title",
    ]
  ) assertEquals(serialized.includes(forbidden), false);
});
