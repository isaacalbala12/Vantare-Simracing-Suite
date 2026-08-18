import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  /** `dirty|saved` pintan el botón Guardar; `running|idle` el de overlay. */
  state?: "idle" | "running" | "dirty" | "saved";
}

export function Button({
  variant = "ghost",
  size = "md",
  icon,
  iconRight,
  loading,
  state,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    "orbit-btn",
    `orbit-btn--${variant}`,
    `orbit-btn--${size}`,
    state === "dirty" || state === "saved" ? "orbit-btn--save" : null,
    state === "idle" || state === "running" ? "orbit-btn--run" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      data-s={state}
      disabled={disabled || loading}
      type="button"
      {...rest}
    >
      {loading ? <i className="orbit-btn__loading" aria-hidden="true" /> : null}
      {state === "dirty" ? <i className="orbit-btn__dot" aria-hidden="true" /> : null}
      {state === "idle" || state === "running" ? (
        <i className="orbit-btn__run-dot" aria-hidden="true" />
      ) : null}
      {icon ? <Icon name={icon} size={14} /> : null}
      <span className="orbit-btn__label">{children}</span>
      {iconRight ? <Icon name={iconRight} size={14} /> : null}
    </button>
  );
}
