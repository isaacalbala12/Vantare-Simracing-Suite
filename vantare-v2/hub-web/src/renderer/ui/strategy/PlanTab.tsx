import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import type {
  StrategyCalculationView,
  StrategyComputeForm,
  StrategyEditView,
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
  editSummary,
  lapTime,
  load,
  movedStops,
  planSubtitle,
  reserveFigure,
  reserveNote,
  scheduleTimeline,
  tyresNote,
} from "../../screens/strategy/planText";
import { Button } from "../Button";
import { type EditActions, StintEditor, StopEditor } from "./PlanAdjust";
import { PlanTimeline, type TimelineMark } from "./PlanTimeline";

const t = strategy.calc;

export type PlanActions = {
  // false when there is no form to send, or an action is already running
  canCalculate: boolean;
  pending: boolean;
  calculate: () => void;
  cancel: () => void;
  // the screen gave up asking the host how the calculation goes
  unreadable: boolean;
  readAgain: () => void;
  // to the Carrera tab; with a field, the editor opens with that field marked
  review: (field: StrategyField | null) => void;
  edit: EditActions;
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
  stale,
}: {
  label: string;
  value: string;
  note?: string;
  // the figure is that of the plan before the edit
  stale: boolean;
}) {
  return (
    <li
      className="strategy-card strategy-figure"
      data-stale={stale || undefined}
    >
      <span>{label}</span>
      {stale && <em>{t.adjust.previous}</em>}
      <b>{value}</b>
      {note && <small>{note}</small>}
    </li>
  );
}

function Figures({
  result,
  form,
  stale,
}: {
  result: StrategyCalculationView;
  form: StrategyComputeForm | null;
  stale: boolean;
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
        stale={stale}
      />
      <Figure
        label={f.laps}
        value={String(metrics.laps)}
        note={asked === metrics.laps ? f.asked : undefined}
        stale={stale}
      />
      <Figure
        label={f.stops}
        value={String(metrics.pitCount)}
        note={timeline ? tyresNote(timeline.pits) : undefined}
        stale={stale}
      />
      <Figure
        label={f.left}
        value={reserveFigure(metrics.fuelReserveRealLaps)}
        note={reserveNote(metrics, timeline?.fuelFinishLiters)}
        stale={stale}
      />
    </ul>
  );
}

