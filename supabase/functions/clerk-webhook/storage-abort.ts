// Supabase S3 session authentication reuses the existing anon/service JWTs.
// No SDK, S3 secret or direct SQL deletion of Storage data.
const bytes = (value: string) => new TextEncoder().encode(value);
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, "0"))
    .join("");
async function hash(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes(value)));
}
async function hmac(key: Uint8Array<ArrayBuffer>, value: string) {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, bytes(value)),
  );
}
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );

export async function abortStorageUpload(
  upload: { bucket_id: string; name: string; upload_id: string },
  config = {
    url: Deno.env.get("SUPABASE_URL") ?? "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    tenant: Deno.env.get("STORAGE_S3_TENANT_ID") ?? "",
    region: Deno.env.get("STORAGE_S3_REGION") ?? "us-east-1",
  },
  request: typeof fetch = fetch,
): Promise<void> {
  const url = new URL(config.url);
  const tenant = config.tenant ||
    (url.hostname.endsWith(".supabase.co") ? url.hostname.split(".")[0] : "");
  if (!tenant || !config.anonKey || !config.serviceKey) {
    throw new Error("storage_abort_not_configured");
  }
  // Sign the external path including the gateway prefix; Storage strips that
  // prefix using its configured S3_PROTOCOL_PREFIX when verifying the request.
  const path = "/storage/v1/s3/" + encode(upload.bucket_id) + "/" +
    upload.name.split("/").map(encode).join("/");
  const query = "uploadId=" + encode(upload.upload_id);
  const date = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = date.slice(0, 8);
  const payloadHash = await hash("");
  const signedHeaders =
    "host;x-amz-content-sha256;x-amz-date;x-amz-security-token";
  const headers =
    `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\nx-amz-security-token:${config.serviceKey}\n`;
  const canonical =
    `DELETE\n${path}\n${query}\n${headers}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${day}/${config.region}/s3/aws4_request`;
  let key = await hmac(bytes("AWS4" + config.anonKey), day);
  for (const value of [config.region, "s3", "aws4_request"]) {
    key = await hmac(key, value);
  }
  const signature = hex(
    (await hmac(
      key,
      `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await hash(canonical)}`,
    )).buffer,
  );
  const response = await request(url.origin + path + "?" + query, {
    method: "DELETE",
    headers: {
      authorization:
        `AWS4-HMAC-SHA256 Credential=${tenant}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-date": date,
      "x-amz-content-sha256": payloadHash,
      "x-amz-security-token": config.serviceKey,
      apikey: config.anonKey,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (response.ok) {
    await response.body?.cancel();
    return;
  }
  // After API success an SQL ACK may be lost. Only the S3 NoSuchUpload result
  // proves this exact upload is absent; a generic 404/permission error does not.
  if (await uploadAlreadyAbsent(response)) return;
  throw new Error("storage_abort_failed");
}

async function uploadAlreadyAbsent(response: Response): Promise<boolean> {
  if (
    response.status !== 404 ||
    !response.headers.get("content-type")?.includes("application/xml") ||
    !response.body
  ) {
    await response.body?.cancel();
    return false;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, body = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 8192) return false;
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return /<Code>NoSuchUpload<\/Code>/.test(body);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
