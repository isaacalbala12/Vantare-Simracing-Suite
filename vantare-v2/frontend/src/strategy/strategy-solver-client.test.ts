import { describe, expect, it, vi } from "vitest";
import { createDefaultStrategyEditorDocument } from "./strategy-editor";
import { correctQuickValue } from "./strategy-manual-input";
import {
  buildStrategySolverCommand,
  createStrategySolverClient,
  STRATEGY_SOLVER_PROTOCOL_V1,
  type StrategySolverEventTransport,
} from "./strategy-solver-client";

function transportThatReplies(reply: (command: Record<string, unknown>) => [string, unknown]) {
  const listeners = new Map<string, Array<(payload: unknown) => void>>();
  const transport: StrategySolverEventTransport = {
    emit(name, payload) {
      if (name !== "strategy:solver:compare") return;
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

function comparisonReply(command: Record<string, unknown>) {
  return ["strategy:solver:result", {
    protocolVersion: STRATEGY_SOLVER_PROTOCOL_V1,
    commandId: command.commandId,
    result: {
      maxStintLaps: 20,
      binding: "fuel",
      assumptions: [{ code: "separate_resources", message: "never added together" }],
      variants: [{
        kind: "fast",
        candidate: {
          stops: 3,
          stints: [{ laps: 20, greenSeconds: 2000, degradationSeconds: 19, totalSeconds: 2019 }],
        },
        total: { optimisticSeconds: 21_800, expectedSeconds: 21_852, pessimisticSeconds: 21_904 },
        deltaToFastestSeconds: 0,
        marginLaps: 0,
        survivesPessimistic: false,
        risk: "high",
        dominated: false,
        reasons: [{ code: "time_optimal", message: "quickest if the estimates hold" }],
      }],
    },
  }] as [string, unknown];
}

describe("strategy solver client", () => {
  it("describes the race from the document without inferring anything", () => {
    const document = createDefaultStrategyEditorDocument();
    const command = buildStrategySolverCommand(document, "solver-1");

    expect(command.protocolVersion).toBe(STRATEGY_SOLVER_PROTOCOL_V1);
    expect(command.input.raceLaps).toBe(
      document.stints.reduce((total, stint) => total + stint.lapCount, 0),
    );
    expect(command.input.baseLapSeconds).toBe(138.4);
    expect(command.input.pitLossSeconds).toBe(22.4);
    // Nothing has been measured, so nothing is claimed about tyre fall-off.
    expect(command.input.degradationPerLapSeconds).toBe(0);
    expect(command.input.tyreLifeLaps).toBe(0);
  });

  it("sends fuel and virtual energy as separate resources in their own units", () => {
    const command = buildStrategySolverCommand(createDefaultStrategyEditorDocument(), "solver-2");
    expect(command.input.fuel).toMatchObject({ kind: "fuel", used: true, usableCapacity: 100, perLap: 4.8 });
    expect(command.input.virtualEnergy).toMatchObject({ kind: "virtual_energy", used: true, perLap: 2 });
    // The two never meet in one number.
    expect(command.input.fuel.usableCapacity).not.toBe(
      command.input.fuel.usableCapacity + command.input.virtualEnergy.usableCapacity,
    );
  });

  it("carries a corrected degradation through to the solver", () => {
    const document = createDefaultStrategyEditorDocument();
    const corrected = correctQuickValue(
      document,
      "degradationPerLapSeconds",
      0.08,
      "medido en la sesión",
      "2026-08-08T00:00:00Z",
    );
    const command = buildStrategySolverCommand(corrected, "solver-3");
    expect(command.input.degradationPerLapSeconds).toBe(0.08);
  });

  it("always declares virtual energy as used, which the contract forces", () => {
    // The manual input requires a positive VE per lap, so a car without virtual
    // energy cannot currently say so. The solver is told the truth as the
    // document holds it rather than having a zero invented for it here.
    const command = buildStrategySolverCommand(createDefaultStrategyEditorDocument(), "solver-4");
    expect(command.input.virtualEnergy.used).toBe(true);
    expect(command.input.virtualEnergy.perLap).toBeGreaterThan(0);
  });

  it("resolves the comparison the solver produced", async () => {
    const client = createStrategySolverClient(
      transportThatReplies(comparisonReply),
      { id: () => "solver-5" },
    );
    const comparison = await client.compare(createDefaultStrategyEditorDocument());

    expect(comparison.variants).toHaveLength(1);
    const [fast] = comparison.variants;
    expect(fast.kind).toBe("fast");
    expect(fast.stops).toBe(3);
    expect(fast.stints[0].laps).toBe(20);
    expect(fast.total.pessimisticSeconds).toBeGreaterThan(fast.total.optimisticSeconds);
    expect(fast.risk).toBe("high");
    // The reasoning has to survive the transport, not just the numbers.
    expect(fast.reasons[0].message).toBe("quickest if the estimates hold");
    expect(comparison.assumptions[0].code).toBe("separate_resources");
    expect(Object.isFrozen(comparison)).toBe(true);
  });

  it("rejects a reply from a protocol it does not speak", async () => {
    const client = createStrategySolverClient(
      transportThatReplies((command) => ["strategy:solver:result", {
        protocolVersion: "strategy.solver.v0",
        commandId: command.commandId,
        result: { variants: [] },
      }]),
      { id: () => "solver-6" },
    );
    await expect(client.compare(createDefaultStrategyEditorDocument())).rejects.toThrow(/protocol/i);
  });

  it("surfaces the reason the backend refused", async () => {
    const client = createStrategySolverClient(
      transportThatReplies((command) => ["strategy:solver:error", {
        commandId: command.commandId,
        code: "infeasible",
        message: "No strategy finishes this race within the stated limits.",
      }]),
      { id: () => "solver-7" },
    );
    await expect(client.compare(createDefaultStrategyEditorDocument()))
      .rejects.toThrow("No strategy finishes this race within the stated limits.");
  });

  it("times out instead of hanging, and refuses work once disposed", async () => {
    vi.useFakeTimers();
    try {
      const client = createStrategySolverClient(
        { emit() {}, on() { return () => {}; } },
        { id: () => "solver-8", timeoutMs: 50 },
      );
      const pending = client.compare(createDefaultStrategyEditorDocument());
      const assertion = expect(pending).rejects.toThrow(/timeout/i);
      await vi.advanceTimersByTimeAsync(60);
      await assertion;

      client.dispose();
      await expect(client.compare(createDefaultStrategyEditorDocument())).rejects.toThrow(/disposed/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
