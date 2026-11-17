import type {
  AnalysisReply,
  AnalysisRequest,
  AnalysisRow,
} from "../../contract/generated/analysis";
import type { HostError, Reply } from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
import {
  comparable,
  initialPair,
  type Pair,
  retainZoom,
  timedLaps,
} from "./analysis-comparison";
export type Compared = Extract<
  AnalysisReply,
  { method: "analysis.compare" }
> & { a: number; b: number };
export type Inspection = Extract<AnalysisReply, { method: "analysis.inspect" }>;
export type Opened = Omit<
  Extract<AnalysisReply, { method: "analysis.open" }>,
  "session"
>;
export type AnalysisSnapshot = {
  pair?: Pair;
  comparison?: Compared;
  comparing?: boolean;
  compareView?: boolean;
  compareError?: HostError["kind"];
  zoom?: [number, number];
  rows: AnalysisRow[];
  inspections: Record<string, Inspection>;
  rowErrors: Record<string, HostError["kind"]>;
  loading: boolean;
  opening: boolean;
  selected?: AnalysisRow;
  opened?: Opened;
  error?: HostError["kind"];
};
type Bridge = { request: (request: AnalysisRequest) => Promise<Reply> };
const failure = (e: unknown) =>
  e instanceof HostFailure ? e.detail.kind : "io";
/** One reader lane. Cancellation bypasses the lane, but its acknowledgement and
 * the abandoned request both settle before another reader starts. */
