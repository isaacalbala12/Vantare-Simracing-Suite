import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { fuelStrategyDefinition } from "../widget-types/fuel-strategy/fuel-strategy-definition";
import { racingFlagsDefinition } from "../widget-types/racing-flags/racing-flags-definition";
import { relativeDefinition } from "../widget-types/relative/relative-definition";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import {
  createOverlayV2PlayerInstrumentsComparator,
  type OverlayV2PlayerInstrumentsComparator,
} from "./overlay-shadow-comparator";

/**
 * Pending window per side. A live 54-car session showed the two producers
 * drifting apart while the driver flapped stale<->live: with a window of 8 the
 * key sets stopped overlapping and pairing stalled for ~2 minutes before
 * recovering on its own. The window must cover that drift, and eviction must
 * drop the sequences furthest behind the newest one rather than the oldest
 * inserted, so a burst on one side cannot evict the counterpart still arriving.
 */
const MAX_PENDING_SEQUENCES = 64;

// Shadow-only comparison content. It is not a user profile: it fixes the
// widget configuration so the sampled evidence stays comparable across runs.
const SESSION_CONTENT = racingFlagsDefinition.parseContent({});
const STANDINGS_CONTENT = standingsDefinition.parseContent({
  classScope: "all-classes",
  rowCount: 20,
});
const DELTA_CONTENT = deltaDefinition.parseContent({ reference: "personal-best" });
const RELATIVE_CONTENT = relativeDefinition.parseContent({});
const FUEL_CONTENT = fuelStrategyDefinition.parseContent({});

export type OverlayV2ShadowRuntime = Readonly<{
  acceptLegacy(epoch: number, sequence: number, snapshot: TelemetrySnapshot): void;
  acceptOverlayV2(frame: OverlayFrameV2, source: OverlaySourceStatusV2): void;
  sessionSummary: OverlayV2PlayerInstrumentsComparator["sessionSummary"];
}>;

export function createOverlayV2ShadowRuntime(): OverlayV2ShadowRuntime {
  const comparator = createOverlayV2PlayerInstrumentsComparator();
  const legacy = new Map<string, TelemetrySnapshot>();
  const overlayV2 = new Map<string, Readonly<{ frame: OverlayFrameV2; source: OverlaySourceStatusV2 }>>();
  const compared = new Set<string>();
  let currentStream: string | undefined;

  const compareIfReady = (key: string) => {
    if (compared.has(key)) return;
    const legacySnapshot = legacy.get(key);
    const current = overlayV2.get(key);
    if (!legacySnapshot || !current) return;
    const pair = { legacySnapshot, frame: current.frame, source: current.source };
    comparator.compare({
      ...pair,
      // Position belongs to the standings slice, not to the player instruments.
      content: { showPosition: false, showClutch: true },
    });
    comparator.compareSession({ ...pair, content: SESSION_CONTENT });
    comparator.compareStandings({ ...pair, content: STANDINGS_CONTENT });
    comparator.compareDelta({ ...pair, content: DELTA_CONTENT });
    comparator.compareRelative({ ...pair, content: RELATIVE_CONTENT });
    comparator.compareFuel({ ...pair, content: FUEL_CONTENT });
    compared.add(key);
    legacy.delete(key);
    overlayV2.delete(key);
    trim(compared);
  };

  return {
    acceptLegacy(epoch, sequence, snapshot) {
      const key = frameKey(epoch, sequence);
      legacy.set(key, snapshot);
      trim(legacy);
      compareIfReady(key);
    },
    acceptOverlayV2(frame, source) {
      // A new epoch or session id is a new run: the accumulated shadow evidence
      // belongs to the previous one and must not leak into the gate.
      const stream = `${frame.epoch}:${frame.sessionId}`;
      if (currentStream !== undefined && currentStream !== stream) {
        comparator.reset();
        legacy.clear();
        overlayV2.clear();
        compared.clear();
      }
      currentStream = stream;
      const key = frameKey(frame.epoch, frame.sequence);
      overlayV2.set(key, { frame, source });
      trim(overlayV2);
      compareIfReady(key);
    },
    sessionSummary: comparator.sessionSummary,
  };
}

function frameKey(epoch: number, sequence: number): string {
  return `${epoch}:${sequence}`;
}

function trim<T>(collection: Map<string, T> | Set<string>): void {
  if (collection.size <= MAX_PENDING_SEQUENCES) return;
  const ordered = [...collection.keys()].sort((left, right) => sequenceOf(left) - sequenceOf(right));
  for (const key of ordered.slice(0, collection.size - MAX_PENDING_SEQUENCES)) {
    collection.delete(key);
  }
}

function sequenceOf(key: string): number {
  return Number(key.slice(key.indexOf(":") + 1));
}
