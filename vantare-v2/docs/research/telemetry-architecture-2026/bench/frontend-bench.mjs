// docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// frontend/src/overlay/projection/overlay-projection-v1.ts
var OVERLAY_PROJECTION_MAX_VEHICLES = 104;
var OVERLAY_PROJECTION_MAX_CONTROL_SAMPLES = 120;
var OVERLAY_PROJECTION_MAX_DELTA_SAMPLES = 120;
var CAPABILITIES = [
  "session",
  "standings",
  "controls",
  "controls.history",
  "pit"
];
var PROVENANCE = ["unknown", "observed", "derived", "estimated"];
var FRESHNESS = ["missing", "fresh", "stale", "invalid"];
var SESSION_TYPES = [
  "practice",
  "qualifying",
  "race",
  "warmup",
  "endurance"
];
var DELTA_REFERENCES = ["best-completed-player-lap"];
var OverlayProjectionDecodeError = class extends Error {
  code;
  constructor(code) {
    super(code);
    this.name = "OverlayProjectionDecodeError";
    this.code = code;
  }
};
function decodeOverlayProjectionV1(envelope) {
  if (envelope.product !== "overlay") {
    throw new OverlayProjectionDecodeError("wrong-product");
  }
  if (envelope.projectionVersion !== 1) {
    throw new OverlayProjectionDecodeError("unsupported-version");
  }
  if (envelope.kind !== "full") {
    throw new OverlayProjectionDecodeError("full-snapshot-required");
  }
  const payload = requireObject(envelope.payload);
  requireKeys(payload, [
    "capabilities",
    "trackName",
    "sessionType",
    "playerVehicleId",
    "vehicles",
    "controlsHistory"
  ]);
  return deepFreeze({
    product: "overlay",
    projectionVersion: 1,
    epoch: requirePositiveSafeInteger(envelope.epoch),
    sequence: requirePositiveSafeInteger(envelope.sequence),
    capturedAt: envelope.capturedAt,
    statusRevision: requirePositiveSafeInteger(envelope.statusRevision),
    payload: {
      capabilities: decodeCapabilities(payload.capabilities),
      trackName: decodeField(payload.trackName, requireString),
      sessionType: decodeField(payload.sessionType, requireSessionType),
      playerVehicleId: requireString(payload.playerVehicleId),
      vehicles: decodeVehicles(payload.vehicles),
      controlsHistory: decodeHistory(payload.controlsHistory),
      endTimeSeconds: decodeOptionalField(
        payload,
        "endTimeSeconds",
        requireNonNegativeFiniteNumber,
        0
      ),
      remainingSeconds: decodeOptionalField(
        payload,
        "remainingSeconds",
        requireNonNegativeFiniteNumber,
        0
      ),
      maximumLaps: decodeOptionalField(
        payload,
        "maximumLaps",
        requireNonNegativeSafeInteger,
        0
      ),
      playerDeltaSeconds: decodeOptionalField(
        payload,
        "playerDeltaSeconds",
        requireFiniteNumber,
        0
      ),
      playerDeltaPersonalBestSeconds: decodeOptionalField(
        payload,
        "playerDeltaPersonalBestSeconds",
        requireFiniteNumber,
        0
      ),
      playerDeltaSessionBestSeconds: decodeOptionalField(
        payload,
        "playerDeltaSessionBestSeconds",
        requireFiniteNumber,
        0
      ),
      playerDeltaPreviousLapSeconds: decodeOptionalField(
        payload,
        "playerDeltaPreviousLapSeconds",
        requireFiniteNumber,
        0
      ),
      playerDeltaReference: decodeOptionalField(
        payload,
        "playerDeltaReference",
        requireDeltaReference,
        "best-completed-player-lap"
      ),
      deltaHistory: Object.hasOwn(payload, "deltaHistory") ? decodeDeltaHistory(payload.deltaHistory) : missingHistory()
    }
  });
}
function decodeCapabilities(value) {
  const entries = requireArray(value, CAPABILITIES.length);
  const seen = /* @__PURE__ */ new Set();
  return entries.map((entry) => {
    const capability = requireEnum(entry, CAPABILITIES);
    if (seen.has(capability)) {
      invalid();
    }
    seen.add(capability);
    return capability;
  });
}
function decodeVehicles(value) {
  const entries = requireArray(value, OVERLAY_PROJECTION_MAX_VEHICLES);
  const ids = /* @__PURE__ */ new Set();
  return entries.map((entry) => {
    const object = requireObject(entry);
    requireKeys(object, [
      "id",
      "name",
      "lapNumber",
      "gear",
      "engineRpm",
      "speedMps",
      "throttle",
      "brake",
      "clutch",
      "position",
      "completedLaps",
      "inPit",
      "pitStopCount"
    ]);
    const id = requireNonEmptyID(object.id);
    if (ids.has(id)) {
      invalid();
    }
    ids.add(id);
    return {
      id,
      name: decodeField(object.name, requireString),
      lapNumber: decodeField(object.lapNumber, requireNonNegativeSafeInteger),
      gear: decodeField(object.gear, requireSafeInteger),
      engineRpm: decodeField(object.engineRpm, requireNonNegativeFiniteNumber),
      speedMps: decodeField(object.speedMps, requireNonNegativeFiniteNumber),
      throttle: decodeField(object.throttle, requireRatio),
      brake: decodeField(object.brake, requireRatio),
      clutch: decodeField(object.clutch, requireRatio),
      position: decodeField(object.position, requireNonNegativeSafeInteger),
      completedLaps: decodeField(
        object.completedLaps,
        requireNonNegativeSafeInteger
      ),
      inPit: decodeField(object.inPit, requireBoolean),
      pitStopCount: decodeField(
        object.pitStopCount,
        requireNonNegativeSafeInteger
      ),
      driverName: decodeOptionalField(object, "driverName", requireString, ""),
      vehicleClass: decodeOptionalField(
        object,
        "vehicleClass",
        requireString,
        ""
      ),
      sector: decodeOptionalField(
        object,
        "sector",
        requireKnownSector,
        0
      ),
      lapDistanceMeters: decodeOptionalField(
        object,
        "lapDistanceMeters",
        requireNonNegativeFiniteNumber,
        0
      ),
      bestLapSeconds: decodeOptionalField(
        object,
        "bestLapSeconds",
        requireNonNegativeFiniteNumber,
        0
      ),
      lastLapSeconds: decodeOptionalField(
        object,
        "lastLapSeconds",
        requireNonNegativeFiniteNumber,
        0
      ),
      estimatedLapSeconds: decodeOptionalField(
        object,
        "estimatedLapSeconds",
        requireNonNegativeFiniteNumber,
        0
      ),
      penaltyCount: decodeOptionalField(
        object,
        "penaltyCount",
        requireNonNegativeSafeInteger,
        0
      ),
      timeBehindLeaderSeconds: decodeOptionalField(
        object,
        "timeBehindLeaderSeconds",
        requireNonNegativeFiniteNumber,
        0
      ),
      lapsBehindLeader: decodeOptionalField(
        object,
        "lapsBehindLeader",
        requireNonNegativeSafeInteger,
        0
      ),
      timeBehindNextSeconds: decodeOptionalField(
        object,
        "timeBehindNextSeconds",
        requireNonNegativeFiniteNumber,
        0
      ),
      lapsBehindNext: decodeOptionalField(
        object,
        "lapsBehindNext",
        requireNonNegativeSafeInteger,
        0
      ),
      fuelLiters: decodeOptionalField(
        object,
        "fuelLiters",
        requireNonNegativeFiniteNumber,
        0
      ),
      fuelCapacityLiters: decodeOptionalField(
        object,
        "fuelCapacityLiters",
        requireNonNegativeFiniteNumber,
        0
      ),
      relativeTimeGapSeconds: decodeOptionalField(
        object,
        "relativeTimeGapSeconds",
        requireFiniteNumber,
        0
      ),
      relativeLapDelta: decodeOptionalField(
        object,
        "relativeLapDelta",
        requireSafeInteger,
        0
      )
    };
  });
}
function decodeOptionalField(object, key, decodeValue, missingValue) {
  return Object.hasOwn(object, key) ? decodeField(object[key], decodeValue) : missingField(missingValue);
}
function missingField(value) {
  return {
    present: false,
    value,
    provenance: "unknown",
    freshness: "missing"
  };
}
function decodeHistory(value) {
  const object = requireObject(value);
  requireKeys(object, ["present", "provenance", "freshness", "samples"]);
  const present = requireBoolean(object.present);
  const samples = requireArray(
    object.samples,
    OVERLAY_PROJECTION_MAX_CONTROL_SAMPLES
  ).map((entry) => {
    const sample = requireObject(entry);
    requireKeys(sample, [
      "epoch",
      "sequence",
      "vehicleId",
      "throttle",
      "brake",
      "clutch"
    ]);
    return {
      epoch: requirePositiveSafeInteger(sample.epoch),
      sequence: requirePositiveSafeInteger(sample.sequence),
      vehicleId: requireNonEmptyID(sample.vehicleId),
      throttle: requireRatio(sample.throttle),
      brake: requireRatio(sample.brake),
      clutch: requireRatio(sample.clutch)
    };
  });
  if (present !== samples.length > 0) {
    invalid();
  }
  return {
    present,
    provenance: requireEnum(object.provenance, PROVENANCE),
    freshness: requireEnum(object.freshness, FRESHNESS),
    samples
  };
}
function decodeDeltaHistory(value) {
  const object = requireObject(value);
  requireKeys(object, ["present", "provenance", "freshness", "samples"]);
  const present = requireBoolean(object.present);
  const freshness = requireEnum(object.freshness, FRESHNESS);
  const samples = requireArray(
    object.samples,
    OVERLAY_PROJECTION_MAX_DELTA_SAMPLES
  ).map((entry) => {
    const sample = requireObject(entry);
    requireKeys(sample, [
      "epoch",
      "sequence",
      "capturedAt",
      "sourceTimeSeconds",
      "lapDistanceMeters",
      "deltaSeconds"
    ]);
    return {
      epoch: requirePositiveSafeInteger(sample.epoch),
      sequence: requirePositiveSafeInteger(sample.sequence),
      capturedAt: requireNonNegativeSafeInteger(sample.capturedAt),
      sourceTimeSeconds: requireNonNegativeFiniteNumber(
        sample.sourceTimeSeconds
      ),
      lapDistanceMeters: requireNonNegativeFiniteNumber(
        sample.lapDistanceMeters
      ),
      deltaSeconds: requireFiniteNumber(sample.deltaSeconds)
    };
  });
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (current.epoch !== previous.epoch || current.sequence <= previous.sequence || current.capturedAt < previous.capturedAt || current.sourceTimeSeconds < previous.sourceTimeSeconds) {
      invalid();
    }
  }
  if (present !== samples.length > 0) {
    invalid();
  }
  return {
    present,
    provenance: requireEnum(object.provenance, PROVENANCE),
    freshness,
    samples
  };
}
function missingHistory() {
  return {
    present: false,
    provenance: "unknown",
    freshness: "missing",
    samples: []
  };
}
function decodeField(value, decodeValue) {
  const object = requireObject(value);
  requireKeys(object, ["present", "value", "provenance", "freshness"]);
  const present = requireBoolean(object.present);
  const freshness = requireEnum(object.freshness, FRESHNESS);
  validatePresenceFreshness(present, freshness);
  const provenance = requireEnum(object.provenance, PROVENANCE);
  if (!present) {
    return {
      present: false,
      value: cloneTransportValue(object.value),
      provenance,
      freshness: "missing"
    };
  }
  if (freshness === "missing") {
    invalid();
  }
  return {
    present: true,
    value: decodeValue(object.value),
    provenance,
    freshness
  };
}
function validatePresenceFreshness(present, freshness) {
  if (present && freshness === "missing" || !present && freshness !== "missing") {
    invalid();
  }
}
function requireObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid();
  }
  return value;
}
function requireKeys(object, keys) {
  if (keys.some((key) => !Object.hasOwn(object, key))) {
    invalid();
  }
}
function requireArray(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    invalid();
  }
  return value;
}
function requireString(value) {
  if (typeof value !== "string") {
    invalid();
  }
  return value;
}
function requireNonEmptyID(value) {
  const id = requireString(value);
  if (id.trim().length === 0) {
    invalid();
  }
  return id;
}
function requireBoolean(value) {
  if (typeof value !== "boolean") {
    invalid();
  }
  return value;
}
function requireSafeInteger(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    invalid();
  }
  return value;
}
function requirePositiveSafeInteger(value) {
  const number = requireSafeInteger(value);
  if (number <= 0) {
    invalid();
  }
  return number;
}
function requireNonNegativeSafeInteger(value) {
  const number = requireSafeInteger(value);
  if (number < 0) {
    invalid();
  }
  return number;
}
function requireKnownSector(value) {
  const sector = requireSafeInteger(value);
  if (sector < 1 || sector > 3) {
    invalid();
  }
  return sector;
}
function requireNonNegativeFiniteNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid();
  }
  return value;
}
function requireFiniteNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid();
  }
  return value;
}
function requireRatio(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    invalid();
  }
  return value;
}
function requireSessionType(value) {
  return requireEnum(value, SESSION_TYPES);
}
function requireDeltaReference(value) {
  return requireEnum(value, DELTA_REFERENCES);
}
function requireEnum(value, allowed) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    invalid();
  }
  return value;
}
function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
function cloneTransportValue(value) {
  if (value === void 0) {
    invalid();
  }
  return structuredClone(value);
}
function invalid() {
  throw new OverlayProjectionDecodeError("invalid-overlay-payload");
}

