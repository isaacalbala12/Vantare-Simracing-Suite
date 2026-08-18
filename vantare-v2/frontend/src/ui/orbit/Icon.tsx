import spriteUrl from "../../assets/orbit-icons.svg?no-inline";

export type IconName =
  | "i-vantare"
  | "i-vantare-a"
  | "i-vantare-b"
  | "i-vantare-c"
  | "i-inicio"
  | "i-studio"
  | "i-launcher"
  | "i-carreras"
  | "i-estrategia"
  | "i-ingeniero"
  | "i-telemetria"
  | "i-roadmap"
  | "i-ajustes"
  | "i-cuenta"
  | "i-comando"
  | "i-panel"
  | "i-flask"
  | "i-lock"
  | "i-chevron";

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.5,
  className,
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      width={size}
    >
      <use href={`${spriteUrl}#${name}`} />
    </svg>
  );
}
