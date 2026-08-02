import { describe, expect, it, vi } from "vitest";

import type {
  StrategyApplicationClient,
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
} from "./strategy-application-client";
import { createStrategyStore } from "./strategy-store";
import type {
  PlanDraftV1,
  StrategyExecutionStateV1,
} from "./strategy-contract-v1";

type Payload = { laps: number; notes?: { text: string } };

function draft(laps = 10): PlanDraftV1<Payload> {
  return {
    contractVersion: "strategy.v1",
    draftId: "draft-1",
    planId: "plan-1",
    variantId: "variant-1",
    name: "Race plan",
    mode: "manual",
    capabilities: ["manual_inputs"],
    provenance: { kind: "manual", sourceId: "user" },
    confidence: { level: "high", basis: "manual" },
    updatedAt: "2026-08-02T00:00:01Z",
    payload: { laps },
  };
}

function result(
  command: StrategyApplicationCommandV1<Payload>,
  saved: PlanDraftV1<Payload>,
  repositoryVersion: number,
): StrategyApplicationResultV1<Payload> {
  return {
    protocolVersion: "strategy.application.v1",
    commandId: command.commandId,
    repositoryVersion,
    draft: structuredClone(saved),
    savedDraft: structuredClone(saved),
    recoveredFromBackup: false,
    closed: false,
  };
}

function createClient(initial = draft()) {
  let persisted = structuredClone(initial);
  let repositoryVersion = 1;
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<Payload>) => {
    switch (command.operation) {
      case "open":
      case "restore":
        return result(command, persisted, repositoryVersion);
      case "save_revision": {
        if (command.expectedRepositoryVersion !== repositoryVersion) {
          throw new Error("stale_command");
        }
        persisted = structuredClone(command.draft);
        persisted.baseRevision = {
          planId: persisted.planId,
          variantId: persisted.variantId,
          revisionId: command.revisionId,
          contentHash: "a".repeat(64),
        };
        repositoryVersion += 1;
        return result(command, persisted, repositoryVersion);
      }
      case "close":
        return {
          protocolVersion: "strategy.application.v1" as const,
          commandId: command.commandId,
          repositoryVersion,
          recoveredFromBackup: false,
          closed: true,
        };
      default:
        return result(command, persisted, repositoryVersion);
    }
  });
  return { client: mockClient(execute), execute };
}

