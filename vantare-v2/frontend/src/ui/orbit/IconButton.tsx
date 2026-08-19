import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** `label` → `aria-label` **y** tooltip propio (`data-tip`), nunca `title`. */
  label: string;
  on?: boolean;
  tone?: "neutral" | "danger";
  size?: 28 | 39;
  tipSide?: "right" | "top";
}

export function IconButton({
  icon,
  label,
  on,
  tone = "neutral",
  size = 39,
  tipSide = "top",
  className,
  ...rest
}: IconButtonProps) {
  const classes = [
    "orbit-icon-btn",
    `orbit-icon-btn--${size}`,
    tone === "danger" ? "orbit-icon-btn--danger" : null,
    on ? "is-on" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      className={classes}
      data-tip={label}
      data-tip-side={tipSide}
      type="button"
      {...rest}
    >
      <Icon name={icon} size={size === 28 ? 15 : 19} />
    </button>
  );
}
