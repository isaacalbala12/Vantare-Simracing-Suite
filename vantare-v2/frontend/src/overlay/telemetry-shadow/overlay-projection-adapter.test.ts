import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeTransportEvent,
  eventName,
  type JSONObject,
  type ProjectionEnvelope,
} from "../../telemetry-transport/contracts";
import {
  decodeOverlayProjectionV1,
  type OverlayProjectionV1,
} from "./overlay-projection-v1";
import {
  adaptOverlayProjectionToSnapshot,
  type OverlayProjectionAdaptation,
  type OverlayProjectionMapping,
} from "./overlay-projection-adapter";

describe("overlay projection adapter", () => {
  it("maps the demonstrated golden fields and identifies the player by ID", () => {
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(readGolden(), {
        transportState: "live",
      }),
    );

    expect(mapping.snapshot).toMatchObject({
      status: "ready",
      capturedAt: Date.parse("2026-07-28T09:00:00Z"),
      session: { type: "race" },
      player: {
        inPit: false,
        speedKph: 0,
        throttle: 0,
        brake: 1,
        clutch: 0,
        totalLaps: 4,
      },
    });
    expect(mapping.snapshot.scoring).toEqual([
      {
        id: "car-7",
        place: 2,
        totalLaps: 4,
        inPits: false,
        isPlayer: true,
      },
      {
        id: "car-9",
        place: 1,
        totalLaps: 4,
        isPlayer: false,
      },
    ]);
    expect(mapping.snapshot.session.trackName).toBeUndefined();
    expect(mapping.quality).toContainEqual({
      sourcePath: "vehicles[0].name",
      present: true,
      provenance: "observed",
      freshness: "fresh",
      usable: true,
    });
  });

  it.each([
    ["stale", "stale"],
    ["degraded", "stale"],
    ["error", "error"],
    ["stopped", "disconnected"],
    ["detecting", "disconnected"],
    ["connecting", "disconnected"],
    ["stopping", "disconnected"],
  ] as const)("maps transport %s to snapshot %s", (transportState, expected) => {
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(readGolden(), {
        transportState,
      }),
    );
    expect(mapping.snapshot.status).toBe(expected);
    if (transportState === "error") {
      expect(mapping.snapshot.errorMessage).toBe("overlay-projection-transport-error");
    }
  });

  it("keeps an isolated stale field usable and marked without degrading the snapshot", () => {
    const projection = mutableProjection();
    firstVehicle(projection).speedMps = field(
      true,
      12.5,
      "observed",
      "stale",
    );

    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(decode(projection), {
        transportState: "live",
      }),
    );

    expect(mapping.snapshot.status).toBe("ready");
    expect(mapping.snapshot.player.speedKph).toBe(45);
    expect(mapping.quality).toContainEqual({
      sourcePath: "vehicles[0].speedMps",
      targetPath: "player.speedKph",
      present: true,
      provenance: "observed",
      freshness: "stale",
      usable: true,
    });
  });

  it("maps missing and invalid values to undefined while preserving quality", () => {
    const projection = mutableProjection();
    const player = firstVehicle(projection);
    player.gear = field(false, 0, "unknown", "missing");
    player.engineRpm = field(true, 0, "observed", "invalid");

    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(decode(projection), {
        transportState: "live",
      }),
    );

    expect(mapping.snapshot.player.gear).toBeUndefined();
    expect(mapping.snapshot.player.rpm).toBeUndefined();
    expect(mapping.quality).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: "vehicles[0].gear",
          present: false,
          freshness: "missing",
          usable: false,
        }),
        expect.objectContaining({
          sourcePath: "vehicles[0].engineRpm",
          present: true,
          freshness: "invalid",
          usable: false,
        }),
      ]),
    );
  });

  it("blocks an empty player ID instead of matching a vehicle by position", () => {
    const projection = mutableProjection();
    projection.payload.playerVehicleId = "";

    const mapping = adaptOverlayProjectionToSnapshot(decode(projection), {
      transportState: "live",
    });

    expect(mapping).toMatchObject({ kind: "blocked", code: "player-unavailable" });
    expect(mapping).not.toHaveProperty("snapshot");
    expect(mapping.quality).toContainEqual({
      sourcePath: "playerVehicleId",
      targetPath: "player",
      present: false,
      provenance: "unknown",
      freshness: "missing",
      usable: false,
    });
  });

  it("does not emit an infinite km/h value when a finite m/s value overflows", () => {
    const projection = mutableProjection();
    firstVehicle(projection).speedMps = field(
      true,
      Number.MAX_VALUE,
      "observed",
      "fresh",
    );

    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(decode(projection), {
        transportState: "live",
      }),
    );

    expect(mapping.snapshot.player.speedKph).toBeUndefined();
    expect(mapping.quality).toContainEqual({
      sourcePath: "vehicles[0].speedMps",
      targetPath: "player.speedKph",
      present: true,
      provenance: "observed",
      freshness: "invalid",
      usable: false,
    });
  });

  it("marks the frame missing when the player's in-pit signal is unavailable", () => {
    const projection = mutableProjection();
    firstVehicle(projection).inPit = field(
      false,
      false,
      "unknown",
      "missing",
    );

    const mapping = adaptOverlayProjectionToSnapshot(decode(projection), {
      transportState: "live",
    });

    expect(mapping).toMatchObject({
      kind: "blocked",
      code: "player-in-pit-unavailable",
    });
    expect(mapping).not.toHaveProperty("snapshot");
    expect(mapping.quality).toContainEqual(
      expect.objectContaining({
        sourcePath: "vehicles[0].inPit",
        targetPath: "player.inPit",
        usable: false,
      }),
    );
  });

  it("blocks an unavailable session type without leaking IDs or names", () => {
    const projection = mutableProjection();
    projection.payload.playerVehicleId = "private-player-id";
    projection.payload.sessionType = field(
      false,
      "",
      "unknown",
      "missing",
    );

    const result = adaptOverlayProjectionToSnapshot(decode(projection), {
      transportState: "live",
    });
    expect(result).toMatchObject({
      kind: "blocked",
      code: "session-type-unavailable",
    });
    expect(result).not.toHaveProperty("snapshot");
    expect(JSON.stringify(result)).not.toContain("private-player-id");
    expect(JSON.stringify(result)).not.toContain("Vantare GT");
  });

  it("blocks an invalid capturedAt without declaring it comparable", () => {
    const result = adaptOverlayProjectionToSnapshot(
      { ...readGolden(), capturedAt: "not-a-timestamp" },
      { transportState: "live" },
    );

    expect(result).toMatchObject({
      kind: "blocked",
      code: "captured-at-invalid",
    });
    expect(result.quality.some((entry) => entry.sourcePath === "capturedAt")).toBe(
      false,
    );
  });

  it("never fabricates unsupported delta, gaps, fuel, lap times, classes, flags, weather or damage", () => {
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(readGolden(), {
        transportState: "live",
      }),
    );

    expect(mapping.snapshot.player).not.toHaveProperty("deltaSeconds");
    expect(mapping.snapshot.player).not.toHaveProperty("fuelLiters");
    expect(mapping.snapshot.player).not.toHaveProperty("lastLapSeconds");
    expect(mapping.snapshot.session).not.toHaveProperty("globalFlag");
    expect(mapping.snapshot).not.toHaveProperty("environment");
    expect(mapping.snapshot).not.toHaveProperty("damage");
    expect(mapping.snapshot).not.toHaveProperty("derived");
    for (const row of mapping.snapshot.scoring) {
      expect(row).not.toHaveProperty("timeGapToPlayer");
      expect(row).not.toHaveProperty("vehicleClass");
      expect(row).not.toHaveProperty("lastLapTime");
    }
    expect(mapping.unsupported).toEqual(
      expect.arrayContaining([
        { targetPath: "player.deltaSeconds", reason: "unsupported-by-projection" },
        { targetPath: "scoring[].driverName", reason: "unsupported-by-projection" },
        { targetPath: "scoring[].timeGapToPlayer", reason: "unsupported-by-projection" },
        { targetPath: "derived.inputHistory", reason: "history-without-timestamps" },
      ]),
    );
  });

  it("returns deeply immutable objects without mutating the decoded projection", () => {
    const projection = readGolden();
    const before = JSON.stringify(projection);

    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(projection, {
        transportState: "live",
      }),
    );

    expect(JSON.stringify(projection)).toBe(before);
    expect(Object.isFrozen(mapping)).toBe(true);
    expect(Object.isFrozen(mapping.snapshot)).toBe(true);
    expect(Object.isFrozen(mapping.snapshot.player)).toBe(true);
    expect(Object.isFrozen(mapping.snapshot.scoring)).toBe(true);
    expect(Object.isFrozen(mapping.snapshot.scoring[0])).toBe(true);
    expect(Object.isFrozen(mapping.quality)).toBe(true);
    expect(Object.isFrozen(mapping.unsupported)).toBe(true);
  });
});

