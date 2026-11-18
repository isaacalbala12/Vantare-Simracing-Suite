import { studioKinds } from "../generated/studio";
import {
  workshopCaptionCountLimit,
  workshopCaptionLimit,
  workshopFrameLimit,
  workshopSceneIdPattern,
} from "../generated/workshop";
import { exact, integer, record } from "../validation-common";

export { workshopMethods as methods } from "../generated/workshop";

const sceneIdPattern = new RegExp(workshopSceneIdPattern);
export function isSceneId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !/[\r\n]/.test(value) &&
    sceneIdPattern.test(value)
  );
}
function text(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    !/[\0\r\n]/.test(value) &&
    [...value].length <= limit
  );
}
function captions(value: unknown, frames: number): boolean {
  return (
    Array.isArray(value) &&
    value.length <= workshopCaptionCountLimit &&
    (value.length === 0 || value.length === frames) &&
    value.every(
      (caption) =>
        text(caption, workshopCaptionLimit) &&
        caption.trim() !== "" &&
        !caption.includes("\t"),
    )
  );
}
function isScene(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "id",
      "label",
      "frames",
      "frameMs",
      "watchFor",
      "captions",
    ]) &&
    isSceneId(value.id) &&
    text(value.label, 120) &&
    integer(value.frames) &&
    value.frames > 0 &&
    value.frames <= workshopFrameLimit &&
    (value.frameMs === null ||
      (integer(value.frameMs) &&
        value.frameMs >= 0 &&
        value.frameMs <= 0xffffffff)) &&
    (value.watchFor === null || text(value.watchFor, 400)) &&
    captions(value.captions, value.frames)
  );
}
export function isRequest(value: Record<string, unknown>): boolean {
  return exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  const widgets = value.widgets;
  return (
    exact(value, ["method", "widgets"]) &&
    Array.isArray(widgets) &&
    widgets.length === studioKinds.length &&
    widgets.every(
      (widget, index) =>
        record(widget) &&
        exact(widget, ["kind", "scenes"]) &&
        widget.kind === studioKinds[index] &&
        Array.isArray(widget.scenes) &&
        widget.scenes.length <= 256 &&
        widget.scenes.every(isScene),
    )
  );
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
