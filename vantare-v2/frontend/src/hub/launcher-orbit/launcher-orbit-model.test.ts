import { describe, expect, it } from "vitest";
import type {
  LauncherActiveChain,
  LauncherApp,
  LaunchProfile,
} from "../launcher/launcher-contract";
import {
  appCatalogState,
  chainSteps,
  detectedCount,
  favoriteApps,
  hotkeyKeys,
  isCustomApp,
  orderCatalogApps,
  lastLaunchedAt,
  orderProfiles,
  policyChips,
  profileInitials,
  toOrbitApp,
} from "./launcher-orbit-model";

function app(id: string, patch: Partial<LauncherApp> = {}): LauncherApp {
  return {
    id,
    displayName: id.toUpperCase(),
    abbreviation: id.slice(0, 3).toUpperCase(),
    category: "utility",
    launchMethod: "executable",
    availability: { catalogued: true, found: false, installed: false, launchable: false },
    gradientFrom: "#111111",
    gradientTo: "#222222",
    ...patch,
  };
}

describe("launcher orbit · catálogo", () => {
  it("presenta como catálogo lo que la detección no ha encontrado", () => {
    expect(appCatalogState(app("lmu"))).toBe("catalog");
  });

  it("distingue detectada de instalada por `availability`", () => {
    const found = app("obs", {
      availability: { catalogued: true, found: true, installed: false, launchable: true },
    });
    const installed = app("obs", {
      availability: { catalogued: true, found: true, installed: true, launchable: true },
    });
    expect(appCatalogState(found)).toBe("detected");
    expect(appCatalogState(installed)).toBe("installed");
  });

  it("cuenta como detectadas todas las que no están en estado catálogo", () => {
    const apps = [
      app("a"),
      app("b", {
        availability: { catalogued: true, found: true, installed: false, launchable: true },
      }),
      app("c", {
        availability: { catalogued: true, found: true, installed: true, launchable: true },
      }),
    ];
    expect(detectedCount(apps)).toBe(2);
  });

  it("lleva el degradado del contrato al monograma", () => {
    const orbit = toOrbitApp(app("lmu", { gradientFrom: "#f04755", gradientTo: "#77162c" }));
    expect(orbit.g1).toBe("#f04755");
    expect(orbit.g2).toBe("#77162c");
    expect(orbit.methodKey).toBe("launcher.method.executable");
  });

  it("rotula el método Steam a partir de `steam-uri`", () => {
    expect(toOrbitApp(app("lmu", { launchMethod: "steam-uri" })).methodKey).toBe(
      "launcher.method.steam",
    );
  });
});

describe("launcher orbit · cadena", () => {
  const apps = [
    app("lmu", { displayName: "Le Mans Ultimate", abbreviation: "LMU" }),
    app("obs", { displayName: "OBS Studio", abbreviation: "OBS" }),
  ];
  const profile: LaunchProfile = {
    id: "creator",
    name: "Creador de Contenido",
    steps: [
      { appId: "lmu", delay: 0 },
      { appId: "obs", delay: 2 },
    ],
  };

  it("respeta el orden y las esperas declaradas del perfil", () => {
    const steps = chainSteps(profile, apps);
    expect(steps.map((step) => step.appId)).toEqual(["lmu", "obs"]);
    expect(steps.map((step) => step.delay)).toEqual([0, 2]);
    expect(steps[0].name).toBe("Le Mans Ultimate");
  });

  it("cae a un paso legible cuando la app ya no está en el catálogo", () => {
    const orphan = chainSteps({ ...profile, steps: [{ appId: "moteC", delay: 1 }] }, apps);
    expect(orphan[0].abbreviation).toBe("MOT");
    expect(orphan[0].name).toBe("moteC");
  });

  it("refleja el estado real de cada paso de la cadena activa", () => {
    const chain: LauncherActiveChain = {
      profileId: "creator",
      status: "running",
      steps: [
        { appId: "lmu", status: "done" },
        { appId: "obs", status: "launching" },
      ],
    };
    expect(chainSteps(profile, apps, chain).map((step) => step.status)).toEqual([
      "ready",
      "launching",
    ]);
  });

  it("marca en rojo el paso fallido y deja pendiente lo que no ha empezado", () => {
    const chain: LauncherActiveChain = {
      profileId: "creator",
      status: "failed",
      steps: [{ appId: "lmu", status: "failed" }],
    };
    expect(chainSteps(profile, apps, chain).map((step) => step.status)).toEqual([
      "failed",
      "pending",
    ]);
  });
});

