import { describe, expect, it, vi } from "vitest";
import { createDefaultStrategyEditorDocument } from "./strategy-editor";
import {
  buildStrategyTyresCommand,
  createStrategyTyreClient,
  STRATEGY_TYRES_PROTOCOL_V1,
  type StrategyTyreEventTransport,
} from "./strategy-tyre-client";

function transportThatReplies(reply: (command: Record<string, unknown>) => [string, unknown]) {
  const listeners = new Map<string, Array<(payload: unknown) => void>>();
  const transport: StrategyTyreEventTransport = {
    emit(name, payload) {
      if (name !== "strategy:tyres:validate") return;
      const [event, response] = reply(payload as Record<string, unknown>);
      queueMicrotask(() => {
        for (const listener of listeners.get(event) ?? []) listener({ data: response });
      });
    },
    on(name, listener) {
      const bucket = listeners.get(name) ?? [];
      bucket.push(listener);
      listeners.set(name, bucket);
      return () => listeners.set(name, (listeners.get(name) ?? []).filter((item) => item !== listener));
    },
  };
  return transport;
}

describe("strategy tyre client", () => {
  it("sends the inventory verbatim and drops unassigned corners", () => {
    const document = createDefaultStrategyEditorDocument();
    const command = buildStrategyTyresCommand(document, "tyres-1");

    expect(command.protocolVersion).toBe(STRATEGY_TYRES_PROTOCOL_V1);
    expect(command.input.maximum).toBe(document.tyres.length);
    // No translation layer: the tyres travel exactly as the document holds them.
    expect(command.input.tyres).toBe(document.tyres);
    expect(command.input.plan).toHaveLength(document.stints.length);
    expect(command.input.plan[0]).toMatchObject({ stintId: "stint-1" });
    expect(Object.values(command.input.plan[0].assignments)).not.toContain(null);
  });

  it("omits a corner the plan left empty", () => {
    const document = createDefaultStrategyEditorDocument();
    const emptied = {
      ...document,
      stints: [{ ...document.stints[0], assignments: { ...document.stints[0].assignments, rear_right: null } }],
    } as typeof document;
    const command = buildStrategyTyresCommand(emptied, "tyres-2");
    expect(command.input.plan[0].assignments).not.toHaveProperty("rear_right");
    expect(command.input.plan[0].assignments).toHaveProperty("front_left");
  });

  it("resolves the violations the domain reported", async () => {
    const client = createStrategyTyreClient(
      transportThatReplies((command) => ["strategy:tyres:result", {
        protocolVersion: STRATEGY_TYRES_PROTOCOL_V1,
        commandId: command.commandId,
        result: {
          valid: false,
          violations: [{
            code: "corner_locked",
            message: "tyre is permanently assigned to front_left",
            stintId: "stint-2",
            tyreId: "M-01",
            corner: "rear_right",
          }],
        },
      }]),
      { id: () => "tyres-3" },
    );

    const validation = await client.validate(createDefaultStrategyEditorDocument());
    expect(validation.valid).toBe(false);
    expect(validation.violations).toHaveLength(1);
    expect(validation.violations[0]).toMatchObject({ code: "corner_locked", tyreId: "M-01", corner: "rear_right" });
    expect(Object.isFrozen(validation)).toBe(true);
  });

  it("rejects a result whose protocol does not match", async () => {
    const client = createStrategyTyreClient(
      transportThatReplies((command) => ["strategy:tyres:result", {
        protocolVersion: "strategy.tyres.v0",
        commandId: command.commandId,
        result: { valid: true, violations: [] },
      }]),
      { id: () => "tyres-4" },
    );
    await expect(client.validate(createDefaultStrategyEditorDocument())).rejects.toThrow(/protocol/i);
  });

  it("surfaces the message the backend sent on failure", async () => {
    const client = createStrategyTyreClient(
      transportThatReplies((command) => ["strategy:tyres:error", {
        commandId: command.commandId,
        code: "capacity_exceeded",
        message: "The plan uses more physical tyres than the event allows.",
      }]),
      { id: () => "tyres-5" },
    );
    await expect(client.validate(createDefaultStrategyEditorDocument()))
      .rejects.toThrow("The plan uses more physical tyres than the event allows.");
  });

  it("times out instead of hanging, and refuses work once disposed", async () => {
    vi.useFakeTimers();
    try {
      const client = createStrategyTyreClient(
        { emit() {}, on() { return () => {}; } },
        { id: () => "tyres-6", timeoutMs: 50 },
      );
      const pending = client.validate(createDefaultStrategyEditorDocument());
      const assertion = expect(pending).rejects.toThrow(/timeout/i);
      await vi.advanceTimersByTimeAsync(60);
      await assertion;

      client.dispose();
      await expect(client.validate(createDefaultStrategyEditorDocument())).rejects.toThrow(/disposed/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
