import {
  deepStrictEqual as assertEquals,
  rejects as assertRejects,
} from "node:assert/strict";
import { cleanupDeletedObjects } from "../_shared/account-erasure.ts";
import type { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

// All queues and Storage are synthetic. No env, credentials or network permissions.
function fixture(failure = "") {
  const calls: string[] = [];
  let upload = true, object = true;
  const client = {
    rpc: (name: string, params: Record<string, unknown>) => {
      assertEquals(params.p_issuer, "https://issuer.invalid");
      assertEquals(params.p_subject, "user_fixture");
      calls.push(name);
      if (failure === name) return Promise.resolve({ error: new Error(name) });
      if (name === "clerk_deletion_uploads") {
        return Promise.resolve({
          data: upload
            ? [{ bucket_id: "evidence", name: "partial", upload_id: "upload" }]
            : [],
        });
      }
      if (name === "clerk_deletion_objects") {
        return Promise.resolve({
          data: object ? [{ bucket_id: "evidence", name: "completed" }] : [],
        });
      }
      if (name === "clerk_deletion_upload_completed") upload = false;
      if (name === "clerk_deletion_completed") object = false;
      return Promise.resolve({ data: true });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (names: string[]) => {
          assertEquals(bucket, "evidence");
          assertEquals(names, ["completed"]);
          calls.push("remove");
          return Promise.resolve({
            error: failure === "remove" ? new Error("remove") : null,
          });
        },
      }),
    },
  } as unknown as ReturnType<typeof getSupabaseAdmin>;
  const run = () =>
    cleanupDeletedObjects(
      "https://issuer.invalid",
      "user_fixture",
      client,
      () => {
        calls.push("abort");
        return failure === "abort"
          ? Promise.reject(new Error("abort"))
          : Promise.resolve();
      },
    );
  return { calls, run };
}

Deno.test("erasure characterization: API success precedes each durable ACK; retry drains empty queues", async () => {
  const { calls, run } = fixture();
  await run();
  assertEquals(calls, [
    "clerk_deletion_uploads",
    "abort",
    "clerk_deletion_upload_completed",
    "clerk_deletion_uploads",
    "clerk_deletion_objects",
    "remove",
    "clerk_deletion_completed",
    "clerk_deletion_objects",
  ]);
  calls.length = 0;
  await run();
  assertEquals(calls, ["clerk_deletion_uploads", "clerk_deletion_objects"]);
});

for (
  const failure of [
    "clerk_deletion_uploads",
    "abort",
    "clerk_deletion_upload_completed",
  ]
) {
  Deno.test(
    "erasure characterization: " + failure +
      " keeps uploads pending but drains completed objects",
    async () => {
      const { calls, run } = fixture(failure);
      await assertRejects(run);
      assertEquals(calls.includes("clerk_deletion_completed"), true);
      if (failure === "abort") {
        assertEquals(calls.includes("clerk_deletion_upload_completed"), false);
      }
    },
  );
}

for (
  const failure of [
    "clerk_deletion_objects",
    "remove",
    "clerk_deletion_completed",
  ]
) {
  Deno.test(
    "erasure characterization: " + failure + " prevents successful completion",
    async () => {
      const { calls, run } = fixture(failure);
      await assertRejects(run);
      if (failure === "remove") {
        assertEquals(calls.includes("clerk_deletion_completed"), false);
      }
    },
  );
}
