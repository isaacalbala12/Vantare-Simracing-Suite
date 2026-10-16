export type RemoteSubscription = {
  id: string;
  product_id: string;
  status: string;
  discount_id: string | null;
  amount: number;
  currency: string;
  recurring_interval: string;
  recurring_interval_count: number;
  current_period_end?: string | null;
};
export interface DiscountClient {
  read(subscriptionId: string): Promise<RemoteSubscription>;
  change(
    subscriptionId: string,
    discountId: string | null,
  ): Promise<RemoteSubscription>;
}
export class PolarDiscountClient implements DiscountClient {
  private base: string;
  constructor(
    environment: "sandbox" | "production",
    private token: string,
    private fetchFn: typeof fetch = fetch,
  ) {
    this.base = environment === "sandbox"
      ? "https://sandbox-api.polar.sh/v1"
      : "https://api.polar.sh/v1";
  }
  private async request(
    id: string,
    discount?: string | null,
  ): Promise<RemoteSubscription> {
    const response = await this.fetchFn(
      `${this.base}/subscriptions/${encodeURIComponent(id)}`,
      {
        method: discount === undefined ? "GET" : "PATCH",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "Polar-Version": "2026-10",
        },
        ...(discount === undefined
          ? {}
          : { body: JSON.stringify({ discount_id: discount }) }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error(`polar_discount_http_${response.status}`);
    const value = await response.json();
    if (
      value.id !== id || typeof value.product_id !== "string" ||
      typeof value.status !== "string" ||
      !(value.discount_id === null || typeof value.discount_id === "string")
    ) throw new Error("polar_discount_invalid_response");
    return value;
  }
  read(id: string) {
    return this.request(id);
  }
  change(id: string, discount: string | null) {
    return this.request(id, discount);
  }
}
export async function synchronizeDiscount(client: DiscountClient, expected: {
  subscriptionId: string;
  productId: string;
  discountId: string | null;
  managedDiscountIds?: (string | null)[];
  normalCents: number;
  observed?: (discountId: string | null) => void;
  cleanup?: boolean;
  skippedCleanup?: (reason: "remote_inactive") => void;
  repair?: boolean;
  phase?: "pending" | "cleared";
  markCleared?: () => Promise<void>;
}): Promise<boolean> {
  const current = await client.read(expected.subscriptionId);
  if (
    expected.cleanup &&
    ["canceled", "paused"].includes(current.status)
  ) {
    expected.skippedCleanup?.("remote_inactive");
    return false; // Cannot bill: Polar refuses PATCH; audit as already clean.
  }
  if (
    current.product_id !== expected.productId ||
    !["active", "uncanceled"].includes(current.status)
  ) throw new Error("polar_discount_subscription_changed");
  if (
    current.amount !== expected.normalCents || current.currency !== "eur" ||
    current.recurring_interval !== "month" ||
    current.recurring_interval_count !== 1
  ) throw new Error("polar_discount_catalog_mismatch");
  expected.observed?.(current.discount_id);
  // Finishing our campaign never removes a benefit belonging to another one.
  if (
    expected.discountId === null && current.discount_id !== null &&
    !expected.managedDiscountIds?.includes(current.discount_id)
  ) return false;
  if (expected.repair && expected.phase !== "cleared") {
    if (!expected.markCleared) throw new Error("polar_repair_unconfigured");
    if (current.discount_id === expected.discountId) {
      const cleared = await client.change(expected.subscriptionId, null);
      if (cleared.discount_id !== null) {
        throw new Error("polar_repair_not_cleared");
      }
    } else if (
      current.discount_id !== null &&
      !expected.managedDiscountIds?.includes(current.discount_id)
    ) throw new Error("polar_discount_unmanaged");
    await expected.markCleared();
  } else if (current.discount_id === expected.discountId) return false;
  if (
    current.discount_id !== null &&
    !expected.managedDiscountIds?.includes(current.discount_id)
  ) throw new Error("polar_discount_unmanaged");
  const updated = await client.change(
    expected.subscriptionId,
    expected.discountId,
  );
  if (
    updated.discount_id !== expected.discountId ||
    updated.product_id !== expected.productId
  ) throw new Error("polar_discount_not_applied");
  expected.observed?.(updated.discount_id);
  return true;
}
