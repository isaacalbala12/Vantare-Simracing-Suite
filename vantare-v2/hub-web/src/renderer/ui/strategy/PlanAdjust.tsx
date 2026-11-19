import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  StrategyEditView,
  StrategyServiceSteps,
  StrategyTimeline,
} from "../../../contract/generated/strategy";
import { strategy } from "../../i18n/strategy";
import { amounts } from "../../i18n/strategyAmounts";
import { addedLoad, load } from "../../screens/strategy/planText";
import { pitTime, stopIsFixed } from "../../screens/strategy/stopAmounts";
import { Button } from "../Button";
import { type AmountActions, PinMark, StopAmounts } from "./StopAmounts";

const t = strategy.calc;
const a = t.adjust;

export type EditActions = {
  // Each resolves to `undefined` when the request was not taken (another action
  // was running), to whether the host accepted it otherwise.
  moveBoundary: (index: number, lap: number) => Promise<boolean | undefined>;
  moveStop: (index: number, delta: -1 | 1) => Promise<boolean | undefined>;
  recalculate: () => void;
  reset: () => void;
} & AmountActions;

type Choice = { label: string; text: ReactNode };

// A group of radio buttons: the arrows walk through them and the selection
// follows the focus, as the browser does for radios that share a name.
export function Choices({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice[];
  value: number;
  onChange: (index: number) => void;
}) {
  const name = useId();
  return (
    <fieldset className="strategy-choices">
      <legend className="v-sr-only">{label}</legend>
      {choices.map((choice, index) => (
        <label key={choice.label} className="strategy-choice">
          <input
            type="radio"
            name={name}
            aria-label={choice.label}
            checked={index === value}
            onChange={() => onChange(index)}
          />
          {choice.text}
        </label>
      ))}
    </fieldset>
  );
}

