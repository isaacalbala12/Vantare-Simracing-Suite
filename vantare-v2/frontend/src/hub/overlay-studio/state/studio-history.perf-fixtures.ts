import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";

export function buildStudioHistoryBenchDocument(
  widgets: number,
  createWidget: (index: number) => WidgetInstanceV3,
): ProfileDocumentV3 {
  const entries = Array.from({ length: widgets }, (_, index) => createWidget(index));
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Bench Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: entries,
      },
    },
  };
}
