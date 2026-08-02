import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createCheckoutAttemptStore } from "./checkout-attempts.ts";

const attempt = {
  userId: "00000000-0000-4000-8000-000000000010",
  attemptId: "00000000-0000-4000-8000-000000000020",
  checkoutKey: "pro_monthly" as const,
  environment: "sandbox" as const,
  catalogVersion: "catalog-v2",
};

function client(results: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(results.shift() ?? { data: null, error: null });
    },
  };
}

Deno.test("checkout attempt adapter uses the atomic claim RPC", async () => {
  const fake = client([{
    data: [{ outcome: "claimed", checkout_url: null }],
    error: null,
  }]);
  const result = await createCheckoutAttemptStore(fake as never).claim(attempt);
  assertEquals(result, { kind: "claimed" });
  assertEquals(fake.calls[0].name, "claim_billing_checkout_attempt");
  assertEquals(fake.calls[0].args.p_environment, "sandbox");
});

Deno.test("checkout attempt adapter never reuses an expired URL", async () => {
  const fake = client([{
    data: [{ outcome: "expired", checkout_url: "https://expired.test" }],
    error: null,
  }]);
  assertEquals(await createCheckoutAttemptStore(fake as never).claim(attempt), {
    kind: "expired",
  });
});

Deno.test("checkout attempt transitions require exactly one changed row", async () => {
  for (const operation of ["complete", "markUncertain"] as const) {
    const fake = client([{ data: false, error: null }]);
    const store = createCheckoutAttemptStore(fake as never);
    await assertRejects(
      () =>
        operation === "complete"
          ? store.complete(
            attempt,
            "checkout",
            "https://sandbox.polar.sh/checkout/test",
          )
          : store.markUncertain(attempt),
      Error,
      "failed",
    );
  }
});
