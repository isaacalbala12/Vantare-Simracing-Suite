// Generated from src/renderer/assets/widgets/illustrations/radar.svg; SHA-256 3aafaed4edfb303ec3716bdf7068ce091828d2b810ff59c1580acbdbefce5923.
import type { IllustrationProps } from "./types";
export function RadarIllustration(props: IllustrationProps) {
  return (
    <svg aria-hidden="true" {...props} viewBox={"0 0 110 110"}>
      <circle
        cx={"55"}
        cy={"55"}
        r={"54.5"}
        style={{ fill: "var(--ill-panel)", stroke: "var(--ill-edge)" }}
      />
      <circle
        cx={"55"}
        cy={"55"}
        r={"36"}
        style={{ fill: "none", stroke: "var(--ill-ink-2)", strokeWidth: "0.8" }}
      />
      <circle
        cx={"55"}
        cy={"55"}
        r={"18"}
        style={{ fill: "none", stroke: "var(--ill-ink-2)", strokeWidth: "0.8" }}
      />
      <path
        d={"M24 32a36 36 0 0 0 0 46"}
        style={{
          fill: "none",
          stroke: "var(--ill-warn)",
          strokeWidth: "4",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity: "0.8",
        }}
      />
      <rect
        x={"50"}
        y={"44"}
        width={"10"}
        height={"22"}
        rx={"3"}
        style={{ fill: "var(--ill-bad)" }}
      />
      <rect
        x={"33"}
        y={"36"}
        width={"10"}
        height={"20"}
        rx={"3"}
        style={{ fill: "var(--ill-warn)" }}
      />
      <rect
        x={"52"}
        y={"80"}
        width={"10"}
        height={"20"}
        rx={"3"}
        style={{ fill: "var(--ill-ink)", opacity: "0.7" }}
      />
      <rect
        x={"70"}
        y={"14"}
        width={"10"}
        height={"20"}
        rx={"3"}
        style={{ fill: "var(--ill-ink)", opacity: "0.5" }}
      />
    </svg>
  );
}
