import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_V3_I18N_KEYS, studioV3Es } from "../../i18n/locales/studio-v3/es";
import { studioV3En } from "../../i18n/locales/studio-v3/en";
import { studioV3Pt } from "../../i18n/locales/studio-v3/pt";
import { studioV3It } from "../../i18n/locales/studio-v3/it";
import { es } from "../../i18n/locales/es";
import { en } from "../../i18n/locales/en";
import { pt } from "../../i18n/locales/pt";
import { it as itLocale } from "../../i18n/locales/it";

const STUDIO_V3_LOCALES = {
  es: studioV3Es,
  en: studioV3En,
  pt: studioV3Pt,
  it: studioV3It,
} as const;

const OVERLAY_STUDIO_ROOT = join(__dirname);

const SPANISH_BOUNDARY_PATTERN = /["'`]([^"'`]*[áéíóúñ¿¡][^"'`]*)["'`]/;

const BOUNDARY_ALLOWLIST = new Set([
  "vantare-original",
  "vantare-crystal",
  "practice",
  "qualifying",
  "race",
  "warmup",
  "endurance",
  "track",
  "pits",
  "Mock",
  "Live",
  "Fit",
  "Reset",
  "Browser View",
  "OBS",
  "Layout",
  "Inspector",
  "Overlay Studio",
  "LMU",
]);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "__snapshots__") {
        continue;
      }
      collectSourceFiles(fullPath, acc);
      continue;
    }
    if (/\.(tsx?)$/.test(entry) && !/\.test\.(tsx?)$/.test(entry)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

describe("overlay studio v3 i18n", () => {
  describe("studio.v3 key parity", () => {
    it("all studio-v3 locale modules share the same keys", () => {
      const esKeys = Object.keys(studioV3Es).sort();
      expect(Object.keys(studioV3En).sort()).toEqual(esKeys);
      expect(Object.keys(studioV3Pt).sort()).toEqual(esKeys);
      expect(Object.keys(studioV3It).sort()).toEqual(esKeys);
      expect(STUDIO_V3_I18N_KEYS).toEqual(esKeys);
    });

    it("merged app locales expose every studio.v3 key", () => {
      for (const key of STUDIO_V3_I18N_KEYS) {
        expect(es[key]).toBeTruthy();
        expect(en[key]).toBeTruthy();
        expect(pt[key]).toBeTruthy();
        expect(itLocale[key]).toBeTruthy();
      }
    });

    it("studio.v3 values are non-empty in all locales", () => {
      for (const [locale, dict] of Object.entries(STUDIO_V3_LOCALES)) {
        for (const [key, value] of Object.entries(dict)) {
          expect(typeof value).toBe("string");
          expect(value.length).toBeGreaterThan(0);
          if (!value.trim()) {
            throw new Error(`Empty studio.v3 value for ${locale}.${key}`);
          }
        }
      }
    });
  });

  describe("overlay-studio Spanish literal boundary", () => {
    it("production overlay-studio sources do not hardcode Spanish UI literals", () => {
      const offenders: string[] = [];
      const files = collectSourceFiles(OVERLAY_STUDIO_ROOT).filter(
        (file) => !file.endsWith("studio-v3-i18n.ts"),
      );

      for (const file of files) {
        const source = readFileSync(file, "utf8");
        const match = source.match(SPANISH_BOUNDARY_PATTERN);
        if (!match) {
          continue;
        }
        const literal = match[1]?.trim() ?? "";
        if (!literal || BOUNDARY_ALLOWLIST.has(literal)) {
          continue;
        }
        if (literal.startsWith("studio.v3.")) {
          continue;
        }
        offenders.push(`${file.replace(OVERLAY_STUDIO_ROOT, "")}: ${literal}`);
      }

      expect(offenders).toEqual([]);
    });
  });
});