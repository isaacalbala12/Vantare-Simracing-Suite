import { Button as BaseButton } from "@base-ui/react/button";
import { type ReactNode, useId } from "react";
import { Tooltip } from "./Layers";
export type ButtonProps = BaseButton.Props & {
  variant?: "primary" | "neutral" | "ghost" | "danger";
  size?: "sm" | "md";
  busy?: boolean;
};
export function Button({
  variant = "neutral",
  size = "md",
  busy = false,
  disabled,
  focusableWhenDisabled,
  onClick,
  onKeyDown,
  onKeyUp,
  children,
  className,
  ...props
}: ButtonProps) {
  const blocked = !!(
    disabled ||
    busy ||
    (focusableWhenDisabled &&
      (props["aria-disabled"] === true || props["aria-disabled"] === "true"))
  );
  return (
    <BaseButton
      {...props}
      className={(state) =>
        `v-button v-button--${variant} v-button--${size} ${typeof className === "function" ? className({ ...state, disabled: blocked }) : (className ?? "")}`
      }
      disabled={blocked && !focusableWhenDisabled}
      aria-disabled={
        blocked && focusableWhenDisabled ? true : props["aria-disabled"]
      }
      data-disabled={blocked && focusableWhenDisabled ? "" : undefined}
      focusableWhenDisabled={focusableWhenDisabled}
      onClick={(event) => {
        if (blocked) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (blocked && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onKeyDown?.(event);
      }}
      onKeyUp={(event) => {
        if (blocked && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onKeyUp?.(event);
      }}
      aria-busy={busy || props["aria-busy"]}
    >
      <span className="v-button-label">{children}</span>
      {busy && (
        <span className="v-spinner v-button-spinner" aria-hidden="true" />
      )}
    </BaseButton>
  );
}
export function IconButton({
  label,
  children,
  className,
  ...props
}: Omit<ButtonProps, "aria-label"> & { label: string; children: ReactNode }) {
  const tooltipId = useId();
  return (
    <Tooltip id={tooltipId} label={label}>
      <span>
        <Button
          {...props}
          className={className}
          aria-label={label}
          aria-describedby={[props["aria-describedby"], tooltipId]
            .filter(Boolean)
            .join(" ")}
          focusableWhenDisabled
        >
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}
