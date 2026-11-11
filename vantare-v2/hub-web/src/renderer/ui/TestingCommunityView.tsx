import type { ReactNode } from "react";
import type { TestingView } from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { testingCommunityText as text } from "../i18n/testing-community";
import {
  TestingCard,
  TestingRailLayout,
  TestingRailSection,
} from "./TestingLayout";
import { TrackedCaps } from "./TrackedCaps";
import "./testing-community.css";

export function TestingCommunityView({
  reports,
  header,
  editor,
}: {
  reports: TestingView["reports"];
  header: ReactNode;
  editor: ReactNode;
}) {
  return (
    <div className="v-testing-community">
      {header}
      {editor}
      <TestingCard>
        <h2>
          <Icon name="pulse" />
          <TrackedCaps>{text.contributions}</TrackedCaps>
        </h2>
        {reports.length ? (
          reports.map((report) => (
            <p
              className="v-testing-community-row"
              key={report.id}
            >{`${report.title} · ${text.states[report.state as keyof typeof text.states] ?? text.states.declined}`}</p>
          ))
        ) : (
          <p className="v-testing-community-empty">{text.empty}</p>
        )}
      </TestingCard>
    </div>
  );
}
export function TestingCommunityRail({ count }: { count: number }) {
  // GPUI uses the loaded contribution count in both captions.
  return (
    <div className="v-testing-community-rail">
      <TestingRailLayout>
        <TestingRailSection title={text.participation} icon="pulse">
          <div className="v-testing-community-counts">
            <p>{`${count} ${text.count}`}</p>
            <p>{`${count} ${text.receipts}`}</p>
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
