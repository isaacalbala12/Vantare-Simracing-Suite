import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { observeProcessExit } from "../scripts/visual-diff/process-exit";

it.each([0, 7])(
  "retains an exit code %s that arrives before teardown awaits it",
  async (code) => {
    const child = spawn(process.execPath, ["-e", `process.exit(${code})`], {
      stdio: "ignore",
    });
    const exited = observeProcessExit(child);
    // Synchronize on actual completion, without a sleep. Teardown starts later.
    await once(child, "close");
    expect(child.exitCode).toBe(code);
    await exited;
  },
);
it("does not strand teardown when spawning fails", async () => {
  const child = spawn("vantare-qa-nonexistent-executable", [], {
    stdio: "ignore",
  });
  const exited = observeProcessExit(child);
  await once(child, "error");
  await exited;
});
