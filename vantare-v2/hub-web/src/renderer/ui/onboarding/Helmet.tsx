import type { CSSProperties } from "react";
import helmet from "../../assets/onboarding/helmet.svg?url";
import { onboardingText as t } from "../../i18n/onboarding";

/** The frozen helmet artwork plus its native eye geometry (210 × 196). */
export function Helmet({
  width,
  reducedMotion,
  happy = false,
  surprised = false,
  gaze = [0, 0],
  className = "",
}: {
  width: number;
  reducedMotion: boolean;
  happy?: boolean;
  surprised?: boolean;
  gaze?: readonly [number, number];
  className?: string;
}) {
  const [x, y] = reducedMotion ? [0, 0] : gaze;
  return (
    <div
      className={`v-ob-helmet ${className}`}
      data-motion={reducedMotion ? "reduced" : "full"}
      data-happy={happy}
      data-surprised={surprised}
      style={
        {
          "--helmet-width": width,
          "--helmet-x": `${(x / 210) * 100}%`,
          "--helmet-y": `${(y / 196) * 100}%`,
        } as CSSProperties
      }
    >
      <img src={helmet} alt={t.helmet} />
      {happy ? (
        <svg className="v-ob-happy-eyes" viewBox="0 0 66 28" aria-hidden="true">
          <path
            d="M0 16 C6 4 14 4 20 16 M44 16 C50 4 58 4 64 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
          />
        </svg>
      ) : (
        <div className="v-ob-eyes" aria-hidden="true">
          <span className="v-ob-eye" />
          <span className="v-ob-eye v-ob-eye--second" />
        </div>
      )}
    </div>
  );
}
