import type { ReactNode } from "react";
import "./appearance-controls.css";
export function AppearanceGroups({ children }: { children: ReactNode }) {
  return <div className="v-appearance-groups">{children}</div>;
}
