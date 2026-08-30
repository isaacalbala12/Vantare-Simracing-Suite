import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const benchDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixturePath = fileURLToPath(
  new URL("./testdata/sesion-state-without-transport.json", import.meta.url),
);
const parserPath = fileURLToPath(new URL("./sesion-v1-state.ps1", import.meta.url));

test("tolera targets CDP sin overlay_v2_transport ni propiedades opcionales", () => {
  const script = [
    `. '${parserPath.replaceAll("'", "''")}'`,
    `$capture = Get-Content -LiteralPath '${fixturePath.replaceAll("'", "''")}' -Raw | ConvertFrom-Json`,
    `@(ConvertTo-SessionCdpTargets -Capture $capture) | ConvertTo-Json -Depth 5 -Compress`,
  ].join("; ");

  const output = execFileSync("pwsh", ["-NoProfile", "-Command", script], {
    cwd: benchDirectory,
    encoding: "utf8",
  });
  const targets = JSON.parse(output);

  assert.equal(targets.length, 3);
  assert.deepEqual(targets[0], {
    surface: "hub",
    role: "hub",
    url: "http://localhost/",
    title: "Vantare",
    widgetCount: 0,
    screenshot: null,
    transport: null,
  });
  assert.equal(targets[1].surface, "desktop");
  assert.equal(targets[1].transport, null);
  assert.deepEqual(targets[2], {
    surface: "",
    role: "",
    url: "",
    title: "",
    widgetCount: 0,
    screenshot: null,
    transport: null,
  });
});

test("añade screenshots finales aunque la lista de destino empiece vacía", () => {
  const script = [
    `. '${parserPath.replaceAll("'", "''")}'`,
    `$capture = [pscustomobject]@{ targets = @([pscustomobject]@{ screenshot = 'final/overlay.png' }, [pscustomobject]@{}) }`,
    `$initial = [Collections.Generic.List[string]]::new()`,
    `$final = [Collections.Generic.List[string]]::new()`,
    `Add-SessionScreenshotPaths -Capture $capture -Destination $final`,
    `[pscustomobject]@{ initial = @($initial); final = @($final) } | ConvertTo-Json -Compress`,
  ].join("; ");

  const output = execFileSync("pwsh", ["-NoProfile", "-Command", script], {
    cwd: benchDirectory,
    encoding: "utf8",
  });

  assert.deepEqual(JSON.parse(output), { initial: [], final: ["final/overlay.png"] });
});

test("el dry-run conserva expectedWindows como array aunque S1 tenga una sola clase", () => {
  const collectorPath = fileURLToPath(new URL("./sesion-v1.ps1", import.meta.url));
  const output = execFileSync("pwsh", [
    "-NoProfile", "-File", collectorPath,
    "-Sesion", "S1", "-Fase", "off", "-Duracion", "20",
    "-Exe", "bin/dry-run.exe", "-Puerto", "19455", "-DryRun",
  ], {cwd: benchDirectory, encoding: "utf8"});

  assert.deepEqual(JSON.parse(output).expectedWindows, ["desktop"]);
});

test("el dry-run permite aislar el coste del polling CDP sin quitar checkpoints", () => {
  const collectorPath = fileURLToPath(new URL("./sesion-v1.ps1", import.meta.url));
  const output = execFileSync("pwsh", [
    "-NoProfile", "-File", collectorPath,
    "-Sesion", "S1", "-Fase", "off", "-Duracion", "20",
    "-Exe", "bin/dry-run.exe", "-Puerto", "19456", "-EstadoCada", "0", "-DryRun",
  ], {cwd: benchDirectory, encoding: "utf8"});

  const plan = JSON.parse(output);
  assert.equal(plan.statePollSeconds, 0);
  assert.equal(plan.cdpCheckpointSeconds, 300);
});

test("el diagnostico de memoria admite 10 minutos solo en S1 sin polling y declara el dist", () => {
  const collectorPath = fileURLToPath(new URL("./sesion-v1.ps1", import.meta.url));
  const output = execFileSync("pwsh", [
    "-NoProfile", "-File", collectorPath,
    "-Sesion", "S1", "-Fase", "off", "-Duracion", "10",
    "-Exe", "bin/dry-run.exe", "-Dist", "frontend/dist-external",
    "-Puerto", "19457", "-EstadoCada", "0", "-DiagnosticoMemoria", "-DryRun",
  ], {cwd: benchDirectory, encoding: "utf8"});

  const plan = JSON.parse(output);
  assert.equal(plan.memoryDiagnostic, true);
  assert.equal(plan.statePollSeconds, 0);
  assert.match(plan.dist, /frontend[\\/]dist-external$/);
});

test("el diagnostico de memoria falla cerrado fuera de S1 o con polling de estado", () => {
  const collectorPath = fileURLToPath(new URL("./sesion-v1.ps1", import.meta.url));
  for (const args of [
    ["-Sesion", "S2", "-EstadoCada", "0"],
    ["-Sesion", "S1", "-EstadoCada", "5"],
  ]) {
    assert.throws(() => execFileSync("pwsh", [
      "-NoProfile", "-File", collectorPath,
      ...args, "-Fase", "off", "-Duracion", "10",
      "-Exe", "bin/dry-run.exe", "-Puerto", "19458", "-DiagnosticoMemoria", "-DryRun",
    ], {cwd: benchDirectory, encoding: "utf8", stdio: "pipe"}));
  }
});
