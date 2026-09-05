import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeTransportEvent,
  eventName,
  type JSONObject,
  type ProductID,
} from "./contracts";

const GOLDENS: Record<ProductID, string> = {
  engineer:
    "../internal/telemetry/projection/engineer/testdata/engineer_v1.golden.json",
  strategy:
    "../internal/telemetry/projection/strategy/testdata/strategy_v1.golden.json",
  analysis:
    "../internal/telemetry/projection/analysis/testdata/analysis_v1.golden.json",
};

describe("Go projection golden compatibility", () => {
  it.each(Object.entries(GOLDENS) as [ProductID, string][])(
    "decodes the observable %s v1 golden without duplicating its schema",
    (product, relativePath) => {
      const golden = JSON.parse(
        readFileSync(path.resolve(process.cwd(), relativePath), "utf8"),
      ) as JSONObject;
      const projectionVersion = golden.projectionVersion;
      const epoch = golden.epoch;
      const sequence = golden.sequence;
      const capturedAt = golden.capturedAt;
      const payload = { ...golden };
      delete payload.canonicalVersion;
      delete payload.projectionVersion;
      delete payload.epoch;
      delete payload.sequence;
      delete payload.capturedAt;
      const event = decodeTransportEvent(eventName(product, "projection"), {
        product,
        projectionVersion,
        epoch,
        sequence,
        kind: "full",
        capturedAt,
        statusRevision: 1,
        payload,
      });
      expect(event.kind).toBe("projection");
      if (event.kind === "projection") {
        expect(event.value.payload).toEqual(payload);
      }
    },
  );
});
