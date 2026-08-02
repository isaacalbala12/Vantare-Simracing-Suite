import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import type { EngineerPresentation } from "../../../engineer/engineer-presentation-store";
import { engineerRadioDefinition } from "./engineer-radio-definition";

const activePresentation: EngineerPresentation = {
  version: 1,
  id: "engineer-fuel-1",
  category: "fuel",
  severity: "warning",
  textKey: "fuel.low",
  text: "Combustible bajo",
  voiceText: "Combustible bajo",
  locale: "es",
  role: "engineer",
  channel: "engineer",
  priority: 60,
  createdAt: 1_000,
  expiresAt: 4_000,
  source: "telemetry-core",
};

describe("engineer radio widget definition", () => {
  it("is a distinct Engineer-gated functional widget with Crystal as default", () => {
    const widget = engineerRadioDefinition.createDefault("radio-1");
    expect(widget.type).toBe("engineer-radio");
    expect(widget.visual.systemId).toBe("vantare-crystal");
    expect(engineerRadioDefinition.capabilities.requiredFeature).toBe("engineer.ai");
  });

  it("builds one pure view model from the canonical presentation", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    const model = engineerRadioDefinition.buildRuntimeViewModel!(snapshot, engineerRadioDefinition.parseContent({}), {
      engineerPresentation: activePresentation,
    });
    expect(model).toMatchObject({
      type: "engineer-radio",
      status: "ready",
      visible: true,
      speaker: "Ingeniero",
      text: "Combustible bajo",
      severity: "warning",
      role: "engineer",
    });
  });

  it("renders no message when product policy has no active presentation", () => {
    const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
    expect(engineerRadioDefinition.buildRuntimeViewModel!(snapshot, engineerRadioDefinition.parseContent({}), {})).toMatchObject({
      visible: false,
      status: "missing",
    });
  });
});
