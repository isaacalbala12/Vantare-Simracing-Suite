import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlers, emit } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  return {
    handlers: listeners,
    emit: vi.fn((name: string, payload?: unknown) => {
      if (name !== "strategy:application:command") return;
      const command = payload as { commandId: string };
      for (const handler of listeners.get("strategy:application:result") ?? []) {
        handler({
          data: [{
            protocolVersion: "strategy.application.v1",
            commandId: command.commandId,
            repositoryVersion: 8,
            events: [],
            drivers: [],
            variants: [],
            imported: false,
            recoveredFromBackup: false,
            closed: false,
          }],
        });
      }
    }),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: emit,
    On: (name: string, handler: (event: { data?: unknown }) => void) => {
      const listeners = handlers.get(name) ?? new Set();
      listeners.add(handler);
      handlers.set(name, listeners);
      return () => listeners.delete(handler);
    },
  },
}));

import {
  calculateStrategyOrbit,
  createStrategyOrbitApplicationClient,
  StrategyApplicationError,
  type StrategyApplicationCommandV1,
  type StrategyEventV2,
} from "./strategy-orbit-bridge";
import orbitGolden from "./testdata/orbit-go-golden.json";

const evidence = {
  provenance: { kind: "manual", sourceId: "user" },
  confidence: { level: "high", basis: "manual" },
} as const;

const event: StrategyEventV2 = {
  id: "event-1",
  name: { value: "Enduro", evidence },
  source: { value: "custom", evidence },
  track: { value: "Imola", evidence },
  cls: { value: "GT3", evidence },
  durationMin: { value: 120, evidence },
  startAt: { value: "2026-08-21T18:00:00Z", evidence },
  drivers: [],
  tankLiters: { value: 90, evidence },
  pitLossSeconds: { value: 60, evidence },
  strategies: [],
  availability: {},
  fillMode: { value: "manual", evidence },
  tyreInventory: { sets: [] },
};

function header<T extends StrategyApplicationCommandV1<unknown>["operation"]>(
  operation: T,
  commandId: string,
) {
  return {
    protocolVersion: "strategy.application.v1" as const,
    commandId,
    operation,
    expectedRepositoryVersion: 7,
  };
}

