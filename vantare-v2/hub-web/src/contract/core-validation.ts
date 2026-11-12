import { exact, oneOf, record } from "./validation-common";
export function isCore(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, ["photos", "rights", "services", "access", "live", "accountGeneration"]) ||
    typeof value.live !== "boolean" ||
    !(value.accountGeneration === null || (typeof value.accountGeneration === "string" && /^[0-9a-f]{64}$/.test(value.accountGeneration)))
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
