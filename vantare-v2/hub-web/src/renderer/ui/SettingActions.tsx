import type { ReactNode } from "react";
import "./setting-actions.css";
export function SettingActions({ children }: { children: ReactNode }) {
  return <div className="v-shortcuts-editor">{children}</div>;
}

export function ShortcutGroups({ children }: { children: ReactNode }) {
  return <div className="v-shortcut-groups">{children}</div>;
}
export function ShortcutRail({ children }: { children: ReactNode }) {
  return <div className="v-shortcut-rail">{children}</div>;
}
