import { exact, oneOf } from "../validation-common";
import { windowMethods } from "../generated/window";
export { windowMethods as methods } from "../generated/window";
export function isRequest(value: Record<string, unknown>): boolean { return exact(value, ["method"]); }
export function isReply(value: Record<string, unknown>): boolean {
  return oneOf(value.method, windowMethods) && exact(value, ["method", "accepted"]) && typeof value.accepted === "boolean";
}
export function isError(_value: Record<string, unknown>): boolean { return false; }
export function isEvent(value: Record<string, unknown>): boolean {
  return value.topic === "windowState" && exact(value, ["topic", "maximized"]) && typeof value.maximized === "boolean";
}
