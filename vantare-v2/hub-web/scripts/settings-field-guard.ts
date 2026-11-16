import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The TypeScript 7 compiler is a native child process. Measured on the shared
// server: 156-209 ms alone, 9 797 ms with a renderer build running and
// 21 374 ms during a full suite pass (#2486), so the deadline is explicit here
// instead of borrowing a unit-test timeout.
const deadline = 60_000;

const generated = readFileSync(
  new URL("../src/contract/generated/settings.ts", import.meta.url),
  "utf8",
);
const guard = generated
  .split("\n")
  .find((line) => line.startsWith("export const fieldsCoverContract:"));
assert.ok(guard, "settings.ts is missing fieldsCoverContract");

const root = mkdtempSync(join(tmpdir(), "vantare-field-guard-"));
try {
  const fixtures = {
    matching: '["known"]',
    missing: "[]",
    extra: '["known", "unknown"]',
  };
  for (const [name, fields] of Object.entries(fixtures)) {
    writeFileSync(
      join(root, `${name}.ts`),
      `export {};\ntype SettingsPatch = {field:"known"};\nconst settingsFields = ${fields} as const;\n${guard}\n`,
    );
  }
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/typescript/bin/tsc", import.meta.url),
      ),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--pretty",
      "false",
      ...Object.keys(fixtures).map((name) => `${name}.ts`),
    ],
    { cwd: root, encoding: "utf8", timeout: deadline },
  );
  assert.equal(
    result.error,
    undefined,
    `TypeScript did not finish within ${deadline} ms: ${result.error?.message}`,
  );
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(
    result.status,
    0,
    "The guard compiled clean; missing.ts and extra.ts must be rejected",
  );
  const errors = (result.stdout ?? "")
    .split("\n")
    .filter((line) => line.includes("error TS"));
  assert.equal(
    errors.length,
    2,
    `Expected two contract errors, got ${errors.length}:\n${output}`,
  );
  assert.ok(
    errors.some(
      (line) => line.includes("missing.ts") && line.includes("TS2322"),
    ),
    `missing.ts did not reject the empty field list:\n${output}`,
  );
  assert.ok(
    errors.some((line) => line.includes("extra.ts") && line.includes("TS2322")),
    `extra.ts did not reject the unknown field:\n${output}`,
  );
  console.log(
    `Settings field guard verified: ${errors.length} errors (missing.ts, extra.ts).`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
