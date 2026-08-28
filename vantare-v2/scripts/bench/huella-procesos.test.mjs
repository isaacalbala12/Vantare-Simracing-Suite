import assert from "node:assert/strict";
import test from "node:test";
import { classifyProcesses, commandLineSwitch, ownsWebViewProfile } from "./huella-procesos.mjs";

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
