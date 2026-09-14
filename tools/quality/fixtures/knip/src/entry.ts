// Entry point: imports usedExport (used) but NOT deadExport (dead).
// It does NOT import orphan.ts (whose only consumer was removed).
import { usedExport } from "./used.ts";

export function main(): string {
  return usedExport();
}
