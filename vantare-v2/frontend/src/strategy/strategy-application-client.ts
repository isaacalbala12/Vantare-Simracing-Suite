import { Events } from "@wailsio/runtime";

import {
  decodePlanRevisionV1,
  parseActivePlanV1,
  parsePlanDraftV1,
  type ActivePlanV1,
  type PlanDraftV1,
  type PlanRevisionV1,
  type RevisionRefV1,
} from "./strategy-contract-v1";

export const STRATEGY_APPLICATION_PROTOCOL_V1 =
  "strategy.application.v1" as const;

export type StrategyApplicationOperation =
  | "create"
  | "open"
  | "edit"
  | "save_revision"
  | "duplicate"
  | "activate"
  | "deactivate"
  | "restore"
  | "close"
  | "list";

type CommandHeader<T extends StrategyApplicationOperation> = {
  protocolVersion: typeof STRATEGY_APPLICATION_PROTOCOL_V1;
  commandId: string;
  operation: T;
  expectedRepositoryVersion: number;
};

export type StrategyApplicationCommandV1<TPayload> =
  | (CommandHeader<"create"> & { draft: PlanDraftV1<TPayload> })
  | (CommandHeader<"open"> & { draftId: string })
  | (CommandHeader<"edit"> & { draft: PlanDraftV1<TPayload> })
  | (CommandHeader<"save_revision"> & {
      draft: PlanDraftV1<TPayload>;
      revisionId: string;
      createdAt: string;
    })
  | (CommandHeader<"duplicate"> & {
      sourceDraft: PlanDraftV1<TPayload>;
      targetDraftId: string;
      targetPlanId: string;
      targetVariantId: string;
      name: string;
      updatedAt: string;
    })
  | (CommandHeader<"activate"> & {
      revision: RevisionRefV1;
      activationId: string;
      activatedAt: string;
      current?: ActivePlanV1;
    })
  | (CommandHeader<"deactivate"> & {
      current?: ActivePlanV1;
      expectedActivationId: string;
    })
  | CommandHeader<"list">
  | (CommandHeader<"restore"> & { draftId: string })
  | (CommandHeader<"close"> & {
      draft: PlanDraftV1<TPayload>;
      savedDraft: PlanDraftV1<TPayload>;
      discard: boolean;
    });

/**
 * One entry in "My plans". It carries no payload: the library identifies plans
 * so one can be chosen, and only then is that plan opened.
 */
export type StrategyPlanSummaryV1 = {
  readonly planId: string;
  readonly variantId: string;
  readonly draftId?: string;
  readonly name: string;
  readonly mode: string;
  readonly updatedAt: string;
  readonly hasDraft: boolean;
  readonly revisionCount: number;
  readonly latestRevision?: RevisionRefV1;
  readonly latestRevisionAt?: string;
};

export type StrategyApplicationResultV1<TPayload> = {
  readonly protocolVersion: typeof STRATEGY_APPLICATION_PROTOCOL_V1;
  readonly commandId: string;
  readonly repositoryVersion: number;
  readonly draft?: PlanDraftV1<TPayload>;
  readonly savedDraft?: PlanDraftV1<TPayload>;
  readonly revision?: PlanRevisionV1<TPayload>;
  readonly activePlan?: ActivePlanV1;
  readonly plans?: readonly StrategyPlanSummaryV1[];
  readonly recoveredFromBackup: boolean;
  readonly closed: boolean;
};

export type StrategyApplicationErrorCode =
  | "invalid_command"
  | "stale_command"
  | "draft_not_found"
  | "draft_conflict"
  | "revision_not_found"
  | "active_plan_conflict"
  | "unsaved_changes";

export class StrategyApplicationError extends Error {
  readonly code: StrategyApplicationErrorCode;
  readonly field: string;

  constructor(
    code: StrategyApplicationErrorCode,
    field: string,
    message: string,
  ) {
    super(message);
    this.name = "StrategyApplicationError";
    this.code = code;
    this.field = field;
  }
}

export interface StrategyApplicationClient<TPayload> {
  execute(
    command: StrategyApplicationCommandV1<TPayload>,
  ): Promise<StrategyApplicationResultV1<TPayload>>;
  cancel(commandId: string): boolean;
  dispose(): void;
}

