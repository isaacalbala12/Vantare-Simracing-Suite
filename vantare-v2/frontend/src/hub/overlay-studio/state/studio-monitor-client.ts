import * as WailsRuntime from "@wailsio/runtime";
import {
  isValidLayoutViewportDimension,
  type LayoutViewport,
} from "../../../overlay/core/layout-viewport";

export type StudioMonitor = {
  index: number;
  id: string;
  name: string;
  isPrimary: boolean;
  scaleFactor: number;
  bounds: LayoutViewport;
  workArea: LayoutViewport;
};

type ScreensRuntime = {
  GetAll?: () => Promise<unknown>;
};

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }
  return value;
}

function readDisplayName(value: unknown, fallback: string, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
  return value.length === 0 ? fallback : value;
}

function readScaleFactor(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a finite positive number`);
  }
  return value;
}

function readViewport(value: unknown, path: string): LayoutViewport {
  const record = readRecord(value, path);
  const width = record.Width;
  const height = record.Height;
  if (!isValidLayoutViewportDimension(width) || !isValidLayoutViewportDimension(height)) {
    throw new Error(`${path} must contain valid logical DIP Width and Height`);
  }
  return { width, height };
}

function mapScreen(value: unknown, index: number): StudioMonitor {
  const screen = readRecord(value, `Screens[${index}]`);
  const id = readString(screen.ID, `Screens[${index}].ID`);
  return {
    index,
    id,
    name: readDisplayName(screen.Name, id, `Screens[${index}].Name`),
    isPrimary: readBoolean(screen.IsPrimary, `Screens[${index}].IsPrimary`),
    scaleFactor: readScaleFactor(screen.ScaleFactor, `Screens[${index}].ScaleFactor`),
    bounds: readViewport(screen.Bounds, `Screens[${index}].Bounds`),
    workArea: readViewport(screen.WorkArea, `Screens[${index}].WorkArea`),
  };
}

export async function listStudioMonitors(): Promise<StudioMonitor[]> {
  const screensRuntime = (WailsRuntime as { Screens?: ScreensRuntime }).Screens;
  if (typeof screensRuntime?.GetAll !== "function") {
    throw new Error("Wails Screens.GetAll is unavailable");
  }

  const screens = await screensRuntime.GetAll();
  if (!Array.isArray(screens)) {
    throw new Error("Wails Screens.GetAll must return an array");
  }
  return screens.map(mapScreen);
}
