import type { ComponentType } from "react";
import type { WidgetInstanceV3 } from "./profile-document";

export type InspectorControl =
  | {
      kind: "color";
      id: string;
      labelKey: string;
      path: string;
      defaultValue: string;
    }
  | {
      kind: "range";
      id: string;
      labelKey: string;
      path: string;
      min: number;
      max: number;
      step: number;
      defaultValue: number;
    }
  | {
      kind: "toggle";
      id: string;
      labelKey: string;
      path: string;
      defaultValue: boolean;
    }
  | {
      kind: "select";
      id: string;
      labelKey: string;
      path: string;
      options: readonly { value: string; labelKey: string }[];
      defaultValue: string;
    };

export type CustomInspectorProps = {
  widget: WidgetInstanceV3;
  disabled?: boolean;
  onContentChange?: (content: Record<string, unknown>) => void;
};

export type InspectorCapability = {
  appearance: readonly InspectorControl[];
  content: readonly InspectorControl[];
  CustomContentInspector?: ComponentType<CustomInspectorProps>;
  CustomAppearanceInspector?: ComponentType<CustomInspectorProps>;
};

export class InspectorControlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectorControlValidationError";
  }
}

const FORBIDDEN_PATH_SEGMENTS = new Set(["layout", "behavior", "id", "type"]);
const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSafePath(path: string): void {
  if (path.trim() === "") {
    throw new InspectorControlValidationError("control path must not be empty");
  }
  for (const segment of path.split(".")) {
    if (UNSAFE_PATH_SEGMENTS.has(segment)) {
      throw new InspectorControlValidationError(`unsafe control path segment: ${segment}`);
    }
  }
}

function assertAllowedDescriptorPath(path: string): void {
  assertSafePath(path);
  for (const segment of path.split(".")) {
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      throw new InspectorControlValidationError(`forbidden control path segment: ${segment}`);
    }
  }
}

function assertDefaultMatchesControl(control: InspectorControl): void {
  const controlId = control.id;
  switch (control.kind) {
    case "color":
      if (typeof control.defaultValue !== "string" || control.defaultValue.trim() === "") {
        throw new InspectorControlValidationError(`invalid default for control ${controlId}`);
      }
      return;
    case "toggle":
      if (typeof control.defaultValue !== "boolean") {
        throw new InspectorControlValidationError(`invalid default for control ${controlId}`);
      }
      return;
    case "range":
      if (
        typeof control.defaultValue !== "number" ||
        !Number.isFinite(control.defaultValue) ||
        control.defaultValue < control.min ||
        control.defaultValue > control.max
      ) {
        throw new InspectorControlValidationError(`invalid default for control ${controlId}`);
      }
      return;
    case "select": {
      const allowed = new Set(control.options.map((option) => option.value));
      if (!allowed.has(control.defaultValue)) {
        throw new InspectorControlValidationError(`invalid default for control ${controlId}`);
      }
      return;
    }
    default: {
      const unsupported: never = control;
      throw new InspectorControlValidationError(`unsupported control kind: ${unsupported}`);
    }
  }
}

export function validateInspectorControls(controls: readonly InspectorControl[]): void {
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  for (const control of controls) {
    if (seenIds.has(control.id)) {
      throw new InspectorControlValidationError(`duplicate id: ${control.id}`);
    }
    seenIds.add(control.id);

    if (seenPaths.has(control.path)) {
      throw new InspectorControlValidationError(`duplicate path: ${control.path}`);
    }
    seenPaths.add(control.path);

    assertAllowedDescriptorPath(control.path);
    assertDefaultMatchesControl(control);
  }
}

export function readControlValue(root: Record<string, unknown>, path: string): unknown {
  assertSafePath(path);
  const segments = path.split(".");
  let current: unknown = root;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function writeControlValue(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  assertSafePath(path);
  const segments = path.split(".");
  const result = { ...root };
  let current = result;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const existing = current[segment];
    const cloned = isRecord(existing) ? { ...existing } : {};
    current[segment] = cloned;
    current = cloned;
  }
  current[segments[segments.length - 1]!] = value;
  return result;
}

export const EMPTY_INSPECTOR_CAPABILITY: InspectorCapability = {
  appearance: [],
  content: [],
};