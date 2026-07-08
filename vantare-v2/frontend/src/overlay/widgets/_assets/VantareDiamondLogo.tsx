import { type SVGProps } from "react";

/**
 * Vantare diamond logo extracted from docs/overlay-glassmorphism-pro.html.
 * Used in the StandingsWidget header when design is 'vantare-crystal'.
 */
export function VantareDiamondLogo(props: SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 20, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      {...rest}
    >
      <defs>
        <linearGradient id="vdt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff3b3b" />
          <stop offset="100%" stopColor="#e63946" />
        </linearGradient>
      </defs>
      <path d="M12 2L22 12L12 22L2 12Z" fill="url(#vdt-grad)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      <path d="M12 2L22 12L12 12Z" fill="rgba(255,255,255,0.1)" />
    </svg>
  );
}
