import type { ReactNode } from "react";
import "./diagnostics.css";
export function DiagnosticRailLayout({ children }: { children: ReactNode }) {
  return <div className="v-diagnostic-rail">{children}</div>;
}
