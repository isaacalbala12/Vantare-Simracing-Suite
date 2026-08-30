import type { TelemetrySnapshot } from "./telemetry-snapshot";
import { createDerivedTelemetryStore } from "./derived-telemetry-store";
import type { OverlayFrameV2, OverlaySourceStatusV2 } from "../../generated/telemetry";
import { buildOverlayRuntimeContext, type OverlayRuntimeContext } from "./overlay-runtime-context";
import type { WidgetRuntimeInput } from "./widget-definition";

export type TelemetryListener = () => void;

/**
 * A repaint scheduler drives one visual frame. It carries no frequency
 * domain: the display decides when to paint.
 */
export type TelemetryScheduler = {
  start(onFrame: () => void): void;
  stop(): void;
};

export type TelemetryRateCoordinator = {
  getSnapshot(rateKey?: number | string): TelemetrySnapshot;
  getOverlayFrame(): OverlayFrameV2 | undefined;
  getOverlaySource(): OverlaySourceStatusV2 | undefined;
  getOverlayRuntimeContext(): OverlayRuntimeContext;
  getOverlayFailure(): WidgetRuntimeInput["overlayV2Failure"];
  subscribe(rateKey: number | string | undefined, listener: TelemetryListener): () => void;
  publish(snapshot: TelemetrySnapshot): void;
  setOverlayFrame(
    frame: OverlayFrameV2 | undefined,
    source?: OverlaySourceStatusV2,
    revision?: number,
    frameRevision?: number,
  ): void;
  setOverlayFailure(failure: WidgetRuntimeInput["overlayV2Failure"]): void;
  dispose(): void;
};

export type TelemetryRateCoordinatorOptions = {
  /** Reloj monotónico inyectable para comprobar techos sin temporizadores. */
  now?: () => number;
  /** Injects the repaint loop. Defaults to requestAnimationFrame. */
  createScheduler?: () => TelemetryScheduler;
};

/**
 * Go publica el presupuesto efectivo. Este coordinador solo lo obedece: una
 * rAF compartida, cap global y techo por widget, sin inferir niveles.
 */
