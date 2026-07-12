import type { FeatureId } from "../../lib/access-policy";
import type { WidgetType, DesignSystemId, WidgetInstanceV3 } from "./profile-document";

export type WidgetDesignV1 = {
  id: string;
  name: string;
  widgetType: WidgetType;
  systemId: DesignSystemId;
  systemVersion: number;
  configVersion: number;
  visual: Record<string, unknown>;
  content?: Record<string, unknown>;
  includesContent: boolean;
  origin: "vantare" | "user";
  requiredFeature?: "overlays.basic" | "overlays.advanced";
  createdAt?: string;
  updatedAt?: string;
};

export function resolveDesignRequiredFeature(design: WidgetDesignV1): FeatureId | undefined {
  return design.requiredFeature;
}

export class WidgetDesignValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "WidgetDesignValidationError";
    this.path = path;
  }
}

const WIDGET_TYPES = new Set<WidgetType>(["delta", "standings", "relative", "pedals"]);
const DESIGN_SYSTEM_IDS = new Set<DesignSystemId>(["vantare-original", "vantare-crystal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationError(path: string, message: string): never {
  throw new WidgetDesignValidationError(path, message);
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    validationError(path, "must be a string");
  }
  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    validationError(path, "must be a boolean");
  }
  return value;
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    validationError(path, "must be a number");
  }
  return value;
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    validationError(path, "must be an object");
  }
  return value;
}

export function validateWidgetDesign(input: unknown): WidgetDesignV1 {
  const raw = readRecord(input, "design");
  const id = readString(raw.id, "id");
  const name = readString(raw.name, "name");
  if (name.trim() === "") {
    validationError("name", "must not be empty");
  }
  const widgetType = readString(raw.widgetType, "widgetType") as WidgetType;
  if (!WIDGET_TYPES.has(widgetType)) {
    validationError("widgetType", "unsupported widget type");
  }
  const systemId = readString(raw.systemId, "systemId") as DesignSystemId;
  if (!DESIGN_SYSTEM_IDS.has(systemId)) {
    validationError("systemId", "unsupported design system");
  }
  const systemVersion = readNumber(raw.systemVersion, "systemVersion");
  const configVersion = readNumber(raw.configVersion, "configVersion");
  if (systemVersion < 1) {
    validationError("systemVersion", "must be at least 1");
  }
  if (configVersion < 1) {
    validationError("configVersion", "must be at least 1");
  }
  const visual = readRecord(raw.visual, "visual");
  const includesContent = readBoolean(raw.includesContent, "includesContent");
  const origin = readString(raw.origin, "origin");
  if (origin !== "vantare" && origin !== "user") {
    validationError("origin", "unsupported origin");
  }
  const design: WidgetDesignV1 = {
    id,
    name,
    widgetType,
    systemId,
    systemVersion,
    configVersion,
    visual,
    includesContent,
    origin,
  };
  if (raw.content !== undefined) {
    design.content = readRecord(raw.content, "content");
  }
  if (raw.requiredFeature !== undefined) {
    const requiredFeature = readString(raw.requiredFeature, "requiredFeature");
    if (requiredFeature !== "overlays.basic" && requiredFeature !== "overlays.advanced") {
      validationError("requiredFeature", "unsupported required feature");
    }
    design.requiredFeature = requiredFeature;
  }
  if (raw.createdAt !== undefined) {
    design.createdAt = readString(raw.createdAt, "createdAt");
  }
  if (raw.updatedAt !== undefined) {
    design.updatedAt = readString(raw.updatedAt, "updatedAt");
  }
  return design;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

export function applyWidgetDesign(
  widget: WidgetInstanceV3,
  design: WidgetDesignV1,
  appliedAt: string,
): WidgetInstanceV3 {
  if (widget.type !== design.widgetType) {
    throw new WidgetDesignValidationError("widget.type", "design widget type mismatch");
  }
  const next: WidgetInstanceV3 = {
    ...widget,
    layout: { ...widget.layout },
    behavior: {
      ...widget.behavior,
      visibleWhen: widget.behavior.visibleWhen ? { ...widget.behavior.visibleWhen } : undefined,
    },
    content: widget.content ? cloneRecord(widget.content) : {},
    visual: {
      systemId: design.systemId,
      systemVersion: design.systemVersion,
      configVersion: design.configVersion,
      baseSettings: cloneRecord(design.visual),
      appearanceOverrides: {},
      provenance: {
        designId: design.id,
        designName: design.name,
        origin: design.origin,
        appliedAt,
      },
    },
  };
  if (design.includesContent && design.content) {
    next.content = cloneRecord(design.content);
  }
  return next;
}