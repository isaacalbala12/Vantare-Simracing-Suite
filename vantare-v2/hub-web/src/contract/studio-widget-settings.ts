import type { WidgetSettings } from "./generated/studio";
import { studioWidgetOptions as o } from "./generated/studio";
import { integer, oneOf, record } from "./validation-common";

type Check = (value: unknown) => boolean;
const bool: Check = (v) => typeof v === "boolean";
const text: Check = (v) => typeof v === "string";
const number: Check = (v) => typeof v === "number" && Number.isFinite(v);
const nullable =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);
const list =
  (check: Check, max?: number, unique = false): Check =>
  (v) =>
    Array.isArray(v) &&
    (max === undefined || v.length <= max) &&
    v.every(check) &&
    (!unique || new Set(v).size === v.length);
const choices =
  (values: readonly string[]): Check =>
  (v) =>
    oneOf(v, values);
const range =
  (min: number, max: number): Check =>
  (v) =>
    integer(v) && v >= min && v <= max;
function object(
  v: unknown,
  required: Record<string, Check>,
  optional: Record<string, Check> = {},
): boolean {
  return (
    record(v) &&
    Object.keys(v).every(
      (k) => Object.hasOwn(required, k) || Object.hasOwn(optional, k),
    ) &&
    Object.entries(required).every(
      ([k, check]) => Object.hasOwn(v, k) && check(v[k]),
    ) &&
    Object.entries(optional).every(
      ([k, check]) => !Object.hasOwn(v, k) || check(v[k]),
    )
  );
}
const columnRead: Check = (v) =>
  object(v, {
    id: text,
    metricId: text,
    enabled: bool,
    widthPreset: text,
    format: (f) =>
      object(f, {
        mode: text,
        maxChars: nullable(
          (v) => typeof v === "number" && Number.isInteger(v) && v >= 0,
        ),
        display: nullable(text),
        decimals: nullable(integer),
      }),
    style: (s) => object(s, { align: nullable(text) }),
  });
const base = { kind: text, designSystem: text, style: text, accent: text };
export function isWidgetSettings(
  value: unknown,
  kind: unknown,
): value is WidgetSettings | null {
  if (!record(value))
    return (
      value === null &&
      !["standings", "relative", "delta", "pedals", "fuel-strategy"].includes(
        String(kind),
      )
    );
  if (value.kind !== kind) return false;
  const common = { ...base, contentVersion: integer };
  const brand = { brandVisible: bool };
  switch (kind) {
    case "standings":
      return object(
        value,
        {
          ...common,
          rowCount: integer,
          columns: nullable(list(columnRead)),
          classScope: text,
          classificationMode: text,
          playerWindow: bool,
          windowAround: integer,
          showSessionHeader: bool,
          templateId: text,
          headerFirst: text,
          headerSecond: text,
          showSessionFooter: bool,
          footerFirst: text,
          footerSecond: text,
          showBrand: bool,
        },
        {
          ...brand,
          practiceColumns: list(columnRead),
          qualifyingColumns: list(columnRead),
          footerSlots: list(text),
        },
      );
    case "relative":
      return object(
        value,
        {
          ...common,
          columns: nullable(list(columnRead)),
          rangeAhead: integer,
          rangeBehind: integer,
          classScope: text,
          includePlayer: bool,
          rowHeightMode: text,
          footerSlots: list(text),
        },
        brand,
      );
    case "delta":
      return object(
        value,
        {
          ...common,
          size: text,
          reference: text,
          showBar: bool,
          showSectors: bool,
          templateId: text,
        },
        { ...brand, transparentBackground: bool },
      );
    case "pedals":
      return object(
        value,
        {
          ...base,
          transparentBackground: bool,
          showBrakePeak: bool,
          gap: number,
        },
        brand,
      );
    case "fuel-strategy":
      return object(
        value,
        {
          ...common,
          size: text,
          historyRows: integer,
          showProjection: bool,
          source: text,
          units: text,
        },
        brand,
      );
    default:
      return false;
  }
}
const columnPatch: Check = (v) =>
  object(
    v,
    { metric: choices(o.columns.metrics) },
    {
      enabled: bool,
      widthPreset: choices(o.columns.widths),
      format: (f) =>
        object(
          f,
          {},
          {
            mode: choices(o.columns.names),
            maxChars: nullable(range(0, o.columns.maxChars)),
          },
        ),
      style: (s) =>
        object(s, {}, { align: nullable(choices(o.columns.aligns)) }),
    },
  );
function columns(value: unknown, kind: "standings" | "relative"): boolean {
  if (value === null) return true;
  if (
    !list(
      columnPatch,
      kind === "standings" ? o.standings.columnsMax : undefined,
    )(value) ||
    !Array.isArray(value)
  )
    return false;
  const ids = value.map((v: Record<string, unknown>) => v.metric);
  return (
    new Set(ids).size === ids.length &&
    ids.every((id) => oneOf(id, o.columns.legacy) || oneOf(id, o[kind].columns))
  );
}
export function isWidgetSettingsPatch(value: unknown): boolean {
  if (!record(value)) return false;
  const common = {
    designSystem: choices(o.looks),
    style: choices(o.tones),
    accent: choices(o.accents),
  };
  const footer = list(choices(o.footerKeys), o.footerMax, true);
  switch (value.kind) {
    case "standings":
      return object(
        value,
        { kind: choices(["standings"]) },
        {
          ...common,
          rowCount: range(o.standings.rowsMin, o.standings.rowsMax),
          columns: (v) => columns(v, "standings"),
          practiceColumns: (v) => columns(v, "standings"),
          qualifyingColumns: (v) => columns(v, "standings"),
          classScope: choices(o.standings.scopes),
          classificationMode: choices(o.standings.classifications),
          playerWindow: bool,
          windowAround: (v) =>
            integer(v) &&
            (o.standings.windowAround as readonly number[]).includes(v),
          showSessionHeader: bool,
          templateId: choices(o.standings.templates),
          showSessionFooter: bool,
          footerFirst: choices(o.standings.footerMetrics),
          footerSecond: choices(o.standings.footerMetrics),
          footerSlots: nullable(footer),
        },
      );
    case "relative":
      return object(
        value,
        { kind: choices(["relative"]) },
        {
          ...common,
          columns: (v) => columns(v, "relative"),
          rangeAhead: range(o.relative.rangeMin, o.relative.rangeMax),
          rangeBehind: range(o.relative.rangeMin, o.relative.rangeMax),
          classScope: choices(o.relative.scopes),
          footerSlots: footer,
        },
      );
    case "delta":
      return object(
        value,
        { kind: choices(["delta"]) },
        {
          ...common,
          size: choices(o.delta.sizes),
          reference: choices(o.delta.references),
          templateId: choices(o.delta.templates),
          transparentBackground: bool,
          showBar: bool,
          showSectors: bool,
        },
      );
    case "pedals":
      return object(
        value,
        { kind: choices(["pedals"]) },
        {
          ...common,
          gap: (v) =>
            number(v) &&
            Number(v) >= o.pedals.gapMin &&
            Number(v) <= o.pedals.gapMax,
          transparentBackground: bool,
          showBrakePeak: bool,
        },
      );
    case "fuel-strategy":
      return object(
        value,
        { kind: choices(["fuel-strategy"]) },
        {
          ...common,
          size: choices(o.tableSizes),
          historyRows: range(o.fuel.historyMin, o.fuel.historyMax),
          showProjection: bool,
        },
      );
    default:
      return false;
  }
}
