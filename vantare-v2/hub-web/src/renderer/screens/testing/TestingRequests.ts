import type { Request } from "../../../contract/generated/contract";
import { testingBusyRetry } from "../../../contract/generated/contract";
import { type Client, HostFailure } from "../../bridge/client";

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, testingBusyRetry.delayMs);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// Busy is returned before dispatch; transport failures are never replayed.
export async function testingRequest(
  client: Client,
  request: Exclude<Request, { method: "window.close" }>,
  signal: AbortSignal,
) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      const reply = await client.request(request);
      signal.throwIfAborted();
      return reply;
    } catch (error) {
      if (
        !(error instanceof HostFailure) ||
        error.detail.kind !== "busy" ||
        attempt >= testingBusyRetry.attempts
      )
        throw error;
      await pause(signal);
    }
  }
}
