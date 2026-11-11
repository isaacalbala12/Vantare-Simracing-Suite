import { type CSSProperties, useEffect, useState } from "react";
import helmet from "../../assets/onboarding/helmet.svg?url";
import { onboardingText as t } from "../../i18n/onboarding";
/** The frozen artwork and native eye geometry (210 × 196). */
export function Helmet({
  width,
  reducedMotion,
  happy = false,
  surprised = false,
  gaze,
  placement = "assistant",
  className = "",
}: {
  width: number;
  reducedMotion: boolean;
  happy?: boolean;
  surprised?: boolean;
  gaze?: readonly [number, number];
  placement?: "welcome" | "assistant";
  className?: string;
}) {
  const [pointer, setPointer] = useState<readonly [number, number]>([0, 0]);
  useEffect(() => {
    if (reducedMotion || gaze) return;
    const update = (event: PointerEvent) => {
      const scale = Math.max(
        0.5,
        Math.min(window.innerWidth / 1600, window.innerHeight / 900),
      );
      const [cx, cy] = placement === "welcome" ? [1136, 416] : [148, 216];
      const dx = event.clientX - cx * scale,
        dy = event.clientY - cy * scale;
      const length = Math.max(1, Math.hypot(dx, dy));
      setPointer([(dx / length) * 9, (dy / length) * 6]);
    };
    window.addEventListener("pointermove", update);
    return () => window.removeEventListener("pointermove", update);
  }, [reducedMotion, gaze, placement]);
  const [x, y] = reducedMotion ? [0, 0] : (gaze ?? pointer);
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
      <div className="v-ob-eyes" aria-hidden="true">
        {happy ? (
          <svg
            className="v-ob-happy-eyes"
            viewBox="0 0 66 28"
            aria-hidden="true"
          >
            <path
              d="M0 16 C6 4 14 4 20 16 M44 16 C50 4 58 4 64 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
            />
          </svg>
        ) : (
          <>
            <span className="v-ob-eye" />
            <span className="v-ob-eye v-ob-eye--second" />
          </>
        )}
      </div>
    </div>
  );
}
