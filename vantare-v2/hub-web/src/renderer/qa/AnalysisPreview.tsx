import { useLayoutEffect } from "react";
import { AccountProvider } from "../app/AccountState";
import { PilotProvider } from "../app/PilotState";
import { SettingsProvider } from "../app/SettingsState";
import { Shell } from "../app/Shell";
import { useUi } from "../app/UiState";
import { ReportsProvider } from "../screens/testing/ReportsState";

/** QA catalogue only: never adds Analysis to the product navigation. */
export function AnalysisPreview() {
  const navigate = useUi((s) => s.navigate);
  useLayoutEffect(() => navigate("analysis"), [navigate]);
  return (
    <div className="v-analysis-qa-frame">
      <SettingsProvider>
        <AccountProvider>
          <PilotProvider>
            <ReportsProvider>
              <Shell />
            </ReportsProvider>
          </PilotProvider>
        </AccountProvider>
      </SettingsProvider>
    </div>
  );
}