export class AnalysisController {
  private value: AnalysisSnapshot = {
    rows: [],
    inspections: {},
    rowErrors: {},
    loading: true,
    opening: false,
  };
  private listeners = new Set<() => void>();
  private active = true;
  private generation = 0;
  private visible = new Set<string>();
  private lane: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private wake?: () => void;
  private session?: string;
  private comparingSession?: string;
  constructor(private client: Bridge) {}
  snapshot = () => this.value;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<AnalysisSnapshot>) {
    if (!this.active) return;
    this.value = { ...this.value, ...patch };
    for (const fn of this.listeners) fn();
  }
  private pause() {
    return new Promise<void>((resolve) => {
      this.wake = resolve;
      this.timer = setTimeout(() => {
        this.wake = undefined;
        resolve();
      }, 500);
    });
  }
  private interrupt() {
    clearTimeout(this.timer);
    this.wake?.();
    this.wake = undefined;
    const session = this.comparingSession;
    return this.client
      .request({ method: "analysis.cancel" })
      .then((reply) => {
        if (
          reply.method === "analysis.cancel" &&
          reply.cancelled &&
          session &&
          this.session === session
        )
          this.session = undefined;
      })
      .catch(() => undefined);
  }
  private async request(request: AnalysisRequest, generation: number) {
    // Busy has no total retry cap: at most two retries/second, on this one lane.
    // Its lifetime is bounded by the active screen/generation and, for inspect,
    // row visibility. Exit/selection interrupts the wait and sends cancel.
    // Busy alone must never be reported as an unreadable recording.
    while (
      this.active &&
      generation === this.generation &&
      (request.method !== "analysis.inspect" || this.visible.has(request.id))
    ) {
      try {
        if (request.method === "analysis.compare")
          this.comparingSession = request.session;
        return await this.client.request(request);
      } catch (e) {
        const kind = failure(e);
        if (
          request.method === "analysis.compare" &&
          (kind === "analysisCancelled" ||
            kind === "analysisTimeout" ||
            kind === "analysisNotFound") &&
          this.session === request.session
        )
          this.session = undefined;
        if (!this.active || generation !== this.generation) return undefined;
        if (kind !== "busy") throw e;
      } finally {
        if (
          request.method === "analysis.compare" &&
          this.comparingSession === request.session
        )
          this.comparingSession = undefined;
      }
      await this.pause();
    }
    return undefined;
  }
  private enqueue(work: () => Promise<void>) {
    this.lane = this.lane
      .then(work)
      .catch((e) =>
        this.publish({ error: failure(e), loading: false, opening: false }),
      );
  }
  load = () => {
    const generation = ++this.generation;
    this.publish({
      loading: true,
      opening: false,
      error: undefined,
      selected: undefined,
      opened: undefined,
      inspections: {},
      rowErrors: {},
      pair: undefined,
      comparison: undefined,
      comparing: false,
      compareView: false,
      compareError: undefined,
      zoom: undefined,
    });
    const cancelled = this.interrupt();
    this.enqueue(async () => {
      await cancelled;
      await this.close();
      const r = await this.request({ method: "analysis.catalog" }, generation);
      if (r?.method !== "analysis.catalog" || generation !== this.generation)
        return;
      this.publish({
        rows: [...r.recordings].sort((a, b) => b.startedAtMs - a.startedAtMs),
        loading: false,
      });
    });
  };
  visibleRow = (id: string, visible: boolean) => {
    if (visible) this.visible.add(id);
    else this.visible.delete(id);
    if (!visible) return;
    const generation = this.generation;
    this.enqueue(async () => {
      if (
        !this.visible.has(id) ||
        this.value.selected ||
        this.value.inspections[id] ||
        this.value.rowErrors[id] ||
        generation !== this.generation
      )
        return;
      try {
        const r = await this.request(
          { method: "analysis.inspect", id },
          generation,
        );
        if (r?.method === "analysis.inspect" && generation === this.generation)
          this.publish({ inspections: { ...this.value.inspections, [id]: r } });
      } catch (e) {
        if (generation === this.generation)
          this.publish({
            rowErrors: { ...this.value.rowErrors, [id]: failure(e) },
          });
      }
    });
  };
  open = (row: AnalysisRow) => {
    const generation = ++this.generation;
    this.publish({
      selected: row,
      opened: undefined,
      error: row.recording ? "analysisLocked" : undefined,
      opening: !row.recording,
      zoom: undefined,
      pair: undefined,
      comparison: undefined,
      comparing: false,
      compareView: false,
      compareError: undefined,
    });
    const cancelled = this.interrupt();
    this.enqueue(async () => {
      await cancelled;
      await this.close();
      if (row.recording || generation !== this.generation) return;
      try {
        const r = await this.request(
          { method: "analysis.open", id: row.id },
          generation,
        );
        if (r?.method !== "analysis.open") return;
        const { session, ...opened } = r;
        this.session = session;
        if (!this.active || generation !== this.generation) {
          await this.close();
          return;
        }
        this.publish({
          opened,
          opening: false,
          pair: initialPair(opened.laps),
        });
      } catch (e) {
        if (generation !== this.generation) return;
        if (failure(e) === "analysisCancelled") {
          this.load();
          return;
        }
        this.publish({ error: failure(e), opening: false });
      }
    });
  };
  select = (side: "a" | "b", index: number) => {
    const lap = this.value.opened?.laps.find((l) => l.index === index);
    if (!lap || !comparable(lap)) return;
    const pair = { ...this.value.pair };
    const other = side === "a" ? "b" : "a";
    if (pair[other] === index) pair[other] = pair[side];
    pair[side] = index;
    this.publish({ pair });
    if (this.value.compareView) this.compare();
  };
  bestPair = () => {
    const [a, b] = timedLaps(this.value.opened?.laps ?? []);
    if (!a || !b) return;
    this.publish({ pair: { a: a.index, b: b.index } });
    this.compare();
  };
  zoom = (zoom?: [number, number]) => this.publish({ zoom });
  cancelComparison = () => {
    if (!this.value.comparing) return;
    ++this.generation;
    const cancelled = this.interrupt();
    this.publish({ comparing: false, compareError: "analysisCancelled" });
    this.enqueue(async () => {
      await cancelled;
      await this.close();
    });
  };
  showLaps = () => {
    if (this.value.comparing) {
      ++this.generation;
      const cancelled = this.interrupt();
      this.enqueue(async () => {
        await cancelled;
        await this.close();
      });
    }
    this.publish({
      compareView: false,
      comparing: false,
      compareError: undefined,
    });
  };
  compare = (reopen = false) => {
    const { selected, pair, opened, comparing } = this.value;
    const a = opened?.laps.find((lap) => lap.index === pair?.a);
    const b = opened?.laps.find((lap) => lap.index === pair?.b);
    if (
      !selected ||
      !a ||
      !b ||
      a.index === b.index ||
      !comparable(a) ||
      !comparable(b)
    )
      return;
    const generation = ++this.generation;
    this.publish({
      compareView: true,
      comparing: true,
      compareError: undefined,
    });
    const cancelled = comparing ? this.interrupt() : Promise.resolve();
    this.enqueue(async () => {
      await cancelled;
      if (comparing || reopen) await this.close();
      if (generation !== this.generation) return;
      try {
        if (!this.session) {
          const r = await this.request(
            { method: "analysis.open", id: selected.id },
            generation,
          );
          if (r?.method !== "analysis.open") return;
          const { session, ...fresh } = r;
          this.session = session;
          if (generation !== this.generation || !this.active) {
            await this.close();
            return;
          }
          this.publish({ opened: fresh });
        }
        if (!this.session) return;
        const result = await this.request(
          {
            method: "analysis.compare",
            session: this.session,
            a: a.index,
            b: b.index,
          },
          generation,
        );
        if (
          generation === this.generation &&
          result?.method === "analysis.compare"
        )
          this.publish({
            comparison: { ...result, a: a.index, b: b.index },
            comparing: false,
            zoom: retainZoom(this.value.zoom, result.distanceRange),
          });
      } catch (error) {
        if (!this.active || generation !== this.generation) return;
        const kind = failure(error);
        if (kind === "analysisCancelled" || kind === "analysisTimeout") {
          await this.interrupt();
          await this.close();
        }
        if (generation === this.generation)
          this.publish({ compareError: kind, comparing: false });
      }
    });
  };
  private async close() {
    const session = this.session;
    this.session = undefined;
    if (session)
      await this.client
        .request({ method: "analysis.close", session })
        .catch(() => undefined);
  }
  dispose = () => {
    this.active = false;
    ++this.generation;
    const cancelled = this.interrupt();
    this.enqueue(async () => {
      await cancelled;
      await this.close();
    });
  };
}
