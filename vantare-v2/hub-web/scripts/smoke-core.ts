import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import type { CoreStatus, HostToUi } from "../src/contract/generated/contract";
import { checkPilotCore } from "./check-pilot-core.ts";
import { requiredPath } from "./qa-paths.ts";
import { until } from "./wait-for.ts";

// Existing qa-e2e runtime built with the public RFC8032 test root.
// NoCredential: authenticated services, no access grants, no account or credential.
const qa = join(
  requiredPath("VANTARE_HUB_QA_ROOT"),
  "licencias-e2e",
  `isa-1995-${randomBytes(8).toString("hex")}`,
);
const evidence = process.env.VANTARE_HUB_EVIDENCE
  ? requiredPath("VANTARE_HUB_EVIDENCE")
  : resolve("test-results/core");
await mkdir(evidence, { recursive: true });
const target = requiredPath("VANTARE_HUB_CORE_BIN_DIR");
const bins = join(qa, "bin");
let packageSource = resolve("release/package-qa/vantare-hub-ui-win32-x64");
let candidateProof:
  | {
      root: string;
      manifestSha256: string;
      asarSha256: string;
      hostSha256: string;
    }
  | undefined;
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
if (process.env.VANTARE_HUB_CANDIDATE_ROOT) {
  const root = requiredPath("VANTARE_HUB_CANDIDATE_ROOT");
  await readFile(join(root, "QA-ONLY.txt"));
  const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
  assert.match(state.active.generation, /^[a-f0-9]{32}$/);
  const generation = join(root, "generations", state.active.generation);
  const bytes = await readFile(join(generation, "manifest.json"));
  assert.equal(hash(bytes), state.active.manifest_sha256);
  const manifest = JSON.parse(bytes.toString());
  const member = (path: string) =>
    manifest.files.find((file: { path: string }) => file.path === path)?.sha256;
  packageSource = join(generation, "hub-ui");
  candidateProof = {
    root,
    manifestSha256: hash(bytes),
    asarSha256: member("hub-ui/resources/app.asar"),
    hostSha256: member("bin/vantare-hub.exe"),
  };
  assert.equal(
    hash(await readFile(requiredPath("VANTARE_HUB_HOST_BINARY"))),
    candidateProof.hostSha256,
  );
}
for (const name of ["native", "local", "roaming", "tmp", "bin", "native/hub"])
  await mkdir(join(qa, name), { recursive: true });
await writeFile(join(qa, "qa-e2e-owned"), "VANTA-126 qa-e2e fixture");
const clock = join(qa, "clock.json");
async function phase(value: string) {
  const now = Date.now();
  await writeFile(
    `${clock}.new`,
    JSON.stringify({
      wall_ms: now,
      real_anchor_ms: now,
      monotonic_ms: 0,
      phase: value,
      session: 47,
    }),
  );
  // Windows readers may briefly hold the previous clock; retry the atomic replacement.
  await until(
    async () => {
      try {
        await rename(`${clock}.new`, clock);
        return true;
      } catch {
        return false;
      }
    },
    5000,
    "atomic QA clock replacement",
  );
}
await phase("Waiting");
await cp(resolve("../testdata/lmu-fixture.bin"), join(qa, "replay.bin"));
for (const binary of [
  "vantare.exe",
  "vantare-core.exe",
  "vantare-services.exe",
])
  await cp(join(target, binary), join(bins, binary));
await cp(
  requiredPath("VANTARE_HUB_HOST_BINARY"),
  join(bins, "vantare-hub.exe"),
);
await cp(packageSource, join(qa, "hub-ui"), { recursive: true });
if (candidateProof) {
  assert.equal(
    hash(await readFile(join(bins, "vantare-hub.exe"))),
    candidateProof.hostSha256,
  );
  assert.equal(
    hash(await readFile(join(qa, "hub-ui/resources/app.asar"))),
    candidateProof.asarSha256,
  );
}
const overlay = join(qa, "overlay.ps1");
await writeFile(
  overlay,
  "param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Ignored)\n[Console]::OpenStandardInput().CopyTo([IO.Stream]::Null)\n",
);
const backend = createServer((_request, response) => {
  response.writeHead(503);
  response.end();
});
await new Promise<void>((accept) => backend.listen(0, "127.0.0.1", accept));
const address = backend.address();
if (!address || typeof address === "string")
  throw new Error("Loopback binding failed");
const endpoint = `http://127.0.0.1:${address.port}/`;
const env: Record<string, string> = {};
for (const name of [
  "SystemRoot",
  "SystemDrive",
  "WINDIR",
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "USERPROFILE",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "SESSIONNAME",
])
  if (process.env[name]) env[name] = process.env[name] as string;
