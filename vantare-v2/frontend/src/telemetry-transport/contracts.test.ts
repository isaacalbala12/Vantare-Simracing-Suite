import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeTransportEvent,
  eventName,
  factsRoute,
  MAX_PAYLOAD_BYTES,
  PROJECTION_VERSION,
  projectionRoute,
  TELEMETRY_PRODUCTS,
  TELEMETRY_STATUS_STATES,
  TransportContractError,
  type ProductID,
} from "./contracts";
import {
  OVERLAY_PULL_CLOSE_ROUTE,
  OVERLAY_PULL_REQUEST_ROUTE,
  OVERLAY_PULL_RESPONSE_EVENT,
} from "./overlay-wails-pull";

const capturedAt = "2026-07-30T00:00:00Z";

describe("telemetry transport contracts", () => {
  it("matches the observable Go transport fixture", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.resolve(
          process.cwd(),
          "../internal/app/telemetrytransport/testdata/transport_contract_v1.json",
        ),
        "utf8",
      ),
    ) as {
      projectionVersion: number;
      maxPayloadBytes: number;
      statusStates: string[];
      overlayPull: {
        requestRoute: string;
        responseEvent: string;
        closeRoute: string;
      };
      products: Record<
        ProductID,
        {
          projectionEvent: string;
          statusEvent: string;
          factEvent: string;
          projectionRoute: string;
          factsRoute: string;
        }
      >;
    };
    expect(fixture.projectionVersion).toBe(PROJECTION_VERSION);
    expect(fixture.maxPayloadBytes).toBe(MAX_PAYLOAD_BYTES);
    expect(fixture.statusStates).toEqual(TELEMETRY_STATUS_STATES);
    expect(fixture.overlayPull).toEqual({
      requestRoute: OVERLAY_PULL_REQUEST_ROUTE,
      responseEvent: OVERLAY_PULL_RESPONSE_EVENT,
      closeRoute: OVERLAY_PULL_CLOSE_ROUTE,
    });
    for (const product of TELEMETRY_PRODUCTS) {
      expect(fixture.products[product]).toEqual({
        projectionEvent: eventName(product, "projection"),
        statusEvent: eventName(product, "status"),
        factEvent: eventName(product, "fact"),
        projectionRoute: projectionRoute(product),
        factsRoute: factsRoute(product),
      });
    }
  });

  it.each(TELEMETRY_PRODUCTS)(
    "decodes the namespaced %s projection without knowing its payload",
    (product) => {
      const decoded = decodeTransportEvent(
        eventName(product, "projection"),
        projection(product, { capabilities: [], zeroIsValid: 0 }),
      );
      expect(decoded).toEqual({
        kind: "projection",
        value: projection(product, { capabilities: [], zeroIsValid: 0 }),
      });
      expect(projectionRoute(product)).toBe(`/telemetry/${product}/projection`);
      expect(factsRoute(product)).toBe(`/telemetry/${product}/facts`);
    },
  );

  it("rejects an unknown version and a mismatched product", () => {
    expect(() =>
      decodeTransportEvent(
        eventName("overlay", "projection"),
        { ...projection("overlay", {}), projectionVersion: 2 },
      ),
    ).toThrowError(expect.objectContaining({ code: "unsupported-version" }));
    expect(() =>
      decodeTransportEvent(
        eventName("overlay", "projection"),
        projection("engineer", {}),
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid-envelope" }));
  });

  it("accepts safe additive envelope and status extensions", () => {
    const projected = decodeTransportEvent(
      eventName("overlay", "projection"),
      {
        ...projection("overlay", { capabilities: [] }),
        traceHint: { optional: true },
      },
    );
    expect(projected.kind).toBe("projection");
    const status = decodeTransportEvent(eventName("overlay", "status"), {
      product: "overlay",
      statusRevision: 1,
      capturedAt,
      payload: {
        state: "live",
        reconnectAttempt: 0,
        optionalDetail: "ignored by v1",
      },
      futureEnvelopeField: false,
    });
    expect(status).toEqual({
      kind: "status",
      value: {
        product: "overlay",
        statusRevision: 1,
        capturedAt,
        payload: { state: "live", reconnectAttempt: 0 },
      },
    });
  });

  it("rejects unsafe additive envelope extensions", () => {
    expect(() =>
      decodeTransportEvent(eventName("overlay", "projection"), {
        ...projection("overlay", {}),
        raw: { private: true },
      }),
    ).toThrowError(expect.objectContaining({ code: "forbidden-payload" }));
  });

  it("rejects oversized, reserved and non-object payloads", () => {
    expect(() =>
      decodeTransportEvent(
        eventName("overlay", "projection"),
        projection("overlay", { value: "x".repeat(300) }),
        128,
      ),
    ).toThrowError(expect.objectContaining({ code: "payload-too-large" }));
    expect(() =>
      decodeTransportEvent(
        eventName("overlay", "projection"),
        projection("overlay", { nested: { raw: "private" } }),
      ),
    ).toThrowError(expect.objectContaining({ code: "forbidden-payload" }));
    expect(() =>
      decodeTransportEvent(eventName("overlay", "projection"), {
        ...projection("overlay", {}),
        payload: [],
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid-envelope" }));
    expect(() =>
      decodeTransportEvent(
        eventName("overlay", "projection"),
        JSON.parse(
          JSON.stringify(projection("overlay", {})).replace(
            '"payload":{}',
            '"payload":{"__proto__":{"polluted":true}}',
          ),
        ),
      ),
    ).toThrowError(expect.objectContaining({ code: "forbidden-payload" }));
  });

  it("never lets a public override raise or invalidate the hard payload limit", () => {
    expect(() =>
      decodeTransportEvent(
        eventName("overlay", "projection"),
        projection("overlay", { value: "x".repeat(270_000) }),
        1_000_000,
      ),
    ).toThrowError(expect.objectContaining({ code: "payload-too-large" }));
    for (const invalidMaximum of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        decodeTransportEvent(
          eventName("overlay", "projection"),
          projection("overlay", {}),
          invalidMaximum,
        ),
      ).toThrowError(expect.objectContaining({ code: "invalid-envelope" }));
    }
    expect(() =>
      decodeTransportEvent(
        eventName("overlay", "projection"),
        projection("overlay", { value: "x".repeat(200) }),
        128,
      ),
    ).toThrowError(expect.objectContaining({ code: "payload-too-large" }));
  });

  it("rejects unsafe cursors instead of losing uint64 precision", () => {
    expect(() =>
      decodeTransportEvent(eventName("overlay", "projection"), {
        ...projection("overlay", {}),
        sequence: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(TransportContractError);
  });
});

function projection(product: ProductID, payload: Record<string, unknown>) {
  return {
    product,
    projectionVersion: 1,
    epoch: 1,
    sequence: 1,
    kind: "full",
    capturedAt,
    statusRevision: 1,
    payload,
  };
}
