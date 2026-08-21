/**
 * Mock for @wailsio/runtime used by visual harnesses only (VITE_RUNTIME_MOCK).
 * Auto-responds to common events with realistic data so the app
 * renders without a real Wails backend.
 */
import { mockCalendar } from "../hub/calendar-visual-mock-data";
import {
  createHubProfile,
  getHubMockSettings,
  listHubProfiles,
  loadHubDocument,
  saveHubDocument,
  setActiveHubProfile,
} from "../overlay-harness/hub-profile-mock-state";
import { licenseDebugWarn } from "./license-debug";
import { setWailsRuntimeMockActive } from "./license-debug-log";
import {
  telemetrySourceStatusEvent,
  telemetrySourceStatusRequestEvent,
} from "../telemetry-transport/source-status";
import { createOrbitCalculationTestClient } from "../hub/strategy-orbit/strategy-orbit-calculation.test-support";
import type { StrategyApplicationCommandV1 } from "../strategy/strategy-application-client";

setWailsRuntimeMockActive(true);
licenseDebugWarn(
  "wails-mock",
  "wails-runtime-mock activo — license/reset NO usan el backend Go real",
);

const listeners = new Map<string, Set<(event: unknown) => void>>();

type HarnessWidgetDesign = {
  id: string;
  name: string;
  widgetType: string;
  systemId: string;
  systemVersion: number;
  configVersion: number;
  visual: Record<string, unknown>;
  content?: Record<string, unknown>;
  includesContent: boolean;
  origin: "vantare" | "user";
  createdAt?: string;
  updatedAt?: string;
};

const harnessDesignLibrary: HarnessWidgetDesign[] = [];
const strategyRepositoryKey = "vantare.strategy.harness.repository.v1";

type HarnessStrategyRepository = {
  version: number;
  drafts: Record<string, Record<string, unknown>>;
};


/**
 * Evento activo de Estrategia para los harnesses (briefing 07). El backend real
 * publicará este mismo payload por `strategy:roster`; aquí solo se siembra para
 * que la captura tenga un evento de 4 h con tres pilotos.
 */
const harnessStrategyRoster = {
  event: {
    startMin: 14 * 60,
    durationMin: 240,
    tankL: 90,
    pitS: 64,
    name: "4 Horas de Imola",
    subtitle: "ELMS · Imola · horario de muestra",
    monogram: "4H",
    vehicleClass: "LMGT3",
    team: "Vantare Racing · #58",
    dayLabel: "Sáb 12",
  },
  drivers: [
    { id: "isaac", name: "Isaac Albalá", ini: "IA", color: "#ff6a5f", cls: "Gold SR · 4.12", dry: [104.0, 2.75], wet: [112.4, 2.4], eco: [105.1, 2.55] },
    { id: "sol", name: "Sol Martín", ini: "SM", color: "#78d68b", cls: "Gold SR · 3.88", dry: [104.6, 2.72], wet: [113.0, 2.38], eco: [105.7, 2.52] },
    { id: "diego", name: "Diego Ferrer", ini: "DF", color: "#5ccbd5", cls: "Silver SR · 3.40", dry: [105.3, 2.8], wet: [114.2, 2.44], eco: [106.4, 2.58] },
  ],
  strategies: [
    { id: "s1", name: "Estrategia #1", note: "Mínimo tiempo · un set nuevo por stint", mode: "dry", order: ["isaac", "sol", "diego"] },
    { id: "s2", name: "Estrategia #2", note: "Economía · una parada menos", mode: "eco", order: ["isaac", "sol", "diego"] },
  ],
};