function Metric({
  label,
  value,
  previous,
  note,
}: {
  label: string;
  value: string;
  previous: boolean;
  note?: string;
}) {
  return (
    <div className="strategy-metric" data-stale={previous || undefined}>
      <span>{label}</span>
      {previous && <em>{a.previous}</em>}
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// The lap a boundary is going to: the person moves it (slider, key, drag or typed
// lap) as fast as they like, and the host is asked for the latest one only once
// each answer is back, so a held key or a drag never queues requests.
function useBoundaryTarget(
  index: number,
  lap: number | undefined,
  busy: boolean,
  move: EditActions["moveBoundary"],
  onRefused: () => void,
) {
  const [target, setTarget] = useState<number>();
  const [settled, setSettled] = useState(0);
  const inFlight = useRef(false);
  const latest = useRef(move);
  latest.current = move;
  const refused = useRef(onRefused);
  refused.current = onRefused;
  // biome-ignore lint/correctness/useExhaustiveDependencies: another stint starts clean
  useEffect(() => setTarget(undefined), [index]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `settled` wakes the effect after an answer
  useEffect(() => {
    if (target === undefined || busy || inFlight.current) return;
    if (target === lap) {
      setTarget(undefined);
      return;
    }
    inFlight.current = true;
    const sent = target;
    void latest.current(index, sent).then((taken) => {
      inFlight.current = false;
      // not taken: the end of the running action wakes the effect again
      if (taken === undefined) return;
      if (taken === false) refused.current();
      setTarget((now) => (now === sent ? undefined : now));
      setSettled((count) => count + 1);
    });
  }, [target, lap, index, busy, settled]);
  return [target, setTarget] as const;
}

export function StintEditor({
  edit,
  timeline,
  proposal,
  index,
  onSelect,
  busy,
  locked,
  stale,
  move,
  onUnsettled,
  onRefused,
}: {
  edit: StrategyEditView;
  // the timeline as edited, and the laps of the stops in the calculated plan
  timeline: StrategyTimeline;
  proposal: readonly number[];
  index: number;
  onSelect: (index: number) => void;
  busy: boolean;
  locked: boolean;
  // the amounts are those of the plan before the edit
  stale: boolean;
  move: EditActions["moveBoundary"];
  // a lap typed or moved that the host has not answered yet
  onUnsettled: (unsettled: boolean) => void;
  // the host refused the lap: what was waiting for it must not go on
  onRefused: () => void;
}) {
  const id = useId();
  const stint = edit.stints[index];
  const stop = edit.stops[index];
  const [target, setTarget] = useBoundaryTarget(
    index,
    stop?.lap,
    busy,
    move,
    onRefused,
  );
  const [draft, setDraft] = useState<string>();
  const unsettled = target !== undefined || draft !== undefined;
  useEffect(() => onUnsettled(unsettled), [unsettled, onUnsettled]);
  useEffect(() => () => onUnsettled(false), [onUnsettled]);
  if (!stint) return null;
  // both neighbours have one lap: the only lap this end can have is its own
  const pinned = !!stop && stop.minLap === stop.maxLap;
  const laps = stint.toLap - stint.fromLap + 1;
  const last = index === edit.stops.length;
  const pit = timeline.pits[index];
  const shown = target ?? stop?.lap ?? stint.toLap;
  const share = stop
    ? ((shown - stop.minLap) / Math.max(1, stop.maxLap - stop.minLap)) * 100
    : 0;
  const was = proposal[index];
  const wasShare =
    stop && was !== undefined
      ? ((was - stop.minLap) / Math.max(1, stop.maxLap - stop.minLap)) * 100
      : undefined;
  function commitText() {
    if (draft === undefined || !stop) return;
    const text = draft.trim();
    setDraft(undefined);
    if (/^\d+$/.test(text))
      setTarget(clamp(Number(text), stop.minLap, stop.maxLap));
  }
  return (
    <div className="strategy-card strategy-editor">
      <div className="strategy-editor-row">
        <span>{a.stints.pick}</span>
        <Choices
          label={a.stints.pick}
          value={index}
          onChange={onSelect}
          choices={edit.stints.map((item, position) => ({
            label: `${t.stint(position + 1)}, ${t.lapCount(item.toLap - item.fromLap + 1)}`,
            text: (
              <>
                <b>{position + 1}</b>
                {` ${item.toLap - item.fromLap + 1} v`}
              </>
            ),
          }))}
        />
      </div>
      <div className="strategy-editor-columns">
        <div className="strategy-metrics">
          <Metric
            label={a.stints.laps}
            value={`${stint.fromLap}–${stint.toLap}`}
            previous={false}
          />
          <Metric label={a.stints.total} value={`${laps} v`} previous={false} />
          {index === 0 && (
            <Metric
              label={a.stints.leaves}
              value={load(timeline.fuelStartLiters, timeline.veStartPercent)}
              previous={stale}
            />
          )}
          {pit && (
            <Metric
              label={a.stints.endsWith}
              value={`${t.stop(index + 1)} · ${addedLoad(pit)}`}
              previous={stale}
            />
          )}
          {last && (
            <Metric
              label={a.stints.arrives}
              value={load(timeline.fuelFinishLiters, timeline.veFinishPercent)}
              previous={stale}
            />
          )}
        </div>
        {stop ? (
          <div className="strategy-slider">
            <div className="strategy-slider-head">
              <label htmlFor={`${id}-lap`} id={`${id}-label`}>
                {a.stints.endsIn}
              </label>
              <span className="strategy-input">
                <input
                  id={`${id}-lap`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={locked || pinned}
                  value={draft ?? String(shown)}
                  aria-describedby={`${id}-help`}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitText}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitText();
                    } else if (event.key === "Escape") setDraft(undefined);
                  }}
                />
              </span>
            </div>
            <div
              className="strategy-range"
              style={{ "--share": `${share}%` } as CSSProperties}
            >
              <input
                type="range"
                min={stop.minLap}
                max={stop.maxLap}
                step={1}
                value={shown}
                disabled={locked || pinned}
                aria-labelledby={`${id}-label`}
                aria-describedby={`${id}-help`}
                aria-valuetext={a.stints.valueText(
                  shown,
                  index + 1,
                  shown - (stop.minLap - 1),
                  stop.maxLap + 1 - shown,
                )}
                onChange={(event) => setTarget(Number(event.target.value))}
              />
              {wasShare !== undefined && wasShare >= 0 && wasShare <= 100 && (
                <span
                  className="strategy-range-proposal"
                  aria-hidden="true"
                  style={{ left: `${wasShare}%` }}
                />
              )}
            </div>
            <div className="strategy-range-labels" aria-hidden="true">
              <span>{stop.minLap}</span>
              {was !== undefined && <span>{a.stints.proposal(was)}</span>}
              <span>{stop.maxLap}</span>
            </div>
            <p id={`${id}-help`} className="strategy-help">
              {pinned ? (
                a.stints.pinned
              ) : (
                <>
                  <kbd>{a.stints.keys.left}</kbd>{" "}
                  <kbd>{a.stints.keys.right}</kbd> {a.stints.keys.step}{" "}
                  <kbd>{a.stints.keys.home}</kbd> <kbd>{a.stints.keys.end}</kbd>{" "}
                  {a.stints.keys.ends} {a.stints.keys.drag}
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="strategy-help">{a.stints.last}</p>
        )}
      </div>
    </div>
  );
}

export function StopEditor({
  edit,
  timeline,
  proposal,
  index,
  onSelect,
  busy,
  locked,
  stale,
  steps,
  finish,
  move,
  set,
  clear,
}: {
  edit: StrategyEditView;
  // the plan the stops come from: their amounts, tyres and service
  timeline: StrategyTimeline;
  proposal: readonly number[];
  index: number;
  onSelect: (index: number) => void;
  busy: boolean;
  locked: boolean;
  // the amounts are those of the plan before the edit
  stale: boolean;
  steps: StrategyServiceSteps;
  // how the plan finishes against the automatic one, when the host has both
  finish?: ComponentProps<typeof StopAmounts>["finish"];
  move: EditActions["moveStop"];
  set: EditActions["setStopService"];
  // back to automatic everywhere, offered when something is fixed
  clear?: () => void;
}) {
  const id = useId();
  const stop = edit.stops[index];
  const pit = timeline.pits[index];
  if (!stop || !pit) return null;
  const atFirst = stop.lap <= stop.minLap;
  const atLast = stop.lap >= stop.maxLap;
  const was = proposal[index];
  const moved = was !== undefined && was !== stop.lap;
  // At the end of its range a button stays focusable and says why it does nothing.
  const step = (delta: -1 | 1, blocked: boolean) => (
    <Button
      focusableWhenDisabled
      disabled={locked}
      aria-disabled={blocked || busy}
      aria-describedby={blocked ? `${id}-limit` : undefined}
      onClick={() => void move(index, delta)}
    >
      {delta === -1 ? a.stops.earlier : a.stops.later}
    </Button>
  );
  return (
    <div className="strategy-card strategy-editor">
      <div className="strategy-editor-row">
        <span>{a.stops.pick}</span>
        <Choices
          label={a.stops.pick}
          value={index}
          onChange={onSelect}
          choices={edit.stops.map((item, position) => ({
            label: `${t.stop(position + 1)}, ${t.lap(item.lap).toLowerCase()}${stopIsFixed(item) ? `, ${amounts.pinnedStop}` : ""}`,
            text: (
              <>
                <b>{position + 1}</b>
                {` v. ${item.lap}`}
                {stopIsFixed(item) && <PinMark />}
              </>
            ),
          }))}
        />
      </div>
      <div className="strategy-editor-columns">
        <div className="strategy-metrics">
          <Metric
            label={a.stops.tyres}
            value={pit.changeTyres ? a.stops.freshTyres : a.stops.sameTyres}
            previous={stale}
          />
          <Metric
            label={a.stops.service}
            value={t.services[pit.service]}
            previous={stale}
          />
          <Metric
            label={amounts.pitTime}
            value={pitTime(stop.pitSeconds)}
            previous={false}
            note={
              pit.pitSeconds !== stop.pitSeconds
                ? amounts.pitBefore(pitTime(pit.pitSeconds))
                : undefined
            }
          />
        </div>
        <div className="strategy-mover">
          <span>{a.stops.move}</span>
          <div className="strategy-mover-row">
            {step(-1, atFirst)}
            <div
              className="strategy-mover-value"
              data-moved={moved || undefined}
            >
              <b>{t.lap(stop.lap)}</b>
              <small>
                {moved && was !== undefined
                  ? a.stops.was(was)
                  : a.stops.range(stop.minLap, stop.maxLap)}
              </small>
            </div>
            {step(1, atLast)}
          </div>
          {(atFirst || atLast) && (
            <p id={`${id}-limit`} className="strategy-help" data-limit="">
              {atFirst && atLast
                ? a.stops.pinned
                : atFirst
                  ? a.stops.atFirst
                  : a.stops.atLast}
            </p>
          )}
        </div>
      </div>
      <StopAmounts
        key={index}
        edit={edit}
        index={index}
        steps={steps}
        stale={stale}
        locked={locked}
        finish={finish}
        set={set}
      />
      {clear && (
        <div className="strategy-actions">
          <Button size="sm" variant="ghost" disabled={locked} onClick={clear}>
            {amounts.clear}
          </Button>
        </div>
      )}
      <p className="strategy-help">{amounts.foot}</p>
    </div>
  );
}
