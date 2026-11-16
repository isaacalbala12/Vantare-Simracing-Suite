import tablePresets from "../../../../native/hub-host/data/table-presets.json";
import type {
  HostToUi,
  OverlayInstance,
  StudioView,
  WidgetKind,
} from "../../contract/generated/contract";
import {
  studioAdditionalOptions as a,
  studioAddAvailable,
  studioCatalog,
  studioDuplicateCases,
  studioFreeKinds,
  studioFrequencyOptions,
  studioLimits,
  studioMonitorCases,
  studioSizes,
  studioWidgetDefaults,
} from "../../contract/generated/studio";
import {
  frequencyFor,
  isFrequencyChange,
} from "../../contract/studio-frequency";
import {
  isWidgetSettings,
  isWidgetSettingsPatch,
} from "../../contract/studio-widget-settings";
import type { MockContext, MockHandler } from "../context";
import { applyGeometry } from "../studio-geometry";
import { studioStateScene } from "../studio-states";
import { studioFieldKind } from "../studio-widget-scenes";
export function create(context: MockContext): MockHandler {
  const { sceneName } = context;
  if (sceneName.startsWith("studio-")) {
    context.core.rights = "connected";
    context.core.access.verified = true;
  }
  let performanceLevel = context.settingsData?.track.level ?? "balanced";
  const otherOverrides = context.settingsData?.track.customWidgets ?? 0;
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
    settings: widgetDefault(item.kind as WidgetKind),
    frequency: frequencyFor(item.kind as WidgetKind, performanceLevel, null),
    visible: true,
    locked: false,
    opacity: 100,
    showIn: { practice: true, qualifying: true, race: true },
    offTrack: "inherit",
    x: 48,
    y: 62,
    sizeMode: "auto",
    aspectLocked: true,
    canvasPlacement: "inside",
  })) as OverlayInstance[];
  const fieldKind = studioFieldKind(sceneName);
  if (fieldKind) {
    instances.splice(0, instances.length, {
      ...instances[0],
      kind: fieldKind,
      settings: widgetDefault(fieldKind),
      size: { ...studioSizes[fieldKind] },
      frequency: frequencyFor(fieldKind, performanceLevel, null),
    });
  }
  if (sceneName === "studio-muchos" || sceneName === "studio-nueve") {
    const originals = structuredClone(instances);
    instances.splice(
      0,
      instances.length,
      ...Array.from(
        { length: sceneName === "studio-nueve" ? 9 : 30 },
        (_, index) => ({
          ...structuredClone(originals[index % originals.length]),
          id: `widget-${index + 1}`,
        }),
      ),
    );
  }
  if (sceneName === "studio-pocos") instances.splice(2);
  if (sceneName.startsWith("studio-canvas")) {
    const positions = [
      [48, 62],
      [770, 40],
      [1560, 300],
      [1540, 800],
    ];
    instances.forEach((item, i) => {
      item.x = positions[i][0];
      item.y = positions[i][1];
    });
    // The approved Vista Lienzo A prototype uses this QA distribution.
    instances[1].size = { width: 380, height: 72 };
    instances[2].size = { width: 320, height: 208 };
    instances[2].visible = false;
    instances[3].size = { width: 300, height: 204 };
    if (sceneName === "studio-canvas-outside") {
      instances[0].x = -80;
      instances[0].canvasPlacement = "outside";
    }
    if (sceneName === "studio-canvas-readonly") context.core.live = true;
    if (sceneName === "studio-canvas-fractional") {
      instances[0].x = 0.25;
      instances[0].y = -0.5;
      instances[0].canvasPlacement = "outside";
    }
  }
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
    showing:
      sceneName === "studio-mostrando" ||
      sceneName === "studio-canvas-readonly",
    plan: "pro",
    canUndo: false,
    canRedo: false,
    canvas: { width: 1920, height: 1080, source: "monitor" },
    monitor: { width: 1920, height: 1080 },
  };
  const monitorCase = studioMonitorCases.find(
    (sample) => sceneName === `studio-monitor-${sample.name}`,
  );
  if (monitorCase) {
    view.state = monitorCase.value.state;
    view.canvas = monitorCase.value.canvas
      ? { ...monitorCase.value.canvas }
      : null;
    view.monitor = monitorCase.value.monitor
      ? { ...monitorCase.value.monitor }
      : null;
  }
  if (
    sceneName === "studio-canvas-monitor" ||
    sceneName === "studio-canvas-monitor-missing"
  ) {
    const sample = studioMonitorCases.find(
      (item) =>
        item.name ===
        (sceneName.endsWith("-missing") ? "disconnected" : "native"),
    );
    if (sample) {
      view.canvas = sample.value.canvas ? { ...sample.value.canvas } : null;
      view.monitor = sample.value.monitor ? { ...sample.value.monitor } : null;
      view.state = sample.value.state;
    }
  }
  if (context.settingsData && sceneName.startsWith("studio-")) {
    context.settingsData.track.exists = view.state !== "missing";
    context.settingsData.track.protected = view.state === "protected";
  }
  const duplicateCase = studioDuplicateCases.find(
    (sample) => sceneName === `studio-duplicate-${sample.name}`,
  );
  if (duplicateCase) {
    view.instances.splice(1);
    const item = view.instances[0];
    [item.x, item.y] = duplicateCase.position;
    item.size = { width: duplicateCase.size[0], height: duplicateCase.size[1] };
    item.sizeMode = "explicit";
    view.canvas = {
      width: duplicateCase.canvas[0],
      height: duplicateCase.canvas[1],
      source: "custom",
    };
    item.canvasPlacement =
      item.x < 0 ||
      item.y < 0 ||
      item.x + item.size.width > view.canvas.width ||
      item.y + item.size.height > view.canvas.height
        ? "outside"
        : "inside";
  }
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
  if (view.state !== "ready") view.monitor = null;
  const stateScene = studioStateScene(sceneName, view);
  type LayoutSnapshot = Pick<StudioView, "instances" | "canvas">;
  const undo: LayoutSnapshot[] = [],
    redo: LayoutSnapshot[] = [];
  let conflict =
    sceneName === "studio-error" || sceneName === "studio-canvas-conflict";
  const bump = () => {
    view.revision = (BigInt(`0x${view.revision}`) + 1n)
      .toString(16)
      .padStart(64, "0");
    view.canUndo = undo.length > 0;
    view.canRedo = redo.length > 0;
  };
  return (message) => {
    const level = context.settingsData?.track.level ?? performanceLevel;
    if (level !== performanceLevel) {
      performanceLevel = level;
      view.instances.forEach((item) => {
        item.frequency = frequencyFor(
          item.kind,
          level,
          item.frequency.overrideHz,
        );
      });
      undo.length = redo.length = 0;
      bump();
    }
    const staged = stateScene(message);
    if (staged !== undefined) return staged;
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
    // Catalogue drops are implemented in ADR 0109 PR 3.
    if (request.method === "studio.add" && request.at !== undefined) {
      return { kind: "failure", id, error: { kind: "unsupported" } };
    }
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
    const before = structuredClone({
      instances: view.instances,
      canvas: view.canvas,
    });
    let added: string | null = null;
    switch (request.method) {
      case "studio.canvas": {
        if (
          context.core.live ||
          context.core.rights !== "connected" ||
          !context.core.access.verified ||
          view.plan === "unverified"
        )
          return fail("denied");
        if (request.resolution.kind === "monitor") {
          if (!view.monitor) return fail("denied");
          view.canvas = { ...view.monitor, source: "monitor" };
        } else {
          view.canvas = {
            width: request.resolution.width,
            height: request.resolution.height,
            source: "custom",
          };
        }
        break;
      }
      case "studio.geometry": {
        if (
          !view.canvas ||
          context.core.live ||
          context.core.rights !== "connected" ||
          !context.core.access.verified ||
          view.plan === "unverified"
        )
          return fail("denied");
        const item = view.instances.find((item) => item.id === request.id);
        if (!item || item.locked) return fail("denied");
        const changed = applyGeometry(item, request.change, [
          view.canvas.width,
          view.canvas.height,
        ]);
        if (changed === "rejected")
          return { kind: "failure", id, error: { kind: "rejected" } };
        if (!changed)
          return {
            kind: "response",
            id,
            result: { method: "studio.geometry", value: structuredClone(view) },
          };
        break;
      }
      case "studio.get":
        break;
      case "studio.track":
        view.showing = request.show;
        break;
      case "studio.undo": {
        const prior = undo.pop();
        if (!prior) return fail("denied");
        redo.push(before);
        Object.assign(view, prior);
        bump();
        break;
      }
      case "studio.redo": {
        const next = redo.pop();
        if (!next) return fail("denied");
        undo.push(before);
        Object.assign(view, next);
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
          settings: widgetDefault(request.kind),
          frequency: frequencyFor(request.kind, performanceLevel, null),
          visible: true,
          locked: false,
          opacity: 100,
          showIn: { practice: true, qualifying: true, race: true },
          offTrack: "inherit",
          x: 38.4,
          y: 38.4,
          sizeMode: "auto",
          aspectLocked: true,
          canvasPlacement: "inside",
          size: {
            width: Math.round(studioSizes[request.kind].width),
            height: Math.round(studioSizes[request.kind].height),
          },
        });
        break;
      }
      case "studio.duplicate": {
        if (
          context.core.live ||
          !context.core.access.verified ||
          context.core.access.blocked
        )
          return fail("denied");
        const source = view.instances.find((item) => item.id === request.id);
        if (
          !source ||
          source.locked ||
          view.instances.length >= studioLimits.instances
        )
          return fail("denied");
        if (!view.canvas) return fail("protected");
        if (
          source.frequency.overrideHz !== null &&
          otherOverrides +
            view.instances.filter((item) => item.frequency.overrideHz !== null)
              .length >=
            studioFrequencyOptions.maxOverrides
        )
          return fail("denied");
        let n = 1;
        while (
          view.instances.some(
            (item) =>
              item.id === `widget-${n}` ||
              (source.kind === "session-alerts" &&
                item.id === `widget-${n}-mini`),
          )
        )
          n++;
        added = `widget-${n}`;
        const item = structuredClone(source);
        item.id = added;
        const centerX = source.x + 20 + source.size.width / 2;
        const centerY = source.y + 20 + source.size.height / 2;
        item.x = Math.max(
          0,
          Math.min(
            centerX - source.size.width / 2,
            Math.max(0, view.canvas.width - source.size.width),
          ),
        );
        item.y = Math.max(
          0,
          Math.min(
            centerY - source.size.height / 2,
            Math.max(0, view.canvas.height - source.size.height),
          ),
        );
        item.canvasPlacement =
          item.x + item.size.width > view.canvas.width ||
          item.y + item.size.height > view.canvas.height
            ? "outside"
            : "inside";
        view.instances.push(item);
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
        if (!item || item.locked) return fail("denied");
        switch (request.patch.field) {
          case "frequency": {
            const hz = request.patch.value;
            if (
              item.kind === "racing-flags" ||
              !isFrequencyChange(hz) ||
              new TextEncoder().encode(item.id).length >
                studioFrequencyOptions.maxIdBytes
            )
              return fail("denied");
            if (item.frequency.overrideHz === hz)
              return {
                kind: "response",
                id,
                result: {
                  method: "studio.instance",
                  value: structuredClone(view),
                },
              };
            const count =
              otherOverrides +
              view.instances.filter(
                (entry) => entry.frequency.overrideHz !== null,
              ).length;
            if (
              hz !== null &&
              item.frequency.overrideHz === null &&
              count >= studioFrequencyOptions.maxOverrides
            )
              return fail("denied");
            item.frequency = frequencyFor(item.kind, performanceLevel, hz);
            break;
          }
          case "settings": {
            if (!item.settings || item.kind !== request.patch.value.kind)
              return fail("denied");
            const next = applyWidgetSettings(
              item.settings,
              request.patch.value,
            );
            if (!next) return fail("denied");
            if (JSON.stringify(next) === JSON.stringify(item.settings))
              return {
                kind: "response",
                id,
                result: {
                  method: "studio.instance",
                  value: structuredClone(view),
                },
              };
            item.settings = next;
            break;
          }
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
    if (context.settingsData) {
      const count =
        otherOverrides +
        view.instances.filter((item) => item.frequency.overrideHz !== null)
          .length;
      context.settingsData.track.customWidgets = count;
      context.settingsData.track.customized = count > 0;
      if (
        request.method !== "studio.get" &&
        request.method !== "studio.track"
      ) {
        context.settingsData.revision = (
          BigInt(`0x${context.settingsData.revision}`) + 1n
        )
          .toString(16)
          .padStart(64, "0");
        if (context.onboarding)
          context.onboarding.settingsRevision = context.settingsData.revision;
      }
    }
    if (
      request.method === "studio.add" ||
      request.method === "studio.duplicate"
    ) {
      if (!added) return fail("denied");
      return {
        kind: "response",
        id,
        result: { method: request.method, value: structuredClone(view), added },
      };
    }
    return {
      kind: "response",
      id,
      result: { method: request.method, value: structuredClone(view) },
    };
  };
}

