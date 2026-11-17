import {
  previewErrors,
  previewLimits,
  previewScales,
} from "../generated/preview";
import {
  studioAddKinds,
  studioKinds,
  studioLimits,
  studioRevisionPattern,
} from "../generated/studio";
import { workshopFrameLimit } from "../generated/workshop";
import { exact, integer, oneOf, record } from "../validation-common";
import { isSceneId } from "./workshop";

export { previewMethods as methods } from "../generated/preview";

function target(value: unknown) {
  if (!record(value)) return false;
  if (value.kind === "scene")
    return (
      exact(value, ["kind", "widget", "sceneId", "frame"]) &&
      oneOf(value.widget, studioKinds) &&
      isSceneId(value.sceneId) &&
      integer(value.frame) &&
      value.frame >= 0 &&
      value.frame < workshopFrameLimit
    );
  if (value.kind === "catalog")
    return (
      exact(value, ["kind", "widget"]) && oneOf(value.widget, studioAddKinds)
    );
  return (
    value.kind === "instance" &&
    exact(value, ["kind", "id", "baseRevision"]) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    !value.id.includes("\0") &&
    new TextEncoder().encode(value.id).length <= studioLimits.id &&
    typeof value.baseRevision === "string" &&
    new RegExp(studioRevisionPattern).test(value.baseRevision)
  );
}
export function isRequest(value: Record<string, unknown>): boolean {
  return (
    exact(value, ["method", "target", "scene", "scale"]) &&
    target(value.target) &&
    value.scene === "demo" &&
    oneOf(value.scale, previewScales)
  );
}
export function isReply(value: Record<string, unknown>): boolean {
  const image = value.value;
  if (
    !exact(value, ["method", "value"]) ||
    !record(image) ||
    !exact(image, ["width", "height", "pngBase64"]) ||
    !integer(image.width) ||
    image.width < 1 ||
    image.width > previewLimits.axis ||
    !integer(image.height) ||
    image.height < 1 ||
    image.height > previewLimits.axis ||
    typeof image.pngBase64 !== "string" ||
    !image.pngBase64.startsWith("iVBORw0KGgo") ||
    image.pngBase64.length > Math.ceil(previewLimits.pngBytes / 3) * 4 ||
    image.pngBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(image.pngBase64)
  )
    return false;
  const padding = image.pngBase64.endsWith("==")
    ? 2
    : image.pngBase64.endsWith("=")
      ? 1
      : 0;
  return (image.pngBase64.length / 4) * 3 - padding <= previewLimits.pngBytes;
}
export function isError(value: Record<string, unknown>): boolean {
  return (
    value.kind === "previewFailed" &&
    exact(value, ["kind", "reason"]) &&
    oneOf(value.reason, previewErrors)
  );
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
