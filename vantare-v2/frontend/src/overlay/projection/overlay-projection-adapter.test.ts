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

describe("authoritative overlay projection adapter", () => {
  function withPose(
    projection: OverlayProjectionV1,
    freshness: "fresh" | "invalid",
  ): OverlayProjectionV1 {
    return {
      ...projection,
      payload: {
        ...projection.payload,
        vehicles: projection.payload.vehicles.map((vehicle, index) =>
          index === 0
            ? {
                ...vehicle,
                groundPositionCm: {
                  present: true,
                  value: { xCm: -48781, zCm: -48282 },
                  provenance: "observed" as const,
                  freshness,
                },
              }
            : vehicle,
        ),
      },
    };
  }

  it("converts a published ground position into metres", () => {
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(
        withPose(readGolden("lmu-1.4-delta-overlay-v1.golden.json"), "fresh"),
        { transportState: "live" },
      ),
    );

    expect(mapping.snapshot.scoring[0]).toMatchObject({
      groundPositionXMeters: -487.81,
      groundPositionZMeters: -482.82,
    });
  });

  it("drops a position the driver rejected instead of placing the car", () => {
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(
        withPose(readGolden("lmu-1.4-delta-overlay-v1.golden.json"), "invalid"),
        { transportState: "live" },
      ),
    );

    expect(mapping.snapshot.scoring[0]).not.toHaveProperty("groundPositionXMeters");
    expect(mapping.snapshot.scoring[0]).not.toHaveProperty("groundPositionZMeters");
    expect(
      mapping.quality.find((entry) => entry.targetPath === "scoring[].groundPosition"),
    ).toMatchObject({ present: true, freshness: "invalid", usable: false });
  });

  it("decodes and adapts the first real LMU delta projection produced by Go", () => {
    const projection = readGolden("lmu-1.4-delta-overlay-v1.golden.json");
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(projection, {
        transportState: "live",
      }),
    );

    expect(projection).toMatchObject({
      epoch: 1,
      sequence: 981,
      payload: {
        playerVehicleId: "lmu-slot-7-generation-1",
        playerDeltaSeconds: {
          present: true,
          value: -0.030563504,
          provenance: "derived",
          freshness: "fresh",
        },
      },
    });
    expect(mapping.snapshot).toMatchObject({
      status: "ready",
      player: {
        inPit: false,
        deltaSeconds: -0.030563504,
      },
    });
    expect(mapping.snapshot.scoring).toHaveLength(1);
    expect(mapping.snapshot.scoring[0]).toMatchObject({
      id: "lmu-slot-7-generation-1",
      isPlayer: true,
      inPits: false,
      lapDistanceMeters: 19.51011848449707,
    });
    expect(mapping.snapshot.derived?.deltaHistory).toEqual([
      { capturedAt: Date.parse("2026-07-31T18:01:38Z"), deltaSeconds: -0.030563504 },
    ]);
  });

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
        fuelLiters: 40,
        deltaSeconds: -0.25,
        lastLapSeconds: 91.25,
        bestLapSeconds: 90.5,
        predictedLapSeconds: 90.75,
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
        driverName: "Player",
        vehicleClass: "HYPERCAR",
        sector: 2,
        lapDistanceMeters: 1234.5,
        lastLapTime: 91.25,
        bestLapTime: 90.5,
        estimatedLapTime: 90.75,
        penaltyCount: 0,
        timeBehindLeader: 10,
        lapsBehindLeader: 0,
        timeBehindNext: 1.5,
        lapsBehindNext: 0,
        timeGapToPlayer: 0,
        relativeLapDelta: 0,
      },
      {
        id: "car-9",
        place: 1,
        totalLaps: 4,
        isPlayer: false,
        driverName: "Rival Driver",
        vehicleClass: "HYPERCAR",
        sector: 3,
        lapDistanceMeters: 1300,
        lastLapTime: 90.8,
        bestLapTime: 89.75,
        estimatedLapTime: 90.2,
        penaltyCount: 0,
        timeBehindLeader: 8,
        lapsBehindLeader: 0,
        timeBehindNext: 2,
        lapsBehindNext: 0,
        timeGapToPlayer: 2,
        relativeLapDelta: 0,
      },
    ]);
    expect(mapping.snapshot.session.trackName).toBeUndefined();
    expect(mapping.snapshot.session.remainingSeconds).toBe(3600);
    expect(mapping.snapshot.derived?.deltaHistory).toEqual([
      {
        capturedAt: Date.parse("2026-07-28T09:00:00Z"),
        deltaSeconds: -0.25,
      },
    ]);
    expect(mapping.snapshot.scoring.every((row) => !("pitStopCount" in row))).toBe(true);
    expect(mapping.quality.some((field) =>
      field.sourcePath.includes("pitStopCount") ||
      field.targetPath?.includes("pitStopCount")
    )).toBe(false);
    expect(mapping.quality).toContainEqual({
      sourcePath: "vehicles[0].name",
      present: true,
      provenance: "observed",
      freshness: "fresh",
      usable: true,
    });
    expect(mapping.quality).toEqual(expect.arrayContaining([
      {
        sourcePath: "vehicles[0].id",
        targetPath: "scoring[].id",
        present: true,
        provenance: "observed",
        freshness: "fresh",
        usable: true,
      },
      {
        sourcePath: "vehicles[1].id",
        targetPath: "scoring[].id",
        present: true,
        provenance: "observed",
        freshness: "fresh",
        usable: true,
      },
    ]));
  });

  it.each(["missing", "stale"] as const)(
    "keeps retained delta samples stable when current delta becomes %s",
    (freshness) => {
      const firstEnvelope = mutableProjection();
      const history = firstEnvelope.payload.deltaHistory as Record<string, unknown>;
      const latest = structuredClone(
        (history.samples as Record<string, unknown>[])[0]!,
      );
      history.freshness = freshness;
      history.samples = [
        {
          ...latest,
          sequence: (latest.sequence as number) - 1,
          capturedAt: (latest.capturedAt as number) - 100,
          sourceTimeSeconds: (latest.sourceTimeSeconds as number) - 0.1,
          lapDistanceMeters: (latest.lapDistanceMeters as number) - 5,
          deltaSeconds: (latest.deltaSeconds as number) + 0.01,
        },
        latest,
      ];
      const secondEnvelope = structuredClone(firstEnvelope);
      secondEnvelope.capturedAt = "2026-07-28T09:00:05Z";

      const first = requireMapped(
        adaptOverlayProjectionToSnapshot(decode(firstEnvelope), {
          transportState: "live",
        }),
      );
      const second = requireMapped(
        adaptOverlayProjectionToSnapshot(decode(secondEnvelope), {
          transportState: "live",
        }),
      );

      expect(first.snapshot.derived?.deltaHistory).toEqual(
        second.snapshot.derived?.deltaHistory,
      );
      expect(first.snapshot.derived?.deltaHistory).toEqual([
        {
          capturedAt: Date.parse("2026-07-28T08:59:59.900Z"),
          deltaSeconds: -0.24,
        },
        {
          capturedAt: Date.parse("2026-07-28T09:00:00Z"),
          deltaSeconds: -0.25,
        },
      ]);
      expect(first.quality).toContainEqual(
        expect.objectContaining({
          sourcePath: "deltaHistory",
          freshness,
          usable: freshness === "stale",
        }),
      );
    },
  );

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
      // El estado basta; un codigo interno en errorMessage acababa impreso en
      // el overlay porque los view models lo propagan a statusMessage.
      expect(mapping.snapshot.errorMessage).toBeUndefined();
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

  it("maps admitted signals and keeps phase, flags, team, number, compound, weather and damage unsupported", () => {
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(readGolden(), {
        transportState: "live",
      }),
    );

    expect(mapping.snapshot.player).toMatchObject({
      deltaSeconds: -0.25,
      fuelLiters: 40,
      lastLapSeconds: 91.25,
      bestLapSeconds: 90.5,
      predictedLapSeconds: 90.75,
    });
    expect(mapping.snapshot.session).not.toHaveProperty("globalFlag");
    expect(mapping.snapshot).not.toHaveProperty("environment");
    expect(mapping.snapshot).not.toHaveProperty("damage");
    expect(mapping.snapshot.derived?.deltaHistory).toHaveLength(1);
    for (const row of mapping.snapshot.scoring) {
      expect(row).toHaveProperty("timeGapToPlayer");
      expect(row).toHaveProperty("vehicleClass");
      expect(row).toHaveProperty("lastLapTime");
      expect(row).not.toHaveProperty("driverNumber");
      expect(row).not.toHaveProperty("teamName");
      expect(row).not.toHaveProperty("tireCompound");
    }
    expect(mapping.unsupported).toEqual(
      expect.arrayContaining([
        { targetPath: "session.globalFlag", reason: "unsupported-by-projection" },
        { targetPath: "scoring[].driverNumber", reason: "unsupported-by-projection" },
        { targetPath: "scoring[].teamName", reason: "unsupported-by-projection" },
        { targetPath: "scoring[].tireCompound", reason: "unsupported-by-projection" },
        { targetPath: "derived.inputHistory", reason: "history-without-timestamps" },
      ]),
    );
  });

  it("does not fabricate D7 fields when adapting the exact pre-D7 golden", () => {
    const mapping = requireMapped(
      adaptOverlayProjectionToSnapshot(readGolden("overlay_v1_pre_d7.golden.json"), {
        transportState: "live",
      }),
    );

    expect(mapping.snapshot.session).not.toHaveProperty("remainingSeconds");
    expect(mapping.snapshot.player).not.toHaveProperty("deltaSeconds");
    expect(mapping.snapshot.player).not.toHaveProperty("fuelLiters");
    expect(mapping.snapshot).not.toHaveProperty("derived");
    for (const row of mapping.snapshot.scoring) {
      expect(row).not.toHaveProperty("driverName");
      expect(row).not.toHaveProperty("vehicleClass");
      expect(row).not.toHaveProperty("timeGapToPlayer");
    }
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

function readGolden(fileName = "overlay_v1.golden.json"): OverlayProjectionV1 {
  return decode(readGoldenEnvelope(fileName));
}

function mutableProjection(): MutableProjectionEnvelope {
  return structuredClone(readGoldenEnvelope()) as MutableProjectionEnvelope;
}

function decode(value: ProjectionEnvelope): OverlayProjectionV1 {
  return decodeOverlayProjectionV1(value);
}

function readGoldenEnvelope(
  fileName = "overlay_v1.golden.json",
): ProjectionEnvelope {
  const snapshot = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        `../internal/telemetry/projection/overlay/testdata/${fileName}`,
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
