import { describe, expect, it } from "vitest";
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
    const model = engineerRadioDefinition.buildAuxiliaryViewModel!(engineerRadioDefinition.parseContent({}), {
      engineerPresentation: activePresentation,
    }, "desktop");
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
    expect(engineerRadioDefinition.buildAuxiliaryViewModel!(engineerRadioDefinition.parseContent({}), {}, "desktop")).toMatchObject({
      visible: false,
      status: "missing",
    });
  });

  it("uses an explicitly labelled fixture only for Studio preview", () => {
    const preview = engineerRadioDefinition.buildAuxiliaryViewModel!({}, {}, "studio");
    const runtime = engineerRadioDefinition.buildAuxiliaryViewModel!({}, {}, "desktop");
    expect(preview).toMatchObject({ visible: true, preview: true, messageId: "studio-preview" });
    expect(runtime).toMatchObject({ visible: false, status: "missing" });
  });
});
