import type { ReactNode } from "react";
export function ShellLayout({
  header,
  sidebar,
  rail,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  rail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v-shell">
      {header}
      <div className="v-shell-body">
        {sidebar}
        <main className="v-shell-main">{children}</main>
        {rail}
      </div>
    </div>
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
