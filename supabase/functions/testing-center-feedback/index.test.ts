// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertFalse,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AuthResult } from "../_shared/auth.ts";
import {
  type FeedbackCandidateSource,
  type FeedbackMembership,
  handleTestingCenterFeedbackRequest,
  type TestingCenterFeedbackStore,
} from "./index.ts";

const userId = "00000000-0000-4000-8000-000000000601";
const actorId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";

function auth(id = userId): Promise<AuthResult> {
  return Promise.resolve({
    ok: true,
    token: "synthetic-token",
    userId: id,
    email: null,
  });
}

function candidate(
  overrides: Partial<FeedbackCandidateSource> = {},
): FeedbackCandidateSource {
  return {
    issueId: `issue_${"a".repeat(64)}`,
    candidateId: "candidate-isa242",
    channel: "nightly",
    appVersion: "1.0.0-nightly.242",
    candidateSha: "b".repeat(40),
    candidateAuthorId: authorId,
    candidateState: "pending",
    flowState: "nightly_candidate",
    module: "testing_center",
    actionText: "Open pilot@example.invalid from C:\\Users\\Isaac\\secret.txt",
    expectedText: "The candidate remains stable",
    observedText: "The panel closed",
    ...overrides,
  };
}

function store(
  membership: FeedbackMembership = {
    userId,
    actorId,
    role: "primary_tester",
  },
  source = candidate(),
) {
  const records: Record<string, unknown>[] = [];
  const result: TestingCenterFeedbackStore & {
    records: Record<string, unknown>[];
  } = {
    records,
    async membership() {
      return membership;
    },
    async listCandidates() {
      return [source];
    },
    async candidate() {
      return source;
    },
    async record(projection, canonical, digestSource, projectionDigest) {
      assertEquals(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(digestSource),
        ).then((digest) =>
          Array.from(new Uint8Array(digest))
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("")
        ),
        projectionDigest,
      );
      records.push({ projection, canonical, digestSource, projectionDigest });
      return {
        validationId: `validation_${"c".repeat(64)}`,
        decision: projection.decision as
          | "accepted"
          | "rejected"
          | "cannot_verify",
        flowState: projection.decision === "rejected"
          ? "needs_owner"
          : "nightly_accepted",
        candidateState: projection.decision === "rejected"
          ? "rejected"
          : "accepted",
        idempotent: false,
      };
    },
  };
  return result;
}

function request(body: unknown): Request {
  return new Request("https://example.invalid/testing-center-feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("candidate list requires authenticated membership", async () => {
  const response = await handleTestingCenterFeedbackRequest(
    request({ operation: "list_candidates", channel: "nightly" }),
    {
      requireAuth: () => auth(),
      store: {
        ...store(),
        async membership() {
          return null;
        },
      },
    },
  );
  assertEquals(response.status, 403);
  assertEquals((await response.json()).error, "membership_required");
});

Deno.test("ordinary tester cannot request Nightly candidates", async () => {
  const testingStore = store({ userId, actorId, role: "tester" });
  const response = await handleTestingCenterFeedbackRequest(
    request({ operation: "list_candidates", channel: "nightly" }),
    { requireAuth: () => auth(), store: testingStore },
  );
  assertEquals(response.status, 403);
  assertEquals(testingStore.records.length, 0);
});

Deno.test("candidate list sanitizes private text and exposes no identities", async () => {
  const response = await handleTestingCenterFeedbackRequest(
    request({ operation: "list_candidates", channel: "nightly" }),
    { requireAuth: () => auth(), store: store() },
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.contractVersion, "testing-center.candidate-feed.v1");
  assertEquals(body.candidates.length, 1);
  const serialized = JSON.stringify(body);
  assertFalse(serialized.includes("pilot@example.invalid"));
  assertFalse(serialized.includes("C:\\Users"));
  assertFalse(serialized.includes(authorId));
  assertFalse(serialized.includes(actorId));
  assertEquals(body.candidates[0].canValidate, true);
});

Deno.test("candidate author sees the candidate but cannot self-validate", async () => {
  const testingStore = store({
    userId,
    actorId: authorId,
    role: "primary_tester",
  });
  const response = await handleTestingCenterFeedbackRequest(
    request({ operation: "list_candidates", channel: "nightly" }),
    { requireAuth: () => auth(), store: testingStore },
  );
  const body = await response.json();
  assertEquals(body.candidates[0].canValidate, false);
});

