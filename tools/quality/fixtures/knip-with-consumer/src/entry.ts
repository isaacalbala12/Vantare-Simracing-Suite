// Entry point: imports usedExport (used) AND orphanExport (orphan.ts has a consumer here).
// This fixture has the consumer; knip-with-consumer should NOT report orphan.ts as dead.
import { usedExport } from "./used.ts";
import { orphanExport } from "./orphan.ts";

export function main(): string {
  return usedExport() + orphanExport();
}