function readGolden(): OverlayProjectionV1 {
  return decode(readGoldenEnvelope());
}

function mutableProjection(): MutableProjectionEnvelope {
  return structuredClone(readGoldenEnvelope()) as MutableProjectionEnvelope;
}

function decode(value: ProjectionEnvelope): OverlayProjectionV1 {
  return decodeOverlayProjectionV1(value);
}

function readGoldenEnvelope(): ProjectionEnvelope {
  const snapshot = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        "../internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const payload = { ...snapshot } as JSONObject;
  delete payload.canonicalVersion;
  delete payload.projectionVersion;
  delete payload.epoch;
  delete payload.sequence;
  delete payload.capturedAt;
  const decoded = decodeTransportEvent(eventName("overlay", "projection"), {
    product: "overlay",
    projectionVersion: snapshot.projectionVersion,
    epoch: snapshot.epoch,
    sequence: snapshot.sequence,
    kind: "full",
    capturedAt: snapshot.capturedAt,
    statusRevision: 1,
    payload,
  });
  if (decoded.kind !== "projection") {
    throw new Error("golden-not-projection");
  }
  return decoded.value;
}

type MutableProjectionEnvelope = ProjectionEnvelope & {
  payload: JSONObject & {
    playerVehicleId: string;
    sessionType: Record<string, unknown>;
    vehicles: Record<string, unknown>[];
  };
};

function firstVehicle(input: MutableProjectionEnvelope): Record<string, unknown> {
  return input.payload.vehicles[0]!;
}

function field(
  present: boolean,
  value: unknown,
  provenance: string,
  freshness: string,
): Record<string, unknown> {
  return { present, value, provenance, freshness };
}

function requireMapped(
  result: OverlayProjectionAdaptation,
): OverlayProjectionMapping {
  expect(result.kind).toBe("mapped");
  if (result.kind !== "mapped") {
    throw new Error(`expected-mapped:${result.code}`);
  }
  return result;
}
