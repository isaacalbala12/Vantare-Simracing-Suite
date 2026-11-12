import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright-core";
import { until } from "./wait-for.ts";

/** Native Windows keyboard queue, not a DOM/CDP synthetic AltGr event. */
export async function checkSpanishAltGr(page: Page) {
  assert.equal(process.platform, "win32");
  const browser = page.context().browser();
  assert.ok(browser);
  const session = await browser.newBrowserCDPSession();
  const { processInfo } = await session.send("SystemInfo.getProcessInfo");
  await session.detach();
  const pid = processInfo.find((process) => process.type === "browser")?.id;
  assert.ok(pid);
  const executable = process.env.VANTARE_HUB_UI_BINARY;
  assert.ok(executable);
  const input = page.locator("[data-command-palette]");
  await input.fill("");
  await input.focus();
  await page.evaluate(() => {
    const events: unknown[] = [];
    Reflect.set(window, "spanishAltGrEvents", events);
    const listener = (event: KeyboardEvent) =>
      events.push({
        type: event.type,
        key: event.key,
        code: event.code,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        altGraph: event.getModifierState("AltGraph"),
        trusted: event.isTrusted,
      });
    window.addEventListener("keydown", listener, true);
    window.addEventListener("keyup", listener, true);
    Reflect.set(window, "stopSpanishAltGr", () => {
      window.removeEventListener("keydown", listener, true);
      window.removeEventListener("keyup", listener, true);
    });
  });
  const child = spawn(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      resolve("scripts/spanish-altgr.ps1"),
      "-ProcessId",
      String(pid),
      "-Executable",
      executable,
    ],
    { windowsHide: true, stdio: "pipe" },
  );
  let native = "",
    errors = "";
  child.stdout.on("data", (bytes) => {
    native += bytes.toString();
  });
  child.stderr.on("data", (bytes) => {
    errors += bytes.toString();
  });
  const closed = new Promise<number | null>((done, reject) => {
    child.once("exit", done);
    child.once("error", reject);
  });
  try {
    await until(
      async () => native.includes("INPUT_READY"),
      10000,
      "native input injected",
    );
    await until(
      () => input.inputValue().then((value) => value === "@"),
      5000,
      "native Spanish AltGr inserts @",
    );
    await until(
      () =>
        page.evaluate(() =>
          (
            Reflect.get(window, "spanishAltGrEvents") as {
              type: string;
              code: string;
            }[]
          ).some(
            (event) => event.type === "keyup" && event.code === "AltRight",
          ),
        ),
      5000,
      "native modifiers released",
    );
    child.stdin.end("ACK\n");
    assert.equal(await closed, 0, errors);
    const events = await page.evaluate(
      () =>
        Reflect.get(window, "spanishAltGrEvents") as {
          key: string;
          ctrl: boolean;
          alt: boolean;
          altGraph: boolean;
          trusted: boolean;
        }[],
    );
    assert.ok(events.some((event) => event.key === "@" && event.trusted));
    await writeFile(
      resolve(
        process.env.VANTARE_DIALOG_AUDIT_ROOT ??
          process.env.VANTARE_HUB_EVIDENCE ??
          "test-results",
        "spanish-altgr-windows.json",
      ),
      JSON.stringify({ native, events, value: "@" }, null, 2),
    );
  } finally {
    if (child.exitCode === null) {
      if (!child.stdin.writableEnded) child.stdin.end("ACK\n");
      await closed;
    }
    await page.evaluate(() => Reflect.get(window, "stopSpanishAltGr")());
    await input.fill("");
  }
}
