import { exact, oneOf, record } from "./validation-common";
export function isCore(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, ["photos", "rights", "services", "access", "live"]) ||
    typeof value.live !== "boolean"
  )
    return false;
  if (
    !["photos", "rights", "services"].every((key) =>
      oneOf(value[key], ["connected", "unavailable", "incompatible"]),
    )
  )
    return false;
  return (
    record(value.access) &&
    exact(value.access, [
      "verified",
      "blocked",
      "tester",
      "calendar",
      "engineer",
      "strategy",
    ]) &&
    Object.values(value.access).every((item) => typeof item === "boolean")
  );
}
