import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  acceptedTag,
  addedLoad,
  canAccept,
  certificateNotice,
  clock,
  differsFromAccepted,
  durationNote,
  editSummary,
  isAcceptedOnly,
  isAcceptedOnView,
  isOutdatedSame,
  lapTime,
  load,
  movedStops,
  planSubtitle,
  planSummary,
  reserveFigure,
  reserveNote,
  scheduleTimeline,
  type Tag,
  tyresNote,
} from "../../screens/strategy/planText";
import { Button } from "../Button";
import {
  AcceptedLine,
  AcceptedMenu,
  CompareCard,
  ConfirmCard,
  ProposalLine,
  proposalLine,
  StaleNotice,
  StateTag,
} from "./PlanAccept";
import { type EditActions, StintEditor, StopEditor } from "./PlanAdjust";
import { type ExportActions, ExportMenu, ExportNotice } from "./PlanExport";
import { PlanTimeline, type TimelineMark } from "./PlanTimeline";

const t = strategy.calc;

export type AcceptActions = {
  // keeps the proposal on view, replacing the plan accepted before if there is one
  accept: () => void;
  // drops the proposal: the accepted plan is what is shown
  showAccepted: () => void;
  unaccept: () => void;
  // the plan was just accepted for the first time and the file is not saved yet
  fresh: boolean;
};

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
  acceptance: AcceptActions;
  export: ExportActions;
};

function Heading({
  state,
  name,
  title,
  sub,
  actions,
  tag,
}: {
  state: string;
  name: string;
  title: string;
  sub: string;
  actions?: ReactNode;
  tag?: Tag | null;
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
        <div className="strategy-plan-title">
          <h2 ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {tag && <StateTag tag={tag} />}
        </div>
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
  staleLabel,
}: {
  label: string;
  value: string;
  note?: string;
  // the figure is that of the plan before the edit, or of old data
  stale: boolean;
  staleLabel: string;
}) {
  return (
    <li
      className="strategy-card strategy-figure"
      data-stale={stale || undefined}
    >
      <span>{label}</span>
      {stale && <em>{staleLabel}</em>}
      <b>{value}</b>
      {note && <small>{note}</small>}
    </li>
  );
}

