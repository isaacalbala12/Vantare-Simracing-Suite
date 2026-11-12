import type { ReactNode } from "react";
import {
  SectionChromeProvider,
  SectionRailVisibility,
} from "../app/SectionChrome";
export function ShellLayout({
  header,
  sidebar,
  rail,
  toasts,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  rail: ReactNode;
  toasts?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SectionChromeProvider>
      <div className="v-shell">
        {sidebar}
        <div className="v-shell-column">
          <div className="v-shell-wash" aria-hidden="true" />
          {header}
          <div className="v-shell-body">
            <div className="v-content-column">
              <main className="v-shell-main">{children}</main>
              <div className="v-shell-toast-anchor">{toasts}</div>
            </div>
            <SectionRailVisibility>{rail}</SectionRailVisibility>
          </div>
        </div>
      </div>
    </SectionChromeProvider>
  );
}
export function ContentStack({ children }: { children: ReactNode }) {
  return <div className="v-content-stack">{children}</div>;
}
export function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="v-actions">{children}</div>;
}
export function InfoList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="v-info-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="v-card-grid">{children}</div>;
}
