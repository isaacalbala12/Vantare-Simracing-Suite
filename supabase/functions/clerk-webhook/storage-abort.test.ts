import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { abortStorageUpload } from "./storage-abort.ts";
const upload = {
  bucket_id: "testing-center-evidence",
  name: "folder/part + ñ.png",
  upload_id: "fixture/+=id",
};
const config = {
  url: "http://127.0.0.1:54321",
  anonKey: "fixture-anon",
  serviceKey: "fixture-service",
  tenant: "stub",
  region: "us-east-1",
};
Deno.test("multipart abort signs DELETE, preserves path and upload ID, and only acknowledges API success", async () => {
  await abortStorageUpload(upload, config, (input, init) => {
    const u = new URL(String(input));
    assertEquals(
      u.pathname,
      "/storage/v1/s3/testing-center-evidence/folder/part%20%2B%20%C3%B1.png",
    );
    assertEquals(u.searchParams.get("uploadId"), "fixture/+=id");
    assertEquals(init?.method, "DELETE");
    const headers = new Headers(init?.headers);
    assertEquals(headers.get("x-amz-security-token"), "fixture-service");
    assertEquals(
      headers.get("authorization")?.startsWith(
        "AWS4-HMAC-SHA256 Credential=stub/",
      ),
      true,
    );
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  for (const status of [403, 404, 500]) {
    await assertRejects(
      () =>
        abortStorageUpload(
          upload,
          config,
          () => Promise.resolve(new Response(null, { status })),
        ),
      Error,
      "storage_abort_failed",
    );
  }
  await assertRejects(
    () => abortStorageUpload(upload, { ...config, tenant: "" }),
    Error,
    "storage_abort_not_configured",
  );
});

Deno.test("API abort succeeded but SQL ACK lost: exact NoSuchUpload can drain retry, generic 404 cannot", async () => {
  await abortStorageUpload(
    upload,
    config,
    () =>
      Promise.resolve(
        new Response("<Error><Code>NoSuchUpload</Code></Error>", {
          status: 404,
          headers: { "content-type": "application/xml" },
        }),
      ),
  );
  await assertRejects(
    () =>
      abortStorageUpload(upload, config, () =>
        Promise.resolve(
          new Response("<Error><Code>NoSuchKey</Code></Error>", {
            status: 404,
            headers: { "content-type": "application/xml" },
          }),
        )),
    Error,
    "storage_abort_failed",
  );
});
