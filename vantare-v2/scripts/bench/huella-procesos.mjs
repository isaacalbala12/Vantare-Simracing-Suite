import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function commandLineSwitch(commandLine, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(commandLine ?? "").match(
    new RegExp(`(?:^|\\s)--${escaped}=(?:"([^"]*)"|'([^']*)'|([^\\s]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

export function ownsWebViewProfile(commandLine, exeName) {
  const userDataDir = commandLineSwitch(commandLine, "user-data-dir");
  if (!userDataDir) return false;
  const normalized = path.win32.normalize(userDataDir).replace(/[\\/]+$/, "").toLowerCase();
  const expected = path.win32.join(String(exeName), "EBWebView").toLowerCase();
  return normalized.endsWith(expected);
}

export function isSystemWebViewProfile(commandLine) {
  const userDataDir = commandLineSwitch(commandLine, "user-data-dir");
  if (!userDataDir) return false;
  const normalized = path.win32.normalize(userDataDir).toLowerCase();
  return /\\appdata\\local\\packages\\microsoft[^\\]*\\/.test(normalized);
}

function hygieneRecord(processInfo) {
  const commandLine = String(processInfo.CommandLine ?? processInfo.commandLine ?? "");
  return {
    Name: String(processInfo.Name ?? processInfo.name ?? ""),
    ProcessId: Number(processInfo.ProcessId ?? processInfo.pid),
    ParentProcessId: Number(processInfo.ParentProcessId ?? processInfo.parentPid ?? 0),
    CommandLine: commandLine,
    userDataDir: commandLineSwitch(commandLine, "user-data-dir"),
  };
}

export function classifyHygieneProcesses(processes) {
  const systemWebView2 = [];
  const foreign = [];
  for (const processInfo of processes) {
    const record = hygieneRecord(processInfo);
    if (/^msedgewebview2\.exe$/i.test(record.Name) && isSystemWebViewProfile(record.CommandLine)) {
      systemWebView2.push(record);
    } else if (/^(?:msedge|msedgewebview2)\.exe$/i.test(record.Name) || /^vantare.*\.exe$/i.test(record.Name)) {
      foreign.push(record);
    }
  }
  return { systemWebView2, foreign };
}

export function parseVantareEtwSessions(text) {
  const sessions = new Map();
  for (const match of String(text ?? "").matchAll(/\b(VantareHuella-(\d+)-(\d{8}-\d{6}))\b/g)) {
    const [, name, pid, stamp] = match;
    sessions.set(name, { name, pid: Number(pid), stamp });
  }
  return [...sessions.values()];
}

export function classifyProcess(processInfo, options) {
  const pid = Number(processInfo.ProcessId ?? processInfo.pid);
  if (pid === Number(options.hostPid)) return "go-host";
  if (!/^msedgewebview2\.exe$/i.test(String(processInfo.Name ?? processInfo.name ?? ""))) return null;
  if (!ownsWebViewProfile(processInfo.CommandLine ?? processInfo.commandLine, options.exeName)) return null;

  const type = commandLineSwitch(processInfo.CommandLine ?? processInfo.commandLine, "type");
  if (!type) return "browser";
  if (type === "gpu-process") return "gpu-process";
  if (type === "renderer") return options.rendererRoles?.[pid] ?? "renderer-unassigned";
  if (type === "crashpad-handler") return "crashpad";
  return type === "utility" ? "utility" : type;
}

export function classifyProcesses(processes, options) {
  return processes.flatMap((processInfo) => {
    const role = classifyProcess(processInfo, options);
    if (!role) return [];
    return [{
      pid: Number(processInfo.ProcessId ?? processInfo.pid),
      parentPid: Number(processInfo.ParentProcessId ?? processInfo.parentPid ?? 0),
      role,
      name: String(processInfo.Name ?? processInfo.name ?? ""),
    }];
  });
}

function processCreationMs(processInfo) {
  const value = processInfo.CreationDate ?? processInfo.creationDate;
  const milliseconds = Date.parse(String(value ?? ""));
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function assignRendererRoles(processes, options) {
  const hubRendererIds = new Set((options.hubRendererIds ?? []).map(Number));
  const roles = Object.fromEntries([...hubRendererIds].map((pid) => [pid, "renderer-hub"]));
  const renderers = processes.filter((processInfo) =>
    /^msedgewebview2\.exe$/i.test(String(processInfo.Name ?? processInfo.name ?? ""))
      && commandLineSwitch(processInfo.CommandLine ?? processInfo.commandLine, "type") === "renderer");

  for (const processInfo of renderers) {
    const pid = Number(processInfo.ProcessId ?? processInfo.pid);
    if (!hubRendererIds.has(pid)) roles[pid] = "renderer-unassigned";
  }
  if (!options.overlayStarted) return { roles, overlayRendererPid: null, reason: "overlay-not-started" };

  const startedAt = Date.parse(String(options.activationStartedAt ?? ""));
  const readyAt = Date.parse(String(options.overlayReadyAt ?? ""));
  if (!Number.isFinite(startedAt) || !Number.isFinite(readyAt) || readyAt < startedAt) {
    return { roles, overlayRendererPid: null, reason: "invalid-activation-window" };
  }

  const candidates = renderers.filter((processInfo) => {
    const pid = Number(processInfo.ProcessId ?? processInfo.pid);
    const createdAt = processCreationMs(processInfo);
    return !hubRendererIds.has(pid) && createdAt !== null && createdAt >= startedAt && createdAt <= readyAt;
  });
  if (candidates.length === 0) return { roles, overlayRendererPid: null, reason: "no-renderer-in-window" };

  let selected = null;
  if (candidates.length === 1) {
    selected = candidates[0];
  } else {
    const cdpRendererIds = new Set((options.cdpRendererPids ?? []).map(Number));
    const confirmed = candidates.filter((processInfo) => cdpRendererIds.has(Number(processInfo.ProcessId ?? processInfo.pid)));
    const newestFirst = confirmed.sort((left, right) => processCreationMs(right) - processCreationMs(left));
    if (newestFirst.length === 1 || (newestFirst.length > 1 && processCreationMs(newestFirst[0]) > processCreationMs(newestFirst[1]))) {
      [selected] = newestFirst;
    }
  }
  if (!selected) return { roles, overlayRendererPid: null, reason: "ambiguous-renderers-in-window" };

  const overlayRendererPid = Number(selected.ProcessId ?? selected.pid);
  roles[overlayRendererPid] = "renderer-overlay";
  return { roles, overlayRendererPid, reason: candidates.length === 1 ? "single-renderer-in-window" : "newest-cdp-renderer-in-window" };
}

async function main() {
  const argument = (name, fallback = "") => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
  };
  const input = argument("input");
  const exeName = argument("exe-name");
  const hostPid = Number(argument("host-pid"));
  const rendererRolesRaw = argument("renderer-roles", "{}");
  if (process.argv.includes("--hygiene")) {
    process.stdin.setEncoding("utf8");
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const processes = JSON.parse(input);
    process.stdout.write(`${JSON.stringify(classifyHygieneProcesses(processes))}\n`);
    return;
  }
  if (process.argv.includes("--etw-sessions")) {
    process.stdin.setEncoding("utf8");
    let queryOutput = "";
    for await (const chunk of process.stdin) queryOutput += chunk;
    process.stdout.write(`${JSON.stringify(parseVantareEtwSessions(queryOutput))}\n`);
    return;
  }
  if (process.argv.includes("--assign-renderers")) {
    if (!input) throw new Error("--assign-renderers requires --input processes.json");
    const processes = JSON.parse(await readFile(input, "utf8"));
    const result = assignRendererRoles(processes, {
      hubRendererIds: JSON.parse(argument("hub-renderer-ids", "[]")),
      activationStartedAt: argument("activation-started-at"),
      overlayReadyAt: argument("overlay-ready-at"),
      cdpRendererPids: JSON.parse(argument("cdp-renderer-pids", "[]")),
      overlayStarted: argument("overlay-started", "false") === "true",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (!input || !exeName || !Number.isInteger(hostPid)) {
    throw new Error("usage: node huella-procesos.mjs --input processes.json --exe-name app.exe --host-pid 123 [--renderer-roles JSON]");
  }
  const processes = JSON.parse(await readFile(input, "utf8"));
  const rendererRoles = JSON.parse(rendererRolesRaw);
  process.stdout.write(`${JSON.stringify(classifyProcesses(processes, { exeName, hostPid, rendererRoles }))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
