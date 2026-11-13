import {residentOwnershipProfileLimit} from "./generated/launcher_resident";
import {hex, isProfileId} from "./resident-execution-validation";
import {exact, record} from "./validation-common";

export function isResidentOwnership(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "unknown" || value.kind === "unsupported") return exact(value,["kind"]);
  return value.kind === "known" && exact(value,["kind","instance","accountGeneration","revision","profiles"]) &&
    hex(value.instance,64) && hex(value.accountGeneration,64) && hex(value.revision,64) &&
    Array.isArray(value.profiles) && value.profiles.length <= residentOwnershipProfileLimit &&
    value.profiles.every(profile=>record(profile) && exact(profile,["profile","ownedLive"]) && isProfileId(profile.profile) && typeof profile.ownedLive === "boolean") &&
    new Set(value.profiles.map(profile=>profile.profile)).size === value.profiles.length;
}
