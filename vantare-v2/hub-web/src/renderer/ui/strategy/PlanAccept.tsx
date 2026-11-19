import { Menu } from "@base-ui/react/menu";
import { type KeyboardEvent, type Ref, useId } from "react";
import type { StrategyAcceptedView } from "../../../contract/generated/strategy";
import { Icon } from "../../assets/icons/Icon";
import { strategy } from "../../i18n/strategy";
import {
  acceptedDay,
  acceptedOn,
  changeLine,
  differenceText,
  planSummary,
  type Tag,
  unreachableText,
} from "../../screens/strategy/planText";
import { Button } from "../Button";

const t = strategy.calc.accept;
const shownChanges = 6;

// What the host says of the accepted plan, in the words of the screen: the
// state tag, the line under the certificate, the comparison with a new proposal,
// the question before something is lost and the notice of outdated data. The
// renderer only spells what the host sends.

export function StateTag({ tag }: { tag: Tag }) {
  return (
    <span className="strategy-state" data-tone={tag.tone}>
      {tag.text}
    </span>
  );
}

// «Es una propuesta: no se guarda en el archivo hasta que la aceptes.»; a plan
// with no guarantee can be accepted too, and the line says so.
export function ProposalLine({ unproven }: { unproven: boolean }) {
  return (
    <p className="strategy-line" data-tone={unproven ? "warn" : undefined}>
      <Icon name={unproven ? "warn" : "info"} />
      {unproven ? (
        <span>
          {t.unproven.before}
          <strong>{t.unproven.strong}</strong>
          {t.unproven.after}
        </span>
      ) : (
        <span>{t.proposal}</span>
      )}
    </p>
  );
}

// The accepted plan is only in this session until the file is saved; when it is
// saved, the line says when it was accepted. «Deshacer» only right after the
// first acceptance: it leaves the strategy with no accepted plan.
export function AcceptedLine({
  accepted,
  undo,
  pending,
}: {
  accepted: StrategyAcceptedView;
  undo?: () => void;
  pending: boolean;
}) {
  if (accepted.saved)
    return (
      <p className="strategy-line" data-tone="ok">
        <Icon name="check" />
        <span>{acceptedOn(accepted.acceptedAt)}</span>
      </p>
    );
  return (
    <p className="strategy-line" data-tone="ok">
      <Icon name="check" />
      <span>
        <strong>{t.unsaved.strong}</strong>
        {t.unsaved.rest}
      </span>
      {undo && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={undo}>
          {t.undo}
        </Button>
      )}
    </p>
  );
}

// A proposal that is not the accepted plan: both, side by side, and the way back.
export function CompareCard({
  accepted,
  proposal,
  back,
  pending,
}: {
  accepted: StrategyAcceptedView;
  proposal: string;
  back: () => void;
  pending: boolean;
}) {
  const id = useId();
  const c = t.compare;
  // the plan accepted is outdated: say what changed, and that accepting this
  // proposal brings it up to date
  const outdated = accepted.state !== "accepted";
  const shown = accepted.changes.slice(0, shownChanges);
  return (
    <section
      className="strategy-card strategy-compare"
      aria-labelledby={`${id}-title`}
    >
      <span className="strategy-compare-icon" aria-hidden="true">
        <Icon name="check" />
      </span>
      <div>
        <strong id={`${id}-title`}>{c.title}</strong>
        <p>
          <span>
            {c.accepted(
              planSummary(accepted.result),
              acceptedDay(accepted.acceptedAt),
              accepted.state !== "accepted",
            )}
          </span>
          <span>{proposal}</span>
        </p>
        {outdated && shown.length > 0 && (
          <ul className="strategy-changes" aria-label={t.stale.changes}>
            {shown.map((change) => (
              <li key={change.field}>{changeLine(change)}</li>
            ))}
          </ul>
        )}
        {outdated && <p>{c.outdatedHint}</p>}
      </div>
      <Button size="sm" variant="ghost" disabled={pending} onClick={back}>
        {c.back}
      </Button>
    </section>
  );
}

export function proposalLine(accepted: StrategyAcceptedView, summary: string) {
  return strategy.calc.accept.compare.proposal(
    summary,
    differenceText(accepted.compare),
    accepted.compare?.same === true,
  );
}

