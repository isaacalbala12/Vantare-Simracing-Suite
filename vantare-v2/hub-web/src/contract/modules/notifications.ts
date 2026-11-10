import { exact } from "../validation-common";

export { notificationsMethods as methods } from "../generated/notifications";
export function isRequest(value: Record<string, unknown>): boolean {
  return exact(value, ["method"]);
}
export function isReply(value: Record<string, unknown>): boolean {
  return (
    exact(value, ["method", "accepted"]) && typeof value.accepted === "boolean"
  );
}
export function isError(_value: Record<string, unknown>): boolean {
  return false;
}
export function isEvent(_value: Record<string, unknown>): boolean {
  return false;
}
