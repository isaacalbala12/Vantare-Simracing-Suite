import { setTimeout } from "node:timers/promises";
// Bounded polling of external process/file state; no fixed startup sleeps.
export async function until(
  predicate: () => boolean | Promise<boolean>,
  timeout: number,
  description: string,
) {
  const deadline = performance.now() + timeout;
  do {
    if (await predicate()) return;
    await setTimeout(50);
  } while (performance.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}
