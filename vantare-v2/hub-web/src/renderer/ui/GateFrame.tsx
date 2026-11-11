import type { ReactNode } from "react";
import "./gate.css";
export function GateFrame({
  controls,
  children,
}: {
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v-gate">
      <div className="v-gate-titlebar">{controls}</div>
      <main className="v-gate-content">{children}</main>
    </div>
  );
}
