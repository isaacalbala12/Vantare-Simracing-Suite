// Generated from src/renderer/assets/widgets/illustrations/pedals-telemetry.svg; SHA-256 aa48e7af116757df296fb38b9f2441cf2f6656392b0b4d46b9befab2137d9222.
import type { IllustrationProps } from "./types";
export function PedalsTelemetryIllustration(props: IllustrationProps) {
  return (
    <svg aria-hidden="true" {...props} viewBox={"0 0 200 36"}>
      <rect
        x={"0.5"}
        y={"0.5"}
        width={"199"}
        height={"35"}
        rx={"6"}
        style={{
          fill: "var(--ill-panel)",
          stroke: "var(--ill-edge)",
          strokeWidth: "1",
        }}
      />
      <rect
        x={"8"}
        y={"18"}
        width={"184"}
        height={".6"}
        style={{ fill: "var(--ill-row)" }}
      />
      <path
        d={
          "M8 28L30 28 36 8 70 8 76 26 92 28 110 28 114 12 150 10 156 28 192 28"
        }
        style={{
          fill: "none",
          stroke: "var(--ill-good)",
          strokeWidth: "1.8",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      <path
        d={
          "M8 30L28 30 31 12 36 28 74 30 78 14 86 26 92 30 150 30 154 18 158 30 192 30"
        }
        style={{
          fill: "none",
          stroke: "var(--ill-bad)",
          strokeWidth: "1.8",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
    </svg>
  );
}
