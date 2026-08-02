import { Events } from "@wailsio/runtime";

import type { StrategyEditorDocument } from "./strategy-editor";
import {
  effectiveLapRows,
  effectiveValue,
  type StrategyEffectiveLapValue,
  type StrategyInputValue,
} from "./strategy-manual-input";

export const STRATEGY_MANUAL_PROTOCOL_V1 = "strategy.manual.v1" as const;

export type StrategyManualErrorCode = "invalid_input" | "overflow" | "insufficient_capacity";

export class StrategyManualCalculationError extends Error {
  readonly code: StrategyManualErrorCode;
  readonly field: string;

  constructor(code: StrategyManualErrorCode, field: string, message: string) {
    super(message);
    this.name = "StrategyManualCalculationError";
    this.code = code;
    this.field = field;
  }
}

type Evidence = {
  readonly provenance: { readonly kind: "manual" | "corrected"; readonly sourceId: string };
  readonly confidence: { readonly level: "high"; readonly basis: string };
};

type SourcedNumber = { readonly value: number; readonly evidence: Evidence };

export type StrategyManualCommandV1 = {
  readonly protocolVersion: typeof STRATEGY_MANUAL_PROTOCOL_V1;
  readonly commandId: string;
  readonly input: {
    readonly stints: readonly number[];
    readonly laps: readonly {
      readonly fuelPerLap: SourcedNumber;
      readonly virtualEnergyPerLap: SourcedNumber;
      readonly averageLap: SourcedNumber;
      readonly tyreWearPercent: SourcedNumber;
    }[];
    readonly fuelCapacity: SourcedNumber;
    readonly fuelUsableCapacity: SourcedNumber;
    readonly fuelStartAmount: SourcedNumber;
    readonly fuelFormation: SourcedNumber;
    readonly fuelReserve: SourcedNumber;
    readonly virtualEnergyCapacity: SourcedNumber;
    readonly virtualEnergyUsableCapacity: SourcedNumber;
    readonly virtualEnergyStartAmount: SourcedNumber;
    readonly virtualEnergyFormation: SourcedNumber;
    readonly virtualEnergyReserve: SourcedNumber;
    readonly pitLossPerStop: SourcedNumber;
    readonly repair: SourcedNumber;
    readonly penalty: SourcedNumber;
  };
};

export type StrategyResourceSaving = {
  readonly available: boolean;
  readonly feasible: boolean;
  readonly targetStops: number;
  readonly amount: number;
  readonly perLap: number;
  readonly percentOfConsumption: number;
};

export type StrategyResourceResult = {
  readonly used: boolean;
  readonly raceNeed: number;
  readonly formationNeed: number;
  readonly reserveAmount: number;
  readonly totalNeed: number;
  readonly startAmount: number;
  readonly additionalRequired: number;
  readonly usableCapacity: number;
  readonly availableCompetitiveLaps: number;
  readonly stopsRequired: number;
  readonly saving: StrategyResourceSaving;
};

export type StrategyManualResult = {
  readonly fuel: StrategyResourceResult;
  readonly virtualEnergy: StrategyResourceResult;
  readonly pitStopCount: number;
  readonly pitLossPerStopSeconds: number;
  readonly totalPitLossSeconds: number;
  readonly repairSeconds: number;
  readonly penaltySeconds: number;
  readonly totalPitSeconds: number;
  readonly averageLapSeconds: number;
  readonly averageTyreWearPercent: number;
  readonly stints: readonly {
    readonly lapCount: number;
    readonly fuelNeed: number;
    readonly virtualEnergyNeed: number;
    readonly averageLapSeconds: number;
    readonly tyreWearPercent: number;
    readonly fuelSavingAmount: number;
    readonly virtualEnergySavingAmount: number;
  }[];
};

export type StrategyManualClient = {
  calculate(document: StrategyEditorDocument): Promise<StrategyManualResult>;
  dispose(): void;
};

