import { BodyEncodingError, BodyLimitError, readBundleBody } from "./body";
import { IngestCoordinator } from "./coordinator";
import {
  ContractError,
  normalizePayload,
  semanticPayloadJSON,
  strictDecodeBundle,
  strictDecodeCommand,
} from "./contract";
import {
  authenticateBuildToken,
  protectedHash,
  sha256,
  validSecret,
} from "./crypto";
import { assertEnvironment, type Env } from "./env";
import type {
  DeleteCommand,
  QuotaCommand,
  RotateCommand,
  UploadCommand,
} from "./protocol";

export { IngestCoordinator };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      assertEnvironment(env);
    } catch {
      return response(503, { error: "service_not_configured" });
    }
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/v1/bundles") {
      return upload(request, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/tombstones") {
      return requestDeletion(request, env);
    }
    if (request.method === "POST" && url.pathname === "/v1/credentials/rotate") {
      return rotateCredentials(request, env);
    }
    if (request.method === "GET" && url.pathname === "/v1/quota") {
      return queryQuota(request, env, url);
    }
    return response(404, { error: "not_found" });
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    assertEnvironment(env);
    const now = Date.now();
    let cursor: string | undefined;
    let deleted = 0;
    do {
      const page = await env.CURATION_BUCKET.list({
        prefix: "bundles/",
        include: ["customMetadata"],
        ...(cursor === undefined ? {} : { cursor }),
      });
      const expired = page.objects
        .filter((object) => {
          const expiresAt = object.customMetadata?.expiresAt;
          return expiresAt !== undefined && Date.parse(expiresAt) <= now;
        })
        .map((object) => object.key);
      if (expired.length > 0) {
        await env.CURATION_BUCKET.delete(expired);
        deleted += expired.length;
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
    console.log(JSON.stringify({ event: "retention_sweep", environment: env.CURATION_ENV, deleted }));
  },
} satisfies ExportedHandler<Env>;

