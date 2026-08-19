import { useI18n } from "../../../i18n/I18nProvider";
import type { InspectorControl } from "../../../overlay/core/inspector-control";
import { readControlValue } from "../../../overlay/core/inspector-control";
import { Field, Input, Select, Toggle } from "../../../ui/orbit";
import { useIsOrbitSkin } from "./inspector-skin";

export type InspectorControlFieldProps = {
  control: InspectorControl;
  values: Record<string, unknown>;
  onChange(value: unknown): void;
};

function isValidControlValue(control: InspectorControl, value: unknown): boolean {
  switch (control.kind) {
    case "toggle":
      return typeof value === "boolean";
    case "color":
      return typeof value === "string" && value.trim() !== "";
    case "range":
      return (
        typeof value === "number"
        && Number.isFinite(value)
        && value >= control.min
        && value <= control.max
      );
    case "select":
      return control.options.some((option) => option.value === value);
    default:
      return false;
  }
}

/**
 * Etiqueta humana del control. Los descriptores ya traen `labelKey`; si el
 * catalogo no la tiene traducida se humaniza el id (`show-header` →
 * `Show header`) en vez de pintar la clave cruda.
 */
function humanize(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function label(t: (key: string) => string, key: string, fallbackId: string): string {
  const translated = t(key);
  return translated === key || translated.trim() === "" ? humanize(fallbackId) : translated;
}

export function InspectorControlField(props: InspectorControlFieldProps): React.ReactElement {
  const { control, values, onChange } = props;
  const { t } = useI18n();
  const orbit = useIsOrbitSkin();
  const currentValue = readControlValue(values, control.path);
  const value = currentValue ?? control.defaultValue;
  const testId = `studio-inspector-control-${control.id}`;

  if (orbit) {
    const title = label(t, control.labelKey, control.id);
    const fieldId = `orbit-control-${control.id}`;

    if (control.kind === "toggle") {
      return (
        <Field className="orbit-studio-ins__field" label={title} row>
          <Toggle
            label={title}
            onChange={(next) => onChange(next)}
            pressed={Boolean(value)}
          />
        </Field>
      );
    }

    if (control.kind === "select") {
      return (
        <Field className="orbit-studio-ins__field" htmlFor={fieldId} label={title}>
          <Select
            id={fieldId}
            label={title}
            onChange={(next) => {
              if (isValidControlValue(control, next)) onChange(next);
            }}
            options={control.options.map((option) => ({
              value: option.value,
              label: label(t, option.labelKey, option.value),
            }))}
            value={typeof value === "string" ? value : control.defaultValue}
          />
        </Field>
      );
    }

    if (control.kind === "range") {
      return (
        <Field className="orbit-studio-ins__field" htmlFor={fieldId} label={title}>
          <Input
            aria-label={title}
            id={fieldId}
            max={control.max}
            min={control.min}
            numeric
            onChange={(event) => {
              const next = Number.parseFloat(event.target.value);
              if (isValidControlValue(control, next)) onChange(next);
            }}
            step={control.step}
            type="number"
            value={typeof value === "number" ? value : control.defaultValue}
          />
        </Field>
      );
    }

    return (
      <Field className="orbit-studio-ins__field" htmlFor={fieldId} label={title}>
        <input
          aria-label={title}
          className="orbit-input orbit-studio-ins__color"
          id={fieldId}
          onChange={(event) => {
            const next = event.target.value;
            if (isValidControlValue(control, next)) onChange(next);
          }}
          type="color"
          value={typeof value === "string" ? value : control.defaultValue}
        />
      </Field>
    );
  }

  return (
    <label className="osv3-inspector-field" data-testid={testId}>
      <span className="osv3-inspector-field__label">{control.id}</span>
      {control.kind === "toggle" ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : null}
      {control.kind === "range" ? (
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={typeof value === "number" ? value : control.defaultValue}
          onChange={(event) => {
            const next = Number.parseFloat(event.target.value);
            if (isValidControlValue(control, next)) {
              onChange(next);
            }
          }}
        />
      ) : null}
      {control.kind === "color" ? (
        <input
          type="color"
          value={typeof value === "string" ? value : control.defaultValue}
          onChange={(event) => {
            const next = event.target.value;
            if (isValidControlValue(control, next)) {
              onChange(next);
            }
          }}
        />
      ) : null}
      {control.kind === "select" ? (
        <select
          value={typeof value === "string" ? value : control.defaultValue}
          onChange={(event) => {
            const next = event.target.value;
            if (isValidControlValue(control, next)) {
              onChange(next);
            }
          }}
        >
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.labelKey}
            </option>
          ))}
        </select>
      ) : null}
    </label>
  );
}
