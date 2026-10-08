import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import { computeWebhookPayloadHash } from "../billing-webhook/inbox.ts";
import { applyPolarDisputeSnapshot } from "../billing-webhook/disputes.ts";
import { recoverCheckout } from "./checkouts.ts";
import {
  minimizePolarWebhookEvent,
  type PolarWebhookEvent,
  processPolarWebhookEvent,
  replayPolarWebhookInboxItem,
  type WebhookProcessorDeps,
} from "../billing-webhook/process.ts";

export const RESOURCES = [
  "checkouts",
  "orders",
  "subscriptions",
  "refunds",
  "disputes",
] as const;
export type Resource = typeof RESOURCES[number];
export type Cursor = { resource: Resource; page: number };
export type Page = { items: Record<string, unknown>[]; maxPage: number };

export function advanceCursor(cursor: Cursor, maxPage: number): Cursor {
  if (!Number.isSafeInteger(maxPage) || maxPage < 1 || maxPage < cursor.page) {
    throw new Error("invalid_polar_pagination");
  }
  return cursor.page < maxPage
    ? { resource: cursor.resource, page: cursor.page + 1 }
    : {
      resource:
        RESOURCES[(RESOURCES.indexOf(cursor.resource) + 1) % RESOURCES.length],
      page: 1,
    };
}

export function reconciliationEvent(
  resource: Resource,
  data: Record<string, unknown>,
): PolarWebhookEvent | null {
  if (resource === "disputes" || resource === "checkouts") return null;
  if (resource === "orders" && data.paid !== true) return null;
  const type = resource === "orders"
    ? (data.status === "refunded" ? "order.refunded" : "order.paid")
    : resource === "subscriptions"
    ? "subscription.updated"
    : "refund.updated";
  return minimizePolarWebhookEvent({ type, data });
}

export async function reconcilePage(args: {
  cursor: Cursor;
  page: Page;
  environment: BillingEnvironment;
  supabase: SupabaseClient;
  processDeps?: Partial<WebhookProcessorDeps>;
}): Promise<{ next: Cursor; quarantined: number; observed: number }> {
  let quarantined = 0;
  for (const item of args.page.items) {
    if (args.cursor.resource === "checkouts") {
      await recoverCheckout(args.supabase, args.environment, item);
      continue;
    }
    if (args.cursor.resource === "disputes") {
      if (
        await applyPolarDisputeSnapshot(
          args.supabase,
          args.environment,
          item,
        ) === "missing_order"
      ) quarantined++;
      continue;
    }
    const event = reconciliationEvent(args.cursor.resource, item);
    if (!event) continue;
    const id = "reconcile_" +
      await computeWebhookPayloadHash(JSON.stringify(event));
    const deps = { ...args.processDeps, supabase: args.supabase };
    let result = await processPolarWebhookEvent(event, id, deps);
    if (
      result.status === "quarantined" && result.reason === "existing_quarantine"
    ) {
      const { data: row, error } = await args.supabase.from(
        "billing_webhook_inbox",
      )
        .select("id").eq("provider", "polar").eq(
          "environment",
          args.environment,
        )
        .eq("provider_event_id", id).maybeSingle();
      if (error || !row) throw new Error("reconciliation_inbox_unavailable");
      // Re-evaluate the same signed/API-derived snapshot with current durable
      // bindings. The processor still refuses email or editable metadata.
      result = await replayPolarWebhookInboxItem(
        row.id,
        "billing_reconciler",
        "automatic_reconciliation",
        deps,
      );
    }
    if (result.status === "quarantined") quarantined++;
    if (result.status === "deferred") {
      throw new Error("reconciliation_retry_pending");
    }
  }
  return {
    next: advanceCursor(args.cursor, args.page.maxPage),
    quarantined,
    observed: args.page.items.length,
  };
}
