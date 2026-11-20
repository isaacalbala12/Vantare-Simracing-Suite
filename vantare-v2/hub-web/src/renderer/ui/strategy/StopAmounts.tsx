import {
  type KeyboardEvent,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { HostError } from "../../../contract/generated/contract";
import type {
  StrategyEditStop,
  StrategyEditView,
  StrategyServiceSteps,
} from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy } from "../../i18n/strategy";
import { amounts } from "../../i18n/strategyAmounts";
import {
  type AutomaticCompare,
  automaticSentence,
} from "../../screens/strategy/planText";
import {
  type Amount,
  amountMessage,
  amountText,
  limitLines,
  parseAmount,
  refusalAmount,
  tyreLines,
} from "../../screens/strategy/stopAmounts";
import { Button } from "../Button";

// What the screen asks of the host to fix an amount. It resolves to `undefined`
// when the request was not taken (another action was running), to the host's
// answer otherwise.
export type AmountAnswer = { value: unknown } | { error: HostError };
export type AmountActions = {
  setStopService: (
    index: number,
    fuelLiters: number | null,
    vePercent: number | null,
    changeTyres: boolean | null,
  ) => Promise<AmountAnswer | undefined>;
  // resolves to whether the host took it
  clearStopServices: () => Promise<boolean>;
};

// The mark of an amount (or a stop) the person fixed by hand.
export function PinMark() {
  return (
    <svg
      className="strategy-pin"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 3h6l-1 6 3 3H7l3-3-1-6z" />
      <path d="M12 12v8" />
    </svg>
  );
}

export function PinnedTag() {
  return (
    <span className="strategy-fixed-tag">
      <PinMark />
      {amounts.pinned}
    </span>
  );
}

type Finish = { value: string; automatic: string };

type Row = {
  amount: Amount;
  stop: StrategyEditStop;
  index: number;
  step: number | null;
  // the value of the plan before the edit is shown as such
  stale: boolean;
  disabled: boolean;
  // what the stop admits, as a draft that was typed and what the host refused
  draft: string | undefined;
  message: string | undefined;
  setDraft: (text: string | undefined) => void;
  send: (
    amount: Amount,
    value: number | null,
    focus?: boolean,
  ) => Promise<boolean>;
  // what is typed is not a number: said here, the host is not asked
  reject: () => void;
  // how the plan finishes with this amount, said in the last stop only
  finish?: Finish;
  focusRef: Ref<HTMLInputElement>;
};

const rowName = (amount: Amount) =>
  amount === "fuel" ? amounts.fuel : amounts.energy;

