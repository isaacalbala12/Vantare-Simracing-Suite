import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  TelemetryOverlayShadowHarness,
} from "./TelemetryOverlayShadowHarness";
import {
  SHADOW_HARNESS_SCENARIOS,
  type ShadowHarnessScenario,
} from "./evidence";

const root = document.getElementById("root");
if (!root) {
  throw new Error("telemetry overlay shadow harness root missing");
}

const requested = new URLSearchParams(window.location.search).get("scenario");
const initialScenario = SHADOW_HARNESS_SCENARIOS.includes(
  requested as ShadowHarnessScenario,
)
  ? requested as ShadowHarnessScenario
  : "equal";

createRoot(root).render(
  <StrictMode>
    <TelemetryOverlayShadowHarness initialScenario={initialScenario} />
  </StrictMode>,
);
