import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { recoverCheckout } from "./checkouts.ts";
const user = "00000000-0000-4000-8000-000000000010";
const attempt = "00000000-0000-4000-8000-000000000020";
const snapshot = {
  id: "checkout-1",
  url: "https://sandbox.polar.sh/checkout/one",
  external_customer_id: user,
  created_at: "2026-10-08T12:00:00Z",
  expires_at: "2026-10-08T12:30:00Z",
  metadata: {
    app: "vantare",
    vantare_attempt_id: attempt,
    product_key: "pro_monthly",
    catalog_version: "v1",
  },
};
Deno.test("uncertain checkout binds only the API account and durable attempt; retry is idempotent", async () => {
  const calls: unknown[] = [];
  const admin = {
    rpc(name: string, params: unknown) {
      calls.push({ name, params });
      return Promise.resolve({ error: null, data: true });
    },
  };
  await recoverCheckout(admin as never, "sandbox", snapshot);
  await recoverCheckout(admin as never, "sandbox", snapshot);
  assertEquals(calls.length, 2);
  assertEquals(calls[0], calls[1]);
  assertEquals(
    (calls[0] as { params: Record<string, unknown> }).params.p_user_id,
    user,
  );
});
Deno.test("unknown legacy result, UUID metadata and missing correlation never bind a checkout", async () => {
  let calls = 0;
  const admin = {
    rpc() {
      calls++;
      return Promise.resolve({ error: null });
    },
  };
  for (
    const item of [
      { ...snapshot, external_customer_id: null },
      {
        ...snapshot,
        metadata: { ...snapshot.metadata, vantare_attempt_id: undefined },
      },
      { ...snapshot, metadata: { ...snapshot.metadata, app: "other" } },
    ]
  ) await recoverCheckout(admin as never, "sandbox", item);
  assertEquals(calls, 0);
});
Deno.test("checkout recovery rejects foreign hosts, credentials and environment mismatch", async () => {
  for (
    const url of [
      "https://polar.sh/checkout/one",
      "https://sandbox.polar.sh.evil.invalid/one",
      "https://name:pass@sandbox.polar.sh/one",
    ]
  ) {
    await assertRejects(() =>
      recoverCheckout(
        {
          rpc() {
            throw new Error("must not bind");
          },
        } as never,
        "sandbox",
        { ...snapshot, url },
      )
    );
  }
});
Deno.test("DB outage leaves checkout page retryable without recreating checkout", async () => {
  await assertRejects(() =>
    recoverCheckout(
      {
        rpc() {
          return Promise.resolve({ error: { code: "outage" } });
        },
      } as never,
      "sandbox",
      snapshot,
    )
  );
});
