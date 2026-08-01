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
  OverlayProjectionDecodeError,
} from "./overlay-projection-v1";

const golden = readGoldenEnvelope();
const preD7Golden = readGoldenEnvelope("overlay_v1_pre_d7.golden.json");

describe("overlay projection v1 decoder", () => {
  it("decodes the Go overlay golden and preserves legitimate zero and false values", () => {
    const decoded = decodeOverlayProjectionV1(golden);

    expect(decoded.payload.capabilities).toEqual([
      "session",
      "standings",
      "controls",
      "pit",
      "controls.history",
    ]);
    expect(decoded.payload.trackName).toEqual({
      present: false,
      value: "",
      provenance: "unknown",
      freshness: "missing",
    });
    expect(decoded.payload.vehicles[0]).toMatchObject({
      id: "car-7",
      speedMps: { present: true, value: 0, freshness: "fresh" },
      throttle: { present: true, value: 0, freshness: "fresh" },
      clutch: { present: true, value: 0, freshness: "fresh" },
      inPit: { present: true, value: false, freshness: "fresh" },
    });
    expect(decoded.payload.vehicles[1]?.speedMps.freshness).toBe("stale");
    expect(decoded.payload).toMatchObject({
      endTimeSeconds: { present: true, value: 7200 },
      remainingSeconds: { present: true, value: 3600 },
      maximumLaps: { present: true, value: 0 },
      playerDeltaSeconds: { present: true, value: -0.25 },
      playerDeltaReference: {
        present: true,
        value: "best-completed-player-lap",
      },
      deltaHistory: { present: true, freshness: "fresh" },
    });
    expect(decoded.payload.vehicles[0]).toMatchObject({
      driverName: { present: true, value: "Player" },
      vehicleClass: { present: true, value: "HYPERCAR" },
      penaltyCount: { present: true, value: 0 },
      relativeTimeGapSeconds: { present: true, value: 0 },
      relativeLapDelta: { present: true, value: 0 },
      fuelLiters: { present: true, value: 40 },
      fuelCapacityLiters: { present: true, value: 100 },
    });
    expect(decoded.payload.deltaHistory.samples).toEqual([
      {
        epoch: 2,
        sequence: 8,
        capturedAt: Date.parse("2026-07-28T09:00:00Z"),
        sourceTimeSeconds: 3600,
        lapDistanceMeters: 1234.5,
        deltaSeconds: -0.25,
      },
    ]);
  });

  it("decodes the exact pre-D7 golden and normalizes every additive field to missing", () => {
    const decoded = decodeOverlayProjectionV1(preD7Golden);

    expect(decoded.payload.endTimeSeconds).toEqual(missing(0));
    expect(decoded.payload.remainingSeconds).toEqual(missing(0));
    expect(decoded.payload.maximumLaps).toEqual(missing(0));
    expect(decoded.payload.playerDeltaSeconds).toEqual(missing(0));
    expect(decoded.payload.playerDeltaReference).toEqual(
      missing("best-completed-player-lap"),
    );
    expect(decoded.payload.deltaHistory).toEqual({
      present: false,
      provenance: "unknown",
      freshness: "missing",
      samples: [],
    });
    for (const vehicle of decoded.payload.vehicles) {
      expect(vehicle.driverName).toEqual(missing(""));
      expect(vehicle.vehicleClass).toEqual(missing(""));
      expect(vehicle.fuelLiters).toEqual(missing(0));
      expect(vehicle.relativeTimeGapSeconds).toEqual(missing(0));
    }
  });

  it("keeps the new golden compatible with the frozen pre-D7 consumer surface", () => {
    const oldConsumer = decodeAsPreD7Consumer(golden);

    expect(oldConsumer).toEqual(decodeAsPreD7Consumer(preD7Golden));

    expect(oldConsumer.payload.vehicles[0]).not.toHaveProperty("driverName");
    expect(oldConsumer.payload).not.toHaveProperty("deltaHistory");
    expect(oldConsumer.payload.capabilities).toEqual([
      "session",
      "standings",
      "controls",
      "pit",
      "controls.history",
    ]);
    expect(oldConsumer.payload.vehicles[0]).toMatchObject({
      id: "car-7",
      speedMps: { present: true, value: 0 },
      inPit: { present: true, value: false },
    });
  });

  it("keeps missing and invalid quality distinct even when a zero value is carried", () => {
    const input = cloneEnvelope(golden);
    const vehicle = firstVehicle(input);
    vehicle.gear = field(false, 0, "unknown", "missing");
    vehicle.engineRpm = field(true, 0, "observed", "invalid");

    const decoded = decodeOverlayProjectionV1(input);

    expect(decoded.payload.vehicles[0]?.gear).toEqual(vehicle.gear);
    expect(decoded.payload.vehicles[0]?.engineRpm).toEqual(vehicle.engineRpm);
  });

  it("accepts the real Go zero-value for an absent session type", () => {
    const input = cloneEnvelope(golden);
    input.payload.sessionType = field(false, "", "unknown", "missing");

    const decoded = decodeOverlayProjectionV1(input);

    expect(decoded.payload.sessionType).toEqual({
      present: false,
      value: "",
      provenance: "unknown",
      freshness: "missing",
    });
  });

  it.each([
    [true, "missing", 1],
    [true, "invalid", 1],
    [false, "stale", 0],
  ] as const)(
    "keeps controlsHistory semantics separate: present=%s freshness=%s",
    (present, freshness, sampleCount) => {
      const input = cloneEnvelope(golden);
      const history = input.payload.controlsHistory as Record<string, unknown>;
      history.present = present;
      history.freshness = freshness;
      history.samples = sampleCount === 0 ? [] : history.samples;

      const decoded = decodeOverlayProjectionV1(input);

      expect(decoded.payload.controlsHistory).toMatchObject({
        present,
        freshness,
      });
    },
  );

  it.each([
    [true, "missing", 1],
    [true, "stale", 1],
    [true, "invalid", 1],
    [false, "stale", 0],
  ] as const)(
    "keeps deltaHistory samples independent from live freshness: present=%s freshness=%s",
    (present, freshness, sampleCount) => {
      const input = cloneEnvelope(golden);
      const history = input.payload.deltaHistory as Record<string, unknown>;
      history.present = present;
      history.freshness = freshness;
      history.samples = sampleCount === 0 ? [] : history.samples;

      const decoded = decodeOverlayProjectionV1(input);

      expect(decoded.payload.deltaHistory).toMatchObject({
        present,
        freshness,
      });
    },
  );

  it("accepts safe additive fields without mutating the caller and deeply freezes its result", () => {
    const input = cloneEnvelope(golden);
    const payload = input.payload as Record<string, unknown>;
    payload.futurePayload = { supportedLater: true };
    const vehicle = firstVehicle(input);
    vehicle.futureVehicle = "ignored";
    const speed = vehicle.speedMps as Record<string, unknown>;
    speed.futureField = 1;
    const before = JSON.stringify(input);

    const decoded = decodeOverlayProjectionV1(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(decoded.payload.vehicles[0]?.speedMps.value).toBe(0);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.payload)).toBe(true);
    expect(Object.isFrozen(decoded.payload.vehicles)).toBe(true);
    expect(Object.isFrozen(decoded.payload.vehicles[0])).toBe(true);
    expect(Object.isFrozen(decoded.payload.vehicles[0]?.speedMps)).toBe(true);
    expect(Object.isFrozen(decoded.payload.controlsHistory.samples)).toBe(true);
    expect(Object.isFrozen(decoded.payload.deltaHistory.samples)).toBe(true);
  });

  it("rejects the wrong product or version with stable sanitized errors", () => {
    expect(() =>
      decodeOverlayProjectionV1({ ...golden, product: "engineer" }),
    ).toThrowError(expect.objectContaining({ code: "wrong-product" }));
    expect(() =>
      decodeOverlayProjectionV1({ ...golden, projectionVersion: 2 }),
    ).toThrowError(expect.objectContaining({ code: "unsupported-version" }));
  });

  it.each([
    ["unknown capability", () => {
      const input = cloneEnvelope(golden);
      (input.payload.capabilities as unknown[]) = ["session", "future"];
      return input;
    }],
    ["unknown freshness", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).speedMps = field(true, 1, "observed", "future");
      return input;
    }],
    ["unknown provenance", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).speedMps = field(true, 1, "future", "fresh");
      return input;
    }],
    ["unknown session type", () => {
      const input = cloneEnvelope(golden);
      input.payload.sessionType = field(true, "sprint", "observed", "fresh");
      return input;
    }],
    ["unknown sector", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).sector = field(true, 4, "observed", "fresh");
      return input;
    }],
    ["ratio outside 0..1", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).throttle = field(true, 1.01, "observed", "fresh");
      return input;
    }],
    ["fresh value without presence", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).throttle = field(false, 0, "unknown", "fresh");
      return input;
    }],
    ["missing value marked present", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).throttle = field(true, 0, "unknown", "missing");
      return input;
    }],
    ["invalid value without presence", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).throttle = field(false, 0, "unknown", "invalid");
      return input;
    }],
    ["too many vehicles", () => {
      const input = cloneEnvelope(golden);
      input.payload.vehicles = Array.from({ length: 105 }, () => firstVehicle(input));
      return input;
    }],
    ["too much history", () => {
      const input = cloneEnvelope(golden);
      const history = input.payload.controlsHistory as Record<string, unknown>;
      const sample = (history.samples as unknown[])[0];
      history.samples = Array.from({ length: 121 }, () => sample);
      return input;
    }],
    ["empty vehicle ID", () => {
      const input = cloneEnvelope(golden);
      firstVehicle(input).id = "";
      return input;
    }],
    ["empty control-sample vehicle ID", () => {
      const input = cloneEnvelope(golden);
      const history = input.payload.controlsHistory as Record<string, unknown>;
      (history.samples as Record<string, unknown>[])[0]!.vehicleId = " ";
      return input;
    }],
    ["duplicate vehicle ID", () => {
      const input = cloneEnvelope(golden);
      const vehicles = input.payload.vehicles as Record<string, unknown>[];
      vehicles[1]!.id = vehicles[0]!.id;
      return input;
    }],
    ["invalid known additive field", () => {
      const input = cloneEnvelope(golden);
      input.payload.playerDeltaSeconds = field(
        true,
        "fast",
        "derived",
        "fresh",
      );
      return input;
    }],
    ["unknown delta reference", () => {
      const input = cloneEnvelope(golden);
      input.payload.playerDeltaReference = field(
        true,
        "future-reference",
        "derived",
        "fresh",
      );
      return input;
    }],
    ["delta history presence mismatch", () => {
      const input = cloneEnvelope(golden);
      const history = input.payload.deltaHistory as Record<string, unknown>;
      history.present = false;
      return input;
    }],
    ["too much delta history", () => {
      const input = cloneEnvelope(golden);
      const history = input.payload.deltaHistory as Record<string, unknown>;
      const sample = (history.samples as unknown[])[0];
      history.samples = Array.from({ length: 121 }, () => sample);
      return input;
    }],
    ["non-monotonic delta history", () => {
      const input = cloneEnvelope(golden);
      const history = input.payload.deltaHistory as Record<string, unknown>;
      const sample = structuredClone(
        (history.samples as Record<string, unknown>[])[0]!,
      );
      (history.samples as unknown[]).push(sample);
      return input;
    }],
  ] as const)("rejects %s", (_label, makeInput) => {
    expect(() => decodeOverlayProjectionV1(makeInput())).toThrow(
      OverlayProjectionDecodeError,
    );
  });

  it("relies on the transport boundary to reject non-finite, oversized and abusive nesting", () => {
    const transportInput = cloneEnvelope(golden);
    firstVehicle(transportInput).speedMps = field(
      true,
      Number.NaN,
      "observed",
      "fresh",
    );
    expect(() =>
      decodeTransportEvent(eventName("overlay", "projection"), transportInput),
    ).toThrowError(expect.objectContaining({ code: "invalid-envelope" }));

    const infinite = cloneEnvelope(golden);
    firstVehicle(infinite).speedMps = field(
      true,
      Number.POSITIVE_INFINITY,
      "observed",
      "fresh",
    );
    expect(() =>
      decodeTransportEvent(eventName("overlay", "projection"), infinite),
    ).toThrowError(expect.objectContaining({ code: "invalid-envelope" }));

    const oversized = cloneEnvelope(golden);
    oversized.payload.vehicles = Array.from({ length: 10_000 }, () =>
      firstVehicle(oversized),
    );
    expect(() =>
      decodeTransportEvent(eventName("overlay", "projection"), oversized),
    ).toThrowError(expect.objectContaining({ code: "payload-too-large" }));

    let nested: JSONObject = {};
    for (let depth = 0; depth < 66; depth += 1) {
      nested = { nested };
    }
    const abusive = cloneEnvelope(golden);
    abusive.payload.future = nested;
    expect(() =>
      decodeTransportEvent(eventName("overlay", "projection"), abusive),
    ).toThrowError(expect.objectContaining({ code: "invalid-envelope" }));
  });
});

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

