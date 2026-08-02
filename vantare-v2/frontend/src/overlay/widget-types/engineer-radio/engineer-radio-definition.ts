import type { EngineerPresentation, EngineerRole, EngineerSeverity } from "../../../engineer/engineer-presentation-store";
import { buildEngineerVisualViewModel } from "../../../engineer/engineer-visual-view-model";
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
  locale?: EngineerPresentation["locale"];
  preview?: boolean;
  announce?: boolean;
};

export function buildEngineerRadioViewModel(
  _snapshot: TelemetrySnapshot,
  _content: EngineerRadioContent,
  runtime: WidgetRuntimeInput = {},
): EngineerRadioViewModel {
  const presentation: EngineerPresentation | undefined = runtime.engineerPresentation ?? undefined;
  if (!presentation) return { type: "engineer-radio", status: "missing", visible: false };
  const visual = buildEngineerVisualViewModel(presentation);
  return {
    type: "engineer-radio",
    status: "ready",
    visible: true,
    ...visual,
    announce: runtime.engineerSubtitlesEnabled !== true,
  };
}

function buildEngineerRadioPreviewViewModel(
  snapshot: TelemetrySnapshot,
  content: EngineerRadioContent,
  runtime: WidgetRuntimeInput = {},
): EngineerRadioViewModel {
  if (runtime.engineerPresentation) {
    return {
      ...buildEngineerRadioViewModel(snapshot, content, {
        engineerPresentation: runtime.engineerPresentation,
        engineerSubtitlesEnabled: true,
      }),
      preview: true,
    };
  }
  return {
    type: "engineer-radio", status: "ready", visible: true,
    messageId: "studio-preview", speaker: "Ingeniero", category: "FUEL",
    text: "Ahorra combustible durante las próximas dos vueltas",
    severity: "warning", role: "engineer", locale: "es",
    preview: true, announce: false,
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
  buildPreviewViewModel: buildEngineerRadioPreviewViewModel,
};
