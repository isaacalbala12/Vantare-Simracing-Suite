import {
  defaultZoom,
  zoomLevels as domainZoomLevels,
} from "../../contract/generated/contract";
import { zoomStep } from "../../window-zoom";
import { Button, IconButton } from "./Button";
import { useWindowZoomLimit } from "./window-zoom";

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
  const limit = useWindowZoomLimit();
  const lessValue = zoomStep(value, -1, limit);
  const moreValue = zoomStep(value, 1, limit);
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
        disabled={disabled || lessValue === value}
        onClick={() => {
          if (!pending) onChange(lessValue);
        }}
      >
        {"−"}
      </IconButton>
      <Button
        variant="ghost"
        className="v-zoom-reset"
        aria-label={reset}
        disabled={disabled || defaultZoom > limit}
        onClick={() => {
          if (!pending) onChange(defaultZoom);
        }}
      >
        {`${Number(Math.min(value, limit).toFixed(1))}%`}
      </Button>
      <IconButton
        label={more}
        className="v-zoom-step"
        disabled={disabled || moreValue === value}
        onClick={() => {
          if (!pending) onChange(moreValue);
        }}
      >
        {"+"}
      </IconButton>
    </fieldset>
  );
}
