// VANTA-141: constants exist only in the dedicated measurement build.
declare const __VANTARE_MEASUREMENT_HOME__: boolean;
declare const __VANTARE_MEASUREMENT_PROVENANCE__: string;
export const measurementHome =
  typeof __VANTARE_MEASUREMENT_HOME__ === "boolean" &&
  __VANTARE_MEASUREMENT_HOME__;
export const measurementProvenance =
  typeof __VANTARE_MEASUREMENT_PROVENANCE__ === "string"
    ? __VANTARE_MEASUREMENT_PROVENANCE__
    : "";
export function homeNow(): Date {
  return measurementHome ? new Date("2026-09-30T17:00:00Z") : new Date();
}
