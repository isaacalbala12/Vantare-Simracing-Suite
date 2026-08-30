import goldenV2Raw from "../../../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json?raw";
import type { OverlayFrameV2, OverlayUpdateV2 } from "../../../generated/telemetry";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import { getOverlayV2ViewModelEntry } from "../../core/overlay-v2-view-models";
import type { WidgetType } from "../../core/profile-document";
import type { WidgetRuntimeInput } from "../../core/widget-definition";

const golden = JSON.parse(goldenV2Raw) as OverlayUpdateV2;

export function buildAuthoringV2Runtime(
  widgetType: WidgetType,
  snapshot: TelemetrySnapshot,
): WidgetRuntimeInput {
  if (widgetType === "race-schedule") {
    return {
      raceScheduleEvents: snapshot.auxiliary?.scheduleEvents,
      raceScheduleStatus: snapshot.status,
    };
  }
  if (!getOverlayV2ViewModelEntry(widgetType)) return {};
  const sourceState = snapshot.status === "ready"
    ? "live"
    : snapshot.status === "disconnected"
      ? "stopped"
      : snapshot.status === "missing"
        ? "detecting"
        : snapshot.status;
  const frame = buildFixtureFrame(snapshot);
  return {
    overlayV2Frame: frame,
    overlayV2Source: {
      ...golden.source,
      state: sourceState,
      reason: sourceState === "error" ? snapshot.errorMessage ?? "Fixture source error" : undefined,
    },
  };
}

function buildFixtureFrame(snapshot: TelemetrySnapshot): OverlayFrameV2 | undefined {
  if (!golden.frame) return undefined;
  const frame = structuredClone(golden.frame);
  const quality = snapshot.status === "stale" ? "stale" : "fresh";
  const player = snapshot.scoring.find((row) => row.isPlayer === true);
  const playerId = stringValue(player?.id) ?? frame.player.id;
  return {
    ...frame,
    // Authoring mocks share the golden contract shape, but every published
    // snapshot must still look like a new immutable V2 frame to the coordinator.
    sequence: Math.max(frame.sequence + 1, Math.trunc(snapshot.capturedAt)),
    generatedAt: new Date(snapshot.capturedAt).toISOString(),
    session: {
      ...frame.session,
      phase: { v: snapshot.session.type, q: quality },
      track: snapshot.session.trackName
        ? { v: snapshot.session.trackName, q: quality }
        : frame.session.track,
      remaining: snapshot.session.remainingSeconds === undefined
        ? frame.session.remaining
        : { v: snapshot.session.remainingSeconds, q: quality },
    },
    player: {
      ...frame.player,
      id: playerId,
      speed: qNumber(snapshot.player.speedKph === undefined ? undefined : snapshot.player.speedKph / 3.6, quality),
      rpm: qNumber(snapshot.player.rpm, quality),
      gear: qNumber(snapshot.player.gear, quality),
      throttle: qNumber(snapshot.player.throttle, quality),
      brake: qNumber(snapshot.player.brake, quality),
      clutch: qNumber(snapshot.player.clutch, quality),
    },
    delta: {
      ...frame.delta,
      seconds: qNumber(snapshot.player.deltaSeconds, quality),
    },
    standings: snapshot.scoring.map((row, index) => ({
      id: stringValue(row.id) ?? `fixture-${index}`,
      position: numberValue(row.place) ?? index + 1,
      classPosition: numberValue(row.classPlace) ?? index + 1,
      classId: stringValue(row.vehicleClass) ?? "unknown",
      driver: stringValue(row.driverName) ?? `Driver ${index + 1}`,
      number: stringValue(row.driverNumber),
      gap: qNumber(numberValue(row.gapSeconds), quality),
      pit: row.isPlayer === true ? (snapshot.player.inPit ? "pit" : "track") : "track",
      laps: numberValue(row.completedLaps) ?? numberValue(row.totalLaps) ?? 0,
      lastLap: qNumber(numberValue(row.lastLapSeconds), quality),
      bestLap: qNumber(numberValue(row.bestLapSeconds), quality),
      lapDistance: qNumber(numberValue(row.lapDistance), quality),
      groundPosition: { q: "missing" as const },
    })) as OverlayFrameV2["standings"],
    fuel: {
      ...frame.fuel,
      remaining: qNumber(snapshot.player.fuelLiters, quality),
    },
    weather: {
      ambientC: qNumber(snapshot.environment?.ambientC, quality),
      trackC: qNumber(snapshot.environment?.trackC, quality),
      rainPercent: qNumber(snapshot.environment?.rainPercent, quality),
      wetnessPct: qNumber(snapshot.environment?.wetnessPercent, quality),
      windKph: qNumber(snapshot.environment?.windKph, quality),
      windDir: snapshot.environment?.windDirection
        ? { v: snapshot.environment.windDirection, q: quality }
        : { q: "missing" },
      pressureHpa: qNumber(snapshot.environment?.pressureHpa, quality),
    },
    capabilities: {
      ...frame.capabilities,
      supported: [
        "controls", "damage", "delta", "fuel", "gaps", "player-instruments",
        "session", "spatial.lateral", "spatial.longitudinal", "spotter",
        "standings", "weather",
      ],
      available: {
        ...frame.capabilities.available,
        controls: quality,
        damage: quality,
        delta: snapshot.player.deltaSeconds === undefined ? "missing" : quality,
        fuel: snapshot.player.fuelLiters === undefined ? "missing" : quality,
        "player-instruments": quality,
        session: quality,
        standings: quality,
        weather: snapshot.environment ? quality : "missing",
      },
    },
  } as OverlayFrameV2;
}

function qNumber(value: number | undefined, quality: "fresh" | "stale") {
  return value === undefined ? { q: "missing" as const } : { v: value, q: quality };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value !== "") return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}
