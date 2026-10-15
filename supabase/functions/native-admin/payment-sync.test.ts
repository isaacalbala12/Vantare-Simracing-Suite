import { syncAdminPayments } from "./payment-sync.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";

type Row = Record<string, unknown>;
Deno.test("r3: malformed refund marks only its invoice and history still finishes", async () => {
  const map = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  const actions: { action: string; params: Row }[] = [];
  await syncAdminPayments(
    (action, params) => {
      actions.push({ action, params });
      if (action === "get_payment_sync") {
        return Promise.resolve({
          needs_sync: true,
        });
      }
      if (action === "sync_admin_refund") {
        const amount = (params.refund as Row).amount_cents;
        assert(Number.isSafeInteger(amount) && Number(amount) > 0);
      }
      return Promise.resolve({});
    },
    "sandbox",
    map,
    {
      getAccessToken: () => "local-test-token",
      fetchFn: (input) => {
        const path = String(input);
        const body = path.includes("organizations/")
          ? { id: map.organization_id }
          : {
            items: path.includes("refunds/")
              ? [
                {
                  id: "bad",
                  order_id: "invoice-bad",
                  currency: "eur",
                  amount: "unknown",
                  tax_amount: 0,
                  status: "succeeded",
                  created_at: "2026-10-01T00:00:00Z",
                },
                {
                  id: "good",
                  order_id: "invoice-good",
                  currency: "eur",
                  amount: 100,
                  tax_amount: 21,
                  status: "succeeded",
                  created_at: "2026-10-01T00:00:00Z",
                },
              ]
              : [],
            pagination: { max_page: 1 },
          };
        return Promise.resolve(new Response(JSON.stringify(body)));
      },
    },
  );
  assert(
    actions.some((a) =>
      a.action === "sync_admin_refund_issue" &&
      a.params.payment_id === "invoice-bad"
    ),
  );
  assert(actions.filter((a) => a.action === "sync_admin_refund").length === 1);
  assert(actions.at(-1)?.action === "finish_payment_sync");
});

Deno.test("r3: completed ledger never reads Polar on a normal account read", async () => {
  await syncAdminPayments(
    (action) => {
      assert(action === "get_payment_sync");
      return Promise.resolve({ needs_sync: false });
    },
    "sandbox",
    undefined,
    {
      fetchFn: () => {
        throw new Error("unexpected Polar read");
      },
    },
  );
});
