import type { InspectorControl } from "../../../overlay/core/inspector-control";
import { readControlValue } from "../../../overlay/core/inspector-control";

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

export function InspectorControlField(props: InspectorControlFieldProps): React.ReactElement {
  const { control, values, onChange } = props;
  const currentValue = readControlValue(values, control.path);
  const value = currentValue ?? control.defaultValue;

  return (
    <label className="osv3-inspector-field" data-testid={`studio-inspector-control-${control.id}`}>
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