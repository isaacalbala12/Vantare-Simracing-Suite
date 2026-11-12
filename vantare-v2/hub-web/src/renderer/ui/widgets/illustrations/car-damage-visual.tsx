// Generated from src/renderer/assets/widgets/illustrations/car-damage-visual.svg; SHA-256 9b726962bc97296e03f4680cf5c58b1d6fc9fa80b8d3c1eca14d16a6bd1c0c12.
import type { IllustrationProps } from "./types";
export function CarDamageVisualIllustration(props: IllustrationProps) {
  return (
    <svg aria-hidden="true" {...props} viewBox={"0 0 100 136"}>
      <rect
        x={"0.5"}
        y={"0.5"}
        width={"99"}
        height={"135"}
        rx={"8"}
        style={{
          fill: "var(--ill-panel)",
          stroke: "var(--ill-edge)",
          strokeWidth: "1",
        }}
      />
      <path
        d={
          "M36 14h28c8 0 12 6 12 14v80c0 8-4 14-12 14H36c-8 0-12-6-12-14V28c0-8 4-14 12-14z"
        }
        style={{
          fill: "var(--ill-row)",
          stroke: "var(--ill-ink-2)",
          strokeWidth: "1.6",
        }}
      />
      <path
        d={"M36 14h28c8 0 12 6 12 14v8H24v-8c0-8 4-14 12-14z"}
        style={{ fill: "var(--ill-bad)", opacity: ".85" }}
      />
      <path
        d={"M24 98h52v10c0 8-4 14-12 14H36c-8 0-12-6-12-14z"}
        style={{ fill: "var(--ill-warn)", opacity: ".8" }}
      />
      <rect
        x={"33"}
        y={"48"}
        width={"34"}
        height={"22"}
        rx={"3"}
        style={{ fill: "var(--ill-ink-2)", opacity: "0.5" }}
      />
      <rect
        x={"16"}
        y={"26"}
        width={"7"}
        height={"18"}
        rx={"2"}
        style={{ fill: "var(--ill-ink)" }}
      />
      <rect
        x={"77"}
        y={"26"}
        width={"7"}
        height={"18"}
        rx={"2"}
        style={{ fill: "var(--ill-ink)" }}
      />
      <rect
        x={"16"}
        y={"94"}
        width={"7"}
        height={"18"}
        rx={"2"}
        style={{ fill: "var(--ill-ink)" }}
      />
      <rect
        x={"77"}
        y={"94"}
        width={"7"}
        height={"18"}
        rx={"2"}
        style={{ fill: "var(--ill-warn)" }}
      />
    </svg>
  );
}
