import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import type { TelemetrySnapshot } from "../core/telemetry-snapshot";
import {
  createOverlayV2PlayerInstrumentsComparator,
  type OverlayV2PlayerInstrumentsComparator,
} from "./overlay-shadow-comparator";

const MAX_PENDING_SEQUENCES = 8;

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

  const compareIfReady = (key: string) => {
    if (compared.has(key)) return;
    const legacySnapshot = legacy.get(key);
    const current = overlayV2.get(key);
    if (!legacySnapshot || !current) return;
    comparator.compare({
      legacySnapshot,
      frame: current.frame,
      source: current.source,
      // Position belongs to the still-empty standings slice, not to the player
      // instruments selected for F6.
      content: { showPosition: false, showClutch: true },
    });
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
  while (collection.size > MAX_PENDING_SEQUENCES) {
    const oldest = collection.keys().next().value;
    if (oldest === undefined) return;
    collection.delete(oldest);
  }
}
