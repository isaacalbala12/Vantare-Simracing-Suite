import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { testingText as text } from "./es";
import { useReports } from "./ReportsState";
import { Reports } from "./Testing";
import { TestingRail } from "./TestingRail";
import { useTestingTabs } from "./TestingTabs";

export default function TestingEntry() {
  const { access } = useReports();
  const { tabs, active, change } = useTestingTabs(access);
  return (
    <>
      <SectionChrome
        title={access.tester ? text.sectionTitle : text.title}
        tabs={tabs}
        activeTab={active}
        onTabChange={change}
        rail={<TestingRail />}
      />
      <SectionPanel activeTab={active}>
        {active === "reports" ? <Reports /> : null}
      </SectionPanel>
    </>
  );
}
