import { defineOfficialWidgetDesign } from "../../official-design-declaration";
import { deltaDefinition } from "../../../widget-types/delta/delta-definition";
import { deltaRegistration } from "../manifest";

export const deltaCrystalSimpleDesign = defineOfficialWidgetDesign({
  design: {
    id: "delta-crystal-simple",
    name: "Crystal Simple",
    widgetType: "delta",
    systemId: "vantare-crystal",
    systemVersion: 1,
    configVersion: 2,
    visual: { templateId: "delta-simple", showHeader: true },
    includesContent: false,
    origin: "vantare",
  },
  registration: deltaRegistration,
  defaultSize: deltaDefinition.capabilities.defaultSize,
  scenarios: ["ready", "stale", "disconnected", "error"],
});
