import type { ReactNode } from "react";
import { Icon, type IconName } from "../assets/icons/Icon";
import { RailBlock } from "./Frame";
import { TrackedCaps } from "./TrackedCaps";
import "./testing-layout.css";

export function TestingLayout({
  title,
  description,
  tools,
  toolbar,
  children,
}: {
  title: string;
  description: string;
  tools: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v-testing">
      <div className="v-testing-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {tools}
      </div>
      {toolbar}
      {children}
    </div>
  );
}
export function TestingToolbar({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="v-testing-toolbar">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function TestingCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="v-testing-card">
      {title && (
        <h2>
          <Icon name="v-testing" />
          <TrackedCaps>{title}</TrackedCaps>
        </h2>
      )}
      {children}
    </section>
  );
}
export function TestingNotes({ children }: { children: ReactNode }) {
  return <div className="v-testing-notes">{children}</div>;
}
export function TestingFinePrint({ children }: { children: ReactNode }) {
  return <p className="v-testing-fine-print">{children}</p>;
}
export function TestingRailSection({
  title,
  icon = "v-testing",
  children,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <RailBlock title={title} icon={icon}>
      {children}
    </RailBlock>
  );
}
