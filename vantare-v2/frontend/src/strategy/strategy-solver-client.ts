import { Events } from "@wailsio/runtime";

import type { StrategyEditorDocument } from "./strategy-editor";
import { effectiveValue } from "./strategy-manual-input";

export const STRATEGY_SOLVER_PROTOCOL_V1 = "strategy.solver.v1" as const;

export type StrategyVariantKind = "fast" | "robust" | "conservative";
export type StrategyRiskLevel = "low" | "medium" | "high";

export type StrategyReason = { readonly code: string; readonly message: string };

export type StrategyTotalRange = {
  readonly optimisticSeconds: number;
  readonly expectedSeconds: number;
  readonly pessimisticSeconds: number;
};

export type StrategySolvedStint = {
  readonly laps: number;
  readonly greenSeconds: number;
  readonly degradationSeconds: number;
  readonly totalSeconds: number;
};

export type StrategyVariant = {
  readonly kind: StrategyVariantKind;
  readonly stops: number;
  readonly stints: readonly StrategySolvedStint[];
  readonly total: StrategyTotalRange;
  readonly deltaToFastestSeconds: number;
  readonly marginLaps: number;
  readonly survivesPessimistic: boolean;
  readonly risk: StrategyRiskLevel;
  readonly dominated: boolean;
  readonly dominatedBy?: StrategyVariantKind;
  readonly reasons: readonly StrategyReason[];
};

export type StrategyComparison = {
  readonly variants: readonly StrategyVariant[];
  readonly maxStintLaps: number;
  readonly binding: string;
  readonly assumptions: readonly StrategyReason[];
};

export type StrategySolverClient = {
  compare(document: StrategyEditorDocument): Promise<StrategyComparison>;
  dispose(): void;
};

