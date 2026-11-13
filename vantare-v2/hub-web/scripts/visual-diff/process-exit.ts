import type { ChildProcess } from "node:child_process";

// Register immediately after spawn. A fast native close can finish before the
// Playwright click settles; waiting must not register the exit listener too late.
export function observeProcessExit(child: ChildProcess): Promise<void> {
  return new Promise((accept) => {
    child.once("exit", () => accept());
    child.once("error", () => accept());
  });
}
