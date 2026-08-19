import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeTransportEvent, eventName } from "../telemetry-transport/contracts";
import type {
  AnalysisPayloadV1,
  EngineerPayloadV1,
  JSONObject,
  OverlayPayloadV1,
  ProductID,
  ProjectionEnvelope,
  StrategyPayloadV1,
} from "./telemetry";

type GeneratedPayloads = {
  overlay: OverlayPayloadV1;
  engineer: EngineerPayloadV1;
  strategy: StrategyPayloadV1;
  analysis: AnalysisPayloadV1;
};

const GOLDENS: Record<ProductID, string> = {
  overlay:
    "../internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json",
  engineer:
    "../internal/telemetry/projection/engineer/testdata/engineer_v1.golden.json",
  strategy:
    "../internal/telemetry/projection/strategy/testdata/strategy_v1.golden.json",
  analysis:
    "../internal/telemetry/projection/analysis/testdata/analysis_v1.golden.json",
};

describe("generated telemetry contract", () => {
  it.each(Object.entries(GOLDENS) as [ProductID, string][])(
    "types and decodes the shared %s Go golden",
    (product, relativePath) => {
      const golden = JSON.parse(
        readFileSync(path.resolve(process.cwd(), relativePath), "utf8"),
      ) as JSONObject;
      const payload = { ...golden };
      delete payload.canonicalVersion;
      delete payload.projectionVersion;
      delete payload.epoch;
      delete payload.sequence;
      delete payload.capturedAt;

      const envelope: ProjectionEnvelope = {
        product,
        projectionVersion: numberValue(golden.projectionVersion),
        epoch: numberValue(golden.epoch),
        sequence: numberValue(golden.sequence),
        kind: "full",
        capturedAt: stringValue(golden.capturedAt),
        statusRevision: 1,
        payload,
      };
      const decoded = decodeTransportEvent(eventName(product, "projection"), envelope);
      expect(decoded.kind).toBe("projection");
      if (decoded.kind === "projection") {
        expect(asGeneratedPayload(product, decoded.value.payload)).toEqual(payload);
      }
    },
  );
});

function asGeneratedPayload<Product extends ProductID>(
  _product: Product,
  payload: JSONObject,
): GeneratedPayloads[Product] {
  return payload as unknown as GeneratedPayloads[Product];
}

function numberValue(value: unknown): number {
  if (typeof value !== "number") {
    throw new TypeError("golden metadata must be numeric");
  }
  return value;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("golden metadata must be a string");
  }
  return value;
}