export function applyWidgetSettings(
  current: NonNullable<OverlayInstance["settings"]>,
  patch: import("../../contract/generated/studio").WidgetSettingsPatch,
): NonNullable<OverlayInstance["settings"]> | null {
  if (current.kind !== patch.kind || !isWidgetSettingsPatch(patch)) return null;
  if ("tablePreset" in patch) {
    if (
      Object.keys(patch).length !== 2 ||
      (current.kind !== "standings" && current.kind !== "relative") ||
      current.kind !== patch.kind ||
      current.designSystem !== "vantare"
    )
      return null;
    const result = structuredClone(current) as unknown as Record<
      string,
      unknown
    >;
    const recipes = tablePresets.recipes[current.kind];
    const size = patch.tablePreset;
    if (!size) return null;
    const selected = recipes[size];
    if (!selected) return null;
    if (current.kind === "standings") {
      for (const key of ["practiceColumns", "qualifyingColumns"]) {
        if (result[key] == null)
          result[key] = structuredClone(result.columns ?? recipes.standard);
      }
    }
    const previous = Array.isArray(result.columns)
      ? (result.columns as Record<string, unknown>[])
      : [];
    result.columns = selected.map((column) => {
      const old = previous.find((entry) => entry.metricId === column.metricId);
      return {
        ...old,
        ...column,
        format: { ...(old?.format as object), ...column.format },
        style: { ...(old?.style as object), ...column.style },
      };
    });
    return result as unknown as NonNullable<OverlayInstance["settings"]>;
  }
  const original = current as unknown as Record<string, unknown>;
  const result = structuredClone(current) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "threshold") continue;
    if (
      ["columns", "practiceColumns", "qualifyingColumns"].includes(key) &&
      Array.isArray(value)
    ) {
      const inherited =
        key !== "columns" && original[key] == null
          ? original.columns
          : original[key];
      const previous = Array.isArray(inherited)
        ? (inherited as Record<string, unknown>[])
        : [];
      if (
        value.some(
          (entry) =>
            !previous.some((column) => column.metricId === entry.metric) &&
            previous.some((column) => column.id === entry.metric),
        )
      )
        return null;
      result[key] = value.map((entry) => {
        const { metric, ...fields } = entry;
        const old = previous.find((c) => c.metricId === metric) ?? {
          id: metric,
          metricId: metric,
          enabled: true,
          widthPreset: "auto",
          format: {
            mode: "",
            maxChars: null,
            display: null,
            decimals: null,
          },
          style: { align: null },
        };
        return {
          ...old,
          ...fields,
          format: {
            ...(old.format as object),
            ...fields.format,
            ...(fields.format?.mode === null ? { mode: "" } : {}),
          },
          style: { ...(old.style as object), ...fields.style },
        };
      });
    } else if (
      value === null &&
      ["practiceColumns", "qualifyingColumns", "footerSlots"].includes(key)
    ) {
      delete result[key];
    } else result[key] = value;
  }
  if (patch.kind === "session-alerts" && patch.threshold) {
    const thresholds = Array.isArray(result.thresholds)
      ? [...result.thresholds]
      : [];
    while (thresholds.length <= patch.threshold.index) thresholds.push(0);
    thresholds[patch.threshold.index] = patch.threshold.minutes;
    result.thresholds = [
      ...new Set(
        thresholds.filter(
          (n) =>
            Number.isInteger(n) && n >= 1 && n <= a.sessionAlerts.thresholdMax,
        ),
      ),
    ]
      .sort((x, y) => y - x)
      .slice(0, a.sessionAlerts.thresholdSlots);
  }
  if (patch.kind === "racing-flags" && patch.textColor) {
    result.textColor = patch.textColor.toLowerCase();
    result.contentVersion = Math.max(1, Number(result.contentVersion));
  }
  if (result.kind === "delta" && result.transparentBackground === false)
    delete result.transparentBackground;
  return result as unknown as NonNullable<OverlayInstance["settings"]>;
}

function widgetDefault(kind: WidgetKind): OverlayInstance["settings"] {
  const value: unknown = structuredClone(studioWidgetDefaults[kind]);
  if (!isWidgetSettings(value, kind))
    throw new Error("Invalid generated widget default");
  return value;
}
