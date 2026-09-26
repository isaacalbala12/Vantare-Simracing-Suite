import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shellOrbitEs } from "../../i18n/locales/shell-orbit/es";
import { shellOrbitEn } from "../../i18n/locales/shell-orbit/en";
import { shellOrbitIt } from "../../i18n/locales/shell-orbit/it";
import { shellOrbitPt } from "../../i18n/locales/shell-orbit/pt";

/**
 * Contrato backend→frontend (ISA-901): el centro publica registros con
 * `titleKey`/`textKey` que la UI resuelve dinámicamente (`t(record.titleKey)`),
 * así que el auditor estático no las ve usadas. Esta lista declara las claves
 * que `cmd/vantare/notify_center.go` puede emitir; el test cruza ambos lados:
 * ninguna clave emitida por Go falta en el catálogo y ninguna declarada aquí
 * deja de emitirse en Go.
 */
const EMITTED_RECORD_KEYS = [
  "notifications.record.launcher.finished.title",
  "notifications.record.launcher.finished.text",
  "notifications.record.launcher.failed.title",
  "notifications.record.launcher.failed.text",
  "notifications.record.updater.available.title",
  "notifications.record.updater.available.text",
  "notifications.record.updater.error.title",
  "notifications.record.updater.installed.title",
  "notifications.record.system.test.title",
  "notifications.record.system.test.sent",
  "notifications.record.system.test.failed",
] as const;

function goEmittedKeys(): string[] {
  const source = readFileSync(
    path.join(__dirname, "../../../../cmd/vantare/notify_center.go"),
    "utf8",
  );
  return [...new Set(source.match(/notifications\.record\.[a-z0-9.]+/g) ?? [])].sort();
}

describe("notification center record keys", () => {
  it("la lista declarada cubre exactamente lo que emite el backend", () => {
    expect([...EMITTED_RECORD_KEYS].sort()).toEqual(goEmittedKeys());
  });

  it.each(EMITTED_RECORD_KEYS)("existe %s en los cuatro catálogos", (key) => {
    for (const catalog of [shellOrbitEs, shellOrbitEn, shellOrbitIt, shellOrbitPt]) {
      expect(catalog[key], `falta ${key} en un catálogo`).toBeTruthy();
    }
  });
});
