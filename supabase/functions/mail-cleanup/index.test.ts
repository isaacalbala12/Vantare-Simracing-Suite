import { strict as assert } from "node:assert";
import { handleMailCleanup } from "./index.ts";

Deno.test("existing cleanup worker expires jobs even when Brevo cleanup is disabled", async () => {
  const key = "fixture-cleanup-key-with-32-characters";
  const calls: string[] = [];
  const response = await handleMailCleanup(
    new Request("https://cleanup.invalid", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1 }),
    }),
    {
      env: (name) => name === "MAIL_CLEANUP_KEY" ? key : undefined,
      rpc: (name) => {
        calls.push(name);
        assert.equal(name, "mail_erasure_expire");
        return Promise.resolve(0);
      },
      fetch: () => { throw new Error("disabled worker must not call Brevo"); },
    },
  );
  assert.equal(response.status, 503);
  assert.deepEqual(calls, ["mail_erasure_expire"]);
});
