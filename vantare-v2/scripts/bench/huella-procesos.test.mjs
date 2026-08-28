import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { classifyHygieneProcesses, classifyProcesses, commandLineSwitch, isSystemWebViewProfile, ownsWebViewProfile } from "./huella-procesos.mjs";

const ownProfile = String.raw`C:\Users\isaac\AppData\Roaming\vantare-isa924.exe\EBWebView`;
const browser = String.raw`"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\151.0.4129.107\msedgewebview2.exe" --embedded-browser-webview=1 --webview-exe-name=vantare-isa924.exe --user-data-dir="${ownProfile}" --remote-debugging-port=9247`;
const renderer = `${browser} --type=renderer --renderer-client-id=6`;
const foreign = String.raw`"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\151.0.4129.107\msedgewebview2.exe" --type=gpu-process --user-data-dir="C:\Users\isaac\AppData\Local\Packages\MicrosoftWindows.Client.CBS_x\LocalState\EBWebView"`;

test("extrae switches citados de líneas WebView2 reales", () => {
  assert.equal(commandLineSwitch(renderer, "user-data-dir"), ownProfile);
  assert.equal(commandLineSwitch(renderer, "type"), "renderer");
});

test("identifica únicamente el perfil EBWebView del ejecutable propio", () => {
  assert.equal(ownsWebViewProfile(renderer, "vantare-isa924.exe"), true);
  assert.equal(ownsWebViewProfile(foreign, "vantare-isa924.exe"), false);
});

test("clasifica host y árbol WebView2, con roles renderer observados", () => {
  const processes = [
    { Name: "vantare-isa924.exe", ProcessId: 4100, ParentProcessId: 1, CommandLine: "" },
    { Name: "msedgewebview2.exe", ProcessId: 4200, ParentProcessId: 4100, CommandLine: browser },
    { Name: "msedgewebview2.exe", ProcessId: 4300, ParentProcessId: 4200, CommandLine: `${browser} --type=gpu-process` },
    { Name: "msedgewebview2.exe", ProcessId: 4400, ParentProcessId: 4200, CommandLine: renderer },
    { Name: "msedgewebview2.exe", ProcessId: 4500, ParentProcessId: 4200, CommandLine: foreign },
  ];
  assert.deepEqual(
    classifyProcesses(processes, { exeName: "vantare-isa924.exe", hostPid: 4100, rendererRoles: { 4400: "renderer-overlay" } })
      .map(({ pid, role }) => ({ pid, role })),
    [
      { pid: 4100, role: "go-host" },
      { pid: 4200, role: "browser" },
      { pid: 4300, role: "gpu-process" },
      { pid: 4400, role: "renderer-overlay" },
    ],
  );
});

test("allow-list solo para perfiles WebView2 de paquetes Microsoft del sistema", async () => {
  const processes = JSON.parse(await readFile(new URL("testdata/hygiene-processes.json", import.meta.url), "utf8"));
  const classified = classifyHygieneProcesses(processes);

  assert.equal(isSystemWebViewProfile(processes[0].CommandLine), true);
  assert.deepEqual(classified.systemWebView2.map(({ ProcessId, userDataDir }) => ({ ProcessId, userDataDir })), [{
    ProcessId: 10468,
    userDataDir: String.raw`C:\Users\isaac\AppData\Local\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\LocalState\EBWebView`,
  }]);
  assert.deepEqual(classified.foreign.map(({ Name, ProcessId }) => ({ Name, ProcessId })), [
    { Name: "msedgewebview2.exe", ProcessId: 30380 },
    { Name: "vantare-review937.exe", ProcessId: 22468 },
    { Name: "msedge.exe", ProcessId: 26216 },
  ]);
});

test("la CLI de higiene consume los fixtures por stdin", async () => {
  const input = await readFile(new URL("testdata/hygiene-processes.json", import.meta.url), "utf8");
  const helperPath = fileURLToPath(new URL("huella-procesos.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [helperPath, "--hygiene"], { input, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const classified = JSON.parse(result.stdout);
  assert.equal(classified.systemWebView2.length, 1);
  assert.equal(classified.foreign.length, 3);
});
