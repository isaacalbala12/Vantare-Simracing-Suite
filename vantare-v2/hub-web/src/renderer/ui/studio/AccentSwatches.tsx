import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import {
  studioWidgetOptions,
  type WidgetAccent,
} from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";

const labels: Record<WidgetAccent, string> = {
  red: t.accentRed,
  amber: t.accentAmber,
  green: t.accentGreen,
  white: t.accentWhite,
};
export function AccentSwatches({
  value,
  onChange,
  disabled,
  pending,
}: {
  value: WidgetAccent;
  onChange: (value: WidgetAccent) => void;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <RadioGroup
      className="v-accent-swatches"
      aria-label={t.accentLabel}
      value={value}
      disabled={disabled}
      aria-disabled={disabled || pending || undefined}
      aria-busy={pending || undefined}
      onValueChange={(next) => {
        const value = studioWidgetOptions.accents.find((v) => v === next);
        if (!pending && value) onChange(value);
      }}
    >
      {studioWidgetOptions.accents.map((value) => (
        <Radio.Root
          key={value}
          value={value}
          className="v-accent-swatch"
          data-accent={value}
          aria-label={labels[value]}
          aria-disabled={disabled || pending || undefined}
        />
      ))}
    </RadioGroup>
  );
}
