import { Events } from "@wailsio/runtime";

import { STRATEGY_CORNERS, type StrategyCorner } from "./strategy-tyre";
import type { StrategyEditorDocument } from "./strategy-editor";

export const STRATEGY_TYRES_PROTOCOL_V1 = "strategy.tyres.v1" as const;

/**
 * One reason a planned assignment could not be run, as reported by
 * `internal/strategy/tyres`. The editor mirrors the domain's rules for
 * immediate feedback; this is the domain itself answering, so anything the
 * mirror missed still surfaces.
 */
export type StrategyPlanViolation = {
  readonly code: string;
  readonly message: string;
  readonly stintId?: string;
  readonly tyreId?: string;
  readonly corner?: StrategyCorner;
};

export type StrategyTyreValidation = {
  readonly valid: boolean;
  readonly violations: readonly StrategyPlanViolation[];
};

export type StrategyTyreClient = {
  validate(document: StrategyEditorDocument): Promise<StrategyTyreValidation>;
  dispose(): void;
};

export type StrategyTyreEventTransport = {
  emit(name: string, payload: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

type ClientOptions = { readonly id?: () => string; readonly timeoutMs?: number };

const COMMAND_EVENT = "strategy:tyres:validate";
const RESULT_EVENT = "strategy:tyres:result";
const ERROR_EVENT = "strategy:tyres:error";
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function buildStrategyTyresCommand(document: StrategyEditorDocument, commandId: string) {
  return {
    protocolVersion: STRATEGY_TYRES_PROTOCOL_V1,
    commandId,
    input: {
      // The event allocation is exactly the identities the document holds.
      maximum: document.tyres.length,
      tyres: document.tyres,
      plan: document.stints.map((stint) => ({
        stintId: stint.id,
        assignments: Object.fromEntries(
          STRATEGY_CORNERS.flatMap((corner) => {
            const tyreId = stint.assignments[corner];
            return tyreId ? [[corner, tyreId] as const] : [];
          }),
        ),
      })),
    },
  };
}

export function createStrategyTyreClient(
  transport: StrategyTyreEventTransport,
  options: ClientOptions = {},
): StrategyTyreClient {
  const id = options.id ?? (() => `tyres-${crypto.randomUUID()}`);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pending = new Map<string, (error: Error) => void>();
  let disposed = false;

  return {
    validate(document) {
      if (disposed) return Promise.reject(new Error("Strategy tyre client is disposed"));
      const command = buildStrategyTyresCommand(document, id());
      if (!COMMAND_ID_PATTERN.test(command.commandId)) {
        return Promise.reject(new Error("Invalid Strategy tyre command ID"));
      }
      return new Promise<StrategyTyreValidation>((resolve, reject) => {
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
          () => fail(new Error("Timeout waiting for Strategy tyre validation")),
          timeoutMs,
        );
        try {
          unsubscribers.push(transport.on(RESULT_EVENT, (event) => {
            const payload = readEventPayload(event);
            if (payload.commandId !== command.commandId) return;
            try {
              const validation = parseValidation(payload);
              settled = true;
              cleanup();
              resolve(validation);
            } catch (error) {
              fail(toError(error));
            }
          }));
          unsubscribers.push(transport.on(ERROR_EVENT, (event) => {
            const payload = readEventPayload(event);
            if (payload.commandId !== command.commandId) return;
            fail(new Error(
              typeof payload.message === "string"
                ? payload.message
                : "Invalid Strategy tyre error response",
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
      for (const fail of [...pending.values()]) fail(new Error("Strategy tyre client was disposed"));
    },
  };
}

export function createWailsStrategyTyreClient(): StrategyTyreClient {
  return createStrategyTyreClient({
    emit(name, payload) { Events.Emit(name, payload); },
    on(name, listener) { return Events.On(name, (event) => listener(event)); },
  });
}

function parseValidation(payload: Record<string, unknown>): StrategyTyreValidation {
  if (payload.protocolVersion !== STRATEGY_TYRES_PROTOCOL_V1 || !isRecord(payload.result)) {
    throw new Error("Invalid Strategy tyre result protocol");
  }
  const result = payload.result;
  if (typeof result.valid !== "boolean" || !Array.isArray(result.violations)) {
    throw new Error("Invalid Strategy tyre result");
  }
  const violations = result.violations.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.code !== "string" || typeof raw.message !== "string") {
      throw new Error(`Invalid Strategy tyre violation ${index}`);
    }
    return {
      code: raw.code,
      message: raw.message,
      ...(typeof raw.stintId === "string" ? { stintId: raw.stintId } : {}),
      ...(typeof raw.tyreId === "string" ? { tyreId: raw.tyreId } : {}),
      ...(isCorner(raw.corner) ? { corner: raw.corner } : {}),
    } satisfies StrategyPlanViolation;
  });
  return deepFreeze({ valid: result.valid, violations });
}

function readEventPayload(payload: unknown): Record<string, unknown> {
  const wrapped = payload as { data?: unknown };
  let value = wrapped?.data;
  if (Array.isArray(value)) value = value[0];
  if (isRecord(value)) return value;
  if (isRecord(payload) && !("data" in payload)) return payload;
  return {};
}

function isCorner(value: unknown): value is StrategyCorner {
  return typeof value === "string" && (STRATEGY_CORNERS as readonly string[]).includes(value);
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