// frontend/src/overlay/projection/overlay-projection-adapter.ts
var UNSUPPORTED_FIELDS = [
  { targetPath: "session.key", reason: "unsupported-by-projection" },
  { targetPath: "session.globalFlag", reason: "unsupported-by-projection" },
  { targetPath: "session.sectorFlags", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].driverNumber", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].teamName", reason: "unsupported-by-projection" },
  { targetPath: "scoring[].tireCompound", reason: "unsupported-by-projection" },
  { targetPath: "derived.inputHistory", reason: "history-without-timestamps" },
  { targetPath: "derived.fuelHistory", reason: "unsupported-by-projection" },
  { targetPath: "environment", reason: "unsupported-by-projection" },
  { targetPath: "damage", reason: "unsupported-by-projection" }
];
function adaptOverlayProjectionToSnapshot(projection, options) {
  const capturedAt = Date.parse(projection.capturedAt);
  const quality = [];
  const sessionType = mappedValue(
    projection.payload.sessionType,
    quality,
    "sessionType",
    "session.type"
  );
  const trackName = mappedValue(
    projection.payload.trackName,
    quality,
    "trackName",
    "session.trackName"
  );
  const remainingSeconds = mappedValue(
    projection.payload.remainingSeconds,
    quality,
    "remainingSeconds",
    "session.remainingSeconds"
  );
  recordQuality(projection.payload.endTimeSeconds, quality, "endTimeSeconds");
  recordQuality(projection.payload.maximumLaps, quality, "maximumLaps");
  recordQuality(
    projection.payload.playerDeltaReference,
    quality,
    "playerDeltaReference"
  );
  const playerIndex = projection.payload.vehicles.findIndex(
    (vehicle) => vehicle.id === projection.payload.playerVehicleId
  );
  const playerVehicle = projection.payload.vehicles[playerIndex];
  const playerPresent = playerIndex >= 0;
  quality.push({
    sourcePath: "playerVehicleId",
    targetPath: "player",
    present: playerPresent,
    provenance: playerPresent ? "observed" : "unknown",
    freshness: playerPresent ? "fresh" : "missing",
    usable: playerPresent
  });
  const scoring = projection.payload.vehicles.map(
    (vehicle, index) => mapScoringVehicle(vehicle, index, playerIndex, quality)
  );
  const player = mapPlayer(
    playerVehicle,
    playerIndex,
    projection.payload.playerDeltaSeconds,
    projection.payload.playerDeltaPersonalBestSeconds,
    projection.payload.playerDeltaSessionBestSeconds,
    projection.payload.playerDeltaPreviousLapSeconds,
    quality
  );
  quality.push({
    sourcePath: "controlsHistory",
    present: projection.payload.controlsHistory.present,
    provenance: projection.payload.controlsHistory.provenance,
    freshness: projection.payload.controlsHistory.freshness,
    usable: projection.payload.controlsHistory.present && projection.payload.controlsHistory.freshness !== "missing" && projection.payload.controlsHistory.freshness !== "invalid"
  });
  if (!Number.isFinite(capturedAt)) {
    return blocked("captured-at-invalid", quality);
  }
  if (sessionType === void 0) {
    return blocked("session-type-unavailable", quality);
  }
  if (!playerPresent) {
    return blocked("player-unavailable", quality);
  }
  if (!player) {
    return blocked("player-in-pit-unavailable", quality);
  }
  const session = { type: sessionType };
  if (trackName !== void 0) {
    session.trackName = trackName;
  }
  if (remainingSeconds !== void 0) {
    session.remainingSeconds = remainingSeconds;
  }
  const transportStatus = snapshotStatus(options.transportState);
  const snapshot = {
    status: transportStatus,
    capturedAt,
    session,
    player,
    scoring
  };
  const deltaHistory = mapDeltaHistory(projection, quality);
  if (deltaHistory !== void 0) {
    snapshot.derived = {
      fuelHistory: [],
      inputHistory: [],
      deltaHistory
    };
  }
  return deepFreeze2({
    kind: "mapped",
    snapshot,
    quality,
    unsupported: cloneUnsupported()
  });
}
function mapPlayer(vehicle, index, playerDelta, playerDeltaPersonalBest, playerDeltaSessionBest, playerDeltaPreviousLap, quality) {
  if (!vehicle || index < 0) {
    return void 0;
  }
  const inPit = mappedValue(
    vehicle.inPit,
    quality,
    `vehicles[${index}].inPit`,
    "player.inPit"
  );
  const optional = {};
  optional.deltaReferenceSet = true;
  assignIfPresent(
    optional,
    "speedKph",
    mappedScaledNumber(
      vehicle.speedMps,
      quality,
      `vehicles[${index}].speedMps`,
      "player.speedKph",
      3.6
    )
  );
  assignIfPresent(
    optional,
    "fuelLiters",
    mappedValue(
      vehicle.fuelLiters,
      quality,
      `vehicles[${index}].fuelLiters`,
      "player.fuelLiters"
    )
  );
  recordQuality(
    vehicle.fuelCapacityLiters,
    quality,
    `vehicles[${index}].fuelCapacityLiters`
  );
  assignIfPresent(
    optional,
    "deltaSeconds",
    mappedValue(
      playerDelta,
      quality,
      "playerDeltaSeconds",
      "player.deltaSeconds"
    )
  );
  assignIfPresent(
    optional,
    "deltaPersonalBestSeconds",
    mappedValue(playerDeltaPersonalBest, quality, "playerDeltaPersonalBestSeconds", "player.deltaPersonalBestSeconds")
  );
  assignIfPresent(
    optional,
    "deltaSessionBestSeconds",
    mappedValue(playerDeltaSessionBest, quality, "playerDeltaSessionBestSeconds", "player.deltaSessionBestSeconds")
  );
  assignIfPresent(
    optional,
    "deltaPreviousLapSeconds",
    mappedValue(playerDeltaPreviousLap, quality, "playerDeltaPreviousLapSeconds", "player.deltaPreviousLapSeconds")
  );
  assignIfPresent(
    optional,
    "lastLapSeconds",
    mappedValue(
      vehicle.lastLapSeconds,
      quality,
      `vehicles[${index}].lastLapSeconds`,
      "player.lastLapSeconds"
    )
  );
  assignIfPresent(
    optional,
    "bestLapSeconds",
    mappedValue(
      vehicle.bestLapSeconds,
      quality,
      `vehicles[${index}].bestLapSeconds`,
      "player.bestLapSeconds"
    )
  );
  assignIfPresent(
    optional,
    "predictedLapSeconds",
    mappedValue(
      vehicle.estimatedLapSeconds,
      quality,
      `vehicles[${index}].estimatedLapSeconds`,
      "player.predictedLapSeconds"
    )
  );
  assignIfPresent(
    optional,
    "rpm",
    mappedValue(
      vehicle.engineRpm,
      quality,
      `vehicles[${index}].engineRpm`,
      "player.rpm"
    )
  );
  assignIfPresent(
    optional,
    "gear",
    mappedValue(
      vehicle.gear,
      quality,
      `vehicles[${index}].gear`,
      "player.gear"
    )
  );
  assignIfPresent(
    optional,
    "totalLaps",
    mappedValue(
      vehicle.completedLaps,
      quality,
      `vehicles[${index}].completedLaps`,
      "player.totalLaps"
    )
  );
  assignIfPresent(
    optional,
    "lapNumber",
    mappedValue(
      vehicle.lapNumber,
      quality,
      `vehicles[${index}].lapNumber`,
      "player.lapNumber"
    )
  );
  assignIfPresent(
    optional,
    "throttle",
    mappedValue(
      vehicle.throttle,
      quality,
      `vehicles[${index}].throttle`,
      "player.throttle"
    )
  );
  assignIfPresent(
    optional,
    "brake",
    mappedValue(
      vehicle.brake,
      quality,
      `vehicles[${index}].brake`,
      "player.brake"
    )
  );
  assignIfPresent(
    optional,
    "clutch",
    mappedValue(
      vehicle.clutch,
      quality,
      `vehicles[${index}].clutch`,
      "player.clutch"
    )
  );
  return inPit === void 0 ? void 0 : { inPit, ...optional };
}
function mapScoringVehicle(vehicle, index, playerIndex, quality) {
  quality.push({
    sourcePath: `vehicles[${index}].id`,
    targetPath: "scoring[].id",
    present: true,
    provenance: "observed",
    freshness: "fresh",
    usable: true
  });
  const row = {
    id: vehicle.id,
    isPlayer: index === playerIndex
  };
  recordQuality(vehicle.name, quality, `vehicles[${index}].name`);
  assignIfPresent(
    row,
    "driverName",
    mappedValue(
      vehicle.driverName,
      quality,
      `vehicles[${index}].driverName`,
      "scoring[].driverName"
    )
  );
  assignIfPresent(
    row,
    "vehicleClass",
    mappedValue(
      vehicle.vehicleClass,
      quality,
      `vehicles[${index}].vehicleClass`,
      "scoring[].vehicleClass"
    )
  );
  assignIfPresent(
    row,
    "place",
    mappedValue(
      vehicle.position,
      quality,
      `vehicles[${index}].position`,
      "scoring[].place"
    )
  );
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
      "timeBehindLeaderSeconds"
    ],
    ["lapsBehindLeader", vehicle.lapsBehindLeader, "lapsBehindLeader"],
    ["timeBehindNext", vehicle.timeBehindNextSeconds, "timeBehindNextSeconds"],
    ["lapsBehindNext", vehicle.lapsBehindNext, "lapsBehindNext"],
    [
      "timeGapToPlayer",
      vehicle.relativeTimeGapSeconds,
      "relativeTimeGapSeconds"
    ],
    ["relativeLapDelta", vehicle.relativeLapDelta, "relativeLapDelta"]
  ];
  for (const [targetKey, field, sourceName] of scoringFields) {
    assignIfPresent(
      row,
      targetKey,
      mappedValue(
        field,
        quality,
        `vehicles[${index}].${sourceName}`,
        `scoring[].${targetKey}`
      )
    );
  }
  assignIfPresent(
    row,
    "totalLaps",
    mappedValue(
      vehicle.completedLaps,
      quality,
      `vehicles[${index}].completedLaps`,
      "scoring[].totalLaps"
    )
  );
  assignIfPresent(
    row,
    "inPits",
    mappedValue(
      vehicle.inPit,
      quality,
      `vehicles[${index}].inPit`,
      "scoring[].inPits"
    )
  );
  if (index !== playerIndex) {
    recordUnmappedVehicleFields(vehicle, index, quality);
  }
  return row;
}
function mapDeltaHistory(projection, quality) {
  const history = projection.payload.deltaHistory;
  const mappable = history.present && history.freshness !== "invalid";
  const usable = mappable && history.freshness !== "missing";
  quality.push({
    sourcePath: "deltaHistory",
    targetPath: "derived.deltaHistory",
    present: history.present,
    provenance: history.provenance,
    freshness: history.freshness,
    usable
  });
  if (!mappable) {
    return void 0;
  }
  return history.samples.map((sample) => ({
    capturedAt: sample.capturedAt,
    deltaSeconds: sample.deltaSeconds
  }));
}
function recordUnmappedVehicleFields(vehicle, index, quality) {
  const fields = [
    ["lapNumber", vehicle.lapNumber],
    ["gear", vehicle.gear],
    ["engineRpm", vehicle.engineRpm],
    ["speedMps", vehicle.speedMps],
    ["throttle", vehicle.throttle],
    ["brake", vehicle.brake],
    ["clutch", vehicle.clutch]
  ];
  for (const [name, field] of fields) {
    quality.push({
      sourcePath: `vehicles[${index}].${name}`,
      present: field.present,
      provenance: field.provenance,
      freshness: field.freshness,
      usable: fieldIsUsable(field)
    });
  }
}
function recordQuality(field, quality, sourcePath) {
  quality.push({
    sourcePath,
    present: field.present,
    provenance: field.provenance,
    freshness: field.freshness,
    usable: fieldIsUsable(field)
  });
}
function mappedValue(field, quality, sourcePath, targetPath) {
  const usable = fieldIsUsable(field);
  quality.push({
    sourcePath,
    targetPath,
    present: field.present,
    provenance: field.provenance,
    freshness: field.freshness,
    usable
  });
  return usable ? field.value : void 0;
}
function mappedScaledNumber(field, quality, sourcePath, targetPath, factor) {
  const sourceUsable = fieldIsUsable(field);
  const scaled = sourceUsable ? field.value * factor : void 0;
  const conversionUsable = scaled !== void 0 && Number.isFinite(scaled);
  quality.push({
    sourcePath,
    targetPath,
    present: field.present,
    provenance: field.provenance,
    freshness: sourceUsable && !conversionUsable ? "invalid" : field.freshness,
    usable: conversionUsable
  });
  return conversionUsable ? scaled : void 0;
}
function fieldIsUsable(field) {
  return field.present && field.freshness !== "invalid";
}
function cloneUnsupported() {
  return UNSUPPORTED_FIELDS.map((field) => ({ ...field }));
}
function blocked(code, quality) {
  return deepFreeze2({
    kind: "blocked",
    code,
    quality,
    unsupported: cloneUnsupported()
  });
}
function assignIfPresent(target, key, value) {
  if (value !== void 0) {
    target[key] = value;
  }
}
function snapshotStatus(state) {
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
function deepFreeze2(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze2(child);
  }
  return Object.freeze(value);
}

// docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts
var payloadDir = resolve(process.argv[2] ?? "results/payloads");
var cases = [
  { label: "overlay v1 x1", file: "overlay-v1-001.json", decode: true },
  { label: "overlay v1 x20", file: "overlay-v1-020.json", decode: true },
  { label: "overlay v1 x104", file: "overlay-v1-104.json", decode: true },
  { label: "compacto array x1", file: "compact-array-001.json", decode: false },
  { label: "compacto array x20", file: "compact-array-020.json", decode: false },
  { label: "compacto array x104", file: "compact-array-104.json", decode: false },
  { label: "compacto mapa x104", file: "compact-map-104.json", decode: false },
  { label: "canonical x104", file: "canonical-104.json", decode: false }
];
var ITERATIONS = 2e3;
var WARMUP = 200;
function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}
function measure(label, iterations, run) {
  for (let i = 0; i < WARMUP; i += 1) run();
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - start) / 1e3);
  }
  const total = samples.reduce((sum, value) => sum + value, 0);
  samples.sort((a, b) => a - b);
  return [
    label.padEnd(46),
    `${(total / samples.length).toFixed(1)} us media`.padStart(18),
    `${percentile(samples, 0.5).toFixed(1)} p50`.padStart(14),
    `${percentile(samples, 0.95).toFixed(1)} p95`.padStart(14),
    `${percentile(samples, 0.99).toFixed(1)} p99`.padStart(14)
  ].join(" ");
}
var lines = [];
lines.push(`node ${process.version}`);
lines.push(`${ITERATIONS} iteraciones por caso, ${WARMUP} de calentamiento`);
lines.push("");
for (const current of cases) {
  const raw = readFileSync(resolve(payloadDir, current.file), "utf8");
  lines.push(
    measure(`JSON.parse ${current.label} (${raw.length} B)`, ITERATIONS, () => {
      JSON.parse(raw);
    })
  );
  if (!current.decode) continue;
  const parsed = JSON.parse(raw);
  const envelope = {
    product: "overlay",
    projectionVersion: 1,
    epoch: 1,
    sequence: 32,
    kind: "full",
    capturedAt: "2026-08-19T12:00:00.000Z",
    statusRevision: 1,
    payload: parsed
  };
  lines.push(
    measure(`decodeOverlayProjectionV1 ${current.label}`, ITERATIONS, () => {
      decodeOverlayProjectionV1(envelope);
    })
  );
  const decoded = decodeOverlayProjectionV1(envelope);
  lines.push(
    measure(`adapt->TelemetrySnapshot ${current.label}`, ITERATIONS, () => {
      adaptOverlayProjectionToSnapshot(decoded, { transportState: "live" });
    })
  );
  lines.push(
    measure(`parse+decode+adapt ${current.label}`, ITERATIONS, () => {
      const value = decodeOverlayProjectionV1({
        ...envelope,
        payload: JSON.parse(raw)
      });
      adaptOverlayProjectionToSnapshot(value, { transportState: "live" });
    })
  );
  lines.push("");
}
process.stdout.write(lines.join("\n") + "\n");
