import {
  studioAddKinds,
  studioFrequencyOptions,
  studioGeometryLimits,
  studioKinds,
  studioLimits,
  studioMethods,
  studioOffTracks,
  studioPlans,
  studioRevisionPattern,
  studioStates,
} from "../generated/studio";
import { isFrequencyChange, isFrequencyView } from "../studio-frequency";
import {
  isWidgetSettings,
  isWidgetSettingsPatch,
} from "../studio-widget-settings";
import { exact, integer, oneOf, record } from "../validation-common";

export { studioMethods as methods };

const id = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  !v.includes("\0") &&
  new TextEncoder().encode(v).length <= studioLimits.id;
const revision = (v: unknown) =>
  typeof v === "string" && new RegExp(studioRevisionPattern).test(v);
const coordinate = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  Math.abs(v) <= studioGeometryLimits.coordinateMax;
const position = (v: unknown): v is number =>
  coordinate(v) && Math.abs(v) <= studioGeometryLimits.nudgeLimit;
function point(v: unknown) {
  return (
    record(v) && exact(v, ["x", "y"]) && coordinate(v.x) && coordinate(v.y)
  );
}
function resolution(width: unknown, height: unknown) {
  return (
    coordinate(width) &&
    coordinate(height) &&
    width >= studioGeometryLimits.canvasMin &&
    height >= studioGeometryLimits.canvasMin &&
    width <= studioGeometryLimits.canvasMax &&
    height <= studioGeometryLimits.canvasMax
  );
}
function canvas(v: unknown) {
  return (
    v === null ||
    (record(v) &&
      exact(v, ["width", "height", "source"]) &&
      resolution(v.width, v.height) &&
      (v.source === "monitor" || v.source === "custom"))
  );
}
function geometry(v: unknown) {
  if (!record(v)) return false;
  switch (v.kind) {
    case "move":
      return exact(v, ["kind", "x", "y"]) && position(v.x) && position(v.y);
    case "resize":
      return (
        exact(v, ["kind", "x", "y", "width", "height"]) &&
        position(v.x) &&
        position(v.y) &&
        coordinate(v.width) &&
        coordinate(v.height) &&
        v.width > 0 &&
        v.height > 0
      );
    case "anchor":
      return (
        exact(v, ["kind", "column", "row"]) &&
        integer(v.column) &&
        integer(v.row) &&
        v.column <= 2 &&
        v.row <= 2
      );
    case "autoSize":
      return exact(v, ["kind"]);
    case "aspectLocked":
      return exact(v, ["kind", "value"]) && typeof v.value === "boolean";
    default:
      return false;
  }
}
function canvasChoice(v: unknown) {
  return (
    record(v) &&
    (v.kind === "monitor"
      ? exact(v, ["kind"])
      : v.kind === "custom" &&
        exact(v, ["kind", "width", "height"]) &&
        resolution(v.width, v.height))
  );
}
function showIn(v: unknown) {
  return (
    record(v) &&
    exact(v, ["practice", "qualifying", "race"]) &&
    [v.practice, v.qualifying, v.race].every((x) => typeof x === "boolean")
  );
}
function instance(v: unknown) {
  return (
    record(v) &&
    exact(v, [
      "id",
      "kind",
      "visible",
      "locked",
      "opacity",
      "showIn",
      "offTrack",
      "size",
      "settings",
      "frequency",
      "x",
      "y",
      "sizeMode",
      "aspectLocked",
      "canvasPlacement",
    ]) &&
    oneOf(v.kind, studioKinds) &&
    isFrequencyView(v.frequency, v.kind) &&
    isWidgetSettings(v.settings, v.kind) &&
    coordinate(v.x) &&
    coordinate(v.y) &&
    (v.sizeMode === "auto" || v.sizeMode === "explicit") &&
    typeof v.aspectLocked === "boolean" &&
    (v.canvasPlacement === "inside" || v.canvasPlacement === "outside") &&
    id(v.id) &&
    oneOf(v.kind, studioKinds) &&
    typeof v.visible === "boolean" &&
    typeof v.locked === "boolean" &&
    integer(v.opacity) &&
    v.opacity <= studioLimits.opacityMax &&
    showIn(v.showIn) &&
    oneOf(v.offTrack, studioOffTracks) &&
    record(v.size) &&
    exact(v.size, ["width", "height"]) &&
    coordinate(v.size.width) &&
    coordinate(v.size.height) &&
    v.size.width > 0 &&
    v.size.height > 0 &&
    v.size.width <= studioLimits.size &&
    v.size.height <= studioLimits.size
  );
}
export function isStudio(v: unknown) {
  return (
    record(v) &&
    exact(v, [
      "state",
      "revision",
      "instances",
      "catalog",
      "showing",
      "plan",
      "canUndo",
      "canRedo",
      "canvas",
    ]) &&
    canvas(v.canvas) &&
    oneOf(v.state, studioStates) &&
    revision(v.revision) &&
    Array.isArray(v.instances) &&
    v.instances.length <= studioLimits.instances &&
    v.instances.every(instance) &&
    Array.isArray(v.catalog) &&
    v.catalog.length <= studioKinds.length &&
    v.catalog.every(
      (w) =>
        record(w) &&
        exact(w, [
          "kind",
          "name",
          "category",
          "about",
          "allowed",
          "suggested",
        ]) &&
        oneOf(w.kind, studioKinds) &&
        typeof w.name === "string" &&
        w.name.length <= studioLimits.label &&
        typeof w.category === "string" &&
        w.category.length <= studioLimits.label &&
        typeof w.about === "string" &&
        w.about.length <= studioLimits.about &&
        typeof w.allowed === "boolean" &&
        typeof w.suggested === "boolean",
    ) &&
    typeof v.showing === "boolean" &&
    oneOf(v.plan, studioPlans) &&
    typeof v.canUndo === "boolean" &&
    typeof v.canRedo === "boolean"
  );
}
export function isRequest(v: Record<string, unknown>): boolean {
  if (!studioMethods.some((method) => method === v.method)) return false;
  if (v.method === "studio.get") return exact(v, ["method"]);
  if (v.method === "studio.track")
    return exact(v, ["method", "show"]) && typeof v.show === "boolean";
  if (!revision(v.baseRevision)) return false;
  switch (v.method) {
    case "studio.undo":
    case "studio.redo":
      return exact(v, ["method", "baseRevision"]);
    case "studio.add":
      return (
        exact(v, [
          "method",
          "kind",
          "baseRevision",
          ...(Object.hasOwn(v, "at") ? ["at"] : []),
        ]) &&
        (!Object.hasOwn(v, "at") || point(v.at)) &&
        oneOf(v.kind, studioAddKinds)
      );
    case "studio.geometry":
      return (
        exact(v, ["method", "id", "change", "baseRevision"]) &&
        id(v.id) &&
        geometry(v.change)
      );
    case "studio.canvas":
      return (
        exact(v, ["method", "resolution", "baseRevision"]) &&
        canvasChoice(v.resolution)
      );
    case "studio.remove":
      return exact(v, ["method", "id", "baseRevision"]) && id(v.id);
    case "studio.visibility":
      return (
        exact(v, ["method", "id", "visible", "baseRevision"]) &&
        id(v.id) &&
        typeof v.visible === "boolean"
      );
    case "studio.instance": {
      if (
        !exact(v, ["method", "id", "patch", "baseRevision"]) ||
        !id(v.id) ||
        !record(v.patch) ||
        !exact(v.patch, ["field", "value"])
      )
        return false;
      const p = v.patch;
      return p.field === "opacity"
        ? integer(p.value) &&
            p.value >= studioLimits.opacityMin &&
            p.value <= studioLimits.opacityMax
        : p.field === "frequency"
          ? new TextEncoder().encode(v.id).length <=
              studioFrequencyOptions.maxIdBytes && isFrequencyChange(p.value)
          : p.field === "showIn"
            ? showIn(p.value)
            : p.field === "settings"
              ? isWidgetSettingsPatch(p.value)
              : p.field === "offTrack" && oneOf(p.value, studioOffTracks);
    }
    default:
      return false;
  }
}
export function isReply(v: Record<string, unknown>) {
  if (v.method === "studio.add")
    return (
      exact(v, ["method", "value", "added"]) && id(v.added) && isStudio(v.value)
    );
  return (
    studioMethods.some((method) => method === v.method) &&
    exact(v, ["method", "value"]) &&
    isStudio(v.value)
  );
}
export function isError(v: Record<string, unknown>) {
  return (
    v.kind === "studioConflict" &&
    exact(v, ["kind", "current"]) &&
    isStudio(v.current)
  );
}
export function isEvent(v: Record<string, unknown>) {
  return (
    v.topic === "studio" && exact(v, ["topic", "value"]) && isStudio(v.value)
  );
}
