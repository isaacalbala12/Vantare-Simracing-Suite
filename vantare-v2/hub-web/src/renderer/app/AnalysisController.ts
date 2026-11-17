import type {
  AnalysisReply,
  AnalysisRequest,
  AnalysisRow,
} from "../../contract/generated/analysis";
import type { HostError, Reply } from "../../contract/generated/contract";
import { HostFailure } from "../bridge/client";
export type Inspection = Extract<AnalysisReply, { method: "analysis.inspect" }>;
export type Opened = Omit<
  Extract<AnalysisReply, { method: "analysis.open" }>,
  "session"
>;
export type AnalysisSnapshot = {
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
    return this.client
      .request({ method: "analysis.cancel" })
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
        return await this.client.request(request);
      } catch (e) {
        if (!this.active || generation !== this.generation) return undefined;
        if (failure(e) !== "busy") throw e;
        await this.pause();
      }
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
        this.publish({ opened, opening: false });
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
