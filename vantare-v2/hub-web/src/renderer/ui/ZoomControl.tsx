import {
  defaultZoom,
  zoomLevels as domainZoomLevels,
} from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { Button, IconButton } from "./Button";

export const zoomLevels: readonly number[] = domainZoomLevels;
export function ZoomControl({
  value,
  disabled,
  pending = false,
  onChange,
  label,
  less,
  more,
  reset,
}: {
  value: number;
  disabled: boolean;
  pending?: boolean;
  onChange: (value: number) => void;
  label: string;
  less: string;
  more: string;
  reset: string;
}) {
  const index = zoomLevels.indexOf(value);
  return (
    <fieldset
      className="v-zoom"
      aria-busy={pending || undefined}
      aria-disabled={pending || disabled || undefined}
    >
      <legend className="v-sr-only">{label}</legend>
      <IconButton
        label={less}
        disabled={disabled || index <= 0}
        onClick={() => {
          if (!pending) onChange(zoomLevels[index - 1]);
        }}
      >
        <Icon name="min" />
      </IconButton>
      <Button
        variant="ghost"
        aria-label={reset}
        disabled={disabled}
        onClick={() => {
          if (!pending) onChange(defaultZoom);
        }}
      >
        {new Intl.NumberFormat("es-ES", {
          style: "percent",
          maximumFractionDigits: 0,
        }).format(value / 100)}
      </Button>
      <IconButton
        label={more}
        disabled={disabled || index >= zoomLevels.length - 1}
        onClick={() => {
          if (!pending) onChange(zoomLevels[index + 1]);
        }}
      >
        <Icon name="plus" />
      </IconButton>
    </fieldset>
  );
}
