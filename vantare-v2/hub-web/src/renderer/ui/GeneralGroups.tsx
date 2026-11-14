import type { ReactNode } from "react";
import "./settings-general.css";

export function GeneralGroups({ children }: { children: ReactNode }) {
  return <div className="v-settings-general">{children}</div>;
}

export function GeneralRailGroups({ children }: { children: ReactNode }) {
  return <div className="v-settings-general-rail">{children}</div>;
}

export function GeneralAvailabilityNote({ children }: { children: ReactNode }) {
  return <p className="v-setting-important-help">{children}</p>;
}
