import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useId } from "react";
import type { Palette } from "../../contract/generated/contract";
export function PalettePicker({
  label,
  options,
  value,
  scheme,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: Palette; label: string }[];
  value: Palette;
  scheme: "dark" | "light";
  onChange: (value: Palette) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <RadioGroup
      aria-label={label}
      className="v-palettes"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((option) => option.value === next);
        if (option) onChange(option.value);
      }}
    >
      {options.map((option) => (
        <label
          className="v-palette-option"
          key={option.value}
          htmlFor={`${id}-${option.value}`}
          data-palette={option.value}
          data-scheme={scheme}
        >
          <span className="v-palette-preview" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="v-palette-name">
            <Radio.Root
              className="v-radio"
              id={`${id}-${option.value}`}
              value={option.value}
            >
              <Radio.Indicator className="v-radio-indicator" />
            </Radio.Root>
            {option.label}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
