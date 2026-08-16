import type { StatusState } from "../../telemetry-transport/contracts";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";

// Maps the authoritative projection contract into renderer input only.
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
  { targetPath: "session.key", reason: "unsupported-by-projection" },
  { targetPath: "session.globalFlag", reason: "unsupported-by-projection" },
  { targetPath: "session.sectorFlags", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].driverNumber", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].teamName", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].tireCompound", reason: "unsupported-by-projection" },
  { targetPath: "derived.inputHistory", reason: "history-without-timestamps" },
  { targetPath: "derived.fuelHistory", reason: "unsupported-by-projection" },
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
  const remainingSeconds = mappedValue(
    projection.payload.remainingSeconds,
    quality,
    "remainingSeconds",
    "session.remainingSeconds",
  );
  recordQuality(projection.payload.endTimeSeconds, quality, "endTimeSeconds");
  recordQuality(projection.payload.maximumLaps, quality, "maximumLaps");
  recordQuality(
    projection.payload.playerDeltaReference,
    quality,
    "playerDeltaReference",
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
  const player = mapPlayer(
    playerVehicle,
    playerIndex,
    projection.payload.playerDeltaSeconds,
    projection.payload.playerDeltaPersonalBestSeconds,
    projection.payload.playerDeltaSessionBestSeconds,
    projection.payload.playerDeltaPreviousLapSeconds,
    quality,
  );
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
  if (remainingSeconds !== undefined) {
    session.remainingSeconds = remainingSeconds;
  }
  const transportStatus = snapshotStatus(options.transportState);
  const snapshot: TelemetrySnapshot = {
    status: transportStatus,
    capturedAt,
    session,
    player,
    scoring,
  };
  const deltaHistory = mapDeltaHistory(projection, quality);
  if (deltaHistory !== undefined) {
    snapshot.derived = {
      fuelHistory: [],
      inputHistory: [],
      deltaHistory,
    };
  }
  // El estado "error" ya viaja en snapshot.status, que es lo que consumen los
  // renderers para elegir su presentacion. Escribir aqui un codigo interno solo
  // servia para acabar impreso en el overlay.

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
  playerDelta: OverlayProjectionField<number>,
  playerDeltaPersonalBest: OverlayProjectionField<number>,
  playerDeltaSessionBest: OverlayProjectionField<number>,
  playerDeltaPreviousLap: OverlayProjectionField<number>,
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
  optional.deltaReferenceSet = true;
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
    "fuelLiters",
    mappedValue(
      vehicle.fuelLiters,
      quality,
      `vehicles[${index}].fuelLiters`,
      "player.fuelLiters",
    ),
  );
  recordQuality(
    vehicle.fuelCapacityLiters,
    quality,
    `vehicles[${index}].fuelCapacityLiters`,
  );
  assignIfPresent(
    optional,
    "deltaSeconds",
    mappedValue(
      playerDelta,
      quality,
      "playerDeltaSeconds",
      "player.deltaSeconds",
    ),
  );
  assignIfPresent(
    optional,
    "deltaPersonalBestSeconds",
    mappedValue(playerDeltaPersonalBest, quality, "playerDeltaPersonalBestSeconds", "player.deltaPersonalBestSeconds"),
  );
  assignIfPresent(
    optional,
    "deltaSessionBestSeconds",
    mappedValue(playerDeltaSessionBest, quality, "playerDeltaSessionBestSeconds", "player.deltaSessionBestSeconds"),
  );
  assignIfPresent(
    optional,
    "deltaPreviousLapSeconds",
    mappedValue(playerDeltaPreviousLap, quality, "playerDeltaPreviousLapSeconds", "player.deltaPreviousLapSeconds"),
  );
  assignIfPresent(
    optional,
    "lastLapSeconds",
    mappedValue(
      vehicle.lastLapSeconds,
      quality,
      `vehicles[${index}].lastLapSeconds`,
      "player.lastLapSeconds",
    ),
  );
  assignIfPresent(
    optional,
    "bestLapSeconds",
    mappedValue(
      vehicle.bestLapSeconds,
      quality,
      `vehicles[${index}].bestLapSeconds`,
      "player.bestLapSeconds",
    ),
  );
  assignIfPresent(
    optional,
    "predictedLapSeconds",
    mappedValue(
      vehicle.estimatedLapSeconds,
      quality,
      `vehicles[${index}].estimatedLapSeconds`,
      "player.predictedLapSeconds",
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
  quality.push({
    sourcePath: `vehicles[${index}].id`,
    targetPath: "scoring[].id",
    present: true,
    provenance: "observed",
    freshness: "fresh",
    usable: true,
  });
  const row: Record<string, unknown> = {
    id: vehicle.id,
    isPlayer: index === playerIndex,
  };
  recordQuality(vehicle.name, quality, `vehicles[${index}].name`);
  assignIfPresent(
    row,
    "driverName",
    mappedValue(
      vehicle.driverName,
      quality,
      `vehicles[${index}].driverName`,
      "scoring[].driverName",
    ),
  );
  assignIfPresent(
    row,
    "vehicleClass",
    mappedValue(
      vehicle.vehicleClass,
      quality,
      `vehicles[${index}].vehicleClass`,
      "scoring[].vehicleClass",
    ),
  );
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
  // The plane is published in centimetres and consumed in metres, so the widget
  // never has to remember which unit it is holding. Position and quality travel
  // together: a rejected reading yields nothing rather than a place on the map.
  const groundPosition = mappedValue(
    vehicle.groundPositionCm,
    quality,
    `vehicles[${index}].groundPositionCm`,
    "scoring[].groundPosition",
  );
  if (groundPosition !== undefined) {
    row.groundPositionXMeters = groundPosition.xCm / 100;
    row.groundPositionZMeters = groundPosition.zCm / 100;
  }
  const scoringFields = [
    ["sector", vehicle.sector, "sector"],
    ["lapDistanceMeters", vehicle.lapDistanceMeters, "lapDistanceMeters"],
    ["lastLapTime", vehicle.lastLapSeconds, "lastLapSeconds"],
    ["bestLapTime", vehicle.bestLapSeconds, "bestLapSeconds"],
    ["estimatedLapTime", vehicle.estimatedLapSeconds, "estimatedLapSeconds"],
    ["penaltyCount", vehicle.penaltyCount, "penaltyCount"],
    [
      "timeBehindLeader",
      vehicle.timeBehindLeaderSeconds,
      "timeBehindLeaderSeconds",
    ],
    ["lapsBehindLeader", vehicle.lapsBehindLeader, "lapsBehindLeader"],
    ["timeBehindNext", vehicle.timeBehindNextSeconds, "timeBehindNextSeconds"],
    ["lapsBehindNext", vehicle.lapsBehindNext, "lapsBehindNext"],
    [
      "timeGapToPlayer",
      vehicle.relativeTimeGapSeconds,
      "relativeTimeGapSeconds",
    ],
    ["relativeLapDelta", vehicle.relativeLapDelta, "relativeLapDelta"],
  ] as const;
  for (const [targetKey, field, sourceName] of scoringFields) {
    assignIfPresent(
      row,
      targetKey,
      mappedValue(
        field,
        quality,
        `vehicles[${index}].${sourceName}`,
        `scoring[].${targetKey}`,
      ),
    );
  }
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
  if (index !== playerIndex) {
    recordUnmappedVehicleFields(vehicle, index, quality);
  }
  return row;
}

function mapDeltaHistory(
  projection: OverlayProjectionV1,
  quality: OverlayMappedField[],
): NonNullable<TelemetrySnapshot["derived"]>["deltaHistory"] | undefined {
  const history = projection.payload.deltaHistory;
  const mappable =
    history.present &&
    history.freshness !== "invalid";
  const usable = mappable && history.freshness !== "missing";
  quality.push({
    sourcePath: "deltaHistory",
    targetPath: "derived.deltaHistory",
    present: history.present,
    provenance: history.provenance,
    freshness: history.freshness,
    usable,
  });
  if (!mappable) {
    return undefined;
  }
  return history.samples.map((sample) => ({
    capturedAt: sample.capturedAt,
    deltaSeconds: sample.deltaSeconds,
  }));
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