function createHarnessDesignId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `harness-design-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readHarnessPayload(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return {};
}

function loadHarnessStrategyRepository(): HarnessStrategyRepository {
  try {
    const raw = globalThis.localStorage?.getItem(strategyRepositoryKey);
    if (!raw) return { version: 0, drafts: {} };
    const parsed = JSON.parse(raw) as HarnessStrategyRepository;
    if (!Number.isSafeInteger(parsed.version) || parsed.version < 0 || !parsed.drafts || typeof parsed.drafts !== "object") {
      throw new Error("invalid harness Strategy repository");
    }
    return parsed;
  } catch {
    return { version: 0, drafts: {} };
  }
}

function saveHarnessStrategyRepository(repository: HarnessStrategyRepository) {
  globalThis.localStorage?.setItem(strategyRepositoryKey, JSON.stringify(repository));
}

function handleHarnessStrategyCommand(command: Record<string, unknown>) {
  const commandId = typeof command.commandId === "string" ? command.commandId : "invalid-command";
  const operation = command.operation;
  const repository = loadHarnessStrategyRepository();
  const baseResult = {
    protocolVersion: "strategy.application.v1",
    commandId,
    repositoryVersion: repository.version,
    recoveredFromBackup: false,
    closed: false,
  };
  const fail = (code: string, field: string, message: string) => {
    broadcast("strategy:application:error", { commandId, code, field, message });
  };

  if (operation === "calculate_orbit") {
    void createOrbitCalculationTestClient()
      .execute(command as unknown as StrategyApplicationCommandV1<unknown>)
      .then((result) => broadcast("strategy:application:result", result));
    return;
  }

  if (operation === "open" || operation === "restore") {
    const draftId = typeof command.draftId === "string" ? command.draftId : "";
    const draft = repository.drafts[draftId];
    if (!draft) return fail("draft_not_found", "draftId", "Strategy draft not found");
    broadcast("strategy:application:result", { ...baseResult, draft, savedDraft: draft });
    return;
  }
  if (operation === "create") {
    const draft = readHarnessPayload(command.draft);
    const draftId = typeof draft.draftId === "string" ? draft.draftId : "";
    if (!draftId) return fail("invalid_command", "draft.draftId", "Invalid Strategy draft");
    repository.drafts[draftId] = structuredClone(draft);
    repository.version += 1;
    saveHarnessStrategyRepository(repository);
    broadcast("strategy:application:result", {
      ...baseResult,
      repositoryVersion: repository.version,
      draft: repository.drafts[draftId],
      savedDraft: repository.drafts[draftId],
    });
    return;
  }
  if (operation === "save_revision") {
    const draft = readHarnessPayload(command.draft);
    const draftId = typeof draft.draftId === "string" ? draft.draftId : "";
    const revisionId = typeof command.revisionId === "string" ? command.revisionId : "";
    if (!draftId || !revisionId) return fail("invalid_command", "draft", "Invalid Strategy save");
    const stored = {
      ...structuredClone(draft),
      baseRevision: {
        planId: draft.planId,
        variantId: draft.variantId,
        revisionId,
        contentHash: "a".repeat(64),
      },
    };
    repository.drafts[draftId] = stored;
    repository.version += 1;
    saveHarnessStrategyRepository(repository);
    broadcast("strategy:application:result", {
      ...baseResult,
      repositoryVersion: repository.version,
      draft: stored,
      savedDraft: stored,
    });
    return;
  }
  if (operation === "close") {
    broadcast("strategy:application:result", { ...baseResult, closed: true });
    return;
  }
  fail("invalid_command", "operation", "Unsupported harness Strategy operation");
}

function handleHarnessStrategyManual(command: Record<string, unknown>) {
  const commandId = typeof command.commandId === "string" ? command.commandId : "invalid-command";
  const input = readHarnessPayload(command.input);
  const stints = Array.isArray(input.stints) ? input.stints.map(Number) : [];
  const laps = Array.isArray(input.laps) ? input.laps.map(readHarnessPayload) : [];
  const sourced = (field: string) => Number(readHarnessPayload(input[field]).value);
  const lapValue = (lap: Record<string, unknown>, field: string) => Number(readHarnessPayload(lap[field]).value);
  const finite = stints.every((value) => Number.isSafeInteger(value) && value > 0)
    && laps.length === stints.reduce((sum, value) => sum + value, 0)
    && laps.every((lap) => ["fuelPerLap", "virtualEnergyPerLap", "averageLap", "tyreWearPercent"]
      .every((field) => Number.isFinite(lapValue(lap, field))));
  if (!finite) {
    broadcast("strategy:manual:error", {
      commandId,
      code: "invalid_input",
      field: "manualPlan.laps",
      message: "Review the highlighted manual Strategy input.",
    });
    return;
  }

  const total = (field: string) => laps.reduce((sum, lap) => sum + lapValue(lap, field), 0);
  const resource = (raceNeed: number, formationNeed: number, reserveAmount: number, startAmount: number, usableCapacity: number) => {
    const totalNeed = raceNeed + formationNeed + reserveAmount;
    const additionalRequired = Math.max(totalNeed - startAmount, 0);
    const stopsRequired = additionalRequired > 0 ? Math.ceil(additionalRequired / usableCapacity) : 0;
    const amount = stopsRequired > 0
      ? Math.max(totalNeed - (startAmount + usableCapacity * (stopsRequired - 1)), 0)
      : 0;
    const average = raceNeed / laps.length;
    return {
      used: raceNeed > 0,
      raceNeed,
      formationNeed,
      reserveAmount,
      totalNeed,
      startAmount,
      additionalRequired,
      usableCapacity,
      availableCompetitiveLaps: average > 0 ? Math.floor(Math.max(startAmount - formationNeed - reserveAmount, 0) / average) : 0,
      stopsRequired,
      saving: {
        available: stopsRequired > 0,
        feasible: amount > 0 && amount < raceNeed,
        targetStops: Math.max(0, stopsRequired - 1),
        amount,
        perLap: amount / laps.length,
        percentOfConsumption: average > 0 ? amount / laps.length / average * 100 : 0,
      },
    };
  };
  const fuel = resource(total("fuelPerLap"), sourced("fuelFormation"), sourced("fuelReserve"), sourced("fuelStartAmount"), sourced("fuelUsableCapacity"));
  const virtualEnergy = resource(total("virtualEnergyPerLap"), sourced("virtualEnergyFormation"), sourced("virtualEnergyReserve"), sourced("virtualEnergyStartAmount"), sourced("virtualEnergyUsableCapacity"));
  let offset = 0;
  const stintResults = stints.map((lapCount) => {
    const slice = laps.slice(offset, offset + lapCount);
    offset += lapCount;
    const sum = (field: string) => slice.reduce((value, lap) => value + lapValue(lap, field), 0);
    return {
      lapCount,
      fuelNeed: sum("fuelPerLap"),
      virtualEnergyNeed: sum("virtualEnergyPerLap"),
      averageLapSeconds: sum("averageLap") / lapCount,
      tyreWearPercent: sum("tyreWearPercent"),
      fuelSavingAmount: fuel.saving.perLap * lapCount,
      virtualEnergySavingAmount: virtualEnergy.saving.perLap * lapCount,
    };
  });
  const pitStopCount = Math.max(0, stints.length - 1);
  const pitLossPerStopSeconds = sourced("pitLossPerStop");
  const totalPitLossSeconds = pitStopCount * pitLossPerStopSeconds;
  const repairSeconds = sourced("repair");
  const penaltySeconds = sourced("penalty");
  broadcast("strategy:manual:result", {
    protocolVersion: "strategy.manual.v1",
    commandId,
    result: {
      fuel,
      virtualEnergy,
      pitStopCount,
      pitLossPerStopSeconds,
      totalPitLossSeconds,
      repairSeconds,
      penaltySeconds,
      totalPitSeconds: totalPitLossSeconds + repairSeconds + penaltySeconds,
      averageLapSeconds: total("averageLap") / laps.length,
      averageTyreWearPercent: total("tyreWearPercent") / laps.length,
      stints: stintResults,
    },
  });
}


/**
 * Configuracion y radio del Ingeniero para los harnesses (briefing 08). El
 * servicio real publica exactamente este `engineer:status`; aqui solo se
 * siembra para que la captura tenga una sesion con mensajes.
 */
const harnessEngineerMessages = [
  ["Coche a la izquierda", "spotter", "spotter.car_left", "critical", 12],
  ["Ventana de boxes abierta", "engineer", "pitstops.window_open", "info", 44],
  ["Consumo por encima del objetivo", "engineer", "fuel.over_target", "warning", 137],
  ["Libre", "spotter", "spotter.clear", "info", 149],
  ["Aviso de limites de pista", "engineer", "penalties.track_limits", "warning", 233],
  ["Vuelta 1:29.455", "engineer", "laps.personal_best", "info", 320],
  ["Coche a la derecha", "spotter", "spotter.car_right", "critical", 335],
  ["Diferencia con el coche de delante", "engineer", "timings.gap_ahead", "info", 401],
  ["Dos de ancho", "spotter", "spotter.two_wide", "critical", 448],
  ["Quedan 6 vueltas de combustible", "engineer", "fuel.remaining", "info", 512],
  ["Bandera azul en el sector 2", "engineer", "penalties.blue_flag", "warning", 588],
  ["Coche detras, mas rapido", "spotter", "spotter.car_behind", "info", 640],
  ["Entrada a boxes en dos vueltas", "engineer", "pitstops.box_soon", "info", 702],
  ["Coche a la izquierda", "spotter", "spotter.car_left", "critical", 744],
  ["Sector 2 mejorado", "engineer", "laps.sector_gain", "info", 803],
  ["Libre", "spotter", "spotter.clear", "info", 826],
  ["Penalizacion de 5 s aplicada", "engineer", "penalties.applied", "warning", 889],
  ["Diferencia con el coche de detras", "engineer", "timings.gap_behind", "info", 941],
  ["Coche a la derecha", "spotter", "spotter.car_right", "critical", 998],
  ["Objetivo de consumo alcanzado", "engineer", "fuel.on_target", "info", 1054],
] as const;

const harnessEngineerBase = Date.parse("2026-07-07T18:44:12Z");

const harnessEngineerStatus = {
  enabled: true,
  connected: true,
  source: "telemetry-core",
  presentationLifecycle: 3,
  spotterEnabled: true,
  sensitivity: "normal",
  ttsCacheCount: 0,
  subtitlesEnabled: true,
  outputModes: {
    spotter: "both",
    fuel: "both",
    penalties: "both",
    laps: "visual",
    timings: "audio",
    pitstops: "both",
  } as Record<string, string>,
  recentMessages: harnessEngineerMessages.map(([text, role, textKey, severity, ago], index) => ({
    version: 1,
    id: `harness-radio-${index}`,
    category: textKey.split(".")[0],
    severity,
    textKey,
    text,
    voiceText: text,
    locale: "es",
    role,
    channel: role,
    priority: role === "spotter" ? 100 : 40,
    createdAt: harnessEngineerBase - ago * 1000,
    expiresAt: harnessEngineerBase - ago * 1000 + 600000,
    source: "telemetry-core",
  })),
};

function applyHarnessEngineerSetting(name: string, data: unknown) {
  const value = Array.isArray(data) ? data[0] : data;
  if (name === "engineer:enabled:set") harnessEngineerStatus.enabled = Boolean(value);
  if (name === "engineer:spotter:set") harnessEngineerStatus.spotterEnabled = Boolean(value);
  if (name === "engineer:subtitles:set") harnessEngineerStatus.subtitlesEnabled = Boolean(value);
  if (name === "engineer:sensitivity:set" && typeof value === "string") {
    harnessEngineerStatus.sensitivity = value;
  }
  if (name === "engineer:output:set" && value && typeof value === "object") {
    const { category, mode } = value as { category?: string; mode?: string };
    if (category && mode) harnessEngineerStatus.outputModes[category] = mode;
  }
}

/** El canal del actualizador que enseña el harness; por defecto el estable. */
const harnessUpdaterSettings: { channel: string } = { channel: "stable" };

function harnessRelease(tag: string, prerelease: boolean, publishedAt: string) {
  return {
    tag_name: tag,
    name: tag,
    body: "",
    prerelease,
    published_at: publishedAt,
    html_url: `https://example.com/${tag}`,
    assets: [],
  };
}

