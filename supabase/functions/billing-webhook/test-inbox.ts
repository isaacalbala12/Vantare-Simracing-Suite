import type {
  ClaimedWebhook,
  EffectClaim,
  WebhookClaim,
  WebhookDelivery,
  WebhookInbox,
  WebhookInboxState,
  WebhookReceipt,
} from "./inbox.ts";

type Item = ClaimedWebhook & {
  hash: string;
  status: WebhookInboxState;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  maxAttempts: number;
  lastErrorCode: string | null;
  quarantineReason: string | null;
  replayCount: number;
  nextAttemptAt: string;
};

type Effect = {
  status: "received" | "processing" | "completed" | "failed";
  leaseToken: string | null;
  attempts: number;
};

export class MemoryWebhookInbox implements WebhookInbox {
  #items = new Map<string, Item>();
  #effects = new Map<string, Effect>();
  readonly replayAudit: Array<{
    inboxId: string;
    actorId: string;
    reasonCode: string;
  }> = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async receive(delivery: WebhookDelivery): Promise<WebhookReceipt> {
    const current = this.#items.get(delivery.eventId);
    if (current) {
      const matches = current.hash === delivery.payloadHash;
      if (!matches) {
        current.status = "quarantined";
        current.quarantineReason = "payload_hash_mismatch";
        current.leaseToken = null;
        current.leaseExpiresAt = null;
      }
      return {
        id: current.id,
        status: current.status,
        payloadMatches: matches,
      };
    }
    const item: Item = {
      id: `inbox-${this.#items.size + 1}`,
      provider: delivery.provider,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      payload: delivery.payload,
      attemptCount: 0,
      maxAttempts: 5,
      hash: delivery.payloadHash,
      status: "received",
      leaseToken: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
      quarantineReason: null,
      replayCount: 0,
      nextAttemptAt: this.now().toISOString(),
    };
    this.#items.set(delivery.eventId, item);
    return { id: item.id, status: item.status, payloadMatches: true };
  }

  async claim(inboxId: string, leaseToken: string): Promise<WebhookClaim> {
    const item = this.#byId(inboxId);
    if (item.status === "processed") return { status: "processed" };
    if (item.status === "quarantined") return { status: "quarantined" };
    if (item.status === "processing") {
      if (!item.leaseExpiresAt) throw new Error("missing test lease expiry");
      return { status: "busy", leaseExpiresAt: item.leaseExpiresAt };
    }
    if (
      item.status === "failed" &&
      new Date(item.nextAttemptAt) > this.now()
    ) {
      return { status: "retry_scheduled", nextAttemptAt: item.nextAttemptAt };
    }
    if (item.attemptCount >= item.maxAttempts) {
      item.status = "quarantined";
      item.quarantineReason = "retry_limit_reached";
      return { status: "quarantined" };
    }
    item.status = "processing";
    item.leaseToken = leaseToken;
    item.leaseExpiresAt = new Date(this.now().getTime() + 60_000).toISOString();
    item.attemptCount += 1;
    return {
      status: "claimed",
      item: {
        id: item.id,
        provider: item.provider,
        eventId: item.eventId,
        eventType: item.eventType,
        payload: item.payload,
        attemptCount: item.attemptCount,
      },
    };
  }

  async complete(inboxId: string, leaseToken: string): Promise<void> {
    const item = this.#leased(inboxId, leaseToken);
    item.status = "processed";
    item.leaseToken = null;
    item.leaseExpiresAt = null;
  }

  async fail(
    inboxId: string,
    leaseToken: string,
    errorCode: string,
  ): Promise<"failed" | "quarantined"> {
    const item = this.#leased(inboxId, leaseToken);
    item.status = item.attemptCount >= item.maxAttempts
      ? "quarantined"
      : "failed";
    item.quarantineReason = item.status === "quarantined"
      ? "retry_limit_reached"
      : null;
    item.lastErrorCode = errorCode;
    item.nextAttemptAt = new Date(
      this.now().getTime() +
        Math.min(3600, 30 * 2 ** Math.max(0, item.attemptCount - 1)) * 1000,
    ).toISOString();
    item.leaseToken = null;
    item.leaseExpiresAt = null;
    return item.status;
  }

