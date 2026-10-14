import { grossRefund } from "./amounts.ts";
import { isUuid } from "../_shared/request.ts";
import { NativeError } from "../_shared/native-auth.ts";
import {
  loadPolarProductMap,
  type PolarProductMap,
  resolveCheckoutKeyByProductId,
} from "../_shared/mapping.ts";
import { polarAdminRequest, type PolarClientDeps } from "../_shared/polar.ts";
type Row = Record<string, unknown>;
type Execute = (action: string, params: Row) => Promise<Row>;

export async function polarPages(
  kind: "orders" | "refunds" | "discounts",
  organization: string,
  polar?: PolarClientDeps,
): Promise<Row[]> {
  const rows: Row[] = [];
  const ids = new Set<string>();
  let maxPage: number | undefined;
  for (let page = 1; page <= 100; page++) {
    const result = await polarAdminRequest(
      "GET",
      `/${kind}/?organization_id=${
        encodeURIComponent(organization)
      }&limit=100&page=${page}`,
      undefined,
      "sandbox",
      polar,
    );
    const pagination = result.pagination as Row | undefined;
    if (
      !Array.isArray(result.items) || !pagination ||
      !Number.isSafeInteger(pagination.max_page) ||
      Number(pagination.max_page) < 0 || Number(pagination.max_page) > 100
    ) throw new NativeError(503, "history_unavailable");
    if (maxPage !== undefined && maxPage !== Number(pagination.max_page)) {
      throw new NativeError(503, "history_unavailable");
    }
    maxPage = Number(pagination.max_page);
    for (const item of result.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new NativeError(503, "history_unavailable");
      }
      const row = item as Row;
      if (typeof row.id !== "string" || ids.has(row.id)) {
        throw new NativeError(503, "history_unavailable");
      }
      ids.add(row.id);
      rows.push(row);
    }
    if (page >= Number(pagination.max_page)) return rows;
  }
  throw new NativeError(503, "history_unavailable");
}
export async function syncAdminPayments(
  run: Execute,
  environment: string,
  provided?: PolarProductMap,
  polar?: PolarClientDeps,
): Promise<void> {
  const state = await run("get_payment_sync", {});
  if (state.needs_sync !== true) return;
  // Production has no new remote reads/effects in this review candidate.
  if (environment !== "sandbox") return;
  const loaded = provided
    ? { ok: true as const, map: provided }
    : loadPolarProductMap(undefined, { environment: "sandbox" });
  if (!loaded.ok || loaded.map.environment !== "sandbox") {
    throw new NativeError(503, "catalog_unavailable");
  }
  const map = loaded.map;
  const organization = await polarAdminRequest(
    "GET",
    `/organizations/${map.organization_id}`,
    undefined,
    "sandbox",
    polar,
  );
  if (organization.id !== map.organization_id) {
    throw new NativeError(503, "catalog_unavailable");
  }
  const orders = await polarPages("orders", map.organization_id, polar);
  const refunds = await polarPages("refunds", map.organization_id, polar);
  const accounts = new Set<string>();
  const incomplete = new Set<string>();
  for (const order of orders) {
    if (order.paid !== true) continue;
    const customer = order.customer as Row | undefined;
    const resolved = await run("resolve_payment_account", {
      customer_id: order.customer_id ?? customer?.id ?? null,
      external_id: order.external_customer_id ?? customer?.external_id ?? null,
    });
    if (!isUuid(resolved.account_id)) continue;
    const account = String(resolved.account_id);
    accounts.add(account);
    const product = order.product as Row | undefined;
    const selection = resolveCheckoutKeyByProductId(
      map,
      String(order.product_id ?? product?.id ?? ""),
    );
    const paid = order.paid_at ?? order.created_at;
    const modified = order.modified_at ?? order.updated_at ?? order.created_at;
    const amount = order.total_amount;
    const refunded = grossRefund(
      order.refunded_amount,
      order.refunded_tax_amount,
    );
    if (amount === 0) continue;
    if (
      !selection.ok || typeof order.id !== "string" ||
      typeof paid !== "string" || typeof modified !== "string" ||
      !Number.isFinite(Date.parse(paid)) ||
      !Number.isFinite(Date.parse(modified)) || !Number.isSafeInteger(amount) ||
      Number(amount) <= 0 || Number(amount) > 100000000 ||
      !Number.isSafeInteger(refunded) || Number(refunded) < 0 ||
      Number(refunded) > Number(amount) || order.currency !== "eur" ||
      order.applied_balance_amount !== 0
    ) {
      incomplete.add(account);
      continue;
    }
    await run("sync_admin_payment", {
      payment: {
        payment_id: order.id,
        account_id: account,
        subscription_id: order.subscription_id ?? null,
        product: selection.key === "launch_lifetime"
          ? "Launch Edition"
          : `${selection.key.startsWith("pro_plus") ? "Pro Plus" : "Pro"} ${
            selection.key.endsWith("annual") ? "anual" : "mensual"
          }`,
        paid_at: paid,
        modified_at: modified,
        amount_cents: amount,
        currency: "eur",
        discount_id: order.discount_id ?? null,
        refunded_cents: refunded,
      },
    });
  }
  for (const refund of refunds) {
    if (refund.currency !== "eur") continue;
    await run("sync_admin_refund", {
      refund: {
        refund_id: refund.id,
        payment_id: refund.order_id,
        amount_cents: grossRefund(refund.amount, refund.tax_amount),
        currency: refund.currency,
        status: refund.status,
        reason: typeof refund.reason === "string"
          ? refund.reason.slice(0, 500)
          : null,
        modified_at: refund.modified_at ?? refund.updated_at ??
          refund.created_at,
      },
    });
  }
  await run("finish_payment_sync", {
    account_ids: [...accounts].filter((id) => !incomplete.has(id)),
    incomplete_ids: [...incomplete],
  });
}