describe("createStrategyStore", () => {
  it("derives dirty from snapshots and supports bounded undo/redo", async () => {
    const { client } = createClient();
    const store = createStrategyStore(client, {
      id: (() => {
        let value = 0;
        return () => `command-${++value}`;
      })(),
      now: () => "2026-08-02T00:00:02Z",
      historyLimit: 2,
    });
    await store.open("draft-1");
    expect(store.getSnapshot()).toMatchObject({ dirty: false, canUndo: false });

    store.edit((current) => ({ ...current, payload: { laps: 11 } }));
    store.edit((current) => ({ ...current, payload: { laps: 12 } }));
    store.edit((current) => ({ ...current, payload: { laps: 13 } }));
    expect(store.getSnapshot()).toMatchObject({ dirty: true, canUndo: true, canRedo: false });

    store.undo();
    expect(store.getSnapshot().draft?.payload.laps).toBe(12);
    store.undo();
    expect(store.getSnapshot().draft?.payload.laps).toBe(11);
    store.undo();
    expect(store.getSnapshot().draft?.payload.laps).toBe(11);
    store.redo();
    expect(store.getSnapshot().draft?.payload.laps).toBe(12);
    store.edit((current) => ({ ...current, payload: { laps: 20 } }));
    expect(store.getSnapshot().canRedo).toBe(false);
  });

  it("becomes clean after save and rejects a stale save without losing draft", async () => {
    const { client } = createClient();
    const store = createStrategyStore(client, {
      id: () => "id-1",
      now: () => "2026-08-02T00:00:02Z",
    });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { laps: 12 } }));
    await store.save();
    expect(store.getSnapshot()).toMatchObject({ dirty: false, repositoryVersion: 2 });

    store.edit((current) => ({ ...current, payload: { laps: 13 } }));
    const before = store.getSnapshot();
    (client.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("stale_command"));
    await expect(store.save()).rejects.toThrow("stale_command");
    expect(store.getSnapshot()).toEqual(before);
  });

  it("restores persisted recovery and guards close", async () => {
    const { client, execute } = createClient();
    const store = createStrategyStore(client, { id: () => "id-1", now: () => "2026-08-02T00:00:02Z" });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { laps: 99 } }));
    await expect(store.close(false)).rejects.toThrow(/unsaved/i);
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ operation: "close" }));

    await store.restore();
    expect(store.getSnapshot()).toMatchObject({ dirty: false, canUndo: false });
    expect(store.getSnapshot().draft?.payload.laps).toBe(10);
    await expect(store.close(false)).resolves.toBe(true);
    expect(store.getSnapshot().draft).toBeUndefined();
  });

  it("closing the editor preserves the active plan and execution observer", async () => {
    const activePlan = {
      contractVersion: "strategy.v1" as const,
      activationId: "activation-1",
      revision: {
        planId: "plan-1",
        variantId: "variant-1",
        revisionId: "revision-1",
        contentHash: "a".repeat(64),
      },
      activatedAt: "2026-08-02T00:00:01Z",
    };
    const execution = executionState(activePlan);
    const { client } = createClient();
    (client.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async (command: StrategyApplicationCommandV1<Payload>) => {
        if (command.operation === "activate") {
          return {
            protocolVersion: "strategy.application.v1" as const,
            commandId: command.commandId,
            repositoryVersion: 1,
            activePlan,
            recoveredFromBackup: false,
            closed: false,
          };
        }
        if (command.operation === "close") {
          return {
            protocolVersion: "strategy.application.v1" as const,
            commandId: command.commandId,
            repositoryVersion: 1,
            recoveredFromBackup: false,
            closed: true,
          };
        }
        return result(command, draft(), 1);
      },
    );
    const store = createStrategyStore(client, {
      id: () => "command-1",
      now: () => "2026-08-02T00:00:02Z",
    });
    await store.open("draft-1");
    await store.activate(activePlan.revision);
    store.observeExecution(execution);

    await store.close(false);

    const closed = store.getSnapshot();
    expect(closed.draft).toBeUndefined();
    expect(closed).toMatchObject({ activePlan, execution });
  });

  it("telemetry execution snapshots never mutate draft, dirty or history", async () => {
    const { client } = createClient();
    const store = createStrategyStore(client, { id: () => "id-1", now: () => "2026-08-02T00:00:02Z" });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { laps: 11 } }));
    const before = store.getSnapshot();
    const execution = executionState({
      contractVersion: "strategy.v1",
      activationId: "activation-1",
      revision: { planId: "plan-1", variantId: "variant-1", revisionId: "revision-1", contentHash: "a".repeat(64) },
      activatedAt: "2026-08-02T00:00:01Z",
    });

    store.observeExecution(execution);
    const after = store.getSnapshot();
    expect(after.execution).toEqual(execution);
    expect({ ...after, execution: before.execution }).toEqual(before);

    store.undo();
    expect(store.getSnapshot().draft?.payload.laps).toBe(10);
    expect(store.getSnapshot().dirty).toBe(false);
  });

  it("does not add history for structurally identical commands", async () => {
    const { client } = createClient();
    const store = createStrategyStore(client, { id: () => "id-1", now: () => "2026-08-02T00:00:02Z" });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { ...current.payload } }));
    expect(store.getSnapshot()).toMatchObject({ dirty: false, canUndo: false });
  });

  it("serializes application commands while allowing telemetry observations", async () => {
    let release: (() => void) | undefined;
    const pendingOpen = new Promise<StrategyApplicationResultV1<Payload>>(
      (resolve) => {
        release = () =>
          resolve({
            protocolVersion: "strategy.application.v1",
            commandId: "command-1",
            repositoryVersion: 1,
            draft: draft(),
            savedDraft: draft(),
            recoveredFromBackup: false,
            closed: false,
          });
      },
    );
    const client = mockClient(vi.fn(() => pendingOpen));
    const store = createStrategyStore(client, { id: () => "command-1" });
    const opening = store.open("draft-1");
    const execution = executionState({
      contractVersion: "strategy.v1",
      activationId: "activation-1",
      revision: {
        planId: "plan-1",
        variantId: "variant-1",
        revisionId: "revision-1",
        contentHash: "a".repeat(64),
      },
      activatedAt: "2026-08-02T00:00:01Z",
    });

    expect(store.getSnapshot().busy).toBe(true);
    store.observeExecution(execution);
    await expect(store.open("draft-2")).rejects.toThrow(/in progress/i);
    expect(store.getSnapshot().execution).toEqual(execution);

    release?.();
    await opening;
    expect(store.getSnapshot()).toMatchObject({ busy: false, dirty: false });
  });

  it("blocks local history mutations while save and close are in flight", async () => {
    let releaseSave: ((value: StrategyApplicationResultV1<Payload>) => void) | undefined;
    let releaseClose: ((value: StrategyApplicationResultV1<Payload>) => void) | undefined;
    const saveResponse = new Promise<StrategyApplicationResultV1<Payload>>(
      (resolve) => { releaseSave = resolve; },
    );
    const closeResponse = new Promise<StrategyApplicationResultV1<Payload>>(
      (resolve) => { releaseClose = resolve; },
    );
    const execute = vi.fn(
      async (command: StrategyApplicationCommandV1<Payload>) => {
        if (command.operation === "save_revision") return saveResponse;
        if (command.operation === "close") return closeResponse;
        return result(command, draft(), 1);
      },
    );
    const store = createStrategyStore(mockClient(execute), { id: () => "command-1", now: () => "2026-08-02T00:00:02Z" });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { laps: 11 } }));

    const saving = store.save();
    let exposedUnlockedDirtyState = false;
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.getSnapshot();
      if (!snapshot.busy && snapshot.dirty) exposedUnlockedDirtyState = true;
    });
    expect(() => store.edit((current) => ({ ...current, payload: { laps: 12 } }))).toThrow(/in progress/i);
    expect(() => store.undo()).toThrow(/in progress/i);
    expect(() => store.redo()).toThrow(/in progress/i);
    const saveCommand = execute.mock.calls.at(-1)?.[0];
    if (!saveCommand || saveCommand.operation !== "save_revision") throw new Error("missing save command");
    const saved = { ...saveCommand.draft, baseRevision: revisionRef(saveCommand.revisionId) };
    releaseSave?.(result(saveCommand, saved, 2));
    await saving;
    unsubscribe();
    expect(exposedUnlockedDirtyState).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ dirty: false, busy: false });
    expect(store.getSnapshot().draft?.payload.laps).toBe(11);

    const closing = store.close(false);
    expect(() => store.edit((current) => ({ ...current, payload: { laps: 13 } }))).toThrow(/in progress/i);
    releaseClose?.({
      protocolVersion: "strategy.application.v1",
      commandId: "command-1",
      repositoryVersion: 2,
      recoveredFromBackup: false,
      closed: true,
    });
    await expect(closing).resolves.toBe(true);
  });

  it("does not create an unresolved save identity while another command is busy", async () => {
    let releaseActivation: ((value: StrategyApplicationResultV1<Payload>) => void) | undefined;
    const activationResponse = new Promise<StrategyApplicationResultV1<Payload>>(
      (resolve) => { releaseActivation = resolve; },
    );
    const execute = vi.fn(
      async (command: StrategyApplicationCommandV1<Payload>) => {
        if (command.operation === "activate") return activationResponse;
        return result(command, draft(), 1);
      },
    );
    const store = createStrategyStore(mockClient(execute), { id: () => "command-1", now: () => "2026-08-02T00:00:02Z" });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { laps: 11 } }));

    const activating = store.activate(revisionRef("revision-1"));
    await expect(store.save()).rejects.toThrow(/in progress/i);
    releaseActivation?.({
      protocolVersion: "strategy.application.v1",
      commandId: "command-1",
      repositoryVersion: 1,
      activePlan: {
        contractVersion: "strategy.v1",
        activationId: "command-1:activation",
        revision: revisionRef("revision-1"),
        activatedAt: "2026-08-02T00:00:02Z",
      },
      recoveredFromBackup: false,
      closed: false,
    });
    await activating;

    expect(() => store.edit((current) => ({ ...current, payload: { laps: 12 } }))).not.toThrow();
  });

  it("requires explicit discard before create or open can replace a dirty draft", async () => {
    const { client, execute } = createClient();
    const store = createStrategyStore(client, { id: () => "command-1" });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { laps: 12 } }));
    const before = store.getSnapshot();

    await expect(store.open("draft-2")).rejects.toThrow(/unsaved/i);
    await expect(store.create({ ...draft(), draftId: "draft-2" })).rejects.toThrow(/unsaved/i);

    expect(store.getSnapshot()).toEqual(before);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("retries the exact save identity after a committed response is lost", async () => {
    const saveCommands: Array<Extract<StrategyApplicationCommandV1<Payload>, { operation: "save_revision" }>> = [];
    let persisted = draft();
    const execute = vi.fn(
      async (command: StrategyApplicationCommandV1<Payload>) => {
        if (command.operation === "open") return result(command, persisted, 1);
        if (command.operation !== "save_revision") return result(command, persisted, 1);
        saveCommands.push(structuredClone(command));
        persisted = { ...command.draft, baseRevision: revisionRef(command.revisionId) };
        if (saveCommands.length === 1) throw new Error("response lost after commit");
        return result(command, persisted, 2);
      },
    );
    let nextID = 0;
    const store = createStrategyStore(mockClient(execute), {
      id: () => `command-${++nextID}`,
      now: () => "2026-08-02T00:00:02Z",
    });
    await store.open("draft-1");
    store.edit((current) => ({ ...current, payload: { laps: 12 } }));

    await expect(store.save()).rejects.toThrow(/response lost/i);
    expect(() => store.edit((current) => ({ ...current, payload: { laps: 13 } }))).toThrow(/unresolved/i);
    await store.save();

    expect(saveCommands).toHaveLength(2);
    expect(saveCommands[1]).toEqual(saveCommands[0]);
    expect(store.getSnapshot()).toMatchObject({ dirty: false, repositoryVersion: 2 });
  });
});

function revisionRef(revisionId: string) {
  return {
    planId: "plan-1",
    variantId: "variant-1",
    revisionId,
    contentHash: "a".repeat(64),
  };
}

function mockClient(
  execute: StrategyApplicationClient<Payload>["execute"],
): StrategyApplicationClient<Payload> {
  return { execute, cancel: () => false, dispose: () => undefined };
}

function executionState(
  activePlan: StrategyExecutionStateV1["activePlan"],
): StrategyExecutionStateV1 {
  return {
    contractVersion: "strategy.v1",
    executionId: "execution-1",
    activePlan,
    epoch: 1,
    sequence: 1,
    status: "monitoring",
    capabilities: ["live_updates"],
    provenance: { kind: "observed", sourceId: "telemetry-core" },
    confidence: { level: "high", basis: "live projection" },
    updatedAt: "2026-08-02T00:00:02Z",
  };
}
