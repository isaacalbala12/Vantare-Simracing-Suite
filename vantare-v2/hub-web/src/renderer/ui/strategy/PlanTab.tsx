import { Fragment, type ReactNode, useEffect, useRef } from "react";
import type {
  StrategyCalculationView,
  StrategyComputeForm,
  StrategyField,
  StrategyPlanView,
  StrategyTimeline,
} from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy } from "../../i18n/strategy";
import {
  addedLoad,
  certificateNotice,
  clock,
  lapTime,
  load,
  planSubtitle,
  reserveFigure,
  reserveNote,
  tyresNote,
} from "../../screens/strategy/planText";
import { Button } from "../Button";
import { PlanTimeline } from "./PlanTimeline";

const t = strategy.calc;

export type PlanActions = {
  // false when there is no form to send, or an action is already running
  canCalculate: boolean;
  pending: boolean;
  calculate: () => void;
  cancel: () => void;
  // to the Carrera tab; with a field, the editor opens with that field marked
  review: (field: StrategyField | null) => void;
};

function Heading({
  state,
  name,
  title,
  sub,
  actions,
}: {
  state: string;
  name: string;
  title: string;
  sub: string;
  actions?: ReactNode;
}) {
  // The heading takes focus by script when the plan changes under a keyboard
  // user (the button they pressed is gone): it is not a control, so no ring.
  const heading = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus only when the state changes
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) heading.current?.focus();
  }, [state]);
  return (
    <header className="strategy-plan-head">
      <div>
        <div className="strategy-kicker">{t.eyebrow(name)}</div>
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <p>{sub}</p>
      </div>
      {actions && <div className="strategy-actions">{actions}</div>}
    </header>
  );
}

function Empty({
  icon,
  tone,
  title,
  details,
  children,
}: {
  icon: "play" | "alert";
  tone?: "error";
  title: string;
  details: string[];
  children: ReactNode;
}) {
  return (
    <div className="strategy-card strategy-plan-empty" data-tone={tone}>
      <span className="strategy-avatar" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <h2>{title}</h2>
      {details.map((detail) => (
        <p key={detail}>{detail}</p>
      ))}
      <div className="strategy-actions">{children}</div>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <li className="strategy-card strategy-figure">
      <span>{label}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </li>
  );
}

function Figures({
  result,
  form,
}: {
  result: StrategyCalculationView;
  form: StrategyComputeForm | null;
}) {
  const { metrics, timeline } = result;
  if (!metrics) return null;
  const f = t.figures;
  const asked = Number(form?.inputs.raceLaps);
  return (
    <ul className="strategy-figures" aria-label={f.label}>
      <Figure
        label={f.duration}
        value={clock(metrics.totalSeconds)}
        note={f.durationNote}
      />
      <Figure
        label={f.laps}
        value={String(metrics.laps)}
        note={asked === metrics.laps ? f.asked : undefined}
      />
      <Figure
        label={f.stops}
        value={String(metrics.pitCount)}
        note={timeline ? tyresNote(timeline.pits) : undefined}
      />
      <Figure
        label={f.left}
        value={reserveFigure(metrics.fuelReserveRealLaps)}
        note={reserveNote(metrics, timeline?.fuelFinishLiters)}
      />
    </ul>
  );
}

