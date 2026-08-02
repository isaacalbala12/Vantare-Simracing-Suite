import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { I18nProvider } from "./i18n/I18nProvider";
import { V52Shell } from "./hub/components/V52Shell";
import type { Section } from "./hub/navigation";
import { StrategyPlannerPage } from "./hub/strategy/StrategyPlannerPage";
import { LicenseProvider } from "./lib/license";
import { ChainRunnerProvider } from "./hub/launcher/chain-store";
import { LauncherStoreProvider } from "./hub/launcher/launcher-store";

export function StrategyPlannerHarness() {
  const [section, setSection] = useState<Section>("strategy");

  return (
    <LicenseProvider>
      <I18nProvider>
        <ChainRunnerProvider>
          <LauncherStoreProvider>
            <V52Shell
              activeSection={section}
              onNavigate={(next) => setSection(next as Section)}
              version="STR-07"
              sourceStatus={{ kind: "mock", name: "Harness local", live: false, available: false }}
            >
              {section === "strategy" ? (
                <StrategyPlannerPage demo />
              ) : (
                <div className="strategy-harness-placeholder">
                  <p>Harness visual de Strategy Planner</p>
                  <button type="button" onClick={() => setSection("strategy")}>Volver a Strategy</button>
                </div>
              )}
            </V52Shell>
          </LauncherStoreProvider>
        </ChainRunnerProvider>
      </I18nProvider>
    </LicenseProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Strategy Planner harness root is missing");

createRoot(root).render(<StrictMode><StrategyPlannerHarness /></StrictMode>);
