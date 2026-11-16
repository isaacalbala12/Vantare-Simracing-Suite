import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// The TypeScript 7 compiler is a native child process. Spawning it inside the
// test spent its 20 s budget on a cold process under load (#2486), so compile
// once while this file loads and assert the result.
function compileFixtures() {
  const generated = readFileSync(
    new URL("../src/contract/generated/settings.ts", import.meta.url),
    "utf8",
  );
  const guard = generated
    .split("\n")
    .find((line) => line.startsWith("export const fieldsCoverContract:"));
  expect(guard).toBeDefined();
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
      { cwd: root, encoding: "utf8" },
    );
    return {
      error: result.error,
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      errors: (result.stdout ?? "")
        .split("\n")
        .filter((line) => line.includes("error TS")),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const compiled = compileFixtures();

it("rejects both missing fields and fields outside the contract at compile time", () => {
  expect(compiled.error).toBeUndefined();
  expect(compiled.status, compiled.output).not.toBe(0);
  expect(compiled.errors).toHaveLength(2);
  expect(
    compiled.errors.some(
      (line) => line.includes("missing.ts") && line.includes("TS2322"),
    ),
  ).toBe(true);
  expect(
    compiled.errors.some(
      (line) => line.includes("extra.ts") && line.includes("TS2322"),
    ),
  ).toBe(true);
}, 20000);
