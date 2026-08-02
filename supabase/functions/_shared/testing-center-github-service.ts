import {
  createTestingCenterGitHubDryRunAdapter,
  type GitHubIssueProjection,
} from "./testing-center-github-projection.ts";

export type GitHubExternalIssue = { number: number; nodeId: string };
export type EffectClaim =
  | { status: "claimed"; effectId: string; leaseToken: string }
  | {
    status: "completed" | "paused" | "busy" | "retry_scheduled" | "exhausted";
  };

export interface TestingCenterGitHubStore {
  claim(effectId: string, leaseToken: string): Promise<EffectClaim>;
  assertUnpaused(effectId: string, leaseToken: string): Promise<void>;
  complete(
    effectId: string,
    leaseToken: string,
    issue: GitHubExternalIssue,
  ): Promise<void>;
  fail(effectId: string, leaseToken: string, errorCode: string): Promise<void>;
  reconcile(effectId: string, issue: GitHubExternalIssue): Promise<void>;
  recordDelivery(
    delivery: VerifiedGitHubDelivery,
  ): Promise<"recorded" | "duplicate">;
}

export interface TestingCenterGitHubClient {
  findAppAuthoredIssueByEffectMarker(
    effectId: string,
  ): Promise<GitHubExternalIssue | null>;
  createIssue(projection: GitHubIssueProjection): Promise<GitHubExternalIssue>;
}

export type DispatchResult =
  | { status: "created" | "reconciled"; issue: GitHubExternalIssue }
  | {
    status: "completed" | "paused" | "busy" | "retry_scheduled" | "exhausted";
  };

export class GitHubDeliveryError extends Error {
  constructor(
    readonly code: "github_request_failed" | "github_response_ambiguous",
  ) {
    super(code);
    this.name = "GitHubDeliveryError";
  }
}

export async function dispatchTestingCenterGitHubIssue(
  projection: GitHubIssueProjection,
  store: TestingCenterGitHubStore,
  github: TestingCenterGitHubClient,
  leaseToken = crypto.randomUUID(),
): Promise<DispatchResult> {
  const integrity = await createTestingCenterGitHubDryRunAdapter()
    .dispatchIssue(projection);
  if (integrity.status !== "dry_run") {
    throw new Error("github_projection_integrity_invalid");
  }
  const claim = await store.claim(projection.effectId, leaseToken);
  if (claim.status !== "claimed") return { status: claim.status };

  const existing = await github.findAppAuthoredIssueByEffectMarker(
    projection.effectId,
  );
  if (existing !== null) {
    await store.reconcile(projection.effectId, existing);
    return { status: "reconciled", issue: existing };
  }

  await store.assertUnpaused(projection.effectId, leaseToken);
  try {
    const issue = await github.createIssue(projection);
    await store.complete(projection.effectId, leaseToken, issue);
    return { status: "created", issue };
  } catch (error) {
    const code = error instanceof GitHubDeliveryError
      ? error.code
      : "github_request_failed";
    if (code === "github_response_ambiguous") {
      const recovered = await github.findAppAuthoredIssueByEffectMarker(
        projection.effectId,
      );
      if (recovered !== null) {
        await store.reconcile(projection.effectId, recovered);
        return { status: "reconciled", issue: recovered };
      }
    }
    await store.fail(projection.effectId, leaseToken, code);
    throw new GitHubDeliveryError(code);
  }
}

export type GitHubWebhookHeaders = {
  deliveryId: string;
  eventName: string;
  signature256: string;
};

export type VerifiedGitHubDelivery = {
  deliveryId: string;
  eventName: "issues";
  action: "opened" | "edited" | "closed" | "reopened";
  payloadDigest: string;
  issueNumber: number;
  receivedAt: string;
};

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  return hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", copyBuffer(bytes))),
  );
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function verifyGitHubWebhookDelivery(
  rawBody: Uint8Array,
  headers: GitHubWebhookHeaders,
  secret: string,
  receivedAt = new Date(),
): Promise<VerifiedGitHubDelivery> {
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(headers.deliveryId) ||
    headers.eventName !== "issues"
  ) {
    throw new Error("github_webhook_headers_invalid");
  }
  const signatureMatch = /^sha256=([0-9a-f]{64})$/.exec(headers.signature256);
  if (signatureMatch === null || secret.length < 32) {
    throw new Error("github_webhook_signature_invalid");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, copyBuffer(rawBody)),
  );
  const supplied = Uint8Array.from(
    signatureMatch[1].match(/../g) ?? [],
    (part) => parseInt(part, 16),
  );
  if (!constantTimeEqual(expected, supplied)) {
    throw new Error("github_webhook_signature_invalid");
  }

  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    throw new Error("github_webhook_payload_invalid");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("github_webhook_payload_invalid");
  }
  const payload = value as Record<string, unknown>;
  const issue = payload.issue;
  const action = payload.action;
  if (
    !["opened", "edited", "closed", "reopened"].includes(action as string) ||
    typeof issue !== "object" || issue === null || Array.isArray(issue) ||
    !Number.isSafeInteger((issue as Record<string, unknown>).number) ||
    ((issue as Record<string, unknown>).number as number) <= 0
  ) throw new Error("github_webhook_payload_invalid");

  return {
    deliveryId: headers.deliveryId,
    eventName: "issues",
    action: action as VerifiedGitHubDelivery["action"],
    payloadDigest: await sha256Bytes(rawBody),
    issueNumber: (issue as Record<string, unknown>).number as number,
    receivedAt: receivedAt.toISOString(),
  };
}

export async function receiveTestingCenterGitHubWebhook(
  rawBody: Uint8Array,
  headers: GitHubWebhookHeaders,
  secret: string,
  store: TestingCenterGitHubStore,
  receivedAt = new Date(),
): Promise<"recorded" | "duplicate"> {
  const delivery = await verifyGitHubWebhookDelivery(
    rawBody,
    headers,
    secret,
    receivedAt,
  );
  return await store.recordDelivery(delivery);
}

export async function signGitHubWebhookForTest(
  rawBody: Uint8Array,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `sha256=${
    hex(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, copyBuffer(rawBody)),
      ),
    )
  }`;
}
