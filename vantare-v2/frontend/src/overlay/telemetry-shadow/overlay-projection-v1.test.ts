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
