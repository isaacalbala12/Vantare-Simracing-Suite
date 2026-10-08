import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleBillingStatus } from "./index.ts";
const account = "00000000-0000-4000-8000-000000000010";
Deno.test("purchase return reads only authenticated account effective grants; redirect grants nothing", async () => {
  const response = await handleBillingStatus(
    new Request("https://status.invalid", {
      method: "POST",
      body: JSON.stringify({ userId: "another", paid: true }),
    }),
    {
      auth: async () => ({
        ok: true,
        token: "test-only",
        userId: account,
        email: null,
      }),
      environment: "sandbox",
      load: async (userId) => {
        assertEquals(userId, account);
        return [];
      },
    },
  );
  assertEquals(await response.json(), { capabilities: [] });
  assertEquals(response.headers.get("cache-control"), "no-store");
});
Deno.test("expired and refunded source cannot become a confirmed purchase", async () => {
  const response = await handleBillingStatus(
    new Request("https://status.invalid", { method: "POST" }),
    {
      auth: async () => ({
        ok: true,
        token: "test-only",
        userId: account,
        email: null,
      }),
      environment: "sandbox",
      load: async () => [{
        capability: "vantare.plan.pro",
        valid_until: "2020-01-01T00:00:00Z",
        provider: "polar",
        environment: "sandbox",
        source_type: "subscription",
      }],
    },
  );
  assertEquals(await response.json(), { capabilities: [] });
});
