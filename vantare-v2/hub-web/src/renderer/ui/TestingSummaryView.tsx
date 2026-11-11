import type { ReactNode } from "react";
import { testingSummaryText as text } from "../i18n/testing-summary";
import { Button } from "./Button";
import {
  TestingCard,
  TestingRailLayout,
  TestingRailSection,
} from "./TestingLayout";
import "./testing-summary.css";

export function TestingSummaryView({
  onNewReport,
  children,
}: {
  onNewReport: () => void;
  children: ReactNode;
}) {
  return (
    <div className="v-testing-summary">
      <section className="v-testing-summary-hero">
        <p className="v-testing-summary-eyebrow">{text.eyebrow}</p>
        <h2>{text.title}</h2>
        <p className="v-testing-summary-help">{text.help}</p>
        <Button variant="primary" onClick={onNewReport}>
          {text.newReport}
        </Button>
      </section>
      <div className="v-testing-summary-pending">
        <TestingCard title={text.pending}>
          <p>{text.pendingHelp}</p>
        </TestingCard>
        <TestingCard title={text.thanks}>
          <p>{text.thanksHelp}</p>
        </TestingCard>
      </div>
      {children}
    </div>
  );
}

export function TestingSummaryRail({
  count,
  receipts,
}: {
  count: number;
  receipts: number;
}) {
  return (
    <div className="v-testing-summary-rail">
      <TestingRailLayout>
        <TestingRailSection title={text.participation} icon="pulse">
          <div className="v-testing-summary-counts">
            <p>{`${count} ${text.contributions}`}</p>
            <p>{`${receipts} ${text.receipts}`}</p>
          </div>
        </TestingRailSection>
        <TestingRailSection title={text.badges}>
          <p>{text.badgesHelp}</p>
        </TestingRailSection>
        <TestingRailSection title={text.week} icon="clock">
          <p>{text.weekHelp}</p>
        </TestingRailSection>
      </TestingRailLayout>
    </div>
  );
}
