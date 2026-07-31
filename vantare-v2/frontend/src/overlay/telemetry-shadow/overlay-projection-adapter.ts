import type { StatusState } from "../../telemetry-transport/contracts";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import type {
  OverlayFreshness,
  OverlayProjectionField,
  OverlayProjectionPresentField,
  OverlayProjectionV1,
  OverlayProvenance,
  OverlayVehicleV1,
} from "./overlay-projection-v1";

export type OverlayMappedField = Readonly<{
  sourcePath: string;
  targetPath?: string;
  present: boolean;
  provenance: OverlayProvenance;
  freshness: OverlayFreshness;
  usable: boolean;
}>;

export type OverlayUnsupportedReason =
  | "unsupported-by-projection"
  | "history-without-timestamps";

export type OverlayUnsupportedField = Readonly<{
  targetPath: string;
  reason: OverlayUnsupportedReason;
}>;

export type OverlayProjectionMapping = Readonly<{
  kind: "mapped";
  snapshot: TelemetrySnapshot;
  quality: readonly OverlayMappedField[];
  unsupported: readonly OverlayUnsupportedField[];
}>;

export type OverlayProjectionBlockCode =
  | "captured-at-invalid"
  | "session-type-unavailable"
  | "player-unavailable"
  | "player-in-pit-unavailable";

export type OverlayProjectionBlocked = Readonly<{
  kind: "blocked";
  code: OverlayProjectionBlockCode;
  quality: readonly OverlayMappedField[];
  unsupported: readonly OverlayUnsupportedField[];
}>;

export type OverlayProjectionAdaptation =
  | OverlayProjectionMapping
  | OverlayProjectionBlocked;

type AdapterOptions = Readonly<{
  transportState: StatusState;
}>;

const UNSUPPORTED_FIELDS: readonly OverlayUnsupportedField[] = [
  { targetPath: "session.remainingSeconds", reason: "unsupported-by-projection" },
  { targetPath: "session.key", reason: "unsupported-by-projection" },
  { targetPath: "session.globalFlag", reason: "unsupported-by-projection" },
  { targetPath: "session.sectorFlags", reason: "unsupported-by-projection" },
  { targetPath: "player.fuelLiters", reason: "unsupported-by-projection" },
  { targetPath: "player.deltaSeconds", reason: "unsupported-by-projection" },
  { targetPath: "player.lastLapSeconds", reason: "unsupported-by-projection" },
  { targetPath: "player.bestLapSeconds", reason: "unsupported-by-projection" },
  { targetPath: "player.predictedLapSeconds", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].driverName", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].driverNumber", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].teamName", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].vehicleClass", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].timeGapToPlayer", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].lastLapTime", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].bestLapTime", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].estimatedLapTime", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].tireCompound", reason: "unsupported-by-projection" },
  { targetPath: "derived.inputHistory", reason: "history-without-timestamps" },
  { targetPath: "derived.fuelHistory", reason: "unsupported-by-projection" },
  { targetPath: "derived.deltaHistory", reason: "unsupported-by-projection" },
  { targetPath: "environment", reason: "unsupported-by-projection" },
  { targetPath: "damage", reason: "unsupported-by-projection" },
];

