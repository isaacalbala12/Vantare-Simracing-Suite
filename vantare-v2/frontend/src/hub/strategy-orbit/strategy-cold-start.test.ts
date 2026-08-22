import { describe, expect, it } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import { importColdStartSessions, loadColdStartStatus, rejectColdStart } from "./strategy-cold-start";

describe("Strategy cold start", () => {
  it("shows once, reports progress and respects rejection", async () => {
    let rejected = false;
    let imported = 0;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 0, recoveredFromBackup: false, closed: false };
        if (command.operation === "get_cold_start_status") return { ...base, coldStartStatus: { shouldShow: !rejected, found: 2, imported, decision: rejected ? "rejected" : "pending" } };
        if (command.operation === "import_cold_start_next") { imported += 1; return { ...base, coldStartProgress: { imported, total: 2, done: imported === 2 } }; }
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
    await rejectColdStart(client);
    expect((await loadColdStartStatus(client)).decision).toBe("rejected");
  });
});
