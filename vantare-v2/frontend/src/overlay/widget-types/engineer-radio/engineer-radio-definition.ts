import type { EngineerLocale, EngineerPresentation, EngineerRole, EngineerSeverity } from "../../../engineer/engineer-presentation-store";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import type { WidgetRuntimeInput, WidgetTypeDefinition, WidgetViewModelBase } from "../../core/widget-definition";
import { getWidgetRequiredFeature } from "../../core/widget-definition";
import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";

export type EngineerRadioContent = Record<string, never>;

export type EngineerRadioViewModel = WidgetViewModelBase & {
  visible: boolean;
  messageId?: string;
  speaker?: string;
  category?: string;
  text?: string;
  severity?: EngineerSeverity;
  role?: EngineerRole;
};

function speakerFor(role: EngineerRole, locale: EngineerLocale): string {
  if (role === "spotter") return "Spotter";
  return { es: "Ingeniero", en: "Engineer", it: "Ingegnere", "pt-BR": "Engenheiro" }[locale];
}

export function buildEngineerRadioViewModel(
  _snapshot: TelemetrySnapshot,
  _content: EngineerRadioContent,
  runtime: WidgetRuntimeInput = {},
): EngineerRadioViewModel {
  const presentation: EngineerPresentation | undefined = runtime.engineerPresentation ?? undefined;
  if (!presentation) return { type: "engineer-radio", status: "missing", visible: false };
  return {
    type: "engineer-radio",
    status: "ready",
    visible: true,
    messageId: presentation.id,
    speaker: speakerFor(presentation.role, presentation.locale),
    category: presentation.category === presentation.role
      ? undefined
      : presentation.category.toLocaleUpperCase(presentation.locale),
    text: presentation.text,
    severity: presentation.severity,
    role: presentation.role,
  };
}

export const engineerRadioDefinition: WidgetTypeDefinition<EngineerRadioContent, EngineerRadioViewModel> = {
  type: "engineer-radio",
  labelKey: "studio.v3.widgetTypes.engineerRadio",
  capabilities: {
    inspectorSections: ["design", "appearance", "content", "behavior", "layout", "actions"],
    supportsAspectUnlock: true,
    minimumSize: { width: 260, height: 76 },
    defaultSize: { width: 440, height: 112 },
    requiredFeature: getWidgetRequiredFeature("engineer-radio"),
  },
  inspector: { content: [] },
  createDefault(id: string): WidgetInstanceV3 {
    return {
      id,
      type: "engineer-radio",
      layout: { x: 64, y: 64, w: 440, h: 112, zIndex: 0, aspectLocked: false },
      behavior: { enabled: true, updateHz: 15 },
      content: {},
      visual: {
        systemId: "vantare-crystal",
        systemVersion: 1,
        configVersion: 1,
        baseSettings: {},
        appearanceOverrides: {},
      },
    };
  },
  parseContent(input: unknown): EngineerRadioContent {
    if (input == null) return {};
    if (typeof input !== "object" || Array.isArray(input)) {
      throw new Error("engineer-radio content must be an object");
    }
    if (Object.keys(input as Record<string, unknown>).length > 0) {
      throw new Error("engineer-radio content does not accept private output policy");
    }
    return {};
  },
  buildViewModel(snapshot, content) {
    return buildEngineerRadioViewModel(snapshot, content);
  },
  buildRuntimeViewModel: buildEngineerRadioViewModel,
};
