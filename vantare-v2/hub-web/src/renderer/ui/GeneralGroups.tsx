import type { ReactNode } from "react";
import "./settings-general.css";

export function GeneralGroups({ children }: { children: ReactNode }) {
  return <div className="v-settings-general">{children}</div>;
}

export function GeneralRailGroups({ children }: { children: ReactNode }) {
  return <div className="v-settings-general-rail">{children}</div>;
}
