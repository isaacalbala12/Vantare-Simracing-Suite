import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isUuid, readJsonObject } from "./request.ts";

Deno.test("readJsonObject enforces the actual byte limit", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new TextEncoder().encode("x".repeat(30)));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    }),
  });
  const result = await readJsonObject(request, 16);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "body_too_large");
});

Deno.test("readJsonObject accepts an empty optional body", async () => {
  const result = await readJsonObject(
    new Request("https://example.test", { method: "POST" }),
    16,
    true,
  );
  assertEquals(result, { ok: true, value: {} });
});

Deno.test("isUuid accepts account UUIDs and rejects arbitrary identifiers", () => {
  assertEquals(isUuid("00000000-0000-4000-8000-000000000001"), true);
  assertEquals(isUuid("auth-user"), false);
});