function decodeAsPreD7Consumer(input: ProjectionEnvelope): ProjectionEnvelope {
  const copy = cloneEnvelope(input);
  const payload = copy.payload as Record<string, unknown>;
  const basePayloadKeys = [
    "capabilities",
    "trackName",
    "sessionType",
    "playerVehicleId",
    "vehicles",
    "controlsHistory",
  ] as const;
  const baseVehicleKeys = [
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
    "pitStopCount",
  ] as const;
  copy.payload = Object.fromEntries(
    basePayloadKeys.map((key) => [
      key,
      key === "vehicles"
        ? (payload.vehicles as Record<string, unknown>[]).map((vehicle) =>
            Object.fromEntries(
              baseVehicleKeys.map((vehicleKey) => [
                vehicleKey,
                vehicle[vehicleKey],
              ]),
            ),
          )
        : payload[key],
    ]),
  ) as JSONObject;
  // This deliberately does not call the D7 decoder. Exact equality with the
  // separately frozen pre-D7 golden above is the independent compatibility
  // oracle for every base key and value in this producer fixture.
  return copy;
}

function cloneEnvelope(value: ProjectionEnvelope): ProjectionEnvelope {
  return structuredClone(value);
}

function firstVehicle(input: ProjectionEnvelope): Record<string, unknown> {
  return (input.payload.vehicles as Record<string, unknown>[])[0]!;
}

function field(
  present: boolean,
  value: unknown,
  provenance: string,
  freshness: string,
): Record<string, unknown> {
  return { present, value, provenance, freshness };
}

function missing(value: unknown): Record<string, unknown> {
  return {
    present: false,
    value,
    provenance: "unknown",
    freshness: "missing",
  };
}
