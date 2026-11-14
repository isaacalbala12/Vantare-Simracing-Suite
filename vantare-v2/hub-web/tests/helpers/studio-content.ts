import corpus from "../../src/contract/generated/corpus/studio.json";
import type {
  OverlayInstance,
  WidgetSettings,
} from "../../src/contract/generated/studio";
import { studioWidgetDefaults } from "../../src/contract/generated/studio";
export function contentInstance(
  kind: WidgetSettings["kind"] = "standings",
): OverlayInstance {
  for (const entry of corpus.host) {
    if (
      "result" in entry &&
      entry.result &&
      "value" in entry.result &&
      entry.result.value.instances.length
    ) {
      return {
        ...(structuredClone(
          entry.result.value.instances[0],
        ) as OverlayInstance),
        kind,
        settings: structuredClone(studioWidgetDefaults[kind]) as WidgetSettings,
      };
    }
  }
  throw new Error("Native Studio corpus needs a populated instance");
}
