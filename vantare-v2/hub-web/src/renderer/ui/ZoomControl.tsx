import { Icon } from "../assets/icons/Icon";
import { Button, IconButton } from "./Button";
export const zoomLevels: readonly number[] = [90, 100, 110, 125];
export function ZoomControl({
  value,
  disabled,
  onChange,
  label,
  less,
  more,
  reset,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  label: string;
  less: string;
  more: string;
  reset: string;
}) {
  const index = zoomLevels.indexOf(value);
  return (
    <fieldset className="v-zoom">
      <legend className="v-sr-only">{label}</legend>
      <IconButton
        label={less}
        disabled={disabled || index <= 0}
        onClick={() => onChange(zoomLevels[index - 1])}
      >
        <Icon name="min" />
      </IconButton>
      <Button
        variant="ghost"
        aria-label={reset}
        disabled={disabled}
        onClick={() => onChange(100)}
      >
        {new Intl.NumberFormat("es-ES", {
          style: "percent",
          maximumFractionDigits: 0,
        }).format(value / 100)}
      </Button>
      <IconButton
        label={more}
        disabled={disabled || index >= zoomLevels.length - 1}
        onClick={() => onChange(zoomLevels[index + 1])}
      >
        <Icon name="plus" />
      </IconButton>
    </fieldset>
  );
}