  async quarantine(
    inboxId: string,
    leaseToken: string,
    reasonCode: string,
  ): Promise<void> {
    const item = this.#leased(inboxId, leaseToken);
    item.status = "quarantined";
    item.quarantineReason = reasonCode;
    item.leaseToken = null;
    item.leaseExpiresAt = null;
  }

  async claimEffect(
    inboxId: string,
    effectKey: string,
    leaseToken: string,
  ): Promise<EffectClaim> {
    const key = `${inboxId}:${effectKey}`;
    const effect = this.#effects.get(key) ?? {
      status: "received" as const,
      leaseToken: null,
      attempts: 0,
    };
    this.#effects.set(key, effect);
    if (effect.status === "completed") return "completed";
    if (effect.status === "processing") return "busy";
    effect.status = "processing";
    effect.leaseToken = leaseToken;
    effect.attempts += 1;
    return "claimed";
  }

  async completeEffect(
    inboxId: string,
    effectKey: string,
    leaseToken: string,
  ): Promise<void> {
    const effect = this.#leasedEffect(inboxId, effectKey, leaseToken);
    effect.status = "completed";
    effect.leaseToken = null;
  }

  async failEffect(
    inboxId: string,
    effectKey: string,
    leaseToken: string,
    _errorCode: string,
  ): Promise<void> {
    const effect = this.#leasedEffect(inboxId, effectKey, leaseToken);
    effect.status = "failed";
    effect.leaseToken = null;
  }

  async replay(
    inboxId: string,
    actorId: string,
    reasonCode: string,
  ): Promise<void> {
    const item = this.#byId(inboxId);
    if (item.status === "processing") throw new Error("webhook_is_processing");
    this.replayAudit.push({ inboxId, actorId, reasonCode });
    item.status = "received";
    item.attemptCount = 0;
    item.leaseToken = null;
    item.leaseExpiresAt = null;
    item.lastErrorCode = null;
    item.quarantineReason = null;
    item.replayCount += 1;
    item.nextAttemptAt = this.now().toISOString();
  }

  expireEventLease(eventId: string): void {
    const item = this.#event(eventId);
    if (item.status === "processing") item.status = "received";
    item.leaseToken = null;
    item.leaseExpiresAt = null;
  }

  setMaxAttempts(eventId: string, maxAttempts: number): void {
    this.#event(eventId).maxAttempts = maxAttempts;
  }

  makeRetryDue(eventId: string): void {
    this.#event(eventId).nextAttemptAt = this.now().toISOString();
  }

  snapshot(eventId: string) {
    const item = this.#event(eventId);
    return {
      id: item.id,
      status: item.status,
      attempts: item.attemptCount,
      lastErrorCode: item.lastErrorCode,
      quarantineReason: item.quarantineReason,
      replayCount: item.replayCount,
      nextAttemptAt: item.nextAttemptAt,
    };
  }

  effectAttempts(eventId: string, effectKey: string): number {
    const item = this.#event(eventId);
    return this.#effects.get(`${item.id}:${effectKey}`)?.attempts ?? 0;
  }

  #event(eventId: string): Item {
    const item = this.#items.get(eventId);
    if (!item) throw new Error("missing test event");
    return item;
  }

  #byId(inboxId: string): Item {
    const item = [...this.#items.values()].find((candidate) =>
      candidate.id === inboxId
    );
    if (!item) throw new Error("missing test inbox item");
    return item;
  }

  #leased(inboxId: string, leaseToken: string): Item {
    const item = this.#byId(inboxId);
    if (item.status !== "processing" || item.leaseToken !== leaseToken) {
      throw new Error("webhook_lease_lost");
    }
    return item;
  }

  #leasedEffect(
    inboxId: string,
    effectKey: string,
    leaseToken: string,
  ): Effect {
    const effect = this.#effects.get(`${inboxId}:${effectKey}`);
    if (effect?.status !== "processing" || effect.leaseToken !== leaseToken) {
      throw new Error("effect_lease_lost");
    }
    return effect;
  }
}