function defaultScheduler(): TelemetryScheduler {
  let handle: number | null = null;
  let stopped = false;
  const request: (callback: () => void) => number =
    typeof requestAnimationFrame === "function"
      ? (callback) => requestAnimationFrame(() => callback())
      : (callback) => setTimeout(callback, 16) as unknown as number;
  const cancel: (id: number) => void =
    typeof cancelAnimationFrame === "function"
      ? (id) => cancelAnimationFrame(id)
      : (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  return {
    start(onFrame) {
      if (handle !== null || stopped) {
        return;
      }
      const loop = () => {
        onFrame();
        if (!stopped) {
          handle = request(loop);
        }
      };
      handle = request(loop);
    },
    stop() {
      stopped = true;
      if (handle === null) {
        return;
      }
      cancel(handle);
      handle = null;
    },
  };
}

function emptySnapshot(): TelemetrySnapshot {
  return {
    status: "disconnected",
    capturedAt: 0,
    session: { type: "race" },
    player: { inPit: false },
    scoring: [],
  };
}

export function createTelemetryRateCoordinator(
  options: TelemetryRateCoordinatorOptions = {},
): TelemetryRateCoordinator {
  const createScheduler = options.createScheduler ?? defaultScheduler;
  const now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
  let latest = emptySnapshot();
  let overlayFrame: OverlayFrameV2 | undefined;
  let overlaySource: OverlaySourceStatusV2 | undefined;
  let overlayContext = buildOverlayRuntimeContext(undefined, undefined);
  let overlayFailure: WidgetRuntimeInput["overlayV2Failure"];
  let overlayRevision = 0;
  let overlayFrameRevision = 0;
  let overlayFailureFrameRevision: number | undefined;
  const derived = createDerivedTelemetryStore();
  type Subscription = {
    listener: TelemetryListener;
    widgetType?: string;
    seenVersion: number;
    lastPaintAt: number | null;
    lastFrameSequence?: number;
    lastSignature?: string;
    ceilingSequence?: number;
    ceilingSignature?: string;
  };
  const listeners = new Map<TelemetryListener, Subscription>();
  let scheduler: TelemetryScheduler | null = null;
  let version = 0;

  const sectionValue = (widgetType: string): unknown => {
    if (widgetType === "runtime-context") return overlayContext;
    if (!overlayFrame) {
      switch (widgetType) {
        case "race-schedule": return "external-calendar-events";
        case "racing-flags": return undefined;
        case "engineer-radio": return "external-engineer-event";
        default: return undefined;
      }
    }
    switch (widgetType) {
      case "pedals": case "pedals-telemetry": case "pedals-telemetry-compact": return overlayFrame.player;
      case "input-telemetry": return overlayFrame.controls;
      case "delta": case "delta-advanced": case "delta-trace": return overlayFrame.delta;
      case "relative": case "multiclass-relative": case "head-to-head": return overlayFrame.relative;
      case "standings": case "broadcast-tower": case "track-map": return overlayFrame.standings;
      case "fuel-strategy": return overlayFrame.fuel;
      case "car-damage-numbers": case "car-damage-visual": return overlayFrame.damage;
      case "track-weather": return overlayFrame.weather;
      case "racing-flags": return overlayFrame.session;
      case "race-schedule": return "external-calendar-events";
      case "engineer-radio": return "external-engineer-event";
      default: return undefined;
    }
  };

  const signature = (widgetType: string): string => JSON.stringify({
    section: sectionValue(widgetType),
    source: overlaySource
      ? { state: overlaySource.state, retry: overlaySource.retry, reason: overlaySource.reason }
      : undefined,
    failure: overlayFailure,
  });

  const intervalFor = (subscription: Subscription): number => {
    const performancePolicy = overlayFrame?.capabilities.performance;
    const globalCap = performancePolicy?.rafCap ?? null;
    const widgetRate = subscription.widgetType ? performancePolicy?.widgetHz[subscription.widgetType] : undefined;
    // Los eventos de seguridad despiertan en el siguiente rAF y no heredan el
    // cap global. La comparación de sección sigue evitando paints espurios.
    if (widgetRate === "event") return 0;
    const numericRate = typeof widgetRate === "number" && widgetRate > 0 ? widgetRate : null;
    const cap = globalCap && numericRate ? Math.min(globalCap, numericRate) : globalCap ?? numericRate;
    return cap ? 1_000 / cap : 0;
  };

  const paint = () => {
    const currentTime = now();
    for (const subscription of listeners.values()) {
      const widgetRate = subscription.widgetType === "runtime-context"
        ? "dirty"
        : subscription.widgetType
          ? overlayFrame?.capabilities.performance?.widgetHz[subscription.widgetType]
          : undefined;
      const elapsed = subscription.lastPaintAt === null ? Number.POSITIVE_INFINITY : currentTime - subscription.lastPaintAt;
      const ceilingCandidate = widgetRate === "dirty" && elapsed >= 1_000;
      const currentSequence = overlayFrame?.sequence;
      const currentSignature = ceilingCandidate && subscription.widgetType
        ? signature(subscription.widgetType)
        : undefined;
      const dirtyCeilingDue = ceilingCandidate && (
        currentSequence !== subscription.ceilingSequence || currentSignature !== subscription.ceilingSignature
      );
      if (subscription.seenVersion === version && !dirtyCeilingDue) continue;
      const interval = intervalFor(subscription);
      if (elapsed < interval) continue;

      if (widgetRate === "dirty" || widgetRate === "event") {
        const frameSequence = subscription.widgetType === "race-schedule" || subscription.widgetType === "engineer-radio"
          ? undefined
          : overlayFrame?.sequence;
        const nextSignature = subscription.widgetType ? signature(subscription.widgetType) : undefined;
        const changed = nextSignature !== subscription.lastSignature;
        subscription.lastFrameSequence = frameSequence;
        subscription.lastSignature = nextSignature;
        if (!changed && (widgetRate === "event" || elapsed < 1_000)) {
          subscription.seenVersion = version;
          continue;
        }
      }

      subscription.seenVersion = version;
      subscription.lastPaintAt = currentTime;
      if (widgetRate === "dirty" && dirtyCeilingDue) {
        subscription.ceilingSequence = currentSequence;
        subscription.ceilingSignature = currentSignature;
      }
      subscription.listener();
    }
  };

  const ensureScheduler = () => {
    if (scheduler) {
      return;
    }
    scheduler = createScheduler();
    scheduler.start(paint);
  };

  const releaseScheduler = () => {
    if (!scheduler) {
      return;
    }
    scheduler.stop();
    scheduler = null;
  };

  return {
    getSnapshot() {
      return latest;
    },
    getOverlayFrame() {
      return overlayFrame;
    },
    getOverlaySource() {
      return overlaySource;
    },
    getOverlayRuntimeContext() {
      return overlayContext;
    },
    getOverlayFailure() {
      return overlayFailure;
    },
    subscribe(rateKey, listener) {
      ensureScheduler();
      const widgetType = typeof rateKey === "string" ? rateKey : undefined;
      const initialRate = widgetType === "runtime-context"
        ? "dirty"
        : widgetType
          ? overlayFrame?.capabilities.performance?.widgetHz[widgetType]
          : undefined;
      listeners.set(listener, {
        listener,
        widgetType,
        seenVersion: version,
        lastPaintAt: initialRate === "dirty" || initialRate === "event" ? now() : null,
        lastFrameSequence: overlayFrame?.sequence,
        lastSignature: widgetType ? signature(widgetType) : undefined,
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          releaseScheduler();
        }
      };
    },
    publish(snapshot) {
      derived.publish(snapshot);
      latest = {
        ...snapshot,
        derived: {
          fuelHistory: derived.getFuelHistory(),
          inputHistory: derived.getInputHistory(),
          deltaHistory: derived.getDeltaHistory(),
        },
      };
      version += 1;
    },
    setOverlayFrame(frame, source, revision, frameRevision) {
      const sameFrame = frame?.sequence === overlayFrame?.sequence && frame?.epoch === overlayFrame?.epoch;
      const sameSource = JSON.stringify(source) === JSON.stringify(overlaySource);
      const nextRevision = revision ?? (sameFrame && sameSource ? overlayRevision : overlayRevision + 1);
      const nextFrameRevision = frameRevision ?? (frame && !sameFrame ? overlayFrameRevision + 1 : overlayFrameRevision);
      const clearsFailure = overlayFailure !== undefined && frame !== undefined && source !== undefined &&
        nextFrameRevision > (overlayFailureFrameRevision ?? overlayFrameRevision);
      if (sameFrame && sameSource && !clearsFailure) return;
      overlayFrame = frame;
      overlaySource = source;
      overlayRevision = Math.max(overlayRevision, nextRevision);
      overlayFrameRevision = Math.max(overlayFrameRevision, nextFrameRevision);
      overlayContext = buildOverlayRuntimeContext(frame, source);
      if (clearsFailure) {
        overlayFailure = undefined;
        overlayFailureFrameRevision = undefined;
      }
      version += 1;
    },
    setOverlayFailure(failure) {
      if (JSON.stringify(failure) === JSON.stringify(overlayFailure)) return;
      overlayFailure = failure;
      overlayFailureFrameRevision = failure ? overlayFrameRevision : undefined;
      version += 1;
    },
    dispose() {
      releaseScheduler();
      listeners.clear();
      derived.dispose();
    },
  };
}