Object.assign(env, {
  VANTARE_QA_ROOT: qa,
  VANTARE_QA_CLOCK: clock,
  VANTARE_NATIVE_DATA_ROOT: join(qa, "native"),
  LOCALAPPDATA: join(qa, "local"),
  APPDATA: join(qa, "roaming"),
  TEMP: join(qa, "tmp"),
  TMP: join(qa, "tmp"),
  VANTARE_QA_LICENSE_URL: endpoint,
  VANTARE_QA_IDP_URL: endpoint,
  VANTARE_QA_REDIRECT_URL: endpoint,
});
const instance = `hub-web-${randomBytes(8).toString("hex")}`;
const photo = `vantare-qa-${randomBytes(16).toString("hex")}`;
const supervisor = spawn(
  join(bins, "vantare.exe"),
  [
    "--overlays-bin",
    "C:/Program Files/PowerShell/7/pwsh.exe",
    "--instancia",
    instance,
    "--reinicios",
    "0",
    "--",
    "--replay",
    join(qa, "replay.bin"),
    "--build",
    "1.3.0.0",
    "--pipe",
    photo,
    "--",
    "-NoProfile",
    "-File",
    overlay,
    "--fuente",
    "qa",
    "--control-stdin",
  ],
  { env, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
);
// Keep diagnostics local; never copy arbitrary service replies into evidence.
supervisor.stderr.pipe(createWriteStream(join(qa, "supervisor.log")));
const host = spawn(
  join(bins, "vantare-hub.exe"),
  ["--control-stdin", "--pipe", photo, "--data-dir", join(qa, "native/hub")],
  {
    env: { ...env, VANTARE_HUB_UI: join(qa, "hub-ui/vantare-hub-ui.exe") },
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"],
  },
);
host.stderr.pipe(createWriteStream(join(qa, "host.log")));
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
try {
  let debug = "";
  await until(
    async () => {
      try {
        const log = await readFile(
          join(qa, "native/hub/hub-ui-qa.log"),
          "utf8",
        );
        debug = log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
      } catch {}
      return debug.length > 0;
    },
    60000,
    "QA Electron debugger",
  );
  browser = await chromium.connectOverCDP(debug);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page.waitForURL("app://hub/");
  await page.addInitScript(() => {
    window.addEventListener("message", (event) => {
      if (
        event.data !== "vantare:port" ||
        event.source !== window ||
        !event.ports[0]
      )
        return;
      event.ports[0].addEventListener(
        "message",
        ({ data }: MessageEvent<HostToUi>) => {
          if (data?.kind === "failure") {
            const target = window as unknown as {
              qaFailures?: { id: number; kind: string }[];
            };
            target.qaFailures ??= [];
            target.qaFailures.push({
              id: data.id,
              kind: data.error.kind,
            });
          }
          if (data?.kind === "event" && data.event.topic === "core")
            (window as unknown as { qaCore: CoreStatus }).qaCore =
              data.event.value;
        },
      );
    });
  });
  await page.reload();
  await until(
    async () => {
      const view = await page.evaluate(
        () => (window as unknown as { qaCore?: CoreStatus }).qaCore,
      );
      return (
        view?.photos === "connected" &&
        view.rights === "connected" &&
        view.services === "connected" &&
        !view.access.verified &&
        !view.access.blocked &&
        !view.access.tester &&
        !view.access.calendar &&
        !view.access.engineer &&
        !view.access.strategy
      );
    },
    20000,
    "real core and supervisor admission without authority grants",
  ).catch(async (error) => {
    const observed = await page.evaluate(
      () => (window as unknown as { qaCore?: CoreStatus }).qaCore,
    );
    await writeFile(
      join(evidence, "core-probe-failure.json"),
      JSON.stringify({
        observed,
        supervisorExit: supervisor.exitCode,
        hostExit: host.exitCode,
      }),
    );
    await page.screenshot({ path: join(evidence, "core-probe-failure.png") });
    throw error;
  });
  await page.screenshot({ path: join(evidence, "host-core-local.png") });
  if (process.env.VANTARE_HUB_PILOT_TEST === "1")
    await checkPilotCore(page, evidence);
  const system = await browser.newBrowserCDPSession();
  const electronPids = (
    await system.send("SystemInfo.getProcessInfo")
  ).processInfo.map((item) => item.id);
  await system.detach();
  await phase("Live");
  await until(() => host.exitCode !== null, 10000, "host closes on Live");
  assert.equal(host.exitCode, 0);
  const survivors = () =>
    electronPids.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
        throw error;
      }
    });
  await until(
    () => survivors().length === 0,
    10000,
    "zero candidate Electron processes in Live",
  );
  await writeFile(
    join(evidence, "core-smoke.json"),
    JSON.stringify(
      {
        passed: true,
        photos: "connected",
        rights: "connected",
        services: "connected",
        pilotSavedAndReopened: process.env.VANTARE_HUB_PILOT_TEST === "1",
        realSupervisorAdmission: true,
        realCoreAdmission: true,
        liveExit: 0,
        candidateProof,
        electronPidsBeforeLive: electronPids,
        electronPidsAfterLive: survivors(),
        backend: "loopback-only, unavailable; no account",
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => {});
  host.stdin.end();
  if (host.exitCode === null) host.kill();
  const stop = spawn(
    join(bins, "vantare.exe"),
    ["--parar", "--instancia", instance],
    { env, windowsHide: true, stdio: "ignore" },
  );
  await new Promise<void>((accept) => stop.once("exit", () => accept()));
  await until(() => supervisor.exitCode !== null, 10000, "QA supervisor stops");
  backend.close();
}
