import { studioKinds, studioLimits, studioMethods } from "../generated/studio";
import { exact, integer, oneOf, record } from "../validation-common";

export { studioMethods as methods };

const id = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  !v.includes("\0") &&
  new TextEncoder().encode(v).length <= studioLimits.id;
const revision = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
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
    ]) &&
    id(v.id) &&
    oneOf(v.kind, studioKinds) &&
    typeof v.visible === "boolean" &&
    typeof v.locked === "boolean" &&
    integer(v.opacity) &&
    v.opacity <= studioLimits.opacityMax &&
    showIn(v.showIn) &&
    oneOf(v.offTrack, ["inherit", "alwaysVisible", "hide"] as const) &&
    record(v.size) &&
      exact(v.size, ["width", "height"]) &&
      integer(v.size.width) &&
      integer(v.size.height) &&
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
    ]) &&
    oneOf(v.state, ["missing", "protected", "ready"] as const) &&
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
    oneOf(v.plan, [
      "unverified",
      "free",
      "launch",
      "pro",
      "founders",
    ] as const) &&
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
        exact(v, ["method", "kind", "baseRevision"]) &&
        oneOf(v.kind, studioKinds)
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
        : p.field === "showIn"
          ? showIn(p.value)
          : p.field === "offTrack" &&
            oneOf(p.value, ["inherit", "alwaysVisible", "hide"] as const);
    }
    default:
      return false;
  }
}
export function isReply(v: Record<string, unknown>) {
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
