import type { StrategyValidatedExamplesV1 } from "../../strategy/strategy-application-client";
import { Surface } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";

export type ValidatedExamplesViewState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly result: StrategyValidatedExamplesV1 }
  | { readonly status: "error" };

type Props = {
  readonly locale: string;
  readonly state: ValidatedExamplesViewState;
  readonly t: (key: string) => string;
};

function duration(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

function percentage(locale: string, ratio: number): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratio).replace(/\u00a0/g, " ");
}

function relativeDate(locale: string, occurredAt: string): string {
  const elapsedDays = Math.round((new Date(occurredAt).getTime() - Date.now()) / 86_400_000);
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(elapsedDays, "day");
}

export function StrategyValidatedExamplesPanel({ locale, state, t }: Props) {
  let content;
  if (state.status === "idle" || state.status === "loading") {
    content = <p className="orbit-validated-examples__empty">{t("strategy.validated.loading")}</p>;
  } else if (state.status === "error") {
    content = <p className="orbit-validated-examples__empty" role="alert">{t("strategy.validated.error")}</p>;
  } else if (state.result.status !== "available" || state.result.races.length === 0) {
    content = <p className="orbit-validated-examples__empty">{t("strategy.validated.empty")}</p>;
  } else {
    const aggregateKey = state.result.aggregate.raceCount === 1
      ? "strategy.validated.aggregateOne"
      : "strategy.validated.aggregateMany";
    content = (
      <>
        <p className="orbit-validated-examples__aggregate">
          {formatMessage(t(aggregateKey), {
            count: state.result.aggregate.raceCount,
            error: percentage(locale, state.result.aggregate.totalErrorRatio.mean),
          })}
        </p>
        <ol className="orbit-validated-examples__list">
          {state.result.races.map((race) => (
            <li className="orbit-validated-example" key={race.raceId}>
              <div className="orbit-validated-example__identity">
                <b>{relativeDate(locale, race.occurredAt)}</b>
                <span>
                  {race.stints.map((stint) => stint.laps).join(" + ")} {t("strategy.validated.laps")}
                  {race.pitLaps.length > 0 ? ` · ${t("strategy.validated.pit")} V${race.pitLaps.join(", V")}` : ""}
                </span>
                <small>
                  {t("strategy.validated.stints")} {race.stints.map((stint) => percentage(locale, stint.absoluteErrorRatio)).join(" · ")}
                </small>
              </div>
              <dl className="orbit-validated-example__metrics">
                <div><dt>{t("strategy.validated.predicted")}</dt><dd>{duration(race.predictedTotalSeconds)}</dd></div>
                <div><dt>{t("strategy.validated.actual")}</dt><dd>{duration(race.observedTotalSeconds)}</dd></div>
                <div><dt>{t("strategy.validated.deviation")}</dt><dd>{percentage(locale, race.absoluteErrorRatio)}</dd></div>
              </dl>
            </li>
          ))}
        </ol>
      </>
    );
  }

  return (
    <div className="orbit-validated-examples" data-testid="orbit-validated-examples">
      <Surface meta={t("strategy.validated.hint")} title={t("strategy.validated.title")}>
        {content}
      </Surface>
    </div>
  );
}