async function upload(request: Request, env: Env): Promise<Response> {
  const admission = await requireBuildAdmission(request, env);
  if (admission !== undefined) return admission;
  if (!isJSON(request.headers.get("content-type"))) {
    return response(415, { error: "unsupported_media_type" });
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  if (!/^[0-9a-fA-F:.]{3,64}$/.test(ip)) {
    return response(503, { error: "client_address_unavailable" });
  }
  const uploadSecret = request.headers.get("x-vantare-upload-secret") ?? "";
  const deleteSecret = request.headers.get("x-vantare-delete-secret") ?? "";
  if (!validSecret(uploadSecret) || !validSecret(deleteSecret) || uploadSecret === deleteSecret) {
    return response(401, { error: "proof_required" });
  }

  try {
    const { text } = await readBundleBody(request);
    const bundle = strictDecodeBundle(text);
    const payload = normalizePayload(bundle.payload);
    const semanticDigest = await sha256(semanticPayloadJSON(payload));
    const [uploadIdRef, uploadAuthHash, deleteAuthHash, contributorHash, ipHash] = await Promise.all([
      protectedHash(env.HASH_PEPPER, "upload-id", bundle.admin.uploadId),
      protectedHash(env.HASH_PEPPER, "upload-secret", uploadSecret),
      protectedHash(env.HASH_PEPPER, "delete-secret", deleteSecret),
      protectedHash(env.HASH_PEPPER, "contributor", bundle.admin.uploadId),
      protectedHash(env.HASH_PEPPER, "ip", ip),
    ]);
    return coordinator(env, {
      operation: "upload",
      uploadIdRef,
      uploadAuthHash,
      deleteAuthHash,
      contributorHash,
      ipHash,
      semanticDigest,
      storedBytes: 0,
      payload,
    } satisfies UploadCommand);
  } catch (error) {
    if (error instanceof BodyLimitError) return response(413, { error: "size_limit_exceeded" });
    if (error instanceof BodyEncodingError) return response(415, { error: "invalid_body_encoding" });
    if (error instanceof ContractError) return response(422, { error: error.code });
    return response(422, { error: "invalid_bundle" });
  }
}

async function requestDeletion(request: Request, env: Env): Promise<Response> {
  const deleteSecret = request.headers.get("x-vantare-delete-secret") ?? "";
  if (!validSecret(deleteSecret)) return response(401, { error: "proof_required" });
  try {
    const input = await smallCommand(request, ["uploadId"]);
    const uploadId = normalizedUploadId(input.uploadId);
    const [uploadIdRef, deleteAuthHash] = await Promise.all([
      protectedHash(env.HASH_PEPPER, "upload-id", uploadId),
      protectedHash(env.HASH_PEPPER, "delete-secret", deleteSecret),
    ]);
    return coordinator(env, { operation: "delete", uploadIdRef, deleteAuthHash } satisfies DeleteCommand);
  } catch (error) {
    if (error instanceof BodyLimitError) return response(413, { error: "size_limit_exceeded" });
    return response(422, { error: "invalid_request" });
  }
}

async function rotateCredentials(request: Request, env: Env): Promise<Response> {
  const admission = await requireBuildAdmission(request, env);
  if (admission !== undefined) return admission;
  const uploadSecret = request.headers.get("x-vantare-upload-secret") ?? "";
  const deleteSecret = request.headers.get("x-vantare-delete-secret") ?? "";
  if (!validSecret(uploadSecret) || !validSecret(deleteSecret)) {
    return response(401, { error: "proof_required" });
  }
  try {
    const input = await smallCommand(request, ["uploadId", "newUploadSecret", "newDeleteSecret"]);
    const uploadId = normalizedUploadId(input.uploadId);
    const newUploadSecret = commandSecret(input.newUploadSecret);
    const newDeleteSecret = commandSecret(input.newDeleteSecret);
    if (newUploadSecret === newDeleteSecret) return response(422, { error: "secrets_must_be_independent" });
    const [uploadIdRef, uploadAuthHash, deleteAuthHash, nextUploadAuthHash, nextDeleteAuthHash] =
      await Promise.all([
        protectedHash(env.HASH_PEPPER, "upload-id", uploadId),
        protectedHash(env.HASH_PEPPER, "upload-secret", uploadSecret),
        protectedHash(env.HASH_PEPPER, "delete-secret", deleteSecret),
        protectedHash(env.HASH_PEPPER, "upload-secret", newUploadSecret),
        protectedHash(env.HASH_PEPPER, "delete-secret", newDeleteSecret),
      ]);
    return coordinator(env, {
      operation: "rotate",
      uploadIdRef,
      uploadAuthHash,
      deleteAuthHash,
      nextUploadAuthHash,
      nextDeleteAuthHash,
    } satisfies RotateCommand);
  } catch {
    return response(422, { error: "invalid_request" });
  }
}

async function queryQuota(request: Request, env: Env, url: URL): Promise<Response> {
  const admission = await requireBuildAdmission(request, env);
  if (admission !== undefined) return admission;
  const uploadSecret = request.headers.get("x-vantare-upload-secret") ?? "";
  const uploadId = url.searchParams.get("uploadId") ?? "";
  if (!validSecret(uploadSecret)) return response(401, { error: "proof_required" });
  try {
    const normalized = normalizedUploadId(uploadId);
    const [uploadIdRef, uploadAuthHash] = await Promise.all([
      protectedHash(env.HASH_PEPPER, "upload-id", normalized),
      protectedHash(env.HASH_PEPPER, "upload-secret", uploadSecret),
    ]);
    return coordinator(env, { operation: "quota", uploadIdRef, uploadAuthHash } satisfies QuotaCommand);
  } catch {
    return response(422, { error: "invalid_request" });
  }
}

async function requireBuildAdmission(request: Request, env: Env): Promise<Response | undefined> {
  const token = request.headers.get("x-vantare-build-token") ?? "";
  if (!(await authenticateBuildToken(token, env.BUILD_ADMISSION_TOKEN))) {
    return response(403, { error: "admission_denied" });
  }
  return undefined;
}

async function coordinator(env: Env, command: UploadCommand | DeleteCommand | RotateCommand | QuotaCommand): Promise<Response> {
  try {
    const stub = env.INGEST_COORDINATOR.getByName("global");
    return await stub.fetch("https://coordinator.internal/", {
      method: "POST",
      body: JSON.stringify(command),
    });
  } catch {
    return response(503, { error: "security_state_unavailable" });
  }
}

async function smallCommand(request: Request, keys: string[]): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4_096)) {
    throw new BodyLimitError("command body exceeds limit");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 4_096) throw new BodyLimitError("command body exceeds limit");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return strictDecodeCommand(text, keys);
}

function normalizedUploadId(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || !/^[a-z0-9][a-z0-9._:-]*$/.test(value)) {
    throw new Error("invalid upload id");
  }
  return value;
}

function commandSecret(value: unknown): string {
  if (typeof value !== "string" || !validSecret(value)) throw new Error("invalid secret");
  return value;
}

function isJSON(contentType: string | null): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function response(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}
