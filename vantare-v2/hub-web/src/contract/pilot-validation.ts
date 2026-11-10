import {
  pilotCountries,
  pilotLimits,
  pilotRevisionMax,
} from "./generated/contract";
import { exact, record } from "./validation-common";

function text(
  value: unknown,
  limit: number,
  multiline = false,
): value is string {
  return (
    typeof value === "string" &&
    [...value].length <= limit &&
    ![...value].some(
      (c) =>
        ((c.codePointAt(0) ?? 0) < 32 ||
          ((c.codePointAt(0) ?? 0) >= 127 && (c.codePointAt(0) ?? 0) <= 159)) &&
        !(multiline && c === "\n"),
    )
  );
}
export function isPilotFields(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, [
      "publicName",
      "description",
      "country",
      "simulators",
      "favoriteCar",
      "favoriteTeam",
      "photo",
    ]) &&
    text(value.publicName, pilotLimits.name) &&
    text(value.description, pilotLimits.description, true) &&
    text(value.favoriteCar, pilotLimits.favorite) &&
    text(value.favoriteTeam, pilotLimits.favorite) &&
    (value.country === null ||
      pilotCountries.some((c) => c === value.country)) &&
    Array.isArray(value.simulators) &&
    value.simulators.length <= pilotLimits.simulators &&
    value.simulators.every(
      (s) => text(s, pilotLimits.simulator) && s.trim().length > 0,
    ) &&
    new Set(value.simulators).size === value.simulators.length &&
    (value.photo === null ||
      (typeof value.photo === "string" &&
        value.photo.length > 0 &&
        value.photo.length <= (pilotLimits.photoBytes * 4) / 3 &&
        /^[A-Za-z0-9+/]*={0,2}$/u.test(value.photo)))
  );
}
export function isPilotRevision(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9][0-9]*)$/u.test(value) &&
    value.length <= pilotRevisionMax.length &&
    BigInt(value) <= BigInt(pilotRevisionMax)
  );
}
export function isPilot(value: unknown): boolean {
  return (
    record(value) &&
    exact(value, ["fields", "revision", "pending"]) &&
    isPilotFields(value.fields) &&
    isPilotRevision(value.revision) &&
    typeof value.pending === "boolean"
  );
}
