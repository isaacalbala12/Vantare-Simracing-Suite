import { observePromotionInvoice } from "../billing-report-promotion/observe.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import { computeWebhookPayloadHash } from "../billing-webhook/inbox.ts";
import { applyPolarDisputeSnapshot } from "../billing-webhook/disputes.ts";
import {
  minimizePolarWebhookEvent,
  type PolarWebhookEvent,
  processPolarWebhookEvent,
  replayPolarWebhookInboxItem,
  type WebhookProcessorDeps,
} from "../billing-webhook/process.ts";

export const RESOURCES = [
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
  if (resource === "disputes") return null;
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
}): Promise<{ next: Cursor; quarantined: number; observed: number; failed: {resource_id:string|null;code:string;incident_recorded:boolean}[] }> {
  let quarantined = 0;
  const failed: {resource_id:string|null;code:string;incident_recorded:boolean}[]=[];
  for (const item of args.page.items) {
    try {
      if (args.cursor.resource === "disputes") {
        const result = await applyPolarDisputeSnapshot(
          args.supabase,
          args.environment,
          item,
        );
        if (result === "missing_order" || result === "account_deleted") {
          quarantined++;
        }
        continue;
      }
      const event = reconciliationEvent(args.cursor.resource, item);
      if (!event) continue;
      const id = "reconcile_" +
        await computeWebhookPayloadHash(JSON.stringify(event));
      const deps = { ...args.processDeps, supabase: args.supabase };
      let result = await processPolarWebhookEvent(event, id, deps);
      // Reconciliation is also an independent repair of the promotion ledger.
      // Do this even for a completed/quarantined inbox snapshot: SQL checks the
      // durable order owner, B03 and catalogue, and deduplicates by order ID.
      if (args.cursor.resource === "orders") {
        await observePromotionInvoice(
          args.supabase,
          args.environment,
          item,
          true,
          "reconciliation",
        );
      }
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
    } catch {
      let recorded=false;
      if(args.cursor.resource==="orders" && typeof item.id==="string") {
        try {
          const {error}=await args.supabase.rpc("report_promotion_invoice_missing",{p_environment:args.environment,p_order:item.id});
          recorded=!error;
        } catch { /* Keep the page retryable even if the incident store is down. */ }
      }
      failed.push({resource_id:typeof item.id==="string"?item.id:null,code:"reconciliation_item_failed",incident_recorded:recorded});
    }
  }
  return {
    next: failed.length ? args.cursor : advanceCursor(args.cursor, args.page.maxPage),
    failed,
    quarantined,
    observed: args.page.items.length,
  };
}