export type StrategyManualEventTransport = {
  emit(name: string, payload: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

type ClientOptions = { readonly id?: () => string; readonly timeoutMs?: number };

const COMMAND_EVENT = "strategy:manual:calculate";
const RESULT_EVENT = "strategy:manual:result";
const ERROR_EVENT = "strategy:manual:error";
const knownErrors = new Set<StrategyManualErrorCode>(["invalid_input", "overflow", "insufficient_capacity"]);

export function buildStrategyManualCommand(document: StrategyEditorDocument, commandId: string): StrategyManualCommandV1 {
  const quick = document.manualInputs.quick;
  const laps = effectiveLapRows(document);
  return {
    protocolVersion: STRATEGY_MANUAL_PROTOCOL_V1,
    commandId,
    input: {
      stints: document.stints.map((stint) => stint.lapCount),
      laps: laps.map((lap) => ({
        fuelPerLap: sourcedLap(lap.fuelPerLapLitres),
        virtualEnergyPerLap: sourcedLap(lap.virtualEnergyPerLapPercent),
        averageLap: sourcedLap(lap.averageLapSeconds),
        tyreWearPercent: sourcedLap(lap.tyreWearPerLapPercent),
      })),
      fuelCapacity: sourcedInput(quick.fuelCapacityLitres),
      fuelUsableCapacity: sourcedInput(quick.fuelUsableLitres),
      fuelStartAmount: sourcedInput(quick.fuelStartLitres),
      fuelFormation: sourcedInput(quick.fuelFormationLitres),
      fuelReserve: sourcedInput(quick.fuelReserveLitres),
      virtualEnergyCapacity: sourcedInput(quick.virtualEnergyCapacityPercent),
      virtualEnergyUsableCapacity: sourcedInput(quick.virtualEnergyUsablePercent),
      virtualEnergyStartAmount: sourcedInput(quick.virtualEnergyStartPercent),
      virtualEnergyFormation: sourcedInput(quick.virtualEnergyFormationPercent),
      virtualEnergyReserve: sourcedInput(quick.virtualEnergyReservePercent),
      pitLossPerStop: sourcedInput(quick.pitLossPerStopSeconds),
      repair: sourcedInput(quick.repairSeconds),
      penalty: sourcedInput(quick.penaltySeconds),
    },
  };
}

export function createStrategyManualClient(
  transport: StrategyManualEventTransport,
  options: ClientOptions = {},
): StrategyManualClient {
  const id = options.id ?? (() => `manual-${crypto.randomUUID()}`);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pending = new Map<string, (error: Error) => void>();
  let disposed = false;
  return {
    calculate(document) {
      if (disposed) return Promise.reject(new Error("Strategy manual client is disposed"));
      const command = buildStrategyManualCommand(document, id());
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(command.commandId)) {
        return Promise.reject(new Error("Invalid Strategy manual command ID"));
      }
      return new Promise<StrategyManualResult>((resolve, reject) => {
        const unsubscribers: Array<() => void> = [];
        let settled = false;
        const cleanup = () => {
          clearTimeout(timeout);
          for (const unsubscribe of unsubscribers) unsubscribe();
          pending.delete(command.commandId);
        };
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };
        const timeout = setTimeout(() => fail(new Error("Timeout waiting for Strategy manual calculation")), timeoutMs);
        try {
          unsubscribers.push(transport.on(RESULT_EVENT, (event) => {
            const payload = readEventPayload(event);
            if (payload.commandId !== command.commandId) return;
            try {
              const result = parseManualResult(payload);
              settled = true;
              cleanup();
              resolve(result);
            } catch (error) {
              fail(toError(error));
            }
          }));
          unsubscribers.push(transport.on(ERROR_EVENT, (event) => {
            const payload = readEventPayload(event);
            if (payload.commandId !== command.commandId) return;
            fail(parseManualError(payload));
          }));
          pending.set(command.commandId, fail);
          transport.emit(COMMAND_EVENT, command);
        } catch (error) {
          fail(toError(error));
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const fail of [...pending.values()]) fail(new Error("Strategy manual client was disposed"));
    },
  };
}

export function createWailsStrategyManualClient(): StrategyManualClient {
  return createStrategyManualClient({
    emit(name, payload) { Events.Emit(name, payload); },
    on(name, listener) { return Events.On(name, (event) => listener(event)); },
  });
}

function sourcedInput(value: StrategyInputValue): SourcedNumber {
  return {
    value: effectiveValue(value),
    evidence: value.correction
      ? correctedEvidence(value.correction.reason)
      : manualEvidence(),
  };
}

function sourcedLap(value: StrategyEffectiveLapValue): SourcedNumber {
  return {
    value: value.value,
    evidence: value.corrected ? correctedEvidence(value.reason ?? "manual correction") : manualEvidence(),
  };
}

function manualEvidence(): Evidence {
  return {
    provenance: { kind: "manual", sourceId: "strategy-editor" },
    confidence: { level: "high", basis: "manual input" },
  };
}

function correctedEvidence(reason: string): Evidence {
  return {
    provenance: { kind: "corrected", sourceId: "strategy-editor-correction" },
    confidence: { level: "high", basis: reason },
  };
}

function parseManualResult(payload: Record<string, unknown>): StrategyManualResult {
  if (payload.protocolVersion !== STRATEGY_MANUAL_PROTOCOL_V1 || !isRecord(payload.result)) {
    throw new Error("Invalid Strategy manual result protocol");
  }
  const result = payload.result;
  if (!isRecord(result.fuel) || !isRecord(result.virtualEnergy) || !Array.isArray(result.stints)) {
    throw new Error("Invalid Strategy manual result");
  }
  const parsed: StrategyManualResult = {
    fuel: parseResource(result.fuel, "fuel"),
    virtualEnergy: parseResource(result.virtualEnergy, "virtualEnergy"),
    pitStopCount: integer(result.pitStopCount, "pitStopCount"),
    pitLossPerStopSeconds: number(result.pitLossPerStopSeconds, "pitLossPerStopSeconds"),
    totalPitLossSeconds: number(result.totalPitLossSeconds, "totalPitLossSeconds"),
    repairSeconds: number(result.repairSeconds, "repairSeconds"),
    penaltySeconds: number(result.penaltySeconds, "penaltySeconds"),
    totalPitSeconds: number(result.totalPitSeconds, "totalPitSeconds"),
    averageLapSeconds: number(result.averageLapSeconds, "averageLapSeconds"),
    averageTyreWearPercent: number(result.averageTyreWearPercent, "averageTyreWearPercent"),
    stints: result.stints.map((raw, index) => {
      if (!isRecord(raw)) throw new Error(`Invalid Strategy stint result ${index}`);
      return {
        lapCount: integer(raw.lapCount, `stints.${index}.lapCount`),
        fuelNeed: number(raw.fuelNeed, `stints.${index}.fuelNeed`),
        virtualEnergyNeed: number(raw.virtualEnergyNeed, `stints.${index}.virtualEnergyNeed`),
        averageLapSeconds: number(raw.averageLapSeconds, `stints.${index}.averageLapSeconds`),
        tyreWearPercent: number(raw.tyreWearPercent, `stints.${index}.tyreWearPercent`),
        fuelSavingAmount: number(raw.fuelSavingAmount, `stints.${index}.fuelSavingAmount`),
        virtualEnergySavingAmount: number(raw.virtualEnergySavingAmount, `stints.${index}.virtualEnergySavingAmount`),
      };
    }),
  };
  return deepFreeze(parsed);
}

function parseResource(value: Record<string, unknown>, field: string): StrategyResourceResult {
  if (!isRecord(value.saving)) throw new Error(`Invalid ${field} saving`);
  return {
    used: boolean(value.used, `${field}.used`),
    raceNeed: number(value.raceNeed, `${field}.raceNeed`),
    formationNeed: number(value.formationNeed, `${field}.formationNeed`),
    reserveAmount: number(value.reserveAmount, `${field}.reserveAmount`),
    totalNeed: number(value.totalNeed, `${field}.totalNeed`),
    startAmount: number(value.startAmount, `${field}.startAmount`),
    additionalRequired: number(value.additionalRequired, `${field}.additionalRequired`),
    usableCapacity: number(value.usableCapacity, `${field}.usableCapacity`),
    availableCompetitiveLaps: number(value.availableCompetitiveLaps, `${field}.availableCompetitiveLaps`),
    stopsRequired: integer(value.stopsRequired, `${field}.stopsRequired`),
    saving: {
      available: boolean(value.saving.available, `${field}.saving.available`),
      feasible: boolean(value.saving.feasible, `${field}.saving.feasible`),
      targetStops: integer(value.saving.targetStops, `${field}.saving.targetStops`),
      amount: number(value.saving.amount, `${field}.saving.amount`),
      perLap: number(value.saving.perLap, `${field}.saving.perLap`),
      percentOfConsumption: number(value.saving.percentOfConsumption, `${field}.saving.percentOfConsumption`),
    },
  };
}

function parseManualError(payload: Record<string, unknown>) {
  const code = typeof payload.code === "string" && knownErrors.has(payload.code as StrategyManualErrorCode)
    ? payload.code as StrategyManualErrorCode
    : "invalid_input";
  return new StrategyManualCalculationError(
    code,
    typeof payload.field === "string" ? payload.field : "",
    typeof payload.message === "string" ? payload.message : "Invalid Strategy manual error response",
  );
}

function readEventPayload(payload: unknown): Record<string, unknown> {
  const wrapped = payload as { data?: unknown };
  let value = wrapped?.data;
  if (Array.isArray(value)) value = value[0];
  if (isRecord(value)) return value;
  if (isRecord(payload) && !("data" in payload)) return payload;
  return {};
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field}`);
  return value;
}

function integer(value: unknown, field: string): number {
  const parsed = number(value, field);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${field}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
