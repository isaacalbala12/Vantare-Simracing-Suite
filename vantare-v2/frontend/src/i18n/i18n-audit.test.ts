import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "..", "..");

/**
 * El auditor (`scripts/i18n-audit.mjs`) es la red que impide que los catálogos
 * vuelvan a degradarse: paridad es/en/pt/it en cada grupo, ninguna clave usada
 * sin traducir y ninguna clave huérfana. Se ejecuta aquí para que `pnpm test`
 * y la CI fallen igual que `pnpm i18n:audit`.
 */
describe("i18n audit", () => {
  it("keeps es/en/pt/it in parity with no missing or orphan keys", () => {
    const output = execFileSync(
      process.execPath,
      [path.join("scripts", "i18n-audit.mjs")],
      { cwd: frontendRoot, encoding: "utf8" },
    );

    expect(output).toContain("Paridad: OK");
    expect(output).toContain("Claves usadas ausentes: 0");
    expect(output).toContain("Claves huérfanas conservadoras: 0");
  }, 120_000);
});
