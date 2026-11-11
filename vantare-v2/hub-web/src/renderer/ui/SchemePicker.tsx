import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { Palette, Scheme } from "../../contract/generated/contract";
import "./appearance-controls.css";

function MiniScheme({
  palette,
  scheme,
}: {
  palette: Palette;
  scheme: "light" | "dark";
}) {
  return (
    <span className="v-mini-scheme" data-palette={palette} data-scheme={scheme}>
      <i />
      <span>
        <i />
        <b />
        <em />
      </span>
    </span>
  );
}
export function SchemePicker({
  label,
  options,
  value,
  palette,
  disabled,
  pending = false,
  onChange,
}: {
  label: string;
  options: { value: Scheme; label: string }[];
  value: Scheme;
  palette: Palette;
  disabled: boolean;
  pending?: boolean;
  onChange: (value: Scheme) => void;
}) {
  return (
    <RadioGroup
      className="v-schemes"
      aria-label={label}
      aria-busy={pending || undefined}
      aria-disabled={disabled || pending || undefined}
      disabled={disabled}
      value={value}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (!pending && option) onChange(option.value);
      }}
    >
      {options.map((option) => (
        <Radio.Root
          className="v-scheme-card"
          key={option.value}
          value={option.value}
          aria-label={option.label}
        >
          <span className="v-scheme-preview" aria-hidden="true">
            {option.value === "system" ? (
              <>
                <MiniScheme palette={palette} scheme="light" />
                <MiniScheme palette={palette} scheme="dark" />
              </>
            ) : (
              <MiniScheme palette={palette} scheme={option.value} />
            )}
          </span>
          <span>{option.label}</span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