/** Converts only signals demonstrated by Overlay Projection v1. */
export function adaptOverlayProjectionToSnapshot(
  projection: OverlayProjectionV1,
  options: AdapterOptions,
): OverlayProjectionAdaptation {
  const capturedAt = Date.parse(projection.capturedAt);

  const quality: OverlayMappedField[] = [];
  const sessionType = mappedValue(
    projection.payload.sessionType,
    quality,
    "sessionType",
    "session.type",
  );
  const trackName = mappedValue(
    projection.payload.trackName,
    quality,
    "trackName",
    "session.trackName",
  );

  const playerIndex = projection.payload.vehicles.findIndex(
    (vehicle) => vehicle.id === projection.payload.playerVehicleId,
  );
  const playerVehicle = projection.payload.vehicles[playerIndex];
  const playerPresent = playerIndex >= 0;
  quality.push({
    sourcePath: "playerVehicleId",
    targetPath: "player",
    present: playerPresent,
    provenance: playerPresent ? "observed" : "unknown",
    freshness: playerPresent ? "fresh" : "missing",
    usable: playerPresent,
  });
  const scoring = projection.payload.vehicles.map((vehicle, index) =>
    mapScoringVehicle(vehicle, index, playerIndex, quality),
  );
  const player = mapPlayer(playerVehicle, playerIndex, quality);
  quality.push({
    sourcePath: "controlsHistory",
    present: projection.payload.controlsHistory.present,
    provenance: projection.payload.controlsHistory.provenance,
    freshness: projection.payload.controlsHistory.freshness,
    usable:
      projection.payload.controlsHistory.present &&
      projection.payload.controlsHistory.freshness !== "missing" &&
      projection.payload.controlsHistory.freshness !== "invalid",
  });

  if (!Number.isFinite(capturedAt)) {
    return blocked("captured-at-invalid", quality);
  }
  if (sessionType === undefined) {
    return blocked("session-type-unavailable", quality);
  }
  if (!playerPresent) {
    return blocked("player-unavailable", quality);
  }
  if (!player) {
    return blocked("player-in-pit-unavailable", quality);
  }

  const session: TelemetrySnapshot["session"] = { type: sessionType };
  if (trackName !== undefined) {
    session.trackName = trackName;
  }
  const transportStatus = snapshotStatus(options.transportState);
  const snapshot: TelemetrySnapshot = {
    status: transportStatus,
    capturedAt,
    session,
    player,
    scoring,
  };
  if (options.transportState === "error") {
    snapshot.errorMessage = "overlay-projection-transport-error";
  }

  return deepFreeze({
    kind: "mapped",
    snapshot,
    quality,
    unsupported: cloneUnsupported(),
  });
}

function mapPlayer(
  vehicle: OverlayVehicleV1 | undefined,
  index: number,
  quality: OverlayMappedField[],
): TelemetrySnapshot["player"] | undefined {
  if (!vehicle || index < 0) {
    return undefined;
  }

  const inPit = mappedValue(
    vehicle.inPit,
    quality,
    `vehicles[${index}].inPit`,
    "player.inPit",
  );
  const optional: Omit<TelemetrySnapshot["player"], "inPit"> = {};
  assignIfPresent(
    optional,
    "speedKph",
    mappedScaledNumber(
      vehicle.speedMps,
      quality,
      `vehicles[${index}].speedMps`,
      "player.speedKph",
      3.6,
    ),
  );
  assignIfPresent(
    optional,
    "rpm",
    mappedValue(
      vehicle.engineRpm,
      quality,
      `vehicles[${index}].engineRpm`,
      "player.rpm",
    ),
  );
  assignIfPresent(
    optional,
    "gear",
    mappedValue(
      vehicle.gear,
      quality,
      `vehicles[${index}].gear`,
      "player.gear",
    ),
  );
  assignIfPresent(
    optional,
    "totalLaps",
    mappedValue(
      vehicle.completedLaps,
      quality,
      `vehicles[${index}].completedLaps`,
      "player.totalLaps",
    ),
  );
  assignIfPresent(
    optional,
    "lapNumber",
    mappedValue(
      vehicle.lapNumber,
      quality,
      `vehicles[${index}].lapNumber`,
      "player.lapNumber",
    ),
  );
  assignIfPresent(
    optional,
    "throttle",
    mappedValue(
      vehicle.throttle,
      quality,
      `vehicles[${index}].throttle`,
      "player.throttle",
    ),
  );
  assignIfPresent(
    optional,
    "brake",
    mappedValue(
      vehicle.brake,
      quality,
      `vehicles[${index}].brake`,
      "player.brake",
    ),
  );
  assignIfPresent(
    optional,
    "clutch",
    mappedValue(
      vehicle.clutch,
      quality,
      `vehicles[${index}].clutch`,
      "player.clutch",
    ),
  );
  return inPit === undefined ? undefined : { inPit, ...optional };
}