const harnessStableRelease = harnessRelease("v0.1.0.2", false, "2026-06-02T00:00:00Z");
const harnessTestersRelease = harnessRelease("v0.1.0.7-testers.1", true, "2026-06-03T00:00:00Z");
const harnessNightlyRelease = harnessRelease("v0.1.0.7-nightly.11", true, "2026-06-05T00:00:00Z");

/**
 * Espejo del backend: `releases` va filtrada por el canal configurado y
 * `channels` lleva la última de CADA canal.
 */
function harnessUpdateInfo() {
  const channel = harnessUpdaterSettings.channel;
  const releases = [harnessStableRelease];
  if (channel === "testers" || channel === "nightly") releases.unshift(harnessTestersRelease);
  if (channel === "nightly") releases.unshift(harnessNightlyRelease);
  return {
    currentVersion: "v0.1.0.1",
    latestVersion: releases[0].tag_name,
    latestRelease: releases[0],
    hasUpdate: true,
    isDowngrade: false,
    releases,
    channels: {
      stable: harnessStableRelease,
      testers: harnessTestersRelease,
      nightly: harnessNightlyRelease,
    },
  };
}

// ISA-379: el harness de Ajustes tiene que poder enseñar «Últimos eventos» con
// filas reales, así que el mock siembra un anillo con los tres niveles. Las
// marcas de tiempo son relativas al arranque del harness para que la captura no
// dependa de una fecha fija, y el orden es el del backend: más antiguo primero.
const harnessLogSeed: { level: "info" | "warn" | "error"; message: string; agoMs: number }[] = [
  { level: "info", message: "HTTP server: listening on 127.0.0.1:39261", agoMs: 184_000 },
  { level: "info", message: "telemetry: LMU shared memory attached", agoMs: 171_000 },
  { level: "warn", message: "warning: configs directory not found — hub profile CRUD disabled", agoMs: 152_000 },
  { level: "info", message: "overlay: profile 'Racing' loaded with 7 widgets", agoMs: 118_000 },
  { level: "error", message: "storage error: telemetry session chunk could not be written", agoMs: 96_000 },
  { level: "info", message: "updater: channel nightly selected", agoMs: 61_000 },
  { level: "warn", message: "warning: hotkey Ctrl+Alt+O already registered by another app", agoMs: 34_000 },
  { level: "info", message: "launcher: Le Mans Ultimate started", agoMs: 12_000 },
];

