import type {
  GeometryChange,
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/studio";
import { studioSizes } from "../../../contract/generated/studio";
import { anchor, near, type Rect } from "./geometry";
export const rectOf = (item: OverlayInstance): Rect => [
  item.x,
  item.y,
  item.size.width,
  item.size.height,
];
export function sameGeometry(
  a: OverlayInstance | undefined,
  b: OverlayInstance | undefined,
) {
  return (
    !!a &&
    !!b &&
    a.id === b.id &&
    near(a.x, b.x) &&
    near(a.y, b.y) &&
    Math.fround(a.size.width) === Math.fround(b.size.width) &&
    Math.fround(a.size.height) === Math.fround(b.size.height) &&
    a.aspectLocked === b.aspectLocked &&
    a.sizeMode === b.sizeMode &&
    a.locked === b.locked &&
    a.visible === b.visible
  );
}
export function project(
  item: OverlayInstance,
  change: GeometryChange,
  view: StudioView,
): OverlayInstance | undefined {
  const result = structuredClone(item);
  switch (change.kind) {
    case "move":
      result.x = change.x;
      result.y = change.y;
      break;
    case "resize":
      result.x = change.x;
      result.y = change.y;
      result.size = { width: change.width, height: change.height };
      result.sizeMode = "explicit";
      break;
    case "aspectLocked":
      result.aspectLocked = change.value;
      break;
    case "autoSize":
      result.size = { ...studioSizes[item.kind] };
      result.sizeMode = "auto";
      break;
    case "anchor": {
      if (!view.canvas) return;
      const at = anchor(
        [item.size.width, item.size.height],
        [view.canvas.width, view.canvas.height],
        change.column,
        change.row,
      );
      if (!at) return;
      [result.x, result.y] = at;
      break;
    }
  }
  return result;
}
export type GeometryJob = {
  id: string;
  change: GeometryChange;
  base: OverlayInstance;
};
export type CanvasDraft = {
  id: string;
  base: OverlayInstance;
  rect: Rect;
  guides: readonly [number | null, number | null];
};
/** One in-flight write and one replaceable successor. No optimistic saved geometry. */
export class CanvasWriter {
  draft: CanvasDraft | undefined;
  queued: GeometryJob | undefined;
  inflight:
    | { job: GeometryJob; expected: OverlayInstance | undefined }
    | undefined;
  notice: "changed" | "failed" | "saved" | "cancelled" | undefined;
  private epoch = 0;
  private alive = true;
  constructor(
    public view: StudioView,
    private scope: string,
    public allowed: boolean,
    private send: (request: {
      method: "studio.geometry";
      id: string;
      change: GeometryChange;
      baseRevision: string;
    }) => Promise<StudioView | undefined>,
    private changed: () => void,
  ) {}
  refresh(view: StudioView, scope: string, allowed: boolean) {
    const canvasChanged =
      JSON.stringify(view.canvas) !== JSON.stringify(this.view.canvas);
    const pendingItem =
      this.inflight &&
      view.instances.find((i) => i.id === this.inflight?.job.id);
    const pendingChanged =
      this.inflight &&
      !sameGeometry(pendingItem, this.inflight.job.base) &&
      !sameGeometry(pendingItem, this.inflight.expected);
    if (scope !== this.scope || !allowed || canvasChanged || pendingChanged) {
      this.epoch++;
      this.cancel("changed");
      if (this.inflight) this.notice = "changed";
    } else {
      const reconcile = (base: OverlayInstance) => {
        const item = view.instances.find((i) => i.id === base.id);
        if (sameGeometry(item, base)) return item;
        // The publication of our pending write may arrive before its reply.
        if (
          this.inflight?.job.id === base.id &&
          sameGeometry(item, this.inflight.expected)
        )
          return item;
        return undefined;
      };
      if (this.draft) {
        const item = reconcile(this.draft.base);
        if (item) this.draft.base = item;
        else this.cancel("changed");
      }
      if (this.queued) {
        const item = reconcile(this.queued.base);
        if (item) this.queued.base = item;
        else this.cancel("changed");
      }
    }
    this.view = view;
    this.scope = scope;
    this.allowed = allowed;
    this.changed();
  }
  begin(id: string) {
    const base = this.view.instances.find((i) => i.id === id);
    if (
      !this.alive ||
      !this.allowed ||
      !base ||
      base.locked ||
      this.view.state !== "ready" ||
      !this.view.canvas
    )
      return false;
    this.notice = undefined;
    this.draft = {
      id,
      base: structuredClone(base),
      rect: rectOf(base),
      guides: [null, null],
    };
    this.changed();
    return true;
  }
  abandonDraft() {
    this.draft = undefined;
    this.changed();
  }
  preview(rect: Rect, guides: CanvasDraft["guides"] = [null, null]) {
    if (
      this.draft &&
      rect.every((n, i) => n === this.draft?.rect[i]) &&
      guides.every((n, i) => n === this.draft?.guides[i])
    )
      return;
    if (this.draft) {
      this.draft = { ...this.draft, rect, guides };
      this.changed();
    }
  }
  cancel(notice: CanvasWriter["notice"] = "cancelled") {
    const had = !!this.draft || !!this.queued;
    this.draft = undefined;
    this.queued = undefined;
    if (had) this.notice = notice;
    this.changed();
  }
  finish(kind: "move" | "resize") {
    const draft = this.draft;
    if (!draft) return;
    this.draft = undefined;
    const [x, y, width, height] = draft.rect;
    this.enqueue(
      draft.id,
      kind === "move" ? { kind, x, y } : { kind, x, y, width, height },
      draft.base,
    );
    this.changed();
  }
  enqueue(
    id: string,
    change: GeometryChange,
    base = this.view.instances.find((i) => i.id === id),
  ) {
    if (
      !this.alive ||
      !this.allowed ||
      !base ||
      base.locked ||
      this.view.state !== "ready" ||
      !this.view.canvas
    )
      return;
    if (
      (change.kind === "autoSize" && base.sizeMode === "auto") ||
      sameGeometry(base, project(base, change, this.view))
    )
      return;
    this.queued = { id, change, base: structuredClone(base) };
    this.notice = undefined;
    this.changed();
    void this.flush();
  }
  activate() {
    this.alive = true;
  }
  private nextJob(): GeometryJob | undefined {
    return this.queued;
  }
  private async flush() {
    if (this.inflight || !this.queued || !this.alive || !this.allowed) return;
    const job = this.queued;
    this.queued = undefined;
    const item = this.view.instances.find((i) => i.id === job.id);
    if (!sameGeometry(item, job.base)) {
      this.notice = "changed";
      this.changed();
      return;
    }
    const expected = project(job.base, job.change, this.view),
      epoch = this.epoch;
    const submittedRevision = this.view.revision;
    this.inflight = { job, expected };
    this.changed();
    let response: StudioView | undefined;
    try {
      response = await this.send({
        method: "studio.geometry",
        id: job.id,
        change: job.change,
        baseRevision: this.view.revision,
      });
    } catch {
      response = undefined;
    }
    if (!this.alive) return;
    this.inflight = undefined;
    if (epoch !== this.epoch) {
      this.queued = undefined;
      this.changed();
      return;
    }
    if (!response) {
      this.queued = undefined;
      this.draft = undefined;
      this.notice = "failed";
      this.changed();
      return;
    }
    if (
      this.view.revision !== submittedRevision &&
      this.view.revision !== response.revision
    ) {
      this.cancel("changed");
      this.notice = "changed";
      this.changed();
      return;
    }
    const acknowledged = response.instances.find((i) => i.id === job.id);
    if (!acknowledged || acknowledged.locked || response.state !== "ready") {
      this.cancel("changed");
      return;
    }
    // Only our acknowledgment may rebase a gesture completed during this write.
    const queued = this.nextJob();
    if (queued && sameGeometry(queued.base, job.base) && queued.id === job.id)
      queued.base = acknowledged;
    if (
      this.draft &&
      sameGeometry(this.draft.base, job.base) &&
      this.draft.id === job.id
    )
      this.draft.base = acknowledged;
    this.view = response;
    this.notice = "saved";
    this.changed();
    void this.flush();
  }
  dispose() {
    this.alive = false;
    this.epoch++;
    this.draft = undefined;
    this.queued = undefined;
  }
}