function Legs({
  timeline,
  stale,
}: {
  timeline: StrategyTimeline;
  stale: boolean;
}) {
  const last = timeline.stints.length - 1;
  return (
    <ol
      className="strategy-legs"
      aria-label={t.list}
      data-stale={stale || undefined}
    >
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

type Mode = "summary" | "stints" | "stops";

function ViewSelector({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  const modes = t.adjust.modes;
  return (
    <fieldset className="strategy-modes">
      <legend className="v-sr-only">{t.adjust.view}</legend>
      {(Object.keys(modes) as Mode[]).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={mode === key}
          onClick={() => onChange(key)}
        >
          {modes[key]}
        </button>
      ))}
    </fieldset>
  );
}

// The warning that goes with an edited plan, and the failure of its recalculation.
function EditNotices({
  edit,
  edited,
}: {
  edit: StrategyEditView;
  edited: boolean;
}) {
  const failed = edit.error && t.adjust.errors[edit.error];
  return (
    <>
      {edited && (
        <section
          className="strategy-notice strategy-pending"
          data-tone="warn"
          aria-label={t.adjust.pending.title}
        >
          <span className="strategy-icon">
            <Icon name="warn" />
          </span>
          <div>
            <strong>{t.adjust.pending.title}</strong>
            <p>{t.adjust.pending.detail}</p>
            <p>{t.adjust.notSaved}</p>
          </div>
        </section>
      )}
      {failed && (
        <div className="strategy-notice" data-tone="error" role="alert">
          <span className="strategy-icon">
            <Icon name="alert" />
          </span>
          <div>
            <strong>{failed.title}</strong>
            <p>{failed.detail}</p>
          </div>
        </div>
      )}
    </>
  );
}

function Result({
  plan,
  result,
  form,
  name,
  actions,
}: {
  plan: StrategyPlanView;
  result: StrategyCalculationView;
  form: StrategyComputeForm | null;
  name: string;
  actions: PlanActions;
}) {
  const { state, edit } = plan;
  const { timeline } = result;
  const [mode, setMode] = useState<Mode>("summary");
  const [selected, setSelected] = useState(0);
  const edited = state === "edited";
  const recalculating = state === "calculating";
  const busy = actions.pending || recalculating;
  const canReset = !!edit?.canReset && !recalculating;
  const stops = edit?.stops.length ?? 0;
  const adjustable = !!edit && !!timeline && !!result.metrics && stops > 0;
  const view: Mode = adjustable ? mode : "summary";
  // stint i and stop i are the two ends of the same boundary: one selection
  const index = Math.min(selected, view === "stops" ? stops - 1 : stops);
  const mark: TimelineMark | undefined =
    view === "summary"
      ? undefined
      : { kind: view === "stops" ? "stop" : "stint", index };
  const shown = timeline ? scheduleTimeline(timeline, edit) : null;
  const proposal = timeline?.pits.map((pit) => pit.lap) ?? [];
  const moves = movedStops(timeline, edit);
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
  const reset = canReset && (
    <Button variant="ghost" disabled={busy} onClick={actions.edit.reset}>
      {t.adjust.reset}
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
          {reset}
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
          {reset}
          <Button variant="primary" onClick={() => actions.review(null)}>
            <Icon name="pencil" />
            {t.review}
          </Button>
        </div>
      </>
    );
  const [title, sub] = recalculating
    ? [t.adjust.recalculating.heading, t.adjust.recalculating.sub]
    : edited
      ? [t.adjust.modified, editSummary(moves)]
      : view === "stints"
        ? [t.adjust.stints.heading, t.adjust.stints.sub]
        : view === "stops"
          ? [t.adjust.stops.heading, t.adjust.stops.sub]
          : [t.done.heading, planSubtitle(result)];
  const headActions = recalculating ? undefined : edited ? (
    <>
      {reset}
      <Button
        variant="primary"
        disabled={busy}
        onClick={actions.edit.recalculate}
      >
        <Icon name="refresh" />
        {t.adjust.recalculate}
      </Button>
    </>
  ) : (
    <>
      {reset}
      {again}
    </>
  );
  return (
    <>
      <Heading
        state={state}
        name={name}
        title={title}
        sub={sub}
        actions={headActions}
      />
      {recalculating && (
        <div
          className="strategy-card strategy-calculating"
          data-recalculating=""
        >
          <span className="strategy-spinner" aria-hidden="true" />
          <div>
            <strong>{t.adjust.recalculating.title}</strong>
            <p>{t.adjust.recalculating.detail}</p>
          </div>
          <Button disabled={actions.pending} onClick={actions.cancel}>
            <Icon name="x" />
            {t.cancel}
          </Button>
        </div>
      )}
      {actions.unreadable && recalculating && (
        <div className="strategy-notice" data-tone="error" role="alert">
          <span className="strategy-icon">
            <Icon name="alert" />
          </span>
          <div>
            <strong>{t.unreadable.title}</strong>
            <p>{t.unreadable.detail}</p>
            <div className="strategy-actions">
              <Button variant="primary" onClick={actions.readAgain}>
                <Icon name="refresh" />
                {t.retry}
              </Button>
            </div>
          </div>
        </div>
      )}
      {edit && <EditNotices edit={edit} edited={edited} />}
      {!edited && !recalculating && view === "summary" && (
        <Notice result={result} />
      )}
      {(view === "summary" || edited || recalculating) && (
        <Figures result={result} form={form} stale={edited || recalculating} />
      )}
      {shown ? (
        <>
          <section className="strategy-card strategy-timeline-card">
            <div className="strategy-timeline-head">
              <h3>{t.full}</h3>
              {adjustable && <ViewSelector mode={view} onChange={setMode} />}
            </div>
            {edit && stops === 0 && (
              <p className="strategy-help">{t.adjust.noStops}</p>
            )}
            {!edit && <p className="strategy-help">{t.adjust.notEditable}</p>}
            <PlanTimeline
              timeline={shown}
              selected={mark}
              proposal={proposal}
            />
          </section>
          {view === "stints" && edit && (
            <>
              <StintEditor
                edit={edit}
                timeline={shown}
                proposal={proposal}
                index={index}
                onSelect={setSelected}
                busy={actions.pending}
                locked={recalculating}
                stale={edited || recalculating}
                move={actions.edit.moveBoundary}
              />
              {!edited && <p className="strategy-help">{t.adjust.notSaved}</p>}
            </>
          )}
          {view === "stops" && edit && (
            <>
              <StopEditor
                edit={edit}
                timeline={timeline ?? shown}
                proposal={proposal}
                index={index}
                onSelect={setSelected}
                busy={actions.pending}
                locked={recalculating}
                stale={edited || recalculating}
                move={actions.edit.moveStop}
              />
              {!edited && <p className="strategy-help">{t.adjust.notSaved}</p>}
            </>
          )}
          {view === "summary" && (
            <Legs timeline={shown} stale={edited || recalculating} />
          )}
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
      // a recalculation keeps the plan and the edit on view
      if (plan.result)
        return (
          <div className="strategy-plan">
            <Result
              plan={plan}
              result={plan.result}
              form={form}
              name={name}
              actions={actions}
            />
          </div>
        );
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
          {actions.unreadable && (
            <div className="strategy-notice" data-tone="error" role="alert">
              <span className="strategy-icon">
                <Icon name="alert" />
              </span>
              <div>
                <strong>{t.unreadable.title}</strong>
                <p>{t.unreadable.detail}</p>
                <div className="strategy-actions">
                  <Button variant="primary" onClick={actions.readAgain}>
                    <Icon name="refresh" />
                    {t.retry}
                  </Button>
                </div>
              </div>
            </div>
          )}
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
      // calculated, partial and edited
      return plan.result ? (
        <div className="strategy-plan">
          <Result
            plan={plan}
            result={plan.result}
            form={form}
            name={name}
            actions={actions}
          />
        </div>
      ) : null;
  }
}