const harnessLogPath = "C:\\Users\\piloto\\AppData\\Local\\Vantare\\logs\\vantare.log";

function harnessLogEntries() {
  const now = Date.now();
  return harnessLogSeed.map((entry, index) => ({
    seq: index + 1,
    time: new Date(now - entry.agoMs).toISOString(),
    level: entry.level,
    message: entry.message,
  }));
}

// Las mismas ubicaciones que publica `internal/storage`, incluida `logs`, para
// que el botón «Abrir carpeta de registros» tenga a qué apuntar en el harness.
const harnessStorageSummary = {
  locations: [
    {
      key: "configs",
      path: "C:\\Users\\piloto\\AppData\\Roaming\\Vantare\\configs",
      bytes: 184_320,
      files: 12,
      exists: true,
      clearable: false,
    },
    {
      key: "telemetry",
      path: "C:\\Users\\piloto\\AppData\\Local\\Vantare\\telemetry\\sessions",
      bytes: 47_185_920,
      files: 38,
      exists: true,
      clearable: true,
    },
    {
      key: "logs",
      path: "C:\\Users\\piloto\\AppData\\Local\\Vantare\\logs",
      bytes: 262_144,
      files: 3,
      exists: true,
      clearable: false,
    },
  ],
  totalBytes: 47_632_384,
};