function Figures({
  result,
  form,
  stale,
  staleLabel,
  durationText,
}: {
  result: StrategyCalculationView;
  form: StrategyComputeForm | null;
  stale: boolean;
  staleLabel: string;
  // what the duration says of the accepted plan, when this is another proposal
  durationText?: string;
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
        note={durationText ?? f.durationNote}
        stale={stale}
        staleLabel={staleLabel}
      />
      <Figure
        label={f.laps}
        value={String(metrics.laps)}
        note={asked === metrics.laps ? f.asked : undefined}
        stale={stale}
        staleLabel={staleLabel}
      />
      <Figure
        label={f.stops}
        value={String(metrics.pitCount)}
        note={timeline ? tyresNote(timeline.pits) : undefined}
        stale={stale}
        staleLabel={staleLabel}
      />
      <Figure
        label={f.left}
        value={reserveFigure(metrics.fuelReserveRealLaps)}
        note={reserveNote(metrics, timeline?.fuelFinishLiters)}
        stale={stale}
        staleLabel={staleLabel}
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
  recalculating,
}: {
  edit: StrategyEditView;
  edited: boolean;
  recalculating: boolean;
}) {
  // The host keeps the failure of the last attempt until the plan is edited
  // again: not shown while a new attempt runs, so a second failure is a new alert.
  const failed = !recalculating && edit.error && t.adjust.errors[edit.error];
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
            <p>{t.adjust.pending.accept}</p>
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
  only = false,
}: {
  plan: StrategyPlanView;
  result: StrategyCalculationView;
  form: StrategyComputeForm | null;
  name: string;
  actions: PlanActions;
  // only the accepted plan is on view: there is no proposal and nothing to adjust
  only?: boolean;
}) {
  const { state, edit } = plan;
  const { timeline } = result;
  const [mode, setMode] = useState<Mode>("summary");
  const [selected, setSelected] = useState(0);
  // A press on Recalcular waits for the lap that is still going to the host, and
  // then goes: it is never lost, and never goes before the move it follows.
  const [unsettled, setUnsettled] = useState(false);
  const [wantsRecalculation, setWantsRecalculation] = useState(false);
  const settle = useCallback((now: boolean) => setUnsettled(now), []);
  // a lap the host refused takes with it the press that was waiting for it
  const dropPress = useCallback(() => setWantsRecalculation(false), []);
  const recalculate = actions.edit.recalculate;
  const isEdited = plan.state === "edited";
  useEffect(() => {
    if (!wantsRecalculation || (isEdited && unsettled)) return;
    setWantsRecalculation(false);
    if (isEdited) recalculate();
  }, [wantsRecalculation, unsettled, isEdited, recalculate]);
  const edited = state === "edited";
  const recalculating = state === "calculating";
  const busy = actions.pending || recalculating;
  const canReset = !!edit?.canReset && !recalculating;
  const stops = edit?.stops.length ?? 0;
  const adjustable = !!edit && !!timeline && !!result.metrics && stops > 0;
  const view: Mode = adjustable ? mode : "summary";
  // the plan accepted, and what the plan on view is next to it
  const { accepted } = plan;
  const acceptance = actions.acceptance;
  const onView = !only && isAcceptedOnView(plan);
  const showsAccepted = !!accepted && (only || onView);
  const outdated = showsAccepted && accepted.state !== "accepted";
  // another proposal than the accepted plan (it has other stops), or one with its
  // stops that still brings an outdated plan up to date
  const differs = !only && differsFromAccepted(plan);
  const other = differs || (!only && isOutdatedSame(plan));
  const acceptable = !only && canAccept(plan);
  const [confirm, setConfirm] = useState<"replace" | "remove" | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  // the question takes the focus; the menu that opened it must not take it back
  const skipFocus = useRef(false);
  const restore = useRef<"accept" | "menu" | null>(null);
  // the question goes when what it asks about is no longer there
  const asks =
    view === "summary" &&
    ((confirm === "replace" && differs) ||
      (confirm === "remove" && showsAccepted));
  useEffect(() => {
    if (confirm && !asks) setConfirm(null);
  }, [confirm, asks]);
  useEffect(() => {
    if (asks) cancelRef.current?.focus();
    else {
      if (restore.current)
        (restore.current === "accept" ? acceptRef : menuRef).current?.focus();
      restore.current = null;
      // however the question closed (Cancelar, Confirmar or because it no longer
      // applies), the menu may give the focus back again next time
      skipFocus.current = false;
    }
  }, [asks]);
  function cancelQuestion() {
    restore.current = confirm === "replace" ? "accept" : "menu";
    setConfirm(null);
  }
  function confirmQuestion() {
    const kind = confirm;
    restore.current = kind === "replace" ? "accept" : "menu";
    setConfirm(null);
    if (kind === "replace") acceptance.accept();
    else acceptance.unaccept();
  }
  // with the proposal on view nothing is lost: it stays and can be accepted again
  function remove() {
    if (onView) acceptance.unaccept();
    else {
      skipFocus.current = true;
      setConfirm("remove");
    }
  }
  // stint i and stop i are the two ends of the same boundary: one selection
  const index = Math.min(selected, view === "stops" ? stops - 1 : stops);
  const mark: TimelineMark | undefined =
    view === "summary"
      ? undefined
      : { kind: view === "stops" ? "stop" : "stint", index };
  const shown = timeline ? scheduleTimeline(timeline, edit) : null;
  const proposal = timeline?.pits.map((pit) => pit.lap) ?? [];
  const moves = movedStops(timeline, edit);
  // The notice of the export goes away, or tries again, and the focus stays on the
  // button that opened it: the notice it was in is gone.
  const exporting = actions.export;
  const closeExport = () => {
    exporting.dismiss();
    exportRef.current?.focus();
  };
  const retryExport = () => {
    exporting.retry();
    exportRef.current?.focus();
  };
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
  // the proposal has no plan: the accepted one must still be within reach
  const backToAccepted = !only && accepted && (
    <Button
      variant="ghost"
      disabled={actions.pending}
      onClick={acceptance.showAccepted}
    >
      {strategy.calc.accept.compare.back}
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
          {backToAccepted}
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
          {backToAccepted}
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
          : [
              showsAccepted
                ? strategy.calc.accept.acceptedHeading
                : t.done.heading,
              planSubtitle(result),
            ];
  const headActions = recalculating ? undefined : edited ? (
    <>
      {reset}
      <Button variant="primary" onClick={() => setWantsRecalculation(true)}>
        <Icon name="refresh" />
        {t.adjust.recalculate}
      </Button>
    </>
  ) : (
    <>
      {reset}
      {exporting.available && (
        <ExportMenu actions={exporting} triggerRef={exportRef} />
      )}
      {again}
      {acceptable && !asks && (
        <Button
          ref={acceptRef}
          variant="primary"
          disabled={actions.pending}
          onClick={() =>
            differs ? setConfirm("replace") : acceptance.accept()
          }
        >
          <Icon name="check" />
          {strategy.calc.accept.action}
        </Button>
      )}
      {showsAccepted && (
        <AcceptedMenu
          remove={remove}
          keeps={onView}
          triggerRef={menuRef}
          skipFocus={skipFocus}
          disabled={actions.pending}
        />
      )}
    </>
  );
  // the state of the plan, next to its title (only in the summary)
  const tag: Tag | null =
    edited || recalculating || view !== "summary"
      ? null
      : showsAccepted && accepted
        ? acceptedTag(accepted)
        : acceptable
          ? { tone: "neutral", text: strategy.calc.accept.tags.proposal }
          : null;
  return (
    <>
      <Heading
        state={`${state}/${tag?.text ?? ""}`}
        name={name}
        title={title}
        sub={sub}
        actions={headActions}
        tag={tag}
      />
      <ExportNotice
        state={exporting.state}
        retry={retryExport}
        dismiss={closeExport}
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
      {edit && (
        <EditNotices
          edit={edit}
          edited={edited}
          recalculating={recalculating}
        />
      )}
      {!edited &&
        !recalculating &&
        view === "summary" &&
        (outdated && accepted ? (
          <StaleNotice
            accepted={accepted}
            canCalculate={actions.canCalculate}
            pending={actions.pending}
            calculate={actions.calculate}
            review={() => actions.review(null)}
          />
        ) : (
          <Notice result={result} />
        ))}
      {!edited && !recalculating && view === "summary" && (
        <>
          {acceptable && !other && (
            <ProposalLine unproven={result.certificate !== "proven"} />
          )}
          {showsAccepted && !outdated && accepted && (
            <AcceptedLine
              accepted={accepted}
              pending={actions.pending}
              undo={acceptance.fresh ? acceptance.unaccept : undefined}
            />
          )}
          {other && accepted && !asks && (
            <CompareCard
              accepted={accepted}
              proposal={proposalLine(accepted, planSummary(result))}
              back={acceptance.showAccepted}
              pending={actions.pending}
            />
          )}
          {asks && accepted && (
            <ConfirmCard
              kind={confirm === "replace" ? "replace" : "remove"}
              summary={planSummary(accepted.result)}
              saved={accepted.saved}
              cancelRef={cancelRef}
              cancel={cancelQuestion}
              confirm={confirmQuestion}
              pending={actions.pending}
            />
          )}
        </>
      )}
      {(view === "summary" || edited || recalculating) && (
        <Figures
          result={result}
          form={form}
          stale={edited || recalculating || (outdated && view === "summary")}
          staleLabel={
            outdated && !edited && !recalculating
              ? strategy.calc.accept.oldData
              : t.adjust.previous
          }
          durationText={
            other && view === "summary"
              ? durationNote(accepted?.compare ?? null)
              : undefined
          }
        />
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
            {!edit && (
              <p className="strategy-help">
                {only ? strategy.calc.accept.noAdjust : t.adjust.notEditable}
              </p>
            )}
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
                onUnsettled={settle}
                onRefused={dropPress}
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

  // no proposal on view but a plan accepted: that plan is what the tab shows
  if (isAcceptedOnly(plan) && plan.accepted)
    return (
      <div className="strategy-plan">
        <Result
          plan={{
            ...plan,
            state: "calculated",
            result: plan.accepted.result,
            edit: null,
          }}
          result={plan.accepted.result}
          form={form}
          name={name}
          actions={actions}
          only
        />
      </div>
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
                {plan.accepted && (
                  <Button
                    variant="ghost"
                    disabled={actions.pending}
                    onClick={actions.acceptance.showAccepted}
                  >
                    {strategy.calc.accept.compare.back}
                  </Button>
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