export type StrategySolverEventTransport = {
  emit(name: string, payload: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

type ClientOptions = { readonly id?: () => string; readonly timeoutMs?: number };

const COMMAND_EVENT = "strategy:solver:compare";
const RESULT_EVENT = "strategy:solver:result";
const ERROR_EVENT = "strategy:solver:error";
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Describes the race to the solver using only what the document states. Nothing
 * is inferred here: if the driver has not given a figure, the solver is told the
 * truth and reports what that costs.
 */
export function buildStrategySolverCommand(document: StrategyEditorDocument, commandId: string) {
  const quick = document.manualInputs.quick;
  const raceLaps = document.stints.reduce((total, stint) => total + stint.lapCount, 0);
  return {
    protocolVersion: STRATEGY_SOLVER_PROTOCOL_V1,
    commandId,
    input: {
      raceLaps,
      baseLapSeconds: effectiveValue(quick.averageLapSeconds),
      degradationPerLapSeconds: effectiveValue(quick.degradationPerLapSeconds),
      pitLossSeconds: effectiveValue(quick.pitLossPerStopSeconds),
      fuel: {
        kind: "fuel",
        used: effectiveValue(quick.fuelPerLapLitres) > 0,
        usableCapacity: effectiveValue(quick.fuelUsableLitres),
        perLap: effectiveValue(quick.fuelPerLapLitres),
      },
      // The manual contract requires a positive consumption per lap, so a car
      // with no virtual energy at all cannot yet declare that. Until it can,
      // this reports what the document holds rather than guessing.
      virtualEnergy: {
        kind: "virtual_energy",
        used: effectiveValue(quick.virtualEnergyPerLapPercent) > 0,
        usableCapacity: effectiveValue(quick.virtualEnergyUsablePercent),
        perLap: effectiveValue(quick.virtualEnergyPerLapPercent),
      },
      // Tyre life in laps is not a manual input yet, so nothing is claimed.
      tyreLifeLaps: 0,
    },
    sensitivity: { degradationFactor: 0.2, consumptionFactor: 0.05 },
  };
}

export function createStrategySolverClient(
  transport: StrategySolverEventTransport,
  options: ClientOptions = {},
): StrategySolverClient {
  const id = options.id ?? (() => `solver-${crypto.randomUUID()}`);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pending = new Map<string, (error: Error) => void>();
  let disposed = false;

  return {
    compare(document) {
      if (disposed) return Promise.reject(new Error("Strategy solver client is disposed"));
      const command = buildStrategySolverCommand(document, id());
      if (!COMMAND_ID_PATTERN.test(command.commandId)) {
        return Promise.reject(new Error("Invalid Strategy solver command ID"));
      }
      return new Promise<StrategyComparison>((resolve, reject) => {
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
        const timeout = setTimeout(
          () => fail(new Error("Timeout waiting for the Strategy comparison")),
          timeoutMs,
        );
        try {
          unsubscribers.push(transport.on(RESULT_EVENT, (event) => {
            const payload = readEventPayload(event);
            if (payload.commandId !== command.commandId) return;
            try {
              const comparison = parseComparison(payload);
              settled = true;
              cleanup();
              resolve(comparison);
            } catch (error) {
              fail(toError(error));
            }
          }));
          unsubscribers.push(transport.on(ERROR_EVENT, (event) => {
            const payload = readEventPayload(event);
            if (payload.commandId !== command.commandId) return;
            fail(new Error(
              typeof payload.message === "string" ? payload.message : "The comparison failed",
            ));
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
      for (const fail of [...pending.values()]) fail(new Error("Strategy solver client was disposed"));
    },
  };
}

export function createWailsStrategySolverClient(): StrategySolverClient {
  return createStrategySolverClient({
    emit(name, payload) { Events.Emit(name, payload); },
    on(name, listener) { return Events.On(name, (event) => listener(event)); },
  });
}

function parseComparison(payload: Record<string, unknown>): StrategyComparison {
  if (payload.protocolVersion !== STRATEGY_SOLVER_PROTOCOL_V1 || !isRecord(payload.result)) {
    throw new Error("Invalid Strategy solver protocol");
  }
  const result = payload.result;
  if (!Array.isArray(result.variants)) throw new Error("Invalid Strategy comparison");
  return deepFreeze({
    variants: result.variants.map(parseVariant),
    maxStintLaps: numberOr(result.maxStintLaps, 0),
    binding: typeof result.binding === "string" ? result.binding : "none",
    assumptions: parseReasons(result.assumptions),
  });
}

function parseVariant(raw: unknown, index: number): StrategyVariant {
  if (!isRecord(raw) || !isVariantKind(raw.kind)) {
    throw new Error(`Invalid Strategy variant ${index}`);
  }
  const candidate = isRecord(raw.candidate) ? raw.candidate : {};
  const total = isRecord(raw.total) ? raw.total : {};
  const stints = Array.isArray(candidate.stints) ? candidate.stints : [];
  return {
    kind: raw.kind,
    stops: numberOr(candidate.stops, 0),
    stints: stints.map((stint) => ({
      laps: numberOr(isRecord(stint) ? stint.laps : 0, 0),
      greenSeconds: numberOr(isRecord(stint) ? stint.greenSeconds : 0, 0),
      degradationSeconds: numberOr(isRecord(stint) ? stint.degradationSeconds : 0, 0),
      totalSeconds: numberOr(isRecord(stint) ? stint.totalSeconds : 0, 0),
    })),
    total: {
      optimisticSeconds: numberOr(total.optimisticSeconds, 0),
      expectedSeconds: numberOr(total.expectedSeconds, 0),
      pessimisticSeconds: numberOr(total.pessimisticSeconds, 0),
    },
    deltaToFastestSeconds: numberOr(raw.deltaToFastestSeconds, 0),
    marginLaps: numberOr(raw.marginLaps, 0),
    survivesPessimistic: raw.survivesPessimistic === true,
    risk: isRisk(raw.risk) ? raw.risk : "high",
    dominated: raw.dominated === true,
    ...(isVariantKind(raw.dominatedBy) ? { dominatedBy: raw.dominatedBy } : {}),
    reasons: parseReasons(raw.reasons),
  };
}

function parseReasons(value: unknown): readonly StrategyReason[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) =>
    isRecord(raw) && typeof raw.code === "string" && typeof raw.message === "string"
      ? [{ code: raw.code, message: raw.message }]
      : [],
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

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isVariantKind(value: unknown): value is StrategyVariantKind {
  return value === "fast" || value === "robust" || value === "conservative";
}

function isRisk(value: unknown): value is StrategyRiskLevel {
  return value === "low" || value === "medium" || value === "high";
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
