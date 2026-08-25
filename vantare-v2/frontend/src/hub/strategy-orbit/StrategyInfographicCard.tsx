import { useEffect, useMemo, useRef } from "react";
import { Button, Surface } from "../../ui/orbit";
import type { StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import { clockTime, type StrategyEvent } from "./strategy-orbit-model";
import type { StrategyInputProvenanceView } from "./strategy-input-provenance";
import {
  downloadDataUrl,
  drawStrategyInfographic,
  INFOGRAPHIC_HEIGHT,
  INFOGRAPHIC_WIDTH,
  infographicFilename,
  infographicPdfDataUrl,
  infographicPngDataUrl,
  type InfographicData,
} from "./strategy-infographic";

type T = (key: string) => string;

export interface StrategyInfographicCardProps {
  event: StrategyEvent;
  inputs: readonly { label: string; unit: string; view: StrategyInputProvenanceView }[];
  plan: StrategyOrbitCalculatedPlanV1;
  planName: string;
  sessionCount?: number;
  start: Date;
  subtitle: string;
  t: T;
  title: string;
}

function windowLabel(start: Date, durationMin: number): string {
  const end = new Date(start.getTime() + durationMin * 60000);
  const time = (value: Date) => `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  return `${time(start)} → ${time(end)}`;
}

export function StrategyInfographicCard({
  event, inputs, plan, planName, sessionCount, start, subtitle, t, title,
}: StrategyInfographicCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const data = useMemo<InfographicData>(() => {
    const tight = !plan.reserveSatisfied;
    const axis = [0, 0.5, 1].map((fraction) => {
      const at = new Date(start.getTime() + fraction * event.durationMin * 60000);
      return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    });
    return {
      eyebrow: t("strategy.infographic.eyebrow"),
      title,
      subtitle,
      window: windowLabel(start, event.durationMin),
      duration: `${event.durationMin} min`,
      planName,
      figures: [
        { label: t("strategy.analysis.totalLaps"), value: String(plan.totalLaps), sub: t("strategy.analysis.engineDerived") },
        { label: t("strategy.analysis.maxStint"), value: String(plan.maxLaps), sub: t("strategy.analysis.engineDerived") },
        { label: t("strategy.analysis.stops"), value: String(plan.stops), sub: t("strategy.analysis.engineDerived") },
        { label: t("strategy.analysis.startFuel"), value: plan.startFuelLiters.toFixed(1), unit: "L", sub: t("strategy.analysis.engineDerived") },
        {
          label: t("strategy.analysis.finishFuel"),
          value: plan.finishFuelLiters.toFixed(1),
          unit: "L",
          sub: `${plan.reserveLaps.toFixed(2)} / ${plan.reserveRequiredLaps.toFixed(2)} ${t("strategy.analysis.reserveLaps")}`,
          alert: tight,
        },
      ],
      stints: plan.stints.map((stint) => ({ laps: stint.laps, startSeconds: stint.start, endSeconds: stint.end })),
      stops: plan.stopDetails.map((stop) => ({
        index: stop.index,
        lap: stop.lap,
        fuelInLiters: stop.fuelInLiters,
        fuelOutLiters: stop.fuelOutLiters,
        pitLossSeconds: stop.pitLossSeconds,
      })),
      stopsEmpty: t("strategy.analysis.noStopsReason"),
      inputs: inputs.map((input) => ({
        label: input.label,
        value: input.view.value === undefined
          ? "—"
          : input.unit === "s/v"
            ? clockTime(input.view.value)
            : `${input.view.value.toFixed(2)} ${input.unit}`.trim(),
        provenance: t(`strategy.inputs.chip.${input.view.kind}`),
        missing: input.view.kind === "missing",
      })),
      axis,
      labels: {
        timeline: t("strategy.analysis.timelineTitle"),
        stops: t("strategy.analysis.stopPlan"),
        inputs: t("strategy.infographic.inputs"),
        stopLap: t("strategy.analysis.lap"),
        stopIn: t("strategy.analysis.levelIn"),
        stopOut: t("strategy.analysis.levelOut"),
        stopTime: t("strategy.analysis.pitTime"),
        laps: t("strategy.infographic.lapsShort"),
      },
      footer: [
        `${t("strategy.analysis.totalTime")} ${clockTime(plan.total)}`,
        sessionCount ? `${sessionCount} ${t("strategy.infographic.sessions")}` : undefined,
        t("strategy.infographic.generated"),
      ].filter(Boolean).join(" · "),
    };
  }, [event, inputs, plan, planName, sessionCount, start, subtitle, t, title]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = INFOGRAPHIC_WIDTH * scale;
    canvas.height = INFOGRAPHIC_HEIGHT * scale;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawStrategyInfographic(context, data);
  }, [data]);

  const download = (kind: "png" | "pdf") => {
    const url = kind === "png" ? infographicPngDataUrl(data) : infographicPdfDataUrl(data);
    downloadDataUrl(url, infographicFilename(title, kind, new Date()));
  };

  return (
    <Surface
      actions={
        <>
          <Button data-testid="orbit-infographic-png" onClick={() => download("png")} size="sm" variant="ghost">
            {t("strategy.infographic.png")}
          </Button>
          <Button data-testid="orbit-infographic-pdf" onClick={() => download("pdf")} size="sm" variant="ghost">
            {t("strategy.infographic.pdf")}
          </Button>
        </>
      }
      className="orbit-analysis__sheet"
      meta={t("strategy.infographic.meta")}
      title={t("strategy.infographic.title")}
    >
      <canvas
        aria-label={t("strategy.infographic.title")}
        className="orbit-analysis__sheet-canvas"
        data-testid="orbit-infographic-canvas"
        ref={canvasRef}
        role="img"
      />
    </Surface>
  );
}