export type StrategyApplicationEventTransport = {
  emit(name: string, payload: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

const COMMAND_EVENT = "strategy:application:command";
const RESULT_EVENT = "strategy:application:result";
const ERROR_EVENT = "strategy:application:error";
const DEFAULT_TIMEOUT_MS = 10_000;
const applicationErrorCodes = new Set<StrategyApplicationErrorCode>([
  "invalid_command",
  "stale_command",
  "draft_not_found",
  "draft_conflict",
  "revision_not_found",
  "active_plan_conflict",
  "unsaved_changes",
]);

export function createStrategyApplicationClient<TPayload>(
  transport: StrategyApplicationEventTransport,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): StrategyApplicationClient<TPayload> {
  const pending = new Map<string, (error: Error) => void>();
  let disposed = false;

  const client: StrategyApplicationClient<TPayload> = {
    execute(command) {
      if (disposed) {
        return Promise.reject(new Error("Strategy application client is disposed"));
      }
      validateCommandHeader(command);
      if (pending.has(command.commandId)) {
        return Promise.reject(new Error("Strategy application command is already pending"));
      }
      return new Promise<StrategyApplicationResultV1<TPayload>>(
        (resolve, reject) => {
          const unsubs: Array<() => void> = [];
          let settled = false;
          const cleanup = () => {
            globalThis.clearTimeout(timeout);
            for (const unsubscribe of unsubs) unsubscribe();
            pending.delete(command.commandId);
          };
          const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
          };
          const timeout = globalThis.setTimeout(() => {
            fail(new Error("Timeout waiting for Strategy application response"));
          }, timeoutMs);

          try {
            unsubs.push(transport.on(RESULT_EVENT, (event) => {
              const payload = readEventPayload(event);
              if (payload.commandId !== command.commandId) return;
              void parseResult<TPayload>(payload).then(
                (result) => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  resolve(result);
                },
                (error) => {
                  fail(toError(error));
                },
              );
            }));
            unsubs.push(transport.on(ERROR_EVENT, (event) => {
              const payload = readEventPayload(event);
              if (payload.commandId !== command.commandId) return;
              fail(parseApplicationError(payload));
            }));
            pending.set(command.commandId, fail);
            transport.emit(COMMAND_EVENT, command);
          } catch (error) {
            fail(toError(error));
          }
        },
      );
    },
    cancel(commandId) {
      const fail = pending.get(commandId);
      if (!fail) return false;
      fail(new Error(`Strategy application command ${commandId} was cancelled`));
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const fail of [...pending.values()]) {
        fail(new Error("Strategy application client was disposed"));
      }
    },
  };
  return client;
}

export function createWailsStrategyApplicationTransport(): StrategyApplicationEventTransport {
  return {
    emit(name, payload) {
      Events.Emit(name, payload);
    },
    on(name, listener) {
      return Events.On(name, (event) => listener(event));
    },
  };
}

function validateCommandHeader(command: StrategyApplicationCommandV1<unknown>): void {
  if (command.protocolVersion !== STRATEGY_APPLICATION_PROTOCOL_V1) {
    throw new Error("Unsupported Strategy application protocol");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(command.commandId)) {
    throw new Error("Invalid Strategy application command ID");
  }
  if (
    !Number.isSafeInteger(command.expectedRepositoryVersion) ||
    command.expectedRepositoryVersion < 0
  ) {
    throw new Error("Invalid Strategy repository version");
  }
}

