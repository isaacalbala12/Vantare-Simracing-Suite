import { isRoadmap } from "../roadmap-validation";
import { exact } from "../validation-common";

export { roadmapMethods as methods } from "../generated/roadmap";
export function isRequest(value: Record<string, unknown>): boolean {
  return exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return exact(value, ["method", "value"]) && isRoadmap(value.value);
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
