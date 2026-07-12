export const PROFILE_SCHEMA_VERSION_V3 = 3 as const;

export const STUDIO_CANVAS_WIDTH = 1920;
export const STUDIO_CANVAS_HEIGHT = 1080;
export const STUDIO_MINIMUM_VISIBLE = 32;

export type WidgetType =
  | "delta"
  | "standings"
  | "relative"
  | "pedals"
  | "broadcast-tower"
  | "fuel-strategy"
  | "pedals-telemetry"
  | "pedals-telemetry-compact"
  | "racing-flags"
  | "delta-trace"
  | "race-schedule"
  | "head-to-head"
  | "delta-advanced"
  | "input-telemetry"
  | "multiclass-relative"
  | "track-weather"
  | "car-damage-visual"
  | "car-damage-numbers";
export type DesignSystemId = "vantare-original" | "vantare-crystal";
export type SessionLayoutType = "general" | "practice" | "qualifying" | "race" | "endurance";
export type DisplayMode = "racing" | "edit" | "streaming";

export const ALL_WIDGET_TYPES = [
  "delta",
  "standings",
  "relative",
  "pedals",
  "broadcast-tower",
  "fuel-strategy",
  "pedals-telemetry",
  "pedals-telemetry-compact",
  "racing-flags",
  "delta-trace",
  "race-schedule",
  "head-to-head",
  "delta-advanced",
  "input-telemetry",
  "multiclass-relative",
  "track-weather",
  "car-damage-visual",
  "car-damage-numbers",
] as const satisfies readonly WidgetType[];
export const WIDGET_TYPES = new Set<WidgetType>(ALL_WIDGET_TYPES);
const DESIGN_SYSTEM_IDS = new Set<DesignSystemId>(["vantare-original", "vantare-crystal"]);
const SESSION_LAYOUT_TYPES = new Set<SessionLayoutType>([
  "general",
  "practice",
  "qualifying",
  "race",
  "endurance",
]);
const DISPLAY_MODES = new Set<DisplayMode>(["racing", "edit", "streaming"]);

const MAX_PROFILE_ID_LENGTH = 128;
const MAX_PROFILE_NAME_LENGTH = 160;
const MAX_WIDGET_ID_LENGTH = 128;
const MAX_WIDGETS_PER_LAYOUT = 128;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MIN_UPDATE_HZ = 1;
const MAX_UPDATE_HZ = 240;

export type WidgetLayoutV3 = {
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  aspectLocked: boolean;
};

export type WidgetVisibilityV3 = {
  inPit?: boolean;
  sessionTypes?: Array<"practice" | "qualifying" | "race" | "warmup" | "endurance">;
};

export type WidgetBehaviorV3 = {
  enabled: boolean;
  updateHz: number;
  visibleWhen?: WidgetVisibilityV3;
};

export type WidgetDesignProvenanceV3 = {
  designId: string;
  designName: string;
  origin: "vantare" | "user";
  appliedAt: string;
};

export type WidgetVisualSelectionV3 = {
  systemVersion: number;
  configVersion: number;
  baseSettings: Record<string, unknown>;
  appearanceOverrides: Record<string, unknown>;
  provenance?: WidgetDesignProvenanceV3;
};

export type WidgetVisualV3 = WidgetVisualSelectionV3 & {
  systemId: DesignSystemId;
  systemMemories?: Partial<Record<DesignSystemId, WidgetVisualSelectionV3>>;
};

export type WidgetInstanceV3 = {
  id: string;
  type: WidgetType;
  name?: string;
  layout: WidgetLayoutV3;
  behavior: WidgetBehaviorV3;
  content: Record<string, unknown>;
  visual: WidgetVisualV3;
};

export type PreservedWidgetV3 = {
  id: string;
  type: string;
  source: Record<string, unknown>;
};

export type SessionLayoutV3 = {
  type: SessionLayoutType;
  widgets: WidgetInstanceV3[];
  preservedWidgets?: PreservedWidgetV3[];
};

