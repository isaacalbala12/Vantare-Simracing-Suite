import type { ReactNode } from "react";
import type { TestingView } from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { testingCommunityText as text } from "../i18n/testing-community";
import { TestingCard } from "./TestingLayout";
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