describe("strategy-orbit-bridge application client", () => {
  beforeEach(() => {
    emit.mockClear();
    handlers.clear();
  });

  it("expone y envía todos los comandos/queries de documento v2", async () => {
    const commands: StrategyApplicationCommandV1<unknown>[] = [
      { ...header("create_event", "create-event"), event, updatedAt: "2026-08-21T18:00:00Z" },
      { ...header("edit_event", "edit-event"), event, updatedAt: "2026-08-21T18:01:00Z" },
      header("list_events", "list-events"),
      { ...header("create_driver", "create-driver"), eventId: "event-1", driver: { id: "driver-1", order: 0 }, updatedAt: "2026-08-21T18:02:00Z" },
      { ...header("edit_driver", "edit-driver"), eventId: "event-1", driver: { id: "driver-1", order: 0 }, updatedAt: "2026-08-21T18:03:00Z" },
      { ...header("delete_driver", "delete-driver"), eventId: "event-1", driverId: "driver-1", updatedAt: "2026-08-21T18:04:00Z" },
      { ...header("list_drivers", "list-drivers"), eventId: "event-1" },
      { ...header("create_variant", "create-variant"), eventId: "event-1", variant: { id: "variant-1", name: { value: "Base", evidence }, note: { value: "", evidence }, mode: { value: "dry", evidence }, order: ["driver-1"], state: { value: "draft", evidence } }, updatedAt: "2026-08-21T18:05:00Z" },
      { ...header("edit_variant", "edit-variant"), eventId: "event-1", variant: { id: "variant-1", name: { value: "Base", evidence }, note: { value: "", evidence }, mode: { value: "dry", evidence }, order: ["driver-1"], state: { value: "draft", evidence } }, updatedAt: "2026-08-21T18:06:00Z" },
      { ...header("list_variants", "list-variants"), eventId: "event-1" },
      { ...header("compare_variants", "compare-variants"), eventId: "event-1", leftVariantId: "variant-1", rightVariantId: "variant-2" },
      { ...header("calculate_orbit", "calculate-orbit"), input: {
        event: { durationMinutes: 120, tankLiters: 90, pitLossSeconds: 60 },
        drivers: [{ id: "driver-1", name: "Driver", dry: { paceSeconds: 100, fuelLitersPerLap: 2 }, wet: { paceSeconds: 110, fuelLitersPerLap: 1.8 }, eco: { paceSeconds: 101, fuelLitersPerLap: 1.9 } }],
        variants: [{ id: "variant-1", mode: "dry", order: ["driver-1"], overrides: {} }],
        activeVariantId: "variant-1",
      } },
    ];
    const client = createStrategyOrbitApplicationClient<unknown>();

    for (const command of commands) {
      await expect(client.execute(command)).resolves.toMatchObject({ commandId: command.commandId });
    }

    expect(emit.mock.calls.map(([, command]) => (command as { operation: string }).operation)).toEqual(
      commands.map((command) => command.operation),
    );
  });

  it("rechaza con código y mensaje tipados del backend sin tragarlos", async () => {
    emit.mockImplementationOnce((_name: string, payload?: unknown) => {
      const command = payload as { commandId: string };
      for (const handler of handlers.get("strategy:application:error") ?? []) {
        handler({ data: [{ commandId: command.commandId, code: "driver_in_use", field: "driverId", message: "Driver is used by the variant." }] });
      }
    });
    const client = createStrategyOrbitApplicationClient<unknown>();
    const pending = client.execute({
      ...header("delete_driver", "delete-driver-error"),
      eventId: "event-1",
      driverId: "driver-1",
      updatedAt: "2026-08-21T18:04:00Z",
    });

    await expect(pending).rejects.toMatchObject({
      name: "StrategyApplicationError",
      code: "driver_in_use",
      field: "driverId",
      message: "Driver is used by the variant.",
    } satisfies Partial<StrategyApplicationError>);
  });

  it("decodifica el resultado real de cálculo y conserva la correlación v2", async () => {
    emit.mockImplementationOnce((_name: string, payload?: unknown) => {
      const command = payload as { commandId: string };
      for (const handler of handlers.get("strategy:application:result") ?? []) {
        handler({ data: [{
          protocolVersion: "strategy.application.v1",
          commandId: command.commandId,
          repositoryVersion: 0,
          orbitCalculation: orbitGolden,
          imported: false,
          recoveredFromBackup: false,
          closed: false,
        }] });
      }
    });
    const client = createStrategyOrbitApplicationClient<unknown>();
    const result = await calculateStrategyOrbit(client, "orbit-golden", {
      event: { durationMinutes: 240, tankLiters: 90, pitLossSeconds: 64 },
      drivers: ["isaac", "sol", "diego", "marta"].map((id) => ({
        id,
        name: id,
        dry: { paceSeconds: 104, fuelLitersPerLap: 2.75 },
        wet: { paceSeconds: 112, fuelLitersPerLap: 2.4 },
        eco: { paceSeconds: 105, fuelLitersPerLap: 2.55 },
      })),
      variants: [{ id: "s1", mode: "dry", order: ["isaac", "sol", "diego", "marta"], overrides: {} }],
      activeVariantId: "s1",
    });

    expect(result.plans.s1.stints.map((stint) => stint.laps)).toEqual([28, 28, 28, 28, 27]);
    expect(Object.isFrozen(result.plans.s1)).toBe(true);
  });

  it("decodifica el documento v2 y lo entrega inmutable", async () => {
    emit.mockImplementationOnce((_name: string, payload?: unknown) => {
      const command = payload as { commandId: string };
      for (const handler of handlers.get("strategy:application:result") ?? []) {
        handler({
          data: [{
            protocolVersion: "strategy.application.v1",
            commandId: command.commandId,
            repositoryVersion: 9,
            strategyDocument: {
              contractVersion: "strategy.v2",
              schemaVersion: "2.0.0",
              generatedAt: "2026-08-21T18:10:00Z",
              events: [event],
              activeEventId: "event-1",
            },
            imported: false,
            recoveredFromBackup: false,
            closed: false,
          }],
        });
      }
    });
    const client = createStrategyOrbitApplicationClient<unknown>();

    const result = await client.execute(header("list_events", "list-document"));

    expect(result.strategyDocument?.events[0].name.value).toBe("Enduro");
    expect(Object.isFrozen(result.strategyDocument?.events[0])).toBe(true);
  });

  it("rechaza una respuesta v2 mal formada en vez de devolver tipos falsos", async () => {
    emit.mockImplementationOnce((_name: string, payload?: unknown) => {
      const command = payload as { commandId: string };
      for (const handler of handlers.get("strategy:application:result") ?? []) {
        handler({ data: [{
          protocolVersion: "strategy.application.v1",
          commandId: command.commandId,
          repositoryVersion: 9,
          events: [{ id: "event-broken" }],
          imported: false,
          recoveredFromBackup: false,
          closed: false,
        }] });
      }
    });
    const client = createStrategyOrbitApplicationClient<unknown>();

    await expect(client.execute(header("list_events", "list-broken"))).rejects.toThrow(
      /events\.0\.name/i,
    );
  });
});
