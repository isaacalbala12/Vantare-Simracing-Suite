import { describe, expect, it } from "vitest";

import { createDefaultStrategyEditorDocument } from "./strategy-editor";
import { correctLapValue, correctQuickValue } from "./strategy-manual-input";
import {
  buildStrategyManualCommand,
  createStrategyManualClient,
  type StrategyManualEventTransport,
} from "./strategy-manual-client";

describe("Strategy manual calculation client", () => {
  it("builds a sourced request and preserves corrected provenance", () => {
    let document = createDefaultStrategyEditorDocument();
    document = correctQuickValue(document, "fuelPerLapLitres", 4.6, "Promedio revisado", "2026-08-02T10:00:00Z");
    document = correctLapValue(document, 2, "fuelPerLapLitres", 5.1, "Vuelta con tráfico", "2026-08-02T10:01:00Z");

    const command = buildStrategyManualCommand(document, "manual-1");
    expect(command.input.stints).toEqual([17, 22, 19, 20]);
    expect(command.input.laps).toHaveLength(78);
    expect(command.input.laps[0].fuelPerLap).toMatchObject({
      value: 4.6,
      evidence: { provenance: { kind: "corrected" }, confidence: { basis: "Promedio revisado" } },
    });
    expect(command.input.laps[1].fuelPerLap).toMatchObject({
      value: 5.1,
      evidence: { provenance: { kind: "corrected" }, confidence: { basis: "Vuelta con tráfico" } },
    });
  });

  it("correlates results and cleans listeners on dispose", async () => {
    const transport = createTransport();
    const client = createStrategyManualClient(transport, { id: () => "manual-7" });
    const pending = client.calculate(createDefaultStrategyEditorDocument());
    expect(transport.emitted[0].name).toBe("strategy:manual:calculate");
    transport.broadcast("strategy:manual:result", manualResult("manual-7"));
    const result = await pending;
    expect(result.fuel.saving.perLap).toBe(0.95);

    client.dispose();
    expect(transport.listenerCount()).toBe(0);
  });

  it("rejects sanitized typed errors for the matching command", async () => {
    const transport = createTransport();
    const client = createStrategyManualClient(transport, { id: () => "manual-8" });
    const pending = client.calculate(createDefaultStrategyEditorDocument());
    transport.broadcast("strategy:manual:error", {
      commandId: "manual-8",
      code: "invalid_input",
      field: "fuel.capacity",
      message: "Review the highlighted manual Strategy input.",
    });
    await expect(pending).rejects.toMatchObject({ code: "invalid_input", field: "fuel.capacity" });
    client.dispose();
  });
});

function manualResult(commandId: string) {
  return {
    protocolVersion: "strategy.manual.v1",
    commandId,
    result: {
      fuel: resourceResult(0.95),
      virtualEnergy: resourceResult(0.7),
      pitStopCount: 3,
      pitLossPerStopSeconds: 22.4,
      totalPitLossSeconds: 67.2,
      repairSeconds: 0,
      penaltySeconds: 0,
      totalPitSeconds: 22.4,
      averageLapSeconds: 138.4,
      averageTyreWearPercent: 0.65,
      stints: [17, 22, 19, 20].map((lapCount) => ({
        lapCount,
        fuelNeed: lapCount * 4.8,
        virtualEnergyNeed: lapCount * 2,
        averageLapSeconds: 138.4,
        tyreWearPercent: lapCount * 0.65,
        fuelSavingAmount: lapCount * 0.95,
        virtualEnergySavingAmount: lapCount * 0.7,
      })),
    },
  };
}

function resourceResult(perLap: number) {
  return {
    used: true, raceNeed: 1, formationNeed: 0, reserveAmount: 0, totalNeed: 1,
    startAmount: 1, additionalRequired: 1, usableCapacity: 1,
    availableCompetitiveLaps: 1, stopsRequired: 1, refillAmounts: [1], rechargeAmounts: [1],
    assumptions: [],
    saving: { available: true, feasible: true, targetStops: 0, amount: 1, perLap, percentOfConsumption: 10 },
  };
}

function createTransport() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const emitted: Array<{ name: string; payload: unknown }> = [];
  const transport: StrategyManualEventTransport & {
    emitted: typeof emitted;
    broadcast(name: string, payload: unknown): void;
    listenerCount(): number;
  } = {
    emitted,
    emit(name, payload) { emitted.push({ name, payload }); },
    on(name, listener) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
    broadcast(name, payload) { for (const listener of listeners.get(name) ?? []) listener(payload); },
    listenerCount() { return Array.from(listeners.values()).reduce((sum, bucket) => sum + bucket.size, 0); },
  };
  return transport;
}