async function parseResult<TPayload>(
  payload: Record<string, unknown>,
): Promise<StrategyApplicationResultV1<TPayload>> {
  if (payload.protocolVersion !== STRATEGY_APPLICATION_PROTOCOL_V1) {
    throw new Error("Unsupported Strategy application result protocol");
  }
  if (typeof payload.commandId !== "string" || payload.commandId === "") {
    throw new Error("Invalid Strategy application result command ID");
  }
  if (
    typeof payload.repositoryVersion !== "number" ||
    !Number.isSafeInteger(payload.repositoryVersion) ||
    payload.repositoryVersion < 0
  ) {
    throw new Error("Invalid Strategy application result repository version");
  }
  if (typeof payload.recoveredFromBackup !== "boolean") {
    throw new Error("Invalid Strategy application recovery state");
  }
  if (typeof payload.closed !== "boolean") {
    throw new Error("Invalid Strategy application close state");
  }
  const result: StrategyApplicationResultV1<TPayload> = {
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: payload.commandId,
    repositoryVersion: payload.repositoryVersion,
    ...(payload.draft === undefined
      ? {}
      : { draft: parsePlanDraftV1<TPayload>(payload.draft) }),
    ...(payload.savedDraft === undefined
      ? {}
      : { savedDraft: parsePlanDraftV1<TPayload>(payload.savedDraft) }),
    ...(payload.revision === undefined
      ? {}
      : {
          revision: (await decodePlanRevisionV1(
            JSON.stringify(payload.revision),
          )) as PlanRevisionV1<TPayload>,
        }),
    ...(payload.activePlan === undefined
      ? {}
      : { activePlan: parseActivePlanV1(payload.activePlan) }),
    ...(payload.plans === undefined ? {} : { plans: parsePlanSummaries(payload.plans) }),
    recoveredFromBackup: payload.recoveredFromBackup,
    closed: payload.closed,
  };
  return deepFreeze(result);
}

/** A reference is only usable if it is complete: an incomplete one is rejected. */
function parseRevisionRef(value: unknown, field: string): RevisionRefV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid Strategy revision reference: ${field}`);
  }
  const entry = value as Record<string, unknown>;
  for (const key of ["planId", "variantId", "revisionId", "contentHash"]) {
    if (typeof entry[key] !== "string" || entry[key] === "") {
      throw new Error(`Invalid Strategy revision reference: ${field}.${key}`);
    }
  }
  return {
    planId: entry.planId as string,
    variantId: entry.variantId as string,
    revisionId: entry.revisionId as string,
    contentHash: entry.contentHash as string,
  };
}

function parsePlanSummaries(value: unknown): readonly StrategyPlanSummaryV1[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid Strategy plan list");
  }
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`Invalid Strategy plan summary ${index}`);
    }
    const entry = raw as Record<string, unknown>;
    for (const field of ["planId", "variantId", "name", "updatedAt"]) {
      if (typeof entry[field] !== "string" || entry[field] === "") {
        throw new Error(`Invalid Strategy plan summary ${index}: ${field}`);
      }
    }
    if (typeof entry.revisionCount !== "number" || !Number.isSafeInteger(entry.revisionCount)) {
      throw new Error(`Invalid Strategy plan summary ${index}: revisionCount`);
    }
    return {
      planId: entry.planId as string,
      variantId: entry.variantId as string,
      name: entry.name as string,
      mode: typeof entry.mode === "string" ? entry.mode : "",
      updatedAt: entry.updatedAt as string,
      hasDraft: entry.hasDraft === true,
      revisionCount: entry.revisionCount,
      ...(typeof entry.draftId === "string" ? { draftId: entry.draftId } : {}),
      ...(entry.latestRevision === undefined
        ? {}
        : { latestRevision: parseRevisionRef(entry.latestRevision, `plans.${index}.latestRevision`) }),
      ...(typeof entry.latestRevisionAt === "string"
        ? { latestRevisionAt: entry.latestRevisionAt }
        : {}),
    } satisfies StrategyPlanSummaryV1;
  });
}

function parseApplicationError(
  payload: Record<string, unknown>,
): StrategyApplicationError {
  if (
    typeof payload.code !== "string" ||
    !applicationErrorCodes.has(payload.code as StrategyApplicationErrorCode)
  ) {
    return new StrategyApplicationError(
      "invalid_command",
      "",
      "Invalid Strategy application error response",
    );
  }
  return new StrategyApplicationError(
    payload.code as StrategyApplicationErrorCode,
    typeof payload.field === "string" ? payload.field : "",
    typeof payload.message === "string" ? payload.message : payload.code,
  );
}

function readEventPayload(payload: unknown): Record<string, unknown> {
  const wrapped = payload as { data?: unknown };
  let value = wrapped?.data;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const direct = payload as Record<string, unknown>;
    if (!("data" in direct)) return direct;
  }
  return {};
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