describe("launcher orbit · políticas y metadatos", () => {
  it("traduce las tres políticas visibles del perfil", () => {
    expect(
      policyChips({
        alreadyRunning: "reuse",
        failure: "continue",
        cancel: "ask",
        exit: "leave",
        retry: "failed",
        maxRetries: 2,
      }),
    ).toEqual([
      { key: "launcher.profile.policy.reuse" },
      { key: "launcher.profile.policy.retry", params: { n: 2 } },
      { key: "launcher.profile.policy.leave" },
    ]);
  });

  it("usa reiniciar, detener y cerrar lanzadas cuando el perfil lo declara", () => {
    expect(
      policyChips({
        alreadyRunning: "restart",
        failure: "stop",
        cancel: "ask",
        exit: "close-started",
        retry: "failed",
        maxRetries: 0,
      }).map((chip) => chip.key),
    ).toEqual([
      "launcher.profile.policy.restart",
      "launcher.profile.policy.stop",
      "launcher.profile.policy.closeStarted",
    ]);
  });

  it("no pinta chips para políticas sin decidir ni para perfiles sin políticas", () => {
    expect(policyChips(undefined)).toEqual([]);
    expect(
      policyChips({
        alreadyRunning: "ask",
        failure: "ask",
        cancel: "ask",
        exit: "ask",
        retry: "ask",
        maxRetries: 0,
      }),
    ).toEqual([]);
  });

  it("pone el favorito el primero", () => {
    const plain: LaunchProfile = { id: "a", name: "A", steps: [] };
    const fav: LaunchProfile = { id: "b", name: "B", steps: [], isFavorite: true };
    expect(orderProfiles([plain], [fav]).map((profile) => profile.id)).toEqual(["b", "a"]);
  });

  it("parte la hotkey real en teclas y devuelve nada si no hay", () => {
    expect(hotkeyKeys("ctrl+alt+l")).toEqual(["Ctrl", "Alt", "L"]);
    expect(hotkeyKeys(undefined)).toEqual([]);
  });

  it("elige la última ejecución registrada entre todos los perfiles", () => {
    const value = lastLaunchedAt([
      { id: "a", name: "A", steps: [], lastLaunchedAt: "2026-07-01T10:00:00Z" },
      { id: "b", name: "B", steps: [], lastLaunchedAt: "2026-07-05T10:00:00Z" },
      { id: "c", name: "C", steps: [], lastLaunchedAt: null },
    ]);
    expect(value?.toISOString()).toBe("2026-07-05T10:00:00.000Z");
    expect(lastLaunchedAt([{ id: "a", name: "A", steps: [] }])).toBeNull();
  });
});

describe("profileInitials", () => {
  it("ignora los nexos para rotular como la referencia", () => {
    // «Creador de Contenido» es CC en la referencia, no CD.
    expect(profileInitials("Creador de Contenido")).toBe("CC");
    expect(profileInitials("Pro")).toBe("PRO");
    expect(profileInitials("de la")).toBe("DL");
    expect(profileInitials("   ")).toBe("··");
  });
});

describe("catalogo de aplicaciones", () => {
  it("pone los favoritos primero y ordena el resto por nombre", () => {
    const catalog = [
      app("obs", { displayName: "OBS Studio" }),
      app("lmu", { displayName: "Le Mans Ultimate", isFavorite: true }),
      app("crewchief", { displayName: "CrewChief" }),
      app("simhub", { displayName: "SimHub", isFavorite: true }),
    ].map(toOrbitApp);
    expect(orderCatalogApps(catalog).map((entry) => entry.id)).toEqual([
      "lmu",
      "simhub",
      "crewchief",
      "obs",
    ]);
  });

  it("no muta la lista que recibe", () => {
    const catalog = [app("obs"), app("lmu", { isFavorite: true })].map(toOrbitApp);
    const before = catalog.map((entry) => entry.id);
    orderCatalogApps(catalog);
    expect(catalog.map((entry) => entry.id)).toEqual(before);
  });

  it("solo trata como personalizadas las del prefijo del backend", () => {
    expect(isCustomApp(app("custom:mi-app"))).toBe(true);
    expect(isCustomApp(app("lmu"))).toBe(false);
    expect(toOrbitApp(app("custom:mi-app")).custom).toBe(true);
    expect(toOrbitApp(app("lmu")).custom).toBe(false);
  });

  it("filtra las favoritas para la columna contextual", () => {
    const catalog = [app("obs"), app("lmu", { isFavorite: true })].map(toOrbitApp);
    expect(favoriteApps(catalog).map((entry) => entry.id)).toEqual(["lmu"]);
  });
});