function mapScoringVehicle(
  vehicle: OverlayVehicleV1,
  index: number,
  playerIndex: number,
  quality: OverlayMappedField[],
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: vehicle.id,
    isPlayer: index === playerIndex,
  };
  recordQuality(vehicle.name, quality, `vehicles[${index}].name`);
  assignIfPresent(
    row,
    "place",
    mappedValue(
      vehicle.position,
      quality,
      `vehicles[${index}].position`,
      "scoring[].place",
    ),
  );
  assignIfPresent(
    row,
    "totalLaps",
    mappedValue(
      vehicle.completedLaps,
      quality,
      `vehicles[${index}].completedLaps`,
      "scoring[].totalLaps",
    ),
  );
  assignIfPresent(
    row,
    "inPits",
    mappedValue(
      vehicle.inPit,
      quality,
      `vehicles[${index}].inPit`,
      "scoring[].inPits",
    ),
  );
  assignIfPresent(
    row,
    "pitStopCount",
    mappedValue(
      vehicle.pitStopCount,
      quality,
      `vehicles[${index}].pitStopCount`,
      "scoring[].pitStopCount",
    ),
  );
  if (index !== playerIndex) {
    recordUnmappedVehicleFields(vehicle, index, quality);
  }
  return row;
}

function recordUnmappedVehicleFields(
  vehicle: OverlayVehicleV1,
  index: number,
  quality: OverlayMappedField[],
): void {
  const fields = [
    ["lapNumber", vehicle.lapNumber],
    ["gear", vehicle.gear],
    ["engineRpm", vehicle.engineRpm],
    ["speedMps", vehicle.speedMps],
    ["throttle", vehicle.throttle],
    ["brake", vehicle.brake],
    ["clutch", vehicle.clutch],
  ] as const;
  for (const [name, field] of fields) {
    quality.push({
      sourcePath: `vehicles[${index}].${name}`,
      present: field.present,
      provenance: field.provenance,
      freshness: field.freshness,
      usable: fieldIsUsable(field),
    });
  }
}

function recordQuality<T>(
  field: OverlayProjectionField<T>,
  quality: OverlayMappedField[],
  sourcePath: string,
): void {
  quality.push({
    sourcePath,
    present: field.present,
    provenance: field.provenance,
    freshness: field.freshness,
    usable: fieldIsUsable(field),
  });
}

function mappedValue<T>(
  field: OverlayProjectionField<T>,
  quality: OverlayMappedField[],
  sourcePath: string,
  targetPath: string,
): T | undefined {
  const usable = fieldIsUsable(field);
  quality.push({
    sourcePath,
    targetPath,
    present: field.present,
    provenance: field.provenance,
    freshness: field.freshness,
    usable,
  });
  return usable ? field.value : undefined;
}

function mappedScaledNumber(
  field: OverlayProjectionField<number>,
  quality: OverlayMappedField[],
  sourcePath: string,
  targetPath: string,
  factor: number,
): number | undefined {
  const sourceUsable = fieldIsUsable(field);
  const scaled = sourceUsable ? field.value * factor : undefined;
  const conversionUsable = scaled !== undefined && Number.isFinite(scaled);
  quality.push({
    sourcePath,
    targetPath,
    present: field.present,
    provenance: field.provenance,
    freshness:
      sourceUsable && !conversionUsable ? "invalid" : field.freshness,
    usable: conversionUsable,
  });
  return conversionUsable ? scaled : undefined;
}

type UsableOverlayField<T> = OverlayProjectionPresentField<T> &
  Readonly<{ freshness: "fresh" | "stale" }>;

function fieldIsUsable<T>(
  field: OverlayProjectionField<T>,
): field is UsableOverlayField<T> {
  return field.present && field.freshness !== "invalid";
}

function cloneUnsupported(): OverlayUnsupportedField[] {
  return UNSUPPORTED_FIELDS.map((field) => ({ ...field }));
}

function blocked(
  code: OverlayProjectionBlockCode,
  quality: OverlayMappedField[],
): OverlayProjectionBlocked {
  return deepFreeze({
    kind: "blocked",
    code,
    quality,
    unsupported: cloneUnsupported(),
  });
}

function assignIfPresent<T extends object, Key extends keyof T>(
  target: T,
  key: Key,
  value: T[Key] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function snapshotStatus(state: StatusState): TelemetrySnapshot["status"] {
  switch (state) {
    case "live":
      return "ready";
    case "degraded":
    case "stale":
      return "stale";
    case "error":
      return "error";
    case "stopped":
    case "detecting":
    case "connecting":
    case "stopping":
      return "disconnected";
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
