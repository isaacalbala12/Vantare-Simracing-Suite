import { describe, expect, it } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import { COLD_START_IMPORT_TIMEOUT_MS, importColdStartSessions, loadColdStartStatus, rejectColdStart } from "./strategy-cold-start";

describe("Strategy cold start", () => {
  it("shows once, reports progress and respects rejection", async () => {
    let rejected = false;
    let imported = 0;
    const timeouts: Array<number | undefined> = [];
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>, options): Promise<StrategyApplicationResultV1<unknown>> {
        const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false };
        if (command.operation === "get_cold_start_status") return { ...base, coldStartStatus: { shouldShow: !rejected, checking: false, found: 2, imported, skipped: 0, failures: [], decision: rejected ? "rejected" : "pending" } };
        if (command.operation === "import_cold_start_next") { timeouts.push(options?.timeoutMs); imported += 1; return { ...base, coldStartProgress: { imported, skipped: 0, total: 2, done: imported === 2, failures: [] } }; }
        if (command.operation === "reject_cold_start") { rejected = true; return base; }
        throw new Error(`unexpected ${command.operation}`);
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    expect((await loadColdStartStatus(client)).shouldShow).toBe(true);
    const progress: number[] = [];
    await importColdStartSessions(client, (value) => progress.push(value.imported));
    expect(progress).toEqual([1, 2]);
    expect(timeouts).toEqual([COLD_START_IMPORT_TIMEOUT_MS, COLD_START_IMPORT_TIMEOUT_MS]);
    await rejectColdStart(client);
    expect((await loadColdStartStatus(client)).decision).toBe("rejected");
  });

  it("reports imported and skipped sessions without aborting the loop", async () => {
    let step = 0;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command): Promise<StrategyApplicationResultV1<unknown>> {
        step += 1;
        const failure = { locator: "lmu://bad", reason: "invalid database" };
        return {
          protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0,
          coldStartProgress: step === 1
            ? { imported: 0, skipped: 1, total: 2, done: false, failures: [failure] }
            : { imported: 1, skipped: 1, total: 2, done: true, failures: [failure] },
          recoveredFromBackup: false, closed: false,
        };
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const seen: Array<[number, number]> = [];
    await importColdStartSessions(client, (progress) => seen.push([progress.imported, progress.skipped]));
    expect(seen).toEqual([[0, 1], [1, 1]]);
  });
});
