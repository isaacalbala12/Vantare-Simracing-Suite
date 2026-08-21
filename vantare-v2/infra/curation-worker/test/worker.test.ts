import { env, reset, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES } from "../src/constants";

const buildToken = "unit-test-only-build-token-0123456789";

interface Identity {
  uploadId: string;
  uploadSecret: string;
  deleteSecret: string;
}

function identity(suffix: string): Identity {
  return {
    uploadId: `install-${suffix}`,
    uploadSecret: `upload-${suffix}-0123456789abcdef0123456789`,
    deleteSecret: `delete-${suffix}-0123456789abcdef0123456789`,
  };
}

function bundle(owner: Identity, suffix = "a"): Record<string, unknown> {
  return {
    admin: { uploadId: owner.uploadId, deleteHash: "client-value-is-not-authority" },
    payload: {
      contractVersion: "curationbundle.v1",
      bundleId: `bundle-${suffix}`,
      combinationId: "lmu:spa:lmp2",
      epoch: "2026-W33",
      stintAggregates: [
        { stintNumber: 1, laps: 10, avgFuelPerLap: 2.5, avgVEPerLap: 1.25 },
        { stintNumber: 2, laps: 9, avgFuelPerLap: 2.4, avgVEPerLap: 1.2 },
      ],
      pitAggregates: { count: 1, avgDurationSeconds: 20, fuelRateLPerS: 2 },
      observedStrategies: [{ stintCount: 2, pitLaps: [10], compounds: ["medium", "hard"] }],
      channelQuality: { validSessions: 2, invalidSessions: 0 },
    },
  };
}

function uploadHeaders(owner: Identity, ip: string): HeadersInit {
  return {
    "content-type": "application/json",
    "cf-connecting-ip": ip,
    "x-vantare-build-token": buildToken,
    "x-vantare-upload-secret": owner.uploadSecret,
    "x-vantare-delete-secret": owner.deleteSecret,
  };
}

async function upload(
  value: unknown,
  owner: Identity,
  ip: string,
  extraHeaders: HeadersInit = {},
): Promise<Response> {
  const body = value instanceof Uint8Array
    ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
    : typeof value === "string" ? value : JSON.stringify(value);
  return SELF.fetch("https://worker.test/v1/bundles", {
    method: "POST",
    headers: { ...uploadHeaders(owner, ip), ...extraHeaders },
    body,
  });
}