// The question asked in the same place before something is lost. The focus goes
// to «Cancelar»; Escape cancels too.
export function ConfirmCard({
  kind,
  summary,
  saved,
  cancelRef,
  cancel,
  confirm,
  pending,
}: {
  kind: "replace" | "remove";
  summary: string;
  // the file holds the plan: «Descartar cambios» brings it back
  saved: boolean;
  cancelRef: Ref<HTMLButtonElement>;
  cancel: () => void;
  confirm: () => void;
  pending: boolean;
}) {
  const id = useId();
  const c = t.confirm;
  const replace = kind === "replace";
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
        <strong id={`${id}-title`}>
          {replace ? c.replaceTitle : c.removeTitle}
        </strong>
        <p id={`${id}-detail`}>
          {replace
            ? c.replaceDetail(summary, saved)
            : c.removeDetail(summary, saved)}
        </p>
      </div>
      <div className="strategy-actions">
        <Button ref={cancelRef} size="sm" variant="ghost" onClick={cancel}>
          {c.cancel}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={confirm}
        >
          <Icon name="check" />
          {replace ? c.replace : c.remove}
        </Button>
      </div>
    </fieldset>
  );
}

// The accepted plan of data that changed: which ones, what the plan can still
// do and the way out. With no lap from the host, the cause is all that is said.
export function StaleNotice({
  accepted,
  calculate,
  review,
  canCalculate,
  pending,
}: {
  accepted: StrategyAcceptedView;
  calculate: () => void;
  review: () => void;
  canCalculate: boolean;
  pending: boolean;
}) {
  const id = useId();
  const s = t.stale;
  const unreachable = accepted.state === "staleUnreachable";
  const shown = accepted.changes.slice(0, shownChanges);
  const rest = accepted.changes.length - shown.length;
  const title = unreachable ? t.unreachable.title : s.title;
  const body = (
    <>
      <span className="strategy-icon">
        <Icon name={unreachable ? "alert" : "warn"} />
      </span>
      <div>
        <strong id={`${id}-title`}>{title}</strong>
        {shown.length > 0 && (
          <ul className="strategy-changes" aria-label={s.changes}>
            {shown.map((change) => (
              <li key={change.field}>{changeLine(change)}</li>
            ))}
          </ul>
        )}
        {rest > 0 && <p>{s.more(rest)}</p>}
        <p>
          {unreachable && accepted.unreachable
            ? unreachableText(accepted.unreachable)
            : s.reaches}
        </p>
        <div className="strategy-actions">
          <Button
            size="sm"
            variant="primary"
            disabled={!canCalculate || pending}
            onClick={calculate}
          >
            <Icon name="refresh" />
            {t.calculateAgain}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={review}>
            <Icon name="pencil" />
            {t.review}
          </Button>
        </div>
      </div>
    </>
  );
  return unreachable ? (
    <div
      className="strategy-notice strategy-stale"
      data-tone="error"
      role="alert"
      aria-labelledby={`${id}-title`}
    >
      {body}
    </div>
  ) : (
    <section
      className="strategy-notice strategy-stale"
      data-tone="warn"
      aria-labelledby={`${id}-title`}
    >
      {body}
    </section>
  );
}

// «⋯» of the accepted plan: the only thing it has is to remove it.
export function AcceptedMenu({
  remove,
  keeps,
  triggerRef,
  skipFocus,
  disabled,
}: {
  remove: () => void;
  // the proposal stays on screen when the plan is removed
  keeps: boolean;
  triggerRef: Ref<HTMLButtonElement>;
  // the question that opens takes the focus; the menu must not give it back
  skipFocus: { current: boolean };
  disabled: boolean;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        ref={triggerRef}
        disabled={disabled}
        aria-label={t.menu}
        className="v-button v-button--neutral v-button--md"
      >
        {strategy.symbols.more}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="v-positioner" align="end" sideOffset={6}>
          <Menu.Popup
            className="v-popup"
            aria-label={t.menu}
            finalFocus={() => !skipFocus.current}
          >
            <Menu.Item className="v-option strategy-menu-item" onClick={remove}>
              <strong>{t.remove}</strong>
              <small>{keeps ? t.removeKeeps : t.removeAlone}</small>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
