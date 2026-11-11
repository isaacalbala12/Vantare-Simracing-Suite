import type { ReactNode } from "react";
import "./setting-actions.css";
export function SettingActions({ children }: { children: ReactNode }) {
  return <div className="v-shortcuts-editor">{children}</div>;
}
