import type {
  HostToUi,
  OverlayInstance,
  StudioView,
} from "../../contract/generated/contract";
import {
  studioAddAvailable,
  studioCatalog,
  studioFreeKinds,
  studioLimits,
  studioSizes,
} from "../../contract/generated/studio";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName } = context;
  if (sceneName.startsWith("studio-")) {
    context.core.rights = "connected";
    context.core.access.verified = true;
  }
  const instances: OverlayInstance[] = [
    { id: "widget-1", kind: "standings", size: { width: 338, height: 304 } },
    { id: "widget-2", kind: "delta", size: { width: 356, height: 88 } },
    { id: "widget-3", kind: "relative", size: { width: 408, height: 210 } },
    {
      id: "widget-4",
      kind: "fuel-strategy",
      size: { width: 296, height: 136 },
    },
  ].map((item) => ({
    ...item,
    visible: true,
    locked: false,
    opacity: 100,
    showIn: { practice: true, qualifying: true, race: true },
    offTrack: "inherit",
  })) as OverlayInstance[];
  if (sceneName === "studio-muchos") {
    const originals = structuredClone(instances);
    instances.splice(
      0,
      instances.length,
      ...Array.from({ length: 30 }, (_, index) => ({
        ...structuredClone(originals[index % originals.length]),
        id: `widget-${index + 1}`,
      })),
    );
  }
  if (sceneName === "studio-pocos") instances.splice(2);
  const view: StudioView = {
    state:
      sceneName === "studio-missing"
        ? "missing"
        : sceneName === "studio-protegido"
          ? "protected"
          : "ready",
    revision: "0".repeat(64),
    instances: sceneName === "studio-vacio" ? [] : instances,
    catalog: studioCatalog.map((item) => ({ ...item, allowed: true })),
    showing: sceneName === "studio-mostrando",
    plan: "pro",
    canUndo: false,
    canRedo: false,
  };
  if (sceneName === "studio-oculto") view.instances[0].visible = false;
  if (view.state !== "ready") view.instances = [];
  if (
    sceneName === "studio-pro-bloqueado" ||
    sceneName === "studio-bloqueado"
  ) {
    view.plan = "free";
    view.catalog = view.catalog.map((w) => ({
      ...w,
      allowed: studioFreeKinds.some((kind) => kind === w.kind),
    }));
    view.instances = view.instances.map((w) => ({
      ...w,
      locked: !view.catalog.some((c) => c.kind === w.kind && c.allowed),
    }));
  }
  if (sceneName === "studio-protegido-mostrando") {
    view.state = "protected";
    view.showing = true;
    view.plan = "unverified";
    view.instances = [];
    view.catalog = view.catalog.map((w) => ({ ...w, allowed: false }));
  }
  const undo: OverlayInstance[][] = [],
    redo: OverlayInstance[][] = [];
  let conflict = sceneName === "studio-error";
  const bump = () => {
    view.revision = (BigInt(`0x${view.revision}`) + 1n)
      .toString(16)
      .padStart(64, "0");
    view.canUndo = undo.length > 0;
    view.canRedo = redo.length > 0;
  };
  return (message) => {
    if (message.kind === "subscribe" && message.topic === "studio")
      return {
        kind: "event",
        event: { topic: "studio", value: structuredClone(view) },
      };
    if (
      message.kind !== "request" ||
      !message.request.method.startsWith("studio.")
    )
      return;
    const { request, id } = message;
    const fail = (kind: "denied" | "protected"): HostToUi => ({
      kind: "failure",
      id,
      error: { kind },
    });
    if (
      request.method !== "studio.get" &&
      !(request.method === "studio.track" && !request.show) &&
      view.state !== "ready"
    )
      return fail("protected");
    if (
      "baseRevision" in request &&
      (request.baseRevision !== view.revision || conflict)
    ) {
      if (conflict) bump();
      conflict = false;
      return {
        kind: "failure",
        id,
        error: { kind: "studioConflict", current: structuredClone(view) },
      };
    }
    const before = structuredClone(view.instances);
    let added: string | null = null;
    switch (request.method) {
      case "studio.get":
        break;
      case "studio.track":
        view.showing = request.show;
        break;
      case "studio.undo": {
        const prior = undo.pop();
        if (!prior) return fail("denied");
        redo.push(before);
        view.instances = prior;
        bump();
        break;
      }
      case "studio.redo": {
        const next = redo.pop();
        if (!next) return fail("denied");
        undo.push(before);
        view.instances = next;
        bump();
        break;
      }
      case "studio.add": {
        if (!studioAddAvailable) return fail("protected");
        const widget = view.catalog.find((w) => w.kind === request.kind);
        if (!widget?.allowed || view.instances.length >= studioLimits.instances)
          return fail("denied");
        let n = 1;
        while (view.instances.some((w) => w.id === `widget-${n}`)) n++;
        added = `widget-${n}`;
        view.instances.push({
          id: added,
          kind: request.kind,
          visible: true,
          locked: false,
          opacity: 100,
          showIn: { practice: true, qualifying: true, race: true },
          offTrack: "inherit",
          size: {
            width: Math.round(studioSizes[request.kind].width),
            height: Math.round(studioSizes[request.kind].height),
          },
        });
        break;
      }
      case "studio.remove":
        view.instances = view.instances.filter((w) => w.id !== request.id);
        break;
      case "studio.visibility": {
        const item = view.instances.find((w) => w.id === request.id);
        if (!item) return fail("denied");
        item.visible = request.visible;
        break;
      }
      case "studio.instance": {
        const item = view.instances.find((w) => w.id === request.id);
        if (!item) return fail("denied");
        switch (request.patch.field) {
          case "opacity":
            item.opacity = request.patch.value;
            break;
          case "offTrack":
            item.offTrack = request.patch.value;
            break;
          case "showIn":
            item.showIn = request.patch.value;
            break;
        }
        break;
      }
      default:
        return;
    }
    if (
      request.method !== "studio.get" &&
      request.method !== "studio.track" &&
      request.method !== "studio.undo" &&
      request.method !== "studio.redo"
    ) {
      undo.push(before);
      if (undo.length > studioLimits.history) undo.shift();
      redo.length = 0;
      bump();
    }
    if (request.method === "studio.add") {
      if (!added) return fail("denied");
      return {
        kind: "response",
        id,
        result: { method: "studio.add", value: structuredClone(view), added },
      };
    }
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(view) },
    };
  };
}