function Legs({ timeline }: { timeline: StrategyTimeline }) {
  const last = timeline.stints.length - 1;
  return (
    <ol className="strategy-legs" aria-label={t.list}>
      {timeline.stints.map((stint, index) => {
        const pit = timeline.pits[index];
        const laps = stint.toLap - stint.fromLap + 1;
        const start = load(timeline.fuelStartLiters, timeline.veStartPercent);
        const finish = load(
          timeline.fuelFinishLiters,
          timeline.veFinishPercent,
        );
        return (
          <Fragment key={stint.fromLap}>
            <li className="strategy-leg" data-kind="stint">
              <span className="strategy-tag">{t.stint(index + 1)}</span>
              <strong>{t.lapsRange(stint.fromLap, stint.toLap)}</strong>
              <span>{t.lapCount(laps)}</span>
              <span>{`${timeline.pilot} · ${lapTime(timeline.basePaceSeconds)}`}</span>
              <span>
                {[
                  index === 0 && start && t.leaves(start),
                  index === last && finish && t.arrives(finish),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
            {pit && (
              <li className="strategy-leg" data-kind="stop">
                <span className="strategy-tag">{t.stop(index + 1)}</span>
                <strong>{t.lap(pit.lap)}</strong>
                <span>{t.services[pit.service]}</span>
                <span>
                  {`${addedLoad(pit)} · ${pit.changeTyres ? t.freshTyres : t.sameTyres}`}
                </span>
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

function Notice({ result }: { result: StrategyCalculationView }) {
  const { tone, title, details } = certificateNotice(result);
  return (
    <section
      className="strategy-certificate"
      data-tone={tone}
      aria-label={t.certificate.label}
    >
      <span className="strategy-icon">
        <Icon name={tone === "ok" ? "v-shield" : "info"} />
      </span>
      <div>
        <strong>{title}</strong>
        {details.map((detail) => (
          <p key={detail}>{detail}</p>
        ))}
      </div>
    </section>
  );
}

function Result({
  result,
  form,
  name,
  state,
  actions,
}: {
  result: StrategyCalculationView;
  form: StrategyComputeForm | null;
  name: string;
  state: string;
  actions: PlanActions;
}) {
  const { timeline } = result;
  const again = (
    <Button
      variant="ghost"
      disabled={!actions.canCalculate || actions.pending}
      onClick={actions.calculate}
    >
      <Icon name="refresh" />
      {t.again}
    </Button>
  );
  if (result.certificate === "no_solution")
    return (
      <>
        <Heading
          state={state}
          name={name}
          title={t.noSolution.heading}
          sub={t.noSolution.sub}
        />
        <Empty
          icon="alert"
          tone="error"
          title={t.certificate.noSolution}
          details={[...certificateNotice(result).details, t.noSolution.hint]}
        >
          <Button variant="primary" onClick={() => actions.review(null)}>
            <Icon name="pencil" />
            {t.review}
          </Button>
        </Empty>
      </>
    );
  if (!result.metrics)
    return (
      <>
        <Heading
          state={state}
          name={name}
          title={t.unfinished.heading}
          sub={t.unfinished.sub}
          actions={again}
        />
        <Notice result={result} />
        <div className="strategy-actions">
          <Button variant="primary" onClick={() => actions.review(null)}>
            <Icon name="pencil" />
            {t.review}
          </Button>
        </div>
      </>
    );
  return (
    <>
      <Heading
        state={state}
        name={name}
        title={t.done.heading}
        sub={planSubtitle(result)}
        actions={again}
      />
      <Notice result={result} />
      <Figures result={result} form={form} />
      {timeline ? (
        <>
          <section className="strategy-card strategy-timeline-card">
            <h3>{t.full}</h3>
            <PlanTimeline timeline={timeline} />
          </section>
          <Legs timeline={timeline} />
        </>
      ) : (
        <p className="strategy-too-long">{t.tooLong}</p>
      )}
    </>
  );
}

export function PlanTab({
  plan,
  form,
  name,
  actions,
}: {
  plan: StrategyPlanView;
  form: StrategyComputeForm | null;
  name: string;
  actions: PlanActions;
}) {
  const state = plan.state;
  const calculate = (
    <Button
      variant="primary"
      disabled={!actions.canCalculate || actions.pending}
      onClick={actions.calculate}
    >
      <Icon name="play" />
      {t.calculate}
    </Button>
  );
  const review = (
    <Button
      variant="ghost"
      disabled={actions.pending}
      onClick={() => actions.review(null)}
    >
      {t.review}
    </Button>
  );
  const heading = (title: string, sub: string) => (
    <Heading state={state} name={name} title={title} sub={sub} />
  );

  switch (state) {
    case "uncalculated":
      return (
        <div className="strategy-plan">
          {heading(t.uncalculated.heading, t.uncalculated.sub)}
          <Empty
            icon="play"
            title={t.uncalculated.title}
            details={[t.uncalculated.detail(form?.inputs.raceLaps ?? "")]}
          >
            {form && calculate}
            {review}
          </Empty>
        </div>
      );
    case "pendingChanges":
      return (
        <div className="strategy-plan">
          {heading(t.changed.heading, t.changed.sub)}
          <Empty
            icon="play"
            title={t.changed.title}
            details={[t.changed.detail]}
          >
            {form && calculate}
            {review}
          </Empty>
        </div>
      );
    case "calculating":
      return (
        <div className="strategy-plan">
          {heading(t.calculating.heading, t.calculating.sub)}
          <div className="strategy-card strategy-calculating">
            <span className="strategy-spinner" aria-hidden="true" />
            <div>
              <strong>{t.calculating.title}</strong>
              <p>{t.calculating.detail}</p>
            </div>
            <Button disabled={actions.pending} onClick={actions.cancel}>
              <Icon name="x" />
              {t.cancel}
            </Button>
          </div>
          <div className="strategy-skeleton" aria-hidden="true">
            <ul>
              {[
                t.figures.duration,
                t.figures.laps,
                t.figures.stops,
                t.figures.left,
              ].map((label) => (
                <li key={label}>
                  <span>{label}</span>
                  <i />
                </li>
              ))}
            </ul>
            <div />
          </div>
        </div>
      );
    case "error": {
      const field = plan.errorField;
      const rejected = plan.error === "invalidInput";
      const label =
        field && field in strategy.labels
          ? strategy.labels[field as keyof typeof strategy.labels]
          : undefined;
      return (
        <div className="strategy-plan">
          {heading(
            rejected ? t.rejected.heading : t.failed.heading,
            rejected ? t.rejected.sub : t.failed.sub,
          )}
          <div className="strategy-notice" data-tone="error" role="alert">
            <span className="strategy-icon">
              <Icon name="alert" />
            </span>
            <div>
              <strong>{rejected ? t.rejected.title : t.failed.title}</strong>
              <p>
                {rejected
                  ? label
                    ? t.rejected.field(label)
                    : t.rejected.detail
                  : t.failed.detail}
              </p>
              <div className="strategy-actions">
                {rejected ? (
                  <Button
                    variant="primary"
                    disabled={actions.pending}
                    onClick={() => actions.review(field)}
                  >
                    <Icon name="pencil" />
                    {t.review}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      disabled={!actions.canCalculate || actions.pending}
                      onClick={actions.calculate}
                    >
                      <Icon name="refresh" />
                      {t.retry}
                    </Button>
                    {review}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }
    default:
      // calculated, partial and edited. Editing the plan is a later step: an
      // edited plan is shown as the calculated one, without controls to edit it.
      return plan.result ? (
        <div className="strategy-plan">
          <Result
            result={plan.result}
            form={form}
            name={name}
            state={state}
            actions={actions}
          />
        </div>
      ) : null;
  }
}
