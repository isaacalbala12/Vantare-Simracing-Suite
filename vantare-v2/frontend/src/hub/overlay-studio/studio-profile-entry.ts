import type { ProfilePerformanceV4 } from "../../overlay/core/profile-document";

export type StudioProfileEntry = {
  id: string;
  name: string;
  file: string;
  performance?: ProfilePerformanceV4;
};
