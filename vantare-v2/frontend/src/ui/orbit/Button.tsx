import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "reference";
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

/** Check del estado `saved`: el sprite Orbit no lleva icono de confirmación. */
function CheckMark() {
  return (
    <svg
      aria-hidden="true"
      className="orbit-btn__check"
      fill="none"
      focusable="false"
      height={15}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 16 16"
      width={15}
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
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
  const isSave = state === "dirty" || state === "saved";
  const isRun = state === "idle" || state === "running";
  const classes = [
    "orbit-btn",
    `orbit-btn--${variant}`,
    `orbit-btn--${size}`,
    isSave ? "orbit-btn--save" : null,
    isRun ? "orbit-btn--run" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      data-s={state}
      disabled={disabled || loading || state === "saved"}
      type="button"
      {...rest}
    >
      {loading ? <i aria-hidden="true" className="orbit-btn__loading" /> : null}
      {state === "dirty" ? <i aria-hidden="true" className="orbit-btn__dot" /> : null}
      {state === "saved" ? <CheckMark /> : null}
      {isRun ? <i aria-hidden="true" className="orbit-btn__run-dot" /> : null}
      {icon ? <Icon name={icon} size={17} /> : null}
      <span className="orbit-btn__label">{children}</span>
      {iconRight ? <Icon name={iconRight} size={17} /> : null}
    </button>
  );
}