async function gzip(value: string): Promise<Uint8Array> {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function list(prefix: string): Promise<R2Object[]> {
  return (await env.CURATION_BUCKET.list({ prefix, include: ["customMetadata"] })).objects;
}

describe("curation ingestion adversarial protocol", () => {
  beforeEach(async () => reset());

  it("deduplicates replay by normalized semantic payload across JSON order and gzip", async () => {
    const owner = identity("replay");
    const first = await upload(bundle(owner), owner, "203.0.113.1");
    expect(first.status).toBe(201);
    const receipt = await first.json<{ semanticDigest: string }>();

    const reordered = bundle(owner, "transport-only");
    const payload = reordered.payload as { stintAggregates: unknown[] };
    payload.stintAggregates.reverse();
    const compressed = await gzip(JSON.stringify(reordered));
    const replay = await upload(compressed, owner, "203.0.113.1", { "content-encoding": "gzip" });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ status: "replay", semanticDigest: receipt.semanticDigest });
    expect(await list("bundles/")).toHaveLength(1);
  });

  it("preserves distinct contributors that submit the same semantic payload", async () => {
    const firstOwner = identity("cohort-a");
    const secondOwner = identity("cohort-b");
    const firstBundle = bundle(firstOwner, "same-a");
    const secondBundle = bundle(secondOwner, "same-b");
    expect((await upload(firstBundle, firstOwner, "203.0.113.2")).status).toBe(201);
    expect((await upload(secondBundle, secondOwner, "203.0.113.3")).status).toBe(201);
    expect(await list("bundles/")).toHaveLength(2);
  });

  it("rejects invalid, unknown and duplicate fields before any R2 write", async () => {
    const owner = identity("invalid");
    const unknown = bundle(owner);
    (unknown.payload as Record<string, unknown>).driverName = "canary";
    expect((await upload(unknown, owner, "203.0.113.4")).status).toBe(422);

    const encoded = JSON.stringify(bundle(owner)).replace(
      '"bundleId":"bundle-a"',
      '"bundleId":"bundle-a","bundleId":"other"',
    );
    expect((await upload(encoded, owner, "203.0.113.4")).status).toBe(422);
    expect(await list("bundles/")).toHaveLength(0);
  });

  it("rejects compressed and declared oversize before writing", async () => {
    const owner = identity("compressed-limit");
    const oversized = new Uint8Array(MAX_COMPRESSED_BYTES + 1);
    expect((await upload(oversized, owner, "203.0.113.5", { "content-encoding": "gzip" })).status).toBe(413);
    expect(
      (await upload("{}", owner, "203.0.113.5", { "content-length": String(MAX_COMPRESSED_BYTES + 1) })).status,
    ).toBe(413);
    expect(await list("bundles/")).toHaveLength(0);
  });

  it("cuts a gzip whose decompressed form exceeds the limit", async () => {
    const owner = identity("decompressed-limit");
    const compressed = await gzip(JSON.stringify(bundle(owner)) + " ".repeat(MAX_DECOMPRESSED_BYTES));
    expect(compressed.byteLength).toBeLessThan(MAX_COMPRESSED_BYTES);
    expect((await upload(compressed, owner, "203.0.113.6", { "content-encoding": "gzip" })).status).toBe(413);
    expect(await list("bundles/")).toHaveLength(0);
  });

  it("closes IP quota abuse even when every identity is new", async () => {
    const sharedIP = "203.0.113.7";
    for (let index = 0; index < 2; index++) {
      const owner = identity(`quota-${index}`);
      expect((await upload(bundle(owner, String(index)), owner, sharedIP)).status).toBe(201);
    }
    const third = identity("quota-2");
    expect((await upload(bundle(third, "2"), third, sharedIP)).status).toBe(429);
    expect(await list("bundles/")).toHaveLength(2);
  });

  it("closes the global quota across new identities and different IPs", async () => {
    for (let index = 0; index < 3; index++) {
      const owner = identity(`global-${index}`);
      expect((await upload(bundle(owner, String(index)), owner, `198.51.100.${index + 1}`)).status).toBe(201);
    }
    const denied = identity("global-3");
    expect((await upload(bundle(denied, "3"), denied, "198.51.100.4")).status).toBe(429);
    expect(await list("bundles/")).toHaveLength(3);
  });

  it("fails closed when the platform IP is unavailable", async () => {
    const owner = identity("missing-ip");
    const headers = uploadHeaders(owner, "203.0.113.8") as Record<string, string>;
    delete headers["cf-connecting-ip"];
    const result = await SELF.fetch("https://worker.test/v1/bundles", {
      method: "POST",
      headers,
      body: JSON.stringify(bundle(owner)),
    });
    expect(result.status).toBe(503);
    expect(await list("bundles/")).toHaveLength(0);
  });

  it("rejects upload proof from another owner", async () => {
    const owner = identity("owner-upload");
    const foreign = identity("foreign-upload");
    const value = bundle(owner);
    expect((await upload(value, owner, "203.0.113.9")).status).toBe(201);
    expect((await upload(value, foreign, "203.0.113.10")).status).toBe(403);
    expect(await list("bundles/")).toHaveLength(1);
  });

  it("rejects foreign deletion and emits one authenticated tombstone for all owned objects", async () => {
    const owner = identity("owner-delete");
    const foreign = identity("foreign-delete");
    expect((await upload(bundle(owner, "one"), owner, "203.0.113.11")).status).toBe(201);
    const second = bundle(owner, "two");
    (second.payload as { epoch: string }).epoch = "2026-W34";
    expect((await upload(second, owner, "203.0.113.11")).status).toBe(201);

    const deletionBody = JSON.stringify({ uploadId: owner.uploadId });
    const denied = await SELF.fetch("https://worker.test/v1/tombstones", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vantare-delete-secret": foreign.deleteSecret },
      body: deletionBody,
    });
    expect(denied.status).toBe(403);
    expect(await list("tombstones/")).toHaveLength(0);

    const accepted = await SELF.fetch("https://worker.test/v1/tombstones", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vantare-delete-secret": owner.deleteSecret },
      body: deletionBody,
    });
    expect(accepted.status).toBe(201);
    const tombstones = await list("tombstones/");
    expect(tombstones).toHaveLength(1);
    const record = await env.CURATION_BUCKET.get(tombstones[0].key);
    expect(await record!.json()).toMatchObject({
      contractVersion: "vantare.curation.tombstone.v1",
      environment: "test",
      bundleObjectKeys: expect.arrayContaining((await list("bundles/")).map((item) => item.key)),
    });

    expect((await upload(bundle(owner, "after-delete"), owner, "203.0.113.12")).status).toBe(403);
  });

  it("stores only stable administrative hashes and immutable retention metadata", async () => {
    const owner = identity("stored-shape");
    const accepted = await upload(bundle(owner), owner, "203.0.113.13");
    expect(accepted.status).toBe(201);
    const objects = await list("bundles/");
    const stored = await env.CURATION_BUCKET.get(objects[0].key);
    const decoded = await stored!.json<{ admin: { uploadId: string; deleteHash: string } }>();
    expect(decoded.admin.uploadId).toMatch(/^[a-f0-9]{64}$/);
    expect(decoded.admin.deleteHash).toBe(decoded.admin.uploadId);
    expect(JSON.stringify(decoded)).not.toContain(owner.uploadSecret);
    expect(JSON.stringify(decoded)).not.toContain(owner.deleteSecret);
    expect(objects[0].customMetadata).toMatchObject({ environment: "test" });
    expect(Date.parse(objects[0].customMetadata!.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("authenticates quota queries and rotates both independent secrets", async () => {
    const owner = identity("rotation");
    expect((await upload(bundle(owner), owner, "203.0.113.14")).status).toBe(201);

    const deniedQuota = await SELF.fetch(`https://worker.test/v1/quota?uploadId=${owner.uploadId}`, {
      headers: {
        "x-vantare-build-token": buildToken,
        "x-vantare-upload-secret": identity("foreign-quota").uploadSecret,
      },
    });
    expect(deniedQuota.status).toBe(403);
    const quota = await SELF.fetch(`https://worker.test/v1/quota?uploadId=${owner.uploadId}`, {
      headers: {
        "x-vantare-build-token": buildToken,
        "x-vantare-upload-secret": owner.uploadSecret,
      },
    });
    expect(quota.status).toBe(200);
    expect(await quota.json()).toMatchObject({ daily: { objects: 1 }, monthly: { objects: 1 } });

    const next = identity("rotation-next");
    const rotated = await SELF.fetch("https://worker.test/v1/credentials/rotate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vantare-build-token": buildToken,
        "x-vantare-upload-secret": owner.uploadSecret,
        "x-vantare-delete-secret": owner.deleteSecret,
      },
      body: JSON.stringify({
        uploadId: owner.uploadId,
        newUploadSecret: next.uploadSecret,
        newDeleteSecret: next.deleteSecret,
      }),
    });
    expect(rotated.status).toBe(200);

    const afterRotation = bundle(owner, "after-rotation");
    (afterRotation.payload as { epoch: string }).epoch = "2026-W35";
    expect((await upload(afterRotation, owner, "203.0.113.14")).status).toBe(403);
    const rotatedIdentity = { ...owner, uploadSecret: next.uploadSecret, deleteSecret: next.deleteSecret };
    expect((await upload(afterRotation, rotatedIdentity, "203.0.113.14")).status).toBe(201);
  });
});
