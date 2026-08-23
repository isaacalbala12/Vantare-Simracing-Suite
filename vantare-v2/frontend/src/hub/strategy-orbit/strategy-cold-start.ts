import type {
  StrategyApplicationClient,
  StrategyColdStartProgressV1,
  StrategyColdStartStatusV1,
} from "../../strategy/strategy-application-client";

let coldStartSequence = 0;
export const COLD_START_IMPORT_TIMEOUT_MS = 30 * 60 * 1000;

function commandId(operation: string): string {
  coldStartSequence += 1;
  return `orbit-${operation}-${Date.now()}-${coldStartSequence}`;
}

export async function loadColdStartStatus(client: StrategyApplicationClient<unknown>): Promise<StrategyColdStartStatusV1> {
  const result = await client.execute({ protocolVersion: "strategy.application.v1", commandId: commandId("cold-status"), operation: "get_cold_start_status", expectedRepositoryVersion: 0 });
  return result.coldStartStatus ?? { shouldShow: false, checking: false, found: 0, imported: 0, skipped: 0, failures: [], decision: "pending" };
}

export async function rejectColdStart(client: StrategyApplicationClient<unknown>): Promise<void> {
  await client.execute({ protocolVersion: "strategy.application.v1", commandId: commandId("cold-reject"), operation: "reject_cold_start", expectedRepositoryVersion: 0 });
}

export async function importColdStartSessions(
  client: StrategyApplicationClient<unknown>,
  onProgress: (progress: StrategyColdStartProgressV1) => void,
): Promise<void> {
  for (;;) {
    const result = await client.execute(
      { protocolVersion: "strategy.application.v1", commandId: commandId("cold-import"), operation: "import_cold_start_next", expectedRepositoryVersion: 0 },
      { timeoutMs: COLD_START_IMPORT_TIMEOUT_MS },
    );
    if (!result.coldStartProgress) throw new Error("Cold start import returned no progress");
    onProgress(result.coldStartProgress);
    if (result.coldStartProgress.done) return;
  }
}
