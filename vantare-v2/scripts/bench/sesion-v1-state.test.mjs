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
