import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2, OverlayDeltaViewV2, OverlayUpdateV2 } from "../../generated/telemetry";
import { createOverlayFrameV2Store, decodeOverlayUpdateV2, OVERLAY_V2_SNAPSHOT_EVENT, OVERLAY_V2_STATUS_EVENT } from "../../telemetry-transport/overlay-frame-v2-store";
import type { DeltaViewModel } from "../widget-types/delta/delta-view-model";
import { buildDeltaViewModelV2 } from "../widget-types/delta/delta-view-model-v2";
import { buildPedalsViewModelV2 } from "../widget-types/pedals/pedals-view-model-v2";
import { getOverlayV2ViewModelEntry } from "./overlay-v2-view-models";

function fixture(): OverlayUpdateV2 & { frame: OverlayFrameV2 } {
  const update = structuredClone(decodeOverlayUpdateV2(JSON.parse(readFileSync("../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json", "utf8")))) as OverlayUpdateV2;
  if (!update.frame) throw new Error("fixture frame missing");
  const delta = JSON.parse(readFileSync("../internal/telemetry/projection/overlayv2/testdata/delta_references.golden.json", "utf8")) as OverlayDeltaViewV2;
  return { ...update, source: { state: "live" }, frame: { ...update.frame, delta } };
}

const entry = getOverlayV2ViewModelEntry("delta")!;

describe("Delta and Pedals data contract", () => {
  it("feeds two simultaneous widget references from the same Go payload through the real store and registry", () => {
    const store = createOverlayFrameV2Store();
    try {
      store.ingest(OVERLAY_V2_SNAPSHOT_EVENT, fixture());
      const { frame, source } = store.getSnapshot();
      expect(frame).not.toBeNull();
      const personal = entry.buildViewModelV2(frame!, source!, { reference: "personal-best" }) as DeltaViewModel;
      const previous = entry.buildViewModelV2(frame!, source!, { reference: "previous-lap" }) as DeltaViewModel;
      const session = entry.buildViewModelV2(frame!, source!, { reference: "session-best" }) as DeltaViewModel;
      expect([personal.reference, personal.deltaText, personal.status]).toEqual(["personal-best", "-0.238", "ready"]);
      expect([previous.reference, previous.deltaText, previous.status]).toEqual(["previous-lap", "-0.710", "ready"]);
      expect([session.reference, session.deltaText, session.status]).toEqual(["session-best", "+0.912", "stale"]);
      expect(entry.buildViewModelV2(frame!, source!, { reference: "personal-best" })).toEqual(personal);
      expect(Object.isFrozen(frame!.delta.references)).toBe(true);
      expect(Object.isFrozen(frame!.delta.references![0].seconds)).toBe(true);
    } finally { store.dispose(); }
  });

  it("does not borrow another reference from an old single-response payload", () => {
    const current = fixture().frame;
    const frame = { ...current, delta: { ...current.delta, references: undefined } };
    const model = entry.buildViewModelV2(frame, { state: "live" }, { reference: "previous-lap" }) as DeltaViewModel;
    expect(model).toMatchObject({ status: "missing", deltaText: "—", requestedReference: "previous-lap" });
    expect(model.reference).toBeUndefined();
  });

  it("exposes Go fallback without relabelling its seconds as the requested reference", () => {
    const current = fixture().frame;
    const frame = { ...current, delta: { ...current.delta, references: current.delta.references!.map((value) => value.requested === "previous-lap" ? { ...value, reference: "personal-best", authority: "native" as const, seconds: current.delta.seconds } : value) } };
    expect(entry.buildViewModelV2(frame, { state: "live" }, { reference: "previous-lap" })).toMatchObject({ reference: "personal-best", requestedReference: "previous-lap", deltaText: "-0.238" });
  });

  it.each(["connecting", "detecting", "stopping"] as const)("clears retained values during %s and resumes only on a live frame", (state) => {
    const store = createOverlayFrameV2Store();
    try {
      const update = fixture();
      store.ingest(OVERLAY_V2_SNAPSHOT_EVENT, update);
      store.ingest(OVERLAY_V2_STATUS_EVENT, { revision: update.revision + 1, source: { state }, frame: null });
      const retained = store.getSnapshot();
      expect(retained.frame).not.toBeNull();
      expect(buildDeltaViewModelV2(retained.frame!, retained.source!)).toMatchObject({ status: "disconnected", deltaText: "—" });
      expect(buildPedalsViewModelV2(retained.frame!, retained.source!, {})).toMatchObject({ status: "disconnected", throttleText: "—", brakeText: "—", clutchText: "—" });
      store.ingest(OVERLAY_V2_SNAPSHOT_EVENT, { ...update, revision: update.revision + 2, frame: { ...update.frame, sequence: update.frame.sequence + 1 } });
      const resumed = store.getSnapshot();
      expect(buildDeltaViewModelV2(resumed.frame!, resumed.source!).status).toBe("ready");
      expect(buildPedalsViewModelV2(resumed.frame!, resumed.source!, {}).throttleText).toBe("75%");
    } finally { store.dispose(); }
  });

  it.each(["missing", "invalid"] as const)("keeps other pedal channels when one is %s, distinguishing a fresh zero", (q) => {
    const base = fixture().frame;
    for (const channel of ["throttle", "brake", "clutch"] as const) {
      const frame = { ...base, player: { ...base.player, throttle: { q: "fresh" as const, v: 0.75 }, brake: { q: "fresh" as const }, clutch: { q: "fresh" as const, v: 0.2 }, [channel]: { q } } };
      const model = buildPedalsViewModelV2(frame, { state: "live" }, {});
      expect(model.status).toBe("missing");
      expect(model[`${channel}Text`]).toBe("—");
      if (channel !== "throttle") expect(model.throttleText).toBe("75%");
      if (channel !== "brake") expect(model.brakeText).toBe("0%");
      if (channel !== "clutch") expect(model.clutchText).toBe("20%");
    }
  });

  it.each(["live", "degraded"] as const)("does not lose stale delta, BEST or LAST quality with source %s", (state) => {
    const frame = fixture().frame;
    expect(buildDeltaViewModelV2(frame, { state }, { reference: "session-best" }).status).toBe("stale");
    for (const field of ["lastLap", "bestLap"] as const) {
      const standings = frame.standings.map((row) => row.id === frame.player.id ? { ...row, [field]: { q: "stale" as const, v: 91.2 } } : row);
      expect(buildDeltaViewModelV2({ ...frame, standings }, { state }).status).toBe("stale");
    }
  });

  it("rejects malformed per-reference data at the transport boundary", () => {
    const update = fixture();
    const references = update.frame.delta.references!;
    const malformed = [
      references.slice(0, 2),
      [references[0], references[0], references[2]],
      references.map((value, i) => i === 0 ? { ...value, seconds: { q: "fresh", v: Infinity } } : value),
      references.map((value, i) => i === 0 ? { ...value, reference: undefined } : value),
      references.map((value, i) => i === 0 ? { ...value, seconds: { q: "missing" } } : value),
    ];
    for (const values of malformed) {
      expect(() => decodeOverlayUpdateV2({ ...update, frame: { ...update.frame, delta: { ...update.frame.delta, references: values } } })).toThrow();
    }
  });
});
