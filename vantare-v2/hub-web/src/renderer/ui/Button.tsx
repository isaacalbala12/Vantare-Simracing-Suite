import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactNode } from "react";
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
  onDoubleClick,
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
      onDoubleClick={(event) => {
        if (blocked) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onDoubleClick?.(event);
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
  return (
    <Tooltip label={label}>
      <span>
        <Button {...props} className={className} aria-label={label}>
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}
