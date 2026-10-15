// Real SQL/PostgREST/Storage clients, with synthetic local credentials on stdin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  cleanupDeletedObjects,
  handleClerkWebhook,
} from "../functions/clerk-webhook/index.ts";
import { abortStorageUpload } from "../functions/clerk-webhook/storage-abort.ts";

const config = JSON.parse(await new Response(Deno.stdin.readable).text());
for (const url of [config.dbUrl, config.storage.url]) {
  if (new URL(url).hostname !== "127.0.0.1") throw new Error("local_only");
}
const admin = createClient(config.dbUrl, config.dbKey, {
  auth: { persistSession: false },
});
const storage = createClient(config.storage.url, config.storage.serviceKey, {
  auth: { persistSession: false },
});
Object.defineProperty(admin, "storage", { value: storage.storage });
let failures = 0;
for (const row of config.rows) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const body = JSON.stringify({
      type: "user.deleted",
      timestamp: Date.now(),
      data: { id: row.subject },
    });
    const id = crypto.randomUUID(),
      timestamp = String(Math.floor(Date.now() / 1000));
    const secret = new TextEncoder().encode(
      "synthetic-svix-local-test-material",
    );
    const key = await crypto.subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${id}.${timestamp}.${body}`),
      ),
    );
    const response = await handleClerkWebhook(
      new Request("http://127.0.0.1/clerk-webhook", {
        method: "POST",
        body,
        headers: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": "v1," + btoa(String.fromCharCode(...signature)),
        },
      }),
      {
        config: {
          issuer: row.issuer,
          signingSecret: "whsec_" + btoa(String.fromCharCode(...secret)),
        },
        apply: async (args) => {
          const result = await admin.rpc("apply_clerk_user_event", args);
          if (result.error) throw result.error;
        },
        cleanup: () =>
          cleanupDeletedObjects(
            row.issuer,
            row.subject,
            admin,
            row.failAbort && !row.realAbort
              ? () => Promise.reject(new Error("fixture_abort_outage"))
              : (upload) => abortStorageUpload(upload, config.storage),
          ),
      },
    );
    const failed = response.status !== 200;
    if (response.status !== (row.failAbort ? 503 : 200)) failures++;
    if (failed !== row.failAbort) failures++;
    const queues: number[] = [];
    for (const rpc of ["clerk_deletion_uploads", "clerk_deletion_objects"]) {
      const result = await admin.rpc(rpc, {
        p_issuer: row.issuer,
        p_subject: row.subject,
      });
      if (result.error) throw result.error;
      queues.push(result.data.length);
    }
    if (queues[0] !== (row.failAbort ? 1 : 0) || queues[1] !== 0) failures++;
    const downloaded = await storage.storage.from("testing-center-evidence")
      .download(row.objectName);
    if (!downloaded.error || downloaded.data) failures++;
    console.log(row.mode, "retry", attempt, {
      failed,
      status: response.status,
      uploadQueue: queues[0],
      objectQueue: queues[1],
      objectRemoved: !!downloaded.error && !downloaded.data,
    });
  }
}
if (failures) throw new Error(`cleanup_assertions_failed:${failures}`);
console.log("Real cleanup retries and independent object deletion: PASS");