function broadcast(name: string, data: unknown) {

  setTimeout(() => {
    listeners.get(name)?.forEach((fn) => fn({ data }));
  }, 0);
}

export const Events = {
  On(name: string, handler: (event: unknown) => void) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(handler);
    return () => {
      listeners.get(name)?.delete(handler);
    };
  },

  Off(name: string, handler: (event: unknown) => void) {
    listeners.get(name)?.delete(handler);
  },
  Emit(name: string, data: unknown) {

    if (name === "strategy:application:command") {
      setTimeout(() => handleHarnessStrategyCommand(readHarnessPayload(data)), 0);
      return;
    }

    if (name === "engineer:status:get") {
      setTimeout(() => broadcast("engineer:status", harnessEngineerStatus), 30);
      return;
    }

    if (
      name === "engineer:output:set" ||
      name === "engineer:enabled:set" ||
      name === "engineer:spotter:set" ||
      name === "engineer:subtitles:set" ||
      name === "engineer:sensitivity:set"
    ) {
      applyHarnessEngineerSetting(name, data);
      setTimeout(() => broadcast("engineer:status", { ...harnessEngineerStatus }), 0);
      return;
    }

    // ISA-379: registros y últimos eventos de Diagnóstico.
    if (name === "applog:get") {
      setTimeout(
        () =>
          broadcast("applog", {
            entries: harnessLogEntries(),
            path: harnessLogPath,
            available: true,
          }),
        20,
      );
      return;
    }

    if (name === "storage:get") {
      setTimeout(() => broadcast("storage", harnessStorageSummary), 20);
      return;
    }

    // Revelar una carpeta es cosa del sistema operativo: en el mock no hay nada
    // que abrir, pero tampoco debe caer al `broadcast` genérico y simular una
    // respuesta que el backend real nunca manda.
    if (name === "storage:reveal") {
      return;
    }

    if (name === "strategy:roster:get") {
      setTimeout(() => broadcast("strategy:roster", harnessStrategyRoster), 30);
      return;
    }

    if (name === "strategy:manual:calculate") {
      setTimeout(() => handleHarnessStrategyManual(readHarnessPayload(data)), 0);
      return;
    }

    // El actualizador: el harness necesita releases MEZCLADAS (estable, testers
    // y nightly a la vez) para que la regresión visual pueda comprobar que cada
    // tarjeta de canal enseña la suya y no la de al lado (ISA-368).
    if (name === "updater:settings:get") {
      setTimeout(() => broadcast("updater:settings", { settings: harnessUpdaterSettings }), 20);
      return;
    }

    if (name === "updater:settings:save") {
      const next = readHarnessPayload(data) as { channel?: string } | undefined;
      if (next?.channel) harnessUpdaterSettings.channel = next.channel;
      setTimeout(() => broadcast("updater:settings-saved", { ok: true }), 0);
      return;
    }

    if (name === "updater:check") {
      setTimeout(() => broadcast("updater:available", { info: harnessUpdateInfo() }), 30);
      return;
    }

    // Auto-respond to license validation
    if (name === "license:validate") {
      licenseDebugWarn("wails-mock", "license:validate interceptado (mock)", {
        email: "test@example.com",
        entitlements: ["overlays"],
      });
      setTimeout(() => {
        broadcast("license:changed", {
          state: "active",
          entitlements: ["overlays"],
          userId: "mock-user",
          email: "test@example.com",
          deviceOK: true,
          lastValidated: new Date().toISOString(),
        });
      }, 50);
      return;
    }

    if (name === "license:reset-device") {
      licenseDebugWarn("wails-mock", "license:reset-device interceptado (mock)");
      setTimeout(() => {
        broadcast("license:changed", {
          state: "active",
          entitlements: ["overlays"],
          userId: "mock-user",
          email: "test@example.com",
          deviceOK: true,
          lastValidated: new Date().toISOString(),
        });
      }, 50);
      return;
    }

    // Auto-respond to calendar request
    if (name === "calendar:get") {
      setTimeout(() => {
        broadcast("calendar:loaded", { calendar: mockCalendar });
      }, 50);
      return;
    }

    // Auto-respond to app version
    if (name === "app:version:get") {
      setTimeout(() => broadcast("app:version", { version: "v0.1.0.2" }), 50);
      return;
    }

    // Auto-respond to telemetry source status
    if (name === telemetrySourceStatusRequestEvent) {
      setTimeout(
        () =>
          broadcast(telemetrySourceStatusEvent, {
            kind: "none",
            name: "No source",
            live: false,
            available: false,
          }),
        50,
      );
      return;
    }

    // Auto-respond to settings request
    if (name === "settings:get") {
      setTimeout(() => broadcast("settings", getHubMockSettings()), 50);
      return;
    }

    // Auto-respond to hub profiles list
    if (name === "hub:list") {
      setTimeout(() => broadcast("hub:profiles", { profiles: listHubProfiles() }), 50);
      return;
    }

    if (name === "hub:create") {
      const payload = readHarnessPayload(data);
      const profileName = typeof payload.name === "string" ? payload.name : "";
      const created = createHubProfile(profileName);
      setTimeout(() => {
        if ("error" in created) {
          broadcast("hub:error", { message: created.error });
          return;
        }
        broadcast("hub:profile-created", { id: created.id, file: created.file });
        broadcast("hub:profiles", { profiles: listHubProfiles() });
      }, 50);
      return;
    }

    if (name === "hub:set-active") {
      const payload = readHarnessPayload(data);
      const id = typeof payload.id === "string" ? payload.id : "";
      const file = typeof payload.file === "string" ? payload.file : "";
      if (id && file) {
        setActiveHubProfile(id, file);
        setTimeout(() => {
          broadcast("hub:profile-activated", { activeProfileId: id });
          broadcast("settings", getHubMockSettings());
        }, 50);
      }
      return;
    }

    if (name === "studio:profile:load") {
      const payload = readHarnessPayload(data);
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      const file = typeof payload.file === "string" ? payload.file : "";
      const loaded = loadHubDocument(file);
      setTimeout(() => {
        if (!loaded) {
          broadcast("studio:profile:error", {
            requestId,
            operation: "load",
            message: `profile not found: ${file}`,
          });
          return;
        }
        broadcast("studio:profile:loaded", {
          requestId,
          document: loaded.document,
          revision: loaded.revision,
          migratedFrom: 3,
        });
      }, 0);
      return;
    }

    if (name === "studio:profile:save") {
      const payload = readHarnessPayload(data);
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      const expectedRevision = typeof payload.expectedRevision === "string" ? payload.expectedRevision : "";
      const document = payload.document;
      const documentId =
        document && typeof document === "object" && "id" in document && typeof document.id === "string"
          ? document.id
          : "";
      const fileFromPath = listHubProfiles().find((profile) => profile.id === documentId)?.file ?? "";
      if (!document || typeof document !== "object" || !fileFromPath) {
        setTimeout(() => {
          broadcast("studio:profile:error", {
            requestId,
            operation: "save",
            message: "invalid studio profile save payload",
          });
        }, 0);
        return;
      }
      const result = saveHubDocument(
        fileFromPath,
        document as import("../overlay/core/profile-document").ProfileDocumentV3,
        expectedRevision,
      );
      setTimeout(() => {
        if (!result.ok) {
          if (result.kind === "conflict") {
            broadcast("studio:profile:conflict", { requestId, message: result.message });
            return;
          }
          broadcast("studio:profile:error", {
            requestId,
            operation: "save",
            message: result.message,
          });
          return;
        }
        const stored = loadHubDocument(fileFromPath);
        if (!stored) {
          broadcast("studio:profile:error", {
            requestId,
            operation: "save",
            message: "profile missing after save",
          });
          return;
        }
        broadcast("studio:profile:saved", {
          requestId,
          document: stored.document,
          revision: stored.revision,
        });
      }, 0);
      return;
    }

    // Auto-respond to the canonical Launcher V3 snapshot request.
    if (name === "launcher:snapshot:get") {
      setTimeout(
        () =>
          broadcast("launcher:snapshot", {
            revision: 1,
            apps: [
              { id: "lmu", displayName: "Le Mans Ultimate", abbreviation: "LMU", category: "simulator", launchMethod: "steam-uri", steamAppId: 2399420, detected: true, gradientFrom: "#ff3b3b", gradientTo: "#9a0606", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "obs", displayName: "OBS Studio", abbreviation: "OBS", category: "streaming", launchMethod: "executable", detected: true, gradientFrom: "#302e31", gradientTo: "#0a0a0a", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "crewchief", displayName: "CrewChief", abbreviation: "CC", category: "utility", launchMethod: "executable", detected: true, gradientFrom: "#3b82f6", gradientTo: "#1d4ed8", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "discord", displayName: "Discord", abbreviation: "DC", category: "utility", launchMethod: "executable", detected: true, gradientFrom: "#5865F2", gradientTo: "#404EED", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "spotify", displayName: "Spotify", abbreviation: "Sp", category: "audio", launchMethod: "executable", detected: true, gradientFrom: "#10b981", gradientTo: "#059669", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "motec", displayName: "MoTeC", abbreviation: "MT", category: "telemetry", launchMethod: "executable", detected: true, gradientFrom: "#f59e0b", gradientTo: "#b45309", availability: { catalogued: true, found: true, installed: true, launchable: true } },
              { id: "simhub", displayName: "SimHub", abbreviation: "SH", category: "telemetry", launchMethod: "executable", detected: false, gradientFrom: "#8b5cf6", gradientTo: "#6d28d9", availability: { catalogued: true, found: false, installed: false, launchable: false } },
            ],
            vantareProfiles: [
              { id: "creator", name: "Creador de Contenido", description: "LMU + OBS + Spotify", steps: [{ appId: "lmu", delay: 0 }, { appId: "obs", delay: 2 }, { appId: "spotify", delay: 2 }] },
              { id: "pro", name: "Pro", steps: [{ appId: "lmu", delay: 0 }, { appId: "crewchief", delay: 2 }, { appId: "spotify", delay: 2 }, { appId: "motec", delay: 2 }] },
            ],
            userProfiles: [],
            activeChains: [],
            discovery: { scanning: false, lastScanAt: new Date().toISOString(), error: null },
          }),
        50,
      );
      return;
    }

    // In-memory widget design library for Overlay Studio V3 harness
    if (name === "design:list") {
      const payload = readHarnessPayload(data);
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      const widgetType = typeof payload.widgetType === "string" ? payload.widgetType : "";
      const designs =
        widgetType === ""
          ? [...harnessDesignLibrary]
          : harnessDesignLibrary.filter((design) => design.widgetType === widgetType);
      setTimeout(() => {
        broadcast("design:list:response", { requestId, designs });
      }, 0);
      return;
    }

    if (name === "design:save") {
      const payload = readHarnessPayload(data);
      const rawDesign = payload.design;
      if (!rawDesign || typeof rawDesign !== "object") {
        setTimeout(() => {
          broadcast("design:error", { operation: "save", message: "missing design payload" });
        }, 0);
        return;
      }
      const incoming = rawDesign as HarnessWidgetDesign;
      const now = new Date().toISOString();
      const id = incoming.id?.trim() ? incoming.id : createHarnessDesignId();
      const existingIndex = harnessDesignLibrary.findIndex((design) => design.id === id);
      const saved: HarnessWidgetDesign = {
        ...incoming,
        id,
        origin: "user",
        createdAt: existingIndex >= 0 ? harnessDesignLibrary[existingIndex]?.createdAt ?? now : now,
        updatedAt: now,
      };
      if (existingIndex >= 0) {
        harnessDesignLibrary[existingIndex] = saved;
      } else {
        harnessDesignLibrary.push(saved);
      }
      setTimeout(() => {
        broadcast("design:saved", { design: saved });
      }, 0);
      return;
    }

    if (name === "design:delete") {
      const payload = readHarnessPayload(data);
      const id = typeof payload.id === "string" ? payload.id : "";
      const index = harnessDesignLibrary.findIndex((design) => design.id === id);
      if (index < 0) {
        setTimeout(() => {
          broadcast("design:error", { operation: "delete", message: `design not found: ${id}` });
        }, 0);
        return;
      }
      harnessDesignLibrary.splice(index, 1);
      setTimeout(() => {
        broadcast("design:deleted", { id });
      }, 0);
      return;
    }

    if (name === "design:rename") {
      const payload = readHarnessPayload(data);
      const id = typeof payload.id === "string" ? payload.id : "";
      const nextName = typeof payload.name === "string" ? payload.name.trim() : "";
      const design = harnessDesignLibrary.find((entry) => entry.id === id);
      if (!design || nextName === "") {
        setTimeout(() => {
          broadcast("design:error", { operation: "rename", message: "invalid rename payload" });
        }, 0);
        return;
      }
      design.name = nextName;
      design.updatedAt = new Date().toISOString();
      setTimeout(() => {
        broadcast("design:renamed", { id, name: nextName });
      }, 0);
      return;
    }

    // Broadcast any other event to listeners
    broadcast(name, data);
  },
};

export const Browser = {
  OpenURL: () => {
    // no-op in harness
  },
};
