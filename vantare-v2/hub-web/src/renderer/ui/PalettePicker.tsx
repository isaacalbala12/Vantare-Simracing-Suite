import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import "./appearance-controls.css";
import type { Palette } from "../../contract/generated/contract";
export function PalettePicker({
  label,
  pending = false,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  pending?: boolean;
  options: { value: Palette; label: string }[];
  value: Palette;
  scheme: "dark" | "light";
  onChange: (value: Palette) => void;
  disabled: boolean;
}) {
  return (
    <RadioGroup
      aria-label={label}
      aria-busy={pending || undefined}
      aria-disabled={disabled || pending || undefined}
      className="v-palettes"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((option) => option.value === next);
        if (!pending && option) onChange(option.value);
      }}
    >
      {options.map((option) => (
        <Radio.Root
          className="v-palette-card"
          key={option.value}
          value={option.value}
          aria-label={option.label}
        >
          <span>{option.label}</span>
          <span className="v-palette-orbs" aria-hidden="true">
            <span
              className="v-palette-orb"
              data-palette={option.value}
              data-scheme="light"
            />
            <span
              className="v-palette-orb"
              data-palette={option.value}
              data-scheme="dark"
            />
          </span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
