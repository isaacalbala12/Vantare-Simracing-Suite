import { describe, expect, it } from "vitest";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  normalizeLocale,
  translate,
  type Locale,
} from "./i18n";
import { es } from "./locales/es";
import { en } from "./locales/en";
import { pt } from "./locales/pt";
import { it as itLocale } from "./locales/it";

describe("i18n pure module", () => {
  describe("SUPPORTED_LOCALES and DEFAULT_LOCALE", () => {
    it("supports exactly es, en, pt, it", () => {
      expect(SUPPORTED_LOCALES).toEqual(["es", "en", "pt", "it"]);
    });

    it("default locale is es", () => {
      expect(DEFAULT_LOCALE).toBe("es");
    });
  });

  describe("isLocale", () => {
    it("returns true for valid locales", () => {
      expect(isLocale("es")).toBe(true);
      expect(isLocale("en")).toBe(true);
      expect(isLocale("pt")).toBe(true);
      expect(isLocale("it")).toBe(true);
    });

    it("returns false for invalid locales", () => {
      expect(isLocale("fr")).toBe(false);
      expect(isLocale("")).toBe(false);
      expect(isLocale("ES")).toBe(false);
      expect(isLocale("english")).toBe(false);
    });
  });

  describe("normalizeLocale", () => {
    it("returns the locale if valid", () => {
      expect(normalizeLocale("es")).toBe("es");
      expect(normalizeLocale("en")).toBe("en");
    });

    it("returns DEFAULT_LOCALE for invalid input", () => {
      expect(normalizeLocale("fr")).toBe(DEFAULT_LOCALE);
      expect(normalizeLocale("")).toBe(DEFAULT_LOCALE);
      expect(normalizeLocale("ES")).toBe(DEFAULT_LOCALE);
      expect(normalizeLocale("xyz")).toBe(DEFAULT_LOCALE);
    });
  });

  describe("translate", () => {
    it("translates a key in the requested locale", () => {
      const result = translate("en", "onboarding.welcome");
      expect(result).toBe("Welcome to Vantare");
    });

    it("translates the same key in Spanish", () => {
      const result = translate("es", "onboarding.welcome");
      expect(result).toBe("Bienvenido a Vantare");
    });

    it("falls back to es when locale is invalid", () => {
      const result = translate("fr" as Locale, "onboarding.welcome");
      expect(result).toBe("Bienvenido a Vantare");
    });

    it("falls back to the key itself when translation is missing", () => {
      const result = translate("en", "nonexistent.key");
      expect(result).toBe("nonexistent.key");
    });
  });

  describe("locale key parity", () => {
    const locales = { es, en, pt, it: itLocale } as const;

    it("all locales have exactly the same keys", () => {
      const esKeys = Object.keys(es).sort();
      const enKeys = Object.keys(en).sort();
      const ptKeys = Object.keys(pt).sort();
      const itKeys = Object.keys(itLocale).sort();

      expect(enKeys).toEqual(esKeys);
      expect(ptKeys).toEqual(esKeys);
      expect(itKeys).toEqual(esKeys);
    });

    it("all locale values are non-empty strings", () => {
      for (const [locale, dict] of Object.entries(locales)) {
        for (const [key, value] of Object.entries(dict)) {
          expect(typeof value).toBe("string");
          expect((value as string).length).toBeGreaterThan(0);
          if (!(value as string).trim()) {
            throw new Error(`Empty value for ${locale}.${key}`);
          }
        }
      }
    });
  });

  describe("onboarding translations", () => {
    it("has welcome in all locales", () => {
      expect(es["onboarding.welcome"]).toBe("Bienvenido a Vantare");
      expect(en["onboarding.welcome"]).toBe("Welcome to Vantare");
      expect(pt["onboarding.welcome"]).toBe("Bem-vindo ao Vantare");
      expect(itLocale["onboarding.welcome"]).toBe("Benvenuto in Vantare");
    });

    it("has choose simulator in all locales", () => {
      expect(es["onboarding.chooseSimulator"]).toBeTruthy();
      expect(en["onboarding.chooseSimulator"]).toBeTruthy();
      expect(pt["onboarding.chooseSimulator"]).toBeTruthy();
      expect(itLocale["onboarding.chooseSimulator"]).toBeTruthy();
    });

    it("has choose recommended profile in all locales", () => {
      expect(es["onboarding.chooseRecommended"]).toBeTruthy();
      expect(en["onboarding.chooseRecommended"]).toBeTruthy();
      expect(pt["onboarding.chooseRecommended"]).toBeTruthy();
      expect(itLocale["onboarding.chooseRecommended"]).toBeTruthy();
    });
  });

  describe("settings translations", () => {
    it("has settings title in all locales", () => {
      expect(es["settings.title"]).toBe("Ajustes");
      expect(en["settings.title"]).toBe("Settings");
      expect(pt["settings.title"]).toBeTruthy();
      expect(itLocale["settings.title"]).toBeTruthy();
    });

    it("has tab labels in all locales", () => {
      expect(es["settings.tab.account"]).toBe("Cuenta");
      expect(en["settings.tab.account"]).toBe("Account");
      expect(es["settings.tab.updates"]).toBe("Actualizaciones");
      expect(en["settings.tab.updates"]).toBe("Updates");
    });
  });

  describe("launcher v2 translations (Task 3.4)", () => {
  // Keys añadidas en corte 3 del plan launcher-v2
  const NEW_KEYS = [
    "launcher.favorite",
    "launcher.notes",
    "launcher.modal.addNonSteam.title",
    "launcher.modal.addNonSteam.search",
    "launcher.modal.addNonSteam.browse",
    "launcher.modal.addNonSteam.moreResults",
  ];

  it("new launcher keys are present in all 4 locales", () => {
    for (const dict of [es, en, pt, itLocale]) {
      for (const key of NEW_KEYS) {
        expect(dict[key]).toBeTruthy();
        expect(typeof dict[key]).toBe("string");
        expect(dict[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("launcher.modal.addNonSteam.moreResults contains {n} placeholder", () => {
    expect(es["launcher.modal.addNonSteam.moreResults"]).toContain("{n}");
    expect(en["launcher.modal.addNonSteam.moreResults"]).toContain("{n}");
    expect(pt["launcher.modal.addNonSteam.moreResults"]).toContain("{n}");
    expect(itLocale["launcher.modal.addNonSteam.moreResults"]).toContain("{n}");
  });
});

describe("launcher v2 translations (Task 7.4)", () => {
  // Keys añadidas en corte 7 del plan launcher-v2
  const NEW_KEYS = [
    "launcher.chain.states.pending",
    "launcher.chain.states.launching",
    "launcher.chain.states.done",
    "launcher.chain.states.failed",
    "launcher.chain.states.cancelled",
    "launcher.autostart",
    "launcher.hotkey",
    "launcher.appDetails.path",
    "launcher.appDetails.args",
    "launcher.toast.success",
    "launcher.toast.partial",
    "launcher.toast.error",
    "launcher.toast.retry",
  ];

  it("new cut 7 launcher keys are present in all 4 locales", () => {
    for (const dict of [es, en, pt, itLocale]) {
      for (const key of NEW_KEYS) {
        expect(dict[key]).toBeTruthy();
        expect(typeof dict[key]).toBe("string");
        expect(dict[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("launcher.profile.unlaunchable is present and updated in all 4 locales", () => {
    expect(es["launcher.profile.unlaunchable"]).toBe("Perfil no lanzable");
    expect(en["launcher.profile.unlaunchable"]).toBe("Profile not launchable");
    expect(pt["launcher.profile.unlaunchable"]).toBe("Perfil não lançável");
    expect(itLocale["launcher.profile.unlaunchable"]).toBe("Profilo non avviabile");
  });
});

describe("widget studio translations", () => {
    it("has widget studio shell labels", () => {
      expect(es["studio.widgets"]).toBe("Widgets");
      expect(en["studio.widgets"]).toBe("Widgets");
      expect(es["studio.save"]).toBe("Guardar");
      expect(en["studio.save"]).toBe("Save");
    });

    it("has overlay list labels", () => {
      expect(es["studio.overlays"]).toBe("Overlays");
      expect(en["studio.overlays"]).toBe("Overlays");
      expect(es["studio.filterAll"]).toBe("Todos");
      expect(en["studio.filterAll"]).toBe("All");
      expect(es["studio.filterActive"]).toBe("Activos");
      expect(en["studio.filterActive"]).toBe("Active");
    });

    it("has overlay controls labels", () => {
      expect(es["studio.overlayControls"]).toBe("Controles del Overlay");
      expect(en["studio.overlayControls"]).toBe("Overlay Controls");
      expect(es["studio.overview"]).toBe("Resumen");
      expect(en["studio.overview"]).toBe("Overview");
    });
  });
});