function AmountRow(row: Row) {
  const { amount, stop, index, step, stale, disabled, draft, message } = row;
  const id = useId();
  const fixed =
    amount === "fuel" ? stop.fixed.fuelLiters : stop.fixed.vePercent;
  const planned = amount === "fuel" ? stop.fuelLiters : stop.vePercent;
  const limits = stop.limits.kind === "exact" ? stop.limits[amount] : null;
  const lines = limits ? limitLines(amount, limits, fixed) : null;
  const unit = amounts.unit[amount];
  const n = index + 1;
  const how = amount === "fuel" ? amounts.howFuel(n) : amounts.howEnergy(n);
  const label = amount === "fuel" ? amounts.fuelOf(n) : amounts.energyOf(n);
  const name = useId();
  const described = [
    `${id}-limits`,
    lines?.issue && !message ? `${id}-issue` : undefined,
    message ? `${id}-error` : undefined,
    message ? `${id}-kept` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const shown = draft ?? (fixed === null ? "" : amountText(fixed));
  const spelled =
    step === null || !Number.isFinite(step) || step <= 0
      ? null
      : amountText(step);

  function commit() {
    // what was refused is not sent again until it changes
    if (draft === undefined || message) return;
    const text = draft.trim();
    if (text === "") {
      row.setDraft(undefined);
      return;
    }
    const value = parseAmount(text);
    if (value === null) {
      row.reject();
      return;
    }
    if (value === fixed) {
      row.setDraft(undefined);
      return;
    }
    void row.send(amount, value);
  }
  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape" && draft !== undefined) {
      event.preventDefault();
      row.setDraft(undefined);
    }
  }
  // The buttons move the amount that is on the box by the step of the grid. The step is
  // the host's (`steps` of the plan: what the calculation really loads by), never one
  // written here, and without it there are no buttons. It is the person's own number
  // moved a step; the host is who says whether it is valid (`offGrid`, with the nearest).
  function nudge(direction: -1 | 1) {
    if (step === null) return;
    const base = parseAmount(draft ?? "") ?? fixed ?? planned;
    const next = Math.round((base + direction * step) * 1e6) / 1e6;
    void row.send(amount, next);
  }
  const unitName = amount === "fuel" ? amounts.whatFuel : amounts.whatEnergy;

  return (
    <div
      className="strategy-amount"
      data-fixed={fixed !== null || undefined}
      data-invalid={message ? "" : undefined}
    >
      <span className="strategy-amount-name">
        {rowName(amount)}
        {fixed !== null && <PinnedTag />}
      </span>
      <fieldset className="strategy-amount-mode" disabled={disabled}>
        <legend className="v-sr-only">{how}</legend>
        <label>
          <input
            type="radio"
            name={name}
            checked={fixed === null}
            onChange={() => {
              row.setDraft(undefined);
              void row.send(amount, null);
            }}
          />
          {amounts.auto}
        </label>
        <label>
          <input
            type="radio"
            name={name}
            checked={fixed !== null}
            onChange={() => void row.send(amount, planned, true)}
          />
          {amounts.manual}
        </label>
      </fieldset>
      <div className="strategy-amount-value">
        {fixed === null ? (
          <>
            {stale && <em>{strategy.calc.adjust.previous}</em>}
            <b>
              {planned > 0
                ? `+${amountText(planned)} ${unit}`
                : strategy.calc.noLoad}
            </b>
            <small>{amounts.decided}</small>
          </>
        ) : (
          <div className="strategy-amount-stepper">
            {spelled !== null && (
              <Button
                size="sm"
                disabled={disabled}
                aria-label={amounts.less(spelled, unit, unitName, n)}
                onClick={() => nudge(-1)}
              >
                {amounts.symbols.minus}
              </Button>
            )}
            <span className="strategy-input">
              <input
                ref={row.focusRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={disabled}
                aria-label={label}
                aria-invalid={message ? true : undefined}
                aria-describedby={described}
                value={shown}
                onChange={(event) => row.setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={keys}
              />
              <span aria-hidden="true">{unit}</span>
            </span>
            {spelled !== null && (
              <Button
                size="sm"
                disabled={disabled}
                aria-label={amounts.more(spelled, unit, unitName, n)}
                onClick={() => nudge(1)}
              >
                {amounts.symbols.plus}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="strategy-amount-help">
        <p id={`${id}-limits`} className="strategy-help">
          {lines ? (
            <>
              <span>{lines.arrival}</span> <span>{lines.range}</span>
            </>
          ) : (
            amounts.limits.unavailable
          )}
        </p>
        {lines?.issue && !message && (
          <p
            id={`${id}-issue`}
            className="strategy-amount-note"
            data-tone="warn"
          >
            <Icon name="warn" />
            <span>{lines.issue}</span>
          </p>
        )}
        {row.finish && fixed !== null && !lines?.issue && (
          <p className="strategy-amount-note" data-tone="info">
            <Icon name="info" />
            <span>
              {amounts.finish(amount, row.finish.value, row.finish.automatic)}
            </span>
          </p>
        )}
        {message && (
          <p
            id={`${id}-error`}
            className="strategy-amount-note"
            data-tone="error"
            role="alert"
          >
            <Icon name="alert" />
            <span>{message}</span>
          </p>
        )}
        {message && (
          <p id={`${id}-kept`} className="strategy-help">
            {fixed === null
              ? amounts.keepsAutomatic
              : amounts.keeps(`${amountText(fixed)} ${unit}`)}
          </p>
        )}
      </div>
    </div>
  );
}

// The tyres of one stop: «Cambiar» (the calculation's own choice, nothing fixed) or
// «No cambiar» (fixed, and the plan has to respect it). The sentences and every number
// in them are the host's (`tyres` of the stop).
function TyresRow({
  edit,
  index,
  disabled,
  send,
}: {
  edit: StrategyEditView;
  index: number;
  disabled: boolean;
  send: (changeTyres: boolean | null) => void;
}) {
  const stop = edit.stops[index];
  const lines = tyreLines(edit, index);
  const id = useId();
  if (!stop || !lines) return null;
  const { changeTyres } = stop.fixed;
  const note = lines.issue ?? lines.kept;
  const described = [`${id}-help`, note ? `${id}-note` : undefined]
    .filter(Boolean)
    .join(" ");
  const choice = (value: boolean | null, label: string, on: boolean) => (
    <label>
      <input
        type="radio"
        name={id}
        checked={on}
        aria-describedby={described}
        onChange={() => send(value)}
      />
      {label}
    </label>
  );
  return (
    <div
      className="strategy-amount"
      data-kind="tyres"
      data-fixed={changeTyres !== null || undefined}
    >
      <span className="strategy-amount-name">
        {amounts.tyres.name}
        {changeTyres !== null && <PinnedTag />}
      </span>
      <fieldset className="strategy-amount-mode" disabled={disabled}>
        <legend className="v-sr-only">{amounts.tyres.how(index + 1)}</legend>
        {choice(null, amounts.tyres.change, changeTyres !== false)}
        {choice(false, amounts.tyres.keep, changeTyres === false)}
      </fieldset>
      <div className="strategy-amount-value">
        {changeTyres === null && <small>{amounts.decided}</small>}
      </div>
      <div className="strategy-amount-help">
        <p id={`${id}-help`} className="strategy-help">
          {lines.arrival}
        </p>
        {note && (
          <p
            id={`${id}-note`}
            className="strategy-amount-note"
            data-tone={lines.issue ? "warn" : "info"}
          >
            <Icon name={lines.issue ? "warn" : "info"} />
            <span>{note}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// The fuel and the energy of one stop: each one automatic (what the calculation
// loads) or by hand (a box that the host validates at once). Everything said of
// what fits comes from the `limits` of this stop in the last view of the host.
export function StopAmounts({
  edit,
  index,
  steps,
  stale,
  locked,
  finish,
  set,
}: {
  edit: StrategyEditView;
  index: number;
  steps: StrategyServiceSteps;
  stale: boolean;
  locked: boolean;
  // how the plan finishes, against the automatic one: the last stop's amounts
  finish?: Record<Amount, Finish | undefined>;
  set: AmountActions["setStopService"];
}) {
  const stop = edit.stops[index];
  const [drafts, setDrafts] = useState<Partial<Record<Amount, string>>>({});
  const [messages, setMessages] = useState<Partial<Record<Amount, string>>>({});
  const [focusing, setFocusing] = useState<Amount | null>(null);
  const inputs = {
    fuel: useRef<HTMLInputElement>(null),
    ve: useRef<HTMLInputElement>(null),
  };
  // What the host holds for an amount changed (or it is another stop, or the
  // host's view replaced ours): what was typed there and its message go.
  const heldFuel = stop?.fixed.fuelLiters;
  const heldEnergy = stop?.fixed.vePercent;
  // biome-ignore lint/correctness/useExhaustiveDependencies: what the host holds changed
  useEffect(() => {
    setDrafts((now) => ({ ...now, fuel: undefined }));
    setMessages((now) => ({ ...now, fuel: undefined }));
  }, [heldFuel, index]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: what the host holds changed
  useEffect(() => {
    setDrafts((now) => ({ ...now, ve: undefined }));
    setMessages((now) => ({ ...now, ve: undefined }));
  }, [heldEnergy, index]);
  // the box that was just opened takes the focus: the person came to type in it
  useEffect(() => {
    if (!focusing) return;
    const input = inputs[focusing].current;
    if (!input) return;
    setFocusing(null);
    input.focus();
    input.select();
  });
  if (!stop) return null;
  const unused = {
    fuel: stop.limits.kind === "exact" && stop.limits.fuel.kind === "unused",
    ve: stop.limits.kind === "exact" && stop.limits.ve.kind === "unused",
  };
  const step = { fuel: steps.fuelLiters, ve: steps.vePercent };

  // sends how the whole stop stays; true when the host took it
  async function send(amount: Amount, value: number | null, focus = false) {
    if (!stop) return false;
    setMessages((now) => ({ ...now, [amount]: undefined }));
    const fuel = amount === "fuel" ? value : stop.fixed.fuelLiters;
    const ve = amount === "ve" ? value : stop.fixed.vePercent;
    const answer = await set(index, fuel, ve, stop.fixed.changeTyres);
    if (answer === undefined) return false;
    if ("error" in answer) {
      const { error } = answer;
      if (error.kind === "strategyInvalidStopService") {
        const wrong = refusalAmount(error.amount);
        setMessages((now) => ({
          ...now,
          [wrong]: amountMessage(error, step[wrong]),
        }));
      } else {
        setDrafts({});
        setMessages({});
      }
      return false;
    }
    setDrafts((now) => ({ ...now, [amount]: undefined }));
    if (focus) setFocusing(amount);
    return true;
  }

  const sendTyres = (changeTyres: boolean | null) =>
    void set(index, stop.fixed.fuelLiters, stop.fixed.vePercent, changeTyres);
  const rows = (["fuel", "ve"] as const).map((amount) =>
    unused[amount] ? (
      <div key={amount} className="strategy-amount" data-unused="">
        <span className="strategy-amount-name">{rowName(amount)}</span>
        <p className="strategy-amount-unused">
          {amount === "fuel" ? amounts.unusedFuel : amounts.unused}
        </p>
      </div>
    ) : (
      <AmountRow
        key={amount}
        amount={amount}
        stop={stop}
        index={index}
        step={step[amount]}
        stale={stale}
        disabled={locked}
        draft={drafts[amount]}
        message={messages[amount]}
        setDraft={(text) => {
          setDrafts((now) => ({ ...now, [amount]: text }));
          setMessages((now) => ({ ...now, [amount]: undefined }));
        }}
        reject={() =>
          setMessages((now) => ({ ...now, [amount]: amounts.errors.notNumber }))
        }
        send={send}
        finish={finish?.[amount]}
        focusRef={inputs[amount]}
      />
    ),
  );
  return (
    <fieldset className="strategy-amounts">
      <legend className="v-sr-only">{amounts.group(index + 1)}</legend>
      {rows}
      <TyresRow edit={edit} index={index} disabled={locked} send={sendTyres} />
    </fieldset>
  );
}

// The question asked in the same place before «Calcular de nuevo» throws away
// what was fixed. The focus goes to «Cancelar»; Escape cancels.
export function AgainCard({
  stops,
  cancelRef,
  cancel,
  confirm,
  pending,
}: {
  stops: number;
  cancelRef: Ref<HTMLButtonElement>;
  cancel: () => void;
  confirm: () => void;
  pending: boolean;
}) {
  const id = useId();
  const a = amounts.again;
  function keys(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    cancel();
  }
  return (
    <fieldset
      className="strategy-card strategy-compare"
      data-tone="warn"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-detail`}
      onKeyDown={keys}
    >
      <span
        className="strategy-compare-icon"
        data-tone="warn"
        aria-hidden="true"
      >
        <Icon name="warn" />
      </span>
      <div>
        <strong id={`${id}-title`}>{a.title}</strong>
        <p id={`${id}-detail`}>{a.detail(stops)}</p>
      </div>
      <div className="strategy-actions">
        <Button ref={cancelRef} size="sm" variant="ghost" onClick={cancel}>
          {a.cancel}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={confirm}
        >
          <Icon name="refresh" />
          {a.confirm}
        </Button>
      </div>
    </fieldset>
  );
}

// The plan with what was fixed against the automatic one: said once. Faster (✓) and
// slower (⚠) come with the way back to automatic; «same» (ⓘ) has nothing to go back
// for and says why keeping the tyres may save nothing, when that applies.
export function AutomaticLine({
  compare,
  why,
  clear,
  disabled,
}: {
  compare: AutomaticCompare;
  why: boolean;
  clear: () => void;
  disabled: boolean;
}) {
  const { kind } = compare;
  const tone = kind === "slower" ? "warn" : kind === "faster" ? "ok" : "info";
  return (
    <div className="strategy-notice strategy-slower" data-tone={tone}>
      <span className="strategy-icon">
        <Icon
          name={tone === "warn" ? "warn" : tone === "ok" ? "check" : "info"}
        />
      </span>
      <div className="strategy-slower-text">
        <p>{automaticSentence(compare)}</p>
        {kind === "same" && why && (
          <p className="strategy-help">{amounts.sameWhy}</p>
        )}
      </div>
      {kind !== "same" && (
        <Button size="sm" variant="ghost" disabled={disabled} onClick={clear}>
          {amounts.clear}
        </Button>
      )}
    </div>
  );
}
