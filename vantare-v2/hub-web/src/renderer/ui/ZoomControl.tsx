import {
  defaultZoom,
  zoomLevels as domainZoomLevels,
} from "../../contract/generated/contract";
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
        className="v-zoom-step"
        disabled={disabled || index <= 0}
        onClick={() => {
          if (!pending) onChange(zoomLevels[index - 1]);
        }}
      >
        {"−"}
      </IconButton>
      <Button
        variant="ghost"
        className="v-zoom-reset"
        aria-label={reset}
        disabled={disabled}
        onClick={() => {
          if (!pending) onChange(defaultZoom);
        }}
      >
        {`${value}%`}
      </Button>
      <IconButton
        label={more}
        className="v-zoom-step"
        disabled={disabled || index >= zoomLevels.length - 1}
        onClick={() => {
          if (!pending) onChange(zoomLevels[index + 1]);
        }}
      >
        {"+"}
      </IconButton>
    </fieldset>
  );
}
