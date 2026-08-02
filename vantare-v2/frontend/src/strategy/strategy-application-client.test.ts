import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStrategyApplicationClient,
  StrategyApplicationError,
  type StrategyApplicationCommandV1,
  type StrategyApplicationEventTransport,
} from "./strategy-application-client";

type Payload = { laps: number };

type MockTransport = StrategyApplicationEventTransport & {
  emitted: Array<{ name: string; payload: unknown }>;
  listeners: Map<string, Set<(payload: unknown) => void>>;
};

function createTransport(): MockTransport {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emitted: [],
    listeners,
    emit(name, payload) {
      this.emitted.push({ name, payload });
    },
    on(name, listener) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
  };
}

function emit(transport: MockTransport, name: string, payload: unknown): void {
  for (const listener of transport.listeners.get(name) ?? []) {
    listener({ data: [payload] });
  }
}

function openCommand(): StrategyApplicationCommandV1<Payload> {
  return {
    protocolVersion: "strategy.application.v1",
    commandId: "open-1",
    operation: "open",
    expectedRepositoryVersion: 0,
    draftId: "draft-1",
  };
}

function draft() {
  return {
    contractVersion: "strategy.v1" as const,
    draftId: "draft-1",
    planId: "plan-1",
    variantId: "variant-1",
    name: "Race plan",
    mode: "manual" as const,
    capabilities: ["manual_inputs"] as const,
    provenance: { kind: "manual" as const, sourceId: "user" },
    confidence: { level: "high" as const, basis: "manual" },
    updatedAt: "2026-08-02T00:00:01Z",
    payload: { laps: 10 },
  };
}

describe("createStrategyApplicationClient", () => {
  let transport: MockTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = createTransport();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("correlates and validates a versioned Wails-array result", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());

    expect(transport.emitted).toEqual([
      { name: "strategy:application:command", payload: openCommand() },
    ]);
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v1",
      commandId: "open-1",
      repositoryVersion: 3,
      draft: draft(),
      savedDraft: draft(),
      recoveredFromBackup: false,
      closed: false,
    });

    await expect(pending).resolves.toMatchObject({
      commandId: "open-1",
      repositoryVersion: 3,
      draft: { payload: { laps: 10 } },
    });
    expect(transport.listeners.get("strategy:application:result")?.size ?? 0).toBe(0);
  });

  it("ignores another command and exposes stable application errors", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());
    emit(transport, "strategy:application:error", {
      commandId: "another",
      code: "draft_not_found",
      field: "draftId",
      message: "wrong request",
    });
    emit(transport, "strategy:application:error", {
      commandId: "open-1",
      code: "draft_not_found",
      field: "draftId",
      message: "not found",
    });

    await expect(pending).rejects.toMatchObject({
      name: "StrategyApplicationError",
      code: "draft_not_found",
      field: "draftId",
    } satisfies Partial<StrategyApplicationError>);
  });

  it("fails closed on a future result protocol", async () => {
    const client = createStrategyApplicationClient<Payload>(transport);
    const pending = client.execute(openCommand());
    emit(transport, "strategy:application:result", {
      protocolVersion: "strategy.application.v2",
      commandId: "open-1",
      repositoryVersion: 1,
    });
    await expect(pending).rejects.toThrow(/protocol/i);
  });

  it("times out and removes every listener", async () => {
    const client = createStrategyApplicationClient<Payload>(transport, 100);
    const pending = client.execute(openCommand());
    const rejection = expect(pending).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    expect(transport.listeners.get("strategy:application:result")?.size ?? 0).toBe(0);
    expect(transport.listeners.get("strategy:application:error")?.size ?? 0).toBe(0);
  });
});