Deno.test("accepted feedback uses only server-owned actor and candidate context", async () => {
  const testingStore = store();
  const response = await handleTestingCenterFeedbackRequest(
    request({
      operation: "submit_feedback",
      candidateId: "candidate-isa242",
      candidateSha: "b".repeat(40),
      decision: "accepted",
    }),
    { requireAuth: () => auth(), store: testingStore },
  );
  assertEquals(response.status, 200);
  assertEquals(testingStore.records.length, 1);
  const projection = testingStore.records[0].projection as Record<
    string,
    unknown
  >;
  assertEquals(projection.actorRole, "primary_tester");
  assertEquals(projection.decision, "accepted");
  assertFalse(JSON.stringify(projection).includes("synthetic-token"));
  assertMatch(String(projection.projectionDigest), /^[0-9a-f]{64}$/);
});

Deno.test("rejection requires complete structured details", async () => {
  const testingStore = store();
  const response = await handleTestingCenterFeedbackRequest(
    request({
      operation: "submit_feedback",
      candidateId: "candidate-isa242",
      candidateSha: "b".repeat(40),
      decision: "rejected",
      details: { description: "still broken" },
    }),
    { requireAuth: () => auth(), store: testingStore },
  );
  assertEquals(response.status, 400);
  assertEquals((await response.json()).error, "incomplete_rejection");
  assertEquals(testingStore.records.length, 0);
});

Deno.test("complete rejection records diagnostics and logs consent separately", async () => {
  const testingStore = store();
  const response = await handleTestingCenterFeedbackRequest(
    request({
      operation: "submit_feedback",
      candidateId: "candidate-isa242",
      candidateSha: "b".repeat(40),
      decision: "rejected",
      details: {
        category: "issue_persists",
        description: "The original issue remains",
        steps: "Open the Testing Center panel",
        expected: "The panel remains visible",
        observed: "The panel closes",
        frequency: "always",
        blocking: true,
        diagnosticsConsent: true,
        logsConsent: false,
      },
    }),
    { requireAuth: () => auth(), store: testingStore },
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.flowState, "needs_owner");
  const projection = testingStore.records[0].projection as Record<
    string,
    unknown
  >;
  assertEquals(projection.decision, "rejected");
  assertMatch(String(projection.detailsMarkdown), /^## Rechazo:/);
});

Deno.test("stale SHA and store failures return closed errors", async () => {
  const testingStore = store();
  const stale = await handleTestingCenterFeedbackRequest(
    request({
      operation: "submit_feedback",
      candidateId: "candidate-isa242",
      candidateSha: "d".repeat(40),
      decision: "cannot_verify",
    }),
    { requireAuth: () => auth(), store: testingStore },
  );
  assertEquals(stale.status, 409);
  assertEquals((await stale.json()).error, "candidate_unavailable");

  const unavailableStore = store();
  unavailableStore.listCandidates = () =>
    Promise.reject(new Error("private detail"));
  const unavailable = await handleTestingCenterFeedbackRequest(
    request({ operation: "list_candidates", channel: "nightly" }),
    { requireAuth: () => auth(), store: unavailableStore },
  );
  assertEquals(unavailable.status, 503);
  assertFalse((await unavailable.text()).includes("private detail"));
});

Deno.test("malformed server candidate metadata fails closed", async () => {
  const malformedStore = store(
    undefined,
    candidate({ module: "private_area" }),
  );
  const listed = await handleTestingCenterFeedbackRequest(
    request({ operation: "list_candidates", channel: "nightly" }),
    { requireAuth: () => auth(), store: malformedStore },
  );
  assertEquals(listed.status, 503);

  const submitted = await handleTestingCenterFeedbackRequest(
    request({
      operation: "submit_feedback",
      candidateId: "candidate-isa242",
      candidateSha: "b".repeat(40),
      decision: "accepted",
    }),
    { requireAuth: () => auth(), store: malformedStore },
  );
  assertEquals(submitted.status, 409);
  assertEquals(malformedStore.records.length, 0);
});