export type ProfileSourceMeta = {
  kind?: string;
  profileId?: string;
  name?: string;
};

export type ProfileDocumentV3 = {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION_V3;
  id: string;
  name: string;
  displayMode: DisplayMode;
  monitorIndex: number;
  layouts: Partial<Record<SessionLayoutType, SessionLayoutV3>> & { general: SessionLayoutV3 };
  defaultVisualSystemId?: DesignSystemId;
  source?: ProfileSourceMeta;
};

export type LoadedProfileDocumentV3 = {
  document: ProfileDocumentV3;
  revision: string;
  migratedFrom?: 0 | 2 | 3;
};

export class ProfileDocumentValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ProfileDocumentValidationError";
    this.path = path;
  }
}

function validationError(path: string, message: string): never {
  throw new ProfileDocumentValidationError(path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function payloadSize(payload: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function validatePayloadSize(path: string, payload: Record<string, unknown>): void {
  if (payloadSize(payload) > MAX_PAYLOAD_BYTES) {
    validationError(path, "exceeds maximum payload size");
  }
}

function validateLayout(path: string, layout: WidgetLayoutV3): void {
  if (layout.w < 1) {
    validationError(`${path}.w`, "must be at least 1");
  }
  if (layout.h < 1) {
    validationError(`${path}.h`, "must be at least 1");
  }
  const recoverable =
    layout.x <= STUDIO_CANVAS_WIDTH - STUDIO_MINIMUM_VISIBLE &&
    layout.x + layout.w >= STUDIO_MINIMUM_VISIBLE &&
    layout.y <= STUDIO_CANVAS_HEIGHT - STUDIO_MINIMUM_VISIBLE &&
    layout.y + layout.h >= STUDIO_MINIMUM_VISIBLE;
  if (!recoverable) {
    validationError(path, "must keep at least 32x32 recoverable pixels on canvas");
  }
}

function validateBehavior(path: string, behavior: WidgetBehaviorV3): void {
  if (behavior.updateHz < MIN_UPDATE_HZ || behavior.updateHz > MAX_UPDATE_HZ) {
    validationError(`${path}.updateHz`, "must be between 1 and 240");
  }
}

function validateVisual(path: string, visual: WidgetVisualV3): void {
  if (!DESIGN_SYSTEM_IDS.has(visual.systemId)) {
    validationError(`${path}.systemId`, "unsupported design system");
  }
  validateVisualSelection(path, visual);
  for (const [systemId, memory] of Object.entries(visual.systemMemories ?? {})) {
    if (!DESIGN_SYSTEM_IDS.has(systemId as DesignSystemId)) {
      validationError(`${path}.systemMemories.${systemId}`, "unsupported design system");
    }
    validateVisualSelection(`${path}.systemMemories.${systemId}`, memory);
  }
}

function validateVisualSelection(path: string, visual: WidgetVisualSelectionV3): void {
  if (visual.systemVersion < 1) {
    validationError(`${path}.systemVersion`, "must be at least 1");
  }
  if (visual.configVersion < 1) {
    validationError(`${path}.configVersion`, "must be at least 1");
  }
  validatePayloadSize(`${path}.baseSettings`, visual.baseSettings);
  validatePayloadSize(`${path}.appearanceOverrides`, visual.appearanceOverrides);
  validatePayloadSize(path, {
    baseSettings: visual.baseSettings,
    appearanceOverrides: visual.appearanceOverrides,
  });
  if (visual.provenance && visual.provenance.origin !== "vantare" && visual.provenance.origin !== "user") {
    validationError(`${path}.provenance.origin`, "unsupported origin");
  }
}

function parseWidgetLayout(input: unknown, path: string): WidgetLayoutV3 {
  const raw = readRecord(input, path);
  return {
    x: readNumber(raw.x, `${path}.x`),
    y: readNumber(raw.y, `${path}.y`),
    w: readNumber(raw.w, `${path}.w`),
    h: readNumber(raw.h, `${path}.h`),
    zIndex: readNumber(raw.zIndex, `${path}.zIndex`),
    aspectLocked: readBoolean(raw.aspectLocked, `${path}.aspectLocked`),
  };
}

function parseWidgetVisibility(input: unknown, path: string): WidgetVisibilityV3 | undefined {
  if (input === undefined) {
    return undefined;
  }
  const raw = readRecord(input, path);
  const visible: WidgetVisibilityV3 = {};
  if (raw.inPit !== undefined) {
    visible.inPit = readBoolean(raw.inPit, `${path}.inPit`);
  }
  if (raw.sessionTypes !== undefined) {
    if (!Array.isArray(raw.sessionTypes)) {
      validationError(`${path}.sessionTypes`, "must be an array");
    }
    visible.sessionTypes = raw.sessionTypes.map((item, index) => {
      const value = readString(item, `${path}.sessionTypes[${index}]`);
      if (
        value !== "practice" &&
        value !== "qualifying" &&
        value !== "race" &&
        value !== "warmup" &&
        value !== "endurance"
      ) {
        validationError(`${path}.sessionTypes[${index}]`, "unsupported session type");
      }
      return value;
    });
  }
  return visible;
}

function parseWidgetBehavior(input: unknown, path: string): WidgetBehaviorV3 {
  const raw = readRecord(input, path);
  const behavior: WidgetBehaviorV3 = {
    enabled: readBoolean(raw.enabled, `${path}.enabled`),
    updateHz: readNumber(raw.updateHz, `${path}.updateHz`),
  };
  const visibleWhen = parseWidgetVisibility(raw.visibleWhen, `${path}.visibleWhen`);
  if (visibleWhen !== undefined) {
    behavior.visibleWhen = visibleWhen;
  }
  return behavior;
}

function parseWidgetVisualSelection(input: unknown, path: string): WidgetVisualSelectionV3 {
  const raw = readRecord(input, path);
  for (const field of ["content", "behavior", "layout"]) {
    if (raw[field] !== undefined) {
      validationError(`${path}.${field}`, "functional fields are not allowed in visual memory");
    }
  }
  const visual: WidgetVisualSelectionV3 = {
    systemVersion: readNumber(raw.systemVersion, `${path}.systemVersion`),
    configVersion: readNumber(raw.configVersion, `${path}.configVersion`),
    baseSettings: readRecord(raw.baseSettings, `${path}.baseSettings`),
    appearanceOverrides: readRecord(raw.appearanceOverrides, `${path}.appearanceOverrides`),
  };
  if (raw.provenance !== undefined) {
    const provenanceRaw = readRecord(raw.provenance, `${path}.provenance`);
    visual.provenance = {
      designId: readString(provenanceRaw.designId, `${path}.provenance.designId`),
      designName: readString(provenanceRaw.designName, `${path}.provenance.designName`),
      origin: readString(provenanceRaw.origin, `${path}.provenance.origin`) as "vantare" | "user",
      appliedAt: readString(provenanceRaw.appliedAt, `${path}.provenance.appliedAt`),
    };
    if (visual.provenance.origin !== "vantare" && visual.provenance.origin !== "user") {
      validationError(`${path}.provenance.origin`, "unsupported origin");
    }
  }
  return visual;
}

function parseWidgetVisual(input: unknown, path: string): WidgetVisualV3 {
  const raw = readRecord(input, path);
  const systemId = readString(raw.systemId, `${path}.systemId`) as DesignSystemId;
  const visual: WidgetVisualV3 = {
    systemId,
    ...parseWidgetVisualSelection(raw, path),
  };
  if (raw.systemMemories !== undefined) {
    const memoriesRaw = readRecord(raw.systemMemories, `${path}.systemMemories`);
    const memories: Partial<Record<DesignSystemId, WidgetVisualSelectionV3>> = {};
    for (const [memorySystemId, memory] of Object.entries(memoriesRaw)) {
      if (!DESIGN_SYSTEM_IDS.has(memorySystemId as DesignSystemId)) {
        validationError(`${path}.systemMemories.${memorySystemId}`, "unsupported design system");
      }
      memories[memorySystemId as DesignSystemId] = parseWidgetVisualSelection(
        memory,
        `${path}.systemMemories.${memorySystemId}`,
      );
    }
    visual.systemMemories = memories;
  }
  return visual;
}

function parseWidgetInstance(input: unknown, path: string): WidgetInstanceV3 {
  const raw = readRecord(input, path);
  const type = readString(raw.type, `${path}.type`) as WidgetType;
  if (!WIDGET_TYPES.has(type)) {
    validationError(`${path}.type`, "unsupported widget type");
  }
  const widget: WidgetInstanceV3 = {
    id: readString(raw.id, `${path}.id`),
    type,
    layout: parseWidgetLayout(raw.layout, `${path}.layout`),
    behavior: parseWidgetBehavior(raw.behavior, `${path}.behavior`),
    content: readRecord(raw.content, `${path}.content`),
    visual: parseWidgetVisual(raw.visual, `${path}.visual`),
  };
  if (raw.name !== undefined) {
    widget.name = readString(raw.name, `${path}.name`);
  }
  if (widget.id.length > MAX_WIDGET_ID_LENGTH) {
    validationError(`${path}.id`, "exceeds maximum length");
  }
  if (widget.name !== undefined && widget.name.length > MAX_PROFILE_NAME_LENGTH) {
    validationError(`${path}.name`, "exceeds maximum length");
  }
  validateLayout(`${path}.layout`, widget.layout);
  validateBehavior(`${path}.behavior`, widget.behavior);
  validatePayloadSize(`${path}.content`, widget.content);
  validateVisual(`${path}.visual`, widget.visual);
  return widget;
}

function parsePreservedWidget(input: unknown, path: string): PreservedWidgetV3 {
  const raw = readRecord(input, path);
  const preserved: PreservedWidgetV3 = {
    id: readString(raw.id, `${path}.id`),
    type: readString(raw.type, `${path}.type`),
    source: readRecord(raw.source, `${path}.source`),
  };
  if (preserved.id === "") {
    validationError(`${path}.id`, "must not be empty");
  }
  if (preserved.id.length > MAX_WIDGET_ID_LENGTH) {
    validationError(`${path}.id`, "exceeds maximum length");
  }
  if (preserved.type === "") {
    validationError(`${path}.type`, "must not be empty");
  }
  validatePayloadSize(`${path}.source`, preserved.source);
  return preserved;
}

function parseSessionLayout(input: unknown, path: string, expectedType: SessionLayoutType): SessionLayoutV3 {
  const raw = readRecord(input, path);
  const type = readString(raw.type, `${path}.type`) as SessionLayoutType;
  if (type !== expectedType) {
    validationError(`${path}.type`, "layout key and type mismatch");
  }
  if (!Array.isArray(raw.widgets)) {
    validationError(`${path}.widgets`, "must be an array");
  }
  const widgets = raw.widgets.map((widget, index) => parseWidgetInstance(widget, `${path}.widgets[${index}]`));
  let preservedWidgets: PreservedWidgetV3[] | undefined;
  if (raw.preservedWidgets !== undefined) {
    if (!Array.isArray(raw.preservedWidgets)) {
      validationError(`${path}.preservedWidgets`, "must be an array");
    }
    preservedWidgets = raw.preservedWidgets.map((widget, index) =>
      parsePreservedWidget(widget, `${path}.preservedWidgets[${index}]`),
    );
  }
  const seen = new Set<string>();
  for (const widget of widgets) {
    if (seen.has(widget.id)) {
      validationError(`${path}.widgets`, "duplicate widget id");
    }
    seen.add(widget.id);
  }
  for (const preserved of preservedWidgets ?? []) {
    if (seen.has(preserved.id)) {
      validationError(`${path}.preservedWidgets`, "duplicate widget id");
    }
    seen.add(preserved.id);
  }
  const total = widgets.length + (preservedWidgets?.length ?? 0);
  if (total > MAX_WIDGETS_PER_LAYOUT) {
    validationError(`${path}.widgets`, "exceeds maximum widget count");
  }
  const layout: SessionLayoutV3 = {
    type,
    widgets,
  };
  if (preservedWidgets !== undefined) {
    layout.preservedWidgets = preservedWidgets;
  }
  return layout;
}

export function parseProfileDocumentV3(input: unknown): ProfileDocumentV3 {
  const raw = readRecord(input, "document");
  const schemaVersion = readNumber(raw.schemaVersion, "schemaVersion");
  if (schemaVersion !== PROFILE_SCHEMA_VERSION_V3) {
    validationError("schemaVersion", "must be 3");
  }
  const id = readString(raw.id, "id");
  if (id === "") {
    validationError("id", "must not be empty");
  }
  if (id.length > MAX_PROFILE_ID_LENGTH) {
    validationError("id", "exceeds maximum length");
  }
  const name = readString(raw.name, "name");
  if (name === "") {
    validationError("name", "must not be empty");
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH) {
    validationError("name", "exceeds maximum length");
  }
  const displayMode = readString(raw.displayMode, "displayMode") as DisplayMode;
  if (!DISPLAY_MODES.has(displayMode)) {
    validationError("displayMode", "unsupported display mode");
  }
  const monitorIndex = readNumber(raw.monitorIndex, "monitorIndex");
  let defaultVisualSystemId: DesignSystemId | undefined;
  if (raw.defaultVisualSystemId !== undefined) {
    defaultVisualSystemId = readString(raw.defaultVisualSystemId, "defaultVisualSystemId") as DesignSystemId;
    if (!DESIGN_SYSTEM_IDS.has(defaultVisualSystemId)) {
      validationError("defaultVisualSystemId", "unsupported design system");
    }
  }
  const layoutsRaw = readRecord(raw.layouts, "layouts");
  if (layoutsRaw.general === undefined) {
    validationError("layouts.general", "missing required general layout");
  }
  const layouts = {} as ProfileDocumentV3["layouts"];
  for (const [key, value] of Object.entries(layoutsRaw)) {
    if (!SESSION_LAYOUT_TYPES.has(key as SessionLayoutType)) {
      validationError(`layouts.${key}`, "unsupported layout type");
    }
    layouts[key as SessionLayoutType] = parseSessionLayout(value, `layouts.${key}`, key as SessionLayoutType);
  }
  if (layouts.general === undefined) {
    validationError("layouts.general", "missing required general layout");
  }
  const document: ProfileDocumentV3 = {
    schemaVersion: PROFILE_SCHEMA_VERSION_V3,
    id,
    name,
    displayMode,
    monitorIndex,
    layouts,
  };
  if (defaultVisualSystemId !== undefined) {
    document.defaultVisualSystemId = defaultVisualSystemId;
  }
  if (raw.source !== undefined) {
    const sourceRaw = readRecord(raw.source, "source");
    document.source = {
      kind: sourceRaw.kind === undefined ? undefined : readString(sourceRaw.kind, "source.kind"),
      profileId:
        sourceRaw.profileId === undefined ? undefined : readString(sourceRaw.profileId, "source.profileId"),
      name: sourceRaw.name === undefined ? undefined : readString(sourceRaw.name, "source.name"),
    };
  }
  return document;
}

export function getDefaultVisualSystemId(document: ProfileDocumentV3): DesignSystemId {
  return document.defaultVisualSystemId ?? "vantare-original";
}

export function cloneProfileDocumentV3(document: ProfileDocumentV3): ProfileDocumentV3 {
  return structuredClone(document);
}
