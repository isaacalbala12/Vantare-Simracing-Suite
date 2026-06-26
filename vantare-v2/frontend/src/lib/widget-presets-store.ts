import { Events } from "@wailsio/runtime";
import type { WidgetPreset } from "./widget-presets";
import { generatePresetId } from "./widget-presets";

const PRESET_LIST_EVENT = "preset:list";
const PRESET_LIST_RESPONSE = "preset:list:response";
const PRESET_SAVE_EVENT = "preset:save";
const PRESET_DELETE_EVENT = "preset:delete";
const PRESET_RENAME_EVENT = "preset:rename";

const LIST_PRESETS_TIMEOUT_MS = 10000;

export function listPresets(widgetType?: string): Promise<WidgetPreset[]> {
  return new Promise((resolve, reject) => {
    const requestId = generatePresetId();

    const timeout = window.setTimeout(() => {
      unsub();
      reject(new Error("Timeout waiting for preset list response"));
    }, LIST_PRESETS_TIMEOUT_MS);

    const unsub = Events.On(PRESET_LIST_RESPONSE, (event: unknown) => {
      const data = (event as { data?: { requestId?: string; presets?: WidgetPreset[] } })?.data;
      if (data?.requestId !== requestId) {
        return;
      }
      window.clearTimeout(timeout);
      unsub();
      resolve(data.presets ?? []);
    });

    Events.Emit(PRESET_LIST_EVENT, { widgetType: widgetType ?? null, requestId });
  });
}

export function savePreset(
  preset: Omit<WidgetPreset, "id" | "createdAt" | "updatedAt"> & Partial<Pick<WidgetPreset, "id">>,
): WidgetPreset {
  const now = new Date().toISOString();
  const full: WidgetPreset = {
    id: preset.id ?? generatePresetId(),
    name: preset.name,
    widgetType: preset.widgetType,
    appearance: preset.appearance,
    variant: preset.variant,
    props: preset.props,
    createdAt: now,
    updatedAt: now,
  };
  Events.Emit(PRESET_SAVE_EVENT, { preset: full });
  return full;
}

export function deletePreset(id: string): void {
  Events.Emit(PRESET_DELETE_EVENT, { id });
}

export function renamePreset(id: string, name: string): void {
  Events.Emit(PRESET_RENAME_EVENT, { id, name });
}

export function onPresetSaveError(
  callback: (payload: { id: string; message: string }) => void,
): () => void {
  return Events.On("preset:save:error", (event: unknown) => {
    const data = (event as { data?: { id?: string; message?: string } })?.data;
    if (data) {
      callback({ id: data.id ?? "", message: data.message ?? "" });
    }
  });
}

export function onPresetDeleteError(
  callback: (payload: { id: string; message: string }) => void,
): () => void {
  return Events.On("preset:delete:error", (event: unknown) => {
    const data = (event as { data?: { id?: string; message?: string } })?.data;
    if (data) {
      callback({ id: data.id ?? "", message: data.message ?? "" });
    }
  });
}

export function onPresetRenameError(
  callback: (payload: { id: string; message: string }) => void,
): () => void {
  return Events.On("preset:rename:error", (event: unknown) => {
    const data = (event as { data?: { id?: string; message?: string } })?.data;
    if (data) {
      callback({ id: data.id ?? "", message: data.message ?? "" });
    }
  });
}
