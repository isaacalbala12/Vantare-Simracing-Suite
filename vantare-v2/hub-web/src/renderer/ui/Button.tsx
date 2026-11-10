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
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={(state) =>
        `v-button v-button--${variant} v-button--${size} ${typeof className === "function" ? className(state) : (className ?? "")}`
      }
      disabled={disabled || busy}
      aria-busy={busy || undefined}
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
