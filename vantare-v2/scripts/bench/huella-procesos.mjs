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

async function main() {
  const argument = (name, fallback = "") => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
  };
  const input = argument("input");
  const exeName = argument("exe-name");
  const hostPid = Number(argument("host-pid"));
  const rendererRolesRaw = argument("renderer-roles", "{}");
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
