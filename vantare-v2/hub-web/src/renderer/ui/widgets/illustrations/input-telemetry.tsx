// Generated from src/renderer/assets/widgets/illustrations/input-telemetry.svg; SHA-256 2591754b4105e2cba017397f703a6e863f177bef675f2fb58fb1ba6612b6b958.
import type { IllustrationProps } from "./types";
export function InputTelemetryIllustration(props: IllustrationProps) {
  return (
    <svg aria-hidden="true" {...props} viewBox={"0 0 250 36"}>
      <rect
        x={"0.5"}
        y={"0.5"}
        width={"249"}
        height={"35"}
        rx={"6"}
        style={{
          fill: "var(--ill-panel)",
          stroke: "var(--ill-edge)",
          strokeWidth: "1",
        }}
      />
      <circle
        cx={"19"}
        cy={"18"}
        r={"11"}
        style={{ fill: "none", stroke: "var(--ill-ink)", strokeWidth: "2.4" }}
      />
      <path
        d={"M8.5 18h21M19 18v11"}
        style={{
          fill: "none",
          stroke: "var(--ill-ink)",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      <rect
        x={"17"}
        y={"6.4"}
        width={"4"}
        height={"3"}
        rx={"1"}
        style={{ fill: "var(--ill-bad)" }}
      />
      <rect
        x={"38"}
        y={"18"}
        width={"204"}
        height={".6"}
        style={{ fill: "var(--ill-row)" }}
      />
      <path
        d={
          "M38 18c18 0 22-10 40-10s20 18 40 18 18-14 34-14 22 10 38 10 24-6 46-6"
        }
        style={{
          fill: "none",
          stroke: "var(--ill-ink)",
          strokeWidth: "1.5",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      <path
        d={"M38 30H70l4-16h26l4 14h40l4-18h30l4 18h28"}
        style={{
          fill: "none",
          stroke: "var(--ill-good)",
          strokeWidth: "1.4",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity: "0.9",
        }}
      />
      <path
        d={"M38 32H66l3-14 5 14h40l3-10 5 10h70"}
        style={{
          fill: "none",
          stroke: "var(--ill-bad)",
          strokeWidth: "1.4",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity: "0.9",
        }}
      />
    </svg>
  );
}
