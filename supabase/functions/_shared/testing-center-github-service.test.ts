// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildGitHubIssueProjection,
  type TestingCenterGitHubProjectionInput,
} from "./testing-center-github-projection.ts";
import {
  dispatchTestingCenterGitHubIssue,
  type EffectClaim,
  GitHubDeliveryError,
  type GitHubExternalIssue,
  receiveTestingCenterGitHubWebhook,
  signGitHubWebhookForTest,
  type TestingCenterGitHubClient,
  type TestingCenterGitHubStore,
  type VerifiedGitHubDelivery,
} from "./testing-center-github-service.ts";

const effectId = `effect_${"c".repeat(64)}`;
const projectionInput: TestingCenterGitHubProjectionInput = {
  contractVersion: "testing-center.github-projection.v1",
  effectId,
  technicalIssueId: `issue_${"b".repeat(64)}`,
  occurrenceCount: 1,
  replayAvailable: false,
  report: {
    reportId: `report_${"a".repeat(64)}`,
    channel: "nightly",
    appVersion: "v0.4.7-nightly",
    osFamily: "windows",
    osVersion: "Windows 11",
    module: "hub",
    actionText: "Open the hub",
    expectedText: "The hub remains open",
    observedText: "The hub closes unexpectedly",
    contextText: null,
    errorCode: null,
  },
};

class FakeStore implements TestingCenterGitHubStore {
  state: "pending" | "claimed" | "completed" | "failed" = "pending";
  paused = false;
  issue: GitHubExternalIssue | null = null;
  deliveries = new Map<string, string>();
  claim(effect: string, leaseToken: string): Promise<EffectClaim> {
    if (this.state === "completed") {
      return Promise.resolve({ status: "completed" as const });
    }
    if (this.paused) return Promise.resolve({ status: "paused" as const });
    this.state = "claimed";
    return Promise.resolve({
      status: "claimed" as const,
      effectId: effect,
      leaseToken,
    });
  }
  assertUnpaused() {
    return this.paused
      ? Promise.reject(new Error("testing_center_paused"))
      : Promise.resolve();
  }
  complete(_effect: string, _lease: string, issue: GitHubExternalIssue) {
    this.state = "completed";
    this.issue = issue;
    return Promise.resolve();
  }
  fail() {
    this.state = "failed";
    return Promise.resolve();
  }
  reconcile(_effect: string, issue: GitHubExternalIssue) {
    this.state = "completed";
    this.issue = issue;
    return Promise.resolve();
  }
  recordDelivery(delivery: VerifiedGitHubDelivery) {
    const digest = this.deliveries.get(delivery.deliveryId);
    if (digest !== undefined && digest !== delivery.payloadDigest) {
      return Promise.reject(new Error("delivery_conflict"));
    }
    if (digest !== undefined) return Promise.resolve("duplicate" as const);
    this.deliveries.set(delivery.deliveryId, delivery.payloadDigest);
    return Promise.resolve("recorded" as const);
  }
}

class FakeGitHub implements TestingCenterGitHubClient {
  calls = 0;
  issue: GitHubExternalIssue | null = null;
  ambiguous = false;
  findAppAuthoredIssueByEffectMarker() {
    return Promise.resolve(this.issue);
  }
  createIssue() {
    this.calls++;
    this.issue = { number: 42, nodeId: "I_kwDO_test" };
    if (this.ambiguous) {
      return Promise.reject(
        new GitHubDeliveryError("github_response_ambiguous"),
      );
    }
    return Promise.resolve(this.issue);
  }
}

Deno.test("claimed effect creates one issue and completes durable state", async () => {
  const store = new FakeStore();
  const github = new FakeGitHub();
  const result = await dispatchTestingCenterGitHubIssue(
    await buildGitHubIssueProjection(projectionInput),
    store,
    github,
    "11111111-1111-4111-8111-111111111111",
  );
  assertEquals(result.status, "created");
  assertEquals(github.calls, 1);
  assertEquals(store.state, "completed");
});

Deno.test("tampered projection is rejected before claim or network", async () => {
  const store = new FakeStore();
  const github = new FakeGitHub();
  const projection = await awaitProjection();
  await assertRejects(() =>
    dispatchTestingCenterGitHubIssue(
      { ...projection, body: `${projection.body}\ntampered` },
      store,
      github,
    )
  );
  assertEquals(store.state, "pending");
  assertEquals(github.calls, 0);
});

Deno.test("pause is checked again immediately before the side effect", async () => {
  const store = new FakeStore();
  const github = new FakeGitHub();
  const original = store.claim.bind(store);
  store.claim = async (effect, lease) => {
    const claim = await original(effect, lease);
    store.paused = true;
    return claim;
  };
  const projection = await awaitProjection();
  await assertRejects(() =>
    dispatchTestingCenterGitHubIssue(projection, store, github)
  );
  assertEquals(github.calls, 0);
});

Deno.test("ambiguous response reconciles marker and never creates twice", async () => {
  const store = new FakeStore();
  const github = new FakeGitHub();
  github.ambiguous = true;
  const result = await dispatchTestingCenterGitHubIssue(
    await awaitProjection(),
    store,
    github,
  );
  assertEquals(result.status, "reconciled");
  assertEquals(github.calls, 1);
  assertEquals(store.state, "completed");
  assertEquals(
    (await dispatchTestingCenterGitHubIssue(
      await awaitProjection(),
      store,
      github,
    ))
      .status,
    "completed",
  );
  assertEquals(github.calls, 1);
});

Deno.test("existing marker is reconciled before attempting create", async () => {
  const store = new FakeStore();
  const github = new FakeGitHub();
  github.issue = { number: 7, nodeId: "existing" };
  assertEquals(
    (await dispatchTestingCenterGitHubIssue(
      await awaitProjection(),
      store,
      github,
    ))
      .status,
    "reconciled",
  );
  assertEquals(github.calls, 0);
});

Deno.test("signed GitHub delivery is recorded once across 100 replays", async () => {
  const store = new FakeStore();
  const secret = "s".repeat(32);
  const raw = new TextEncoder().encode(
    JSON.stringify({ action: "opened", issue: { number: 42 } }),
  );
  const headers = {
    deliveryId: "delivery-1",
    eventName: "issues",
    signature256: await signGitHubWebhookForTest(raw, secret),
  };
  assertEquals(
    await receiveTestingCenterGitHubWebhook(raw, headers, secret, store),
    "recorded",
  );
  for (let index = 1; index < 100; index++) {
    assertEquals(
      await receiveTestingCenterGitHubWebhook(raw, headers, secret, store),
      "duplicate",
    );
  }
  assertEquals(store.deliveries.size, 1);
});

Deno.test("invalid signature, event, delivery ID and payload fail closed", async () => {
  const store = new FakeStore();
  const secret = "s".repeat(32);
  const raw = new TextEncoder().encode(
    JSON.stringify({ action: "opened", issue: { number: 42 } }),
  );
  const valid = await signGitHubWebhookForTest(raw, secret);
  for (
    const headers of [
      {
        deliveryId: "delivery-1",
        eventName: "issues",
        signature256: `sha256=${"0".repeat(64)}`,
      },
      { deliveryId: "bad id", eventName: "issues", signature256: valid },
      { deliveryId: "delivery-1", eventName: "push", signature256: valid },
    ]
  ) {
    await assertRejects(() =>
      receiveTestingCenterGitHubWebhook(raw, headers, secret, store)
    );
  }
  assertEquals(store.deliveries.size, 0);
});

async function awaitProjection() {
  return await buildGitHubIssueProjection(projectionInput);
}
