import { Menu } from "@base-ui/react/menu";
import { useEffect, useRef, useState } from "react";
import type { HostError } from "../../../contract/generated/contract";
import type {
  StrategyComputeForm,
  StrategyEventSummary,
  StrategyField,
  StrategyPlanState,
  StrategyPlanView,
  StrategyView,
} from "../../../contract/generated/strategy";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { strategy as t } from "../../i18n/strategy";
import { amounts } from "../../i18n/strategyAmounts";
import { planAnnouncement } from "../../screens/strategy/planText";
import {
  amountText,
  limitLines,
  tyreLines,
} from "../../screens/strategy/stopAmounts";
import {
  strategyAccept,
  strategyShowAccepted,
  strategyUnaccept,
} from "../../screens/strategy/strategyAccept";
import {
  strategyCancel,
  strategyCompute,
} from "../../screens/strategy/strategyCompute";
import { strategyConfirm } from "../../screens/strategy/strategyConfirm";
import { strategyCreate } from "../../screens/strategy/strategyCreate";
import {
  strategyClearStopServices,
  strategyMoveBoundary,
  strategyMoveStop,
  strategyRecalculate,
  strategyResetEdit,
  strategySetStopService,
} from "../../screens/strategy/strategyEdit";
import {
  type ExportState,
  exportIdle,
  exportTarget,
} from "../../screens/strategy/strategyExport";
import {
  fileActions,
  type StrategyClient,
  useStrategy,
} from "../../screens/strategy/useStrategy";
import { Button } from "../Button";
import { Select } from "../Forms";
import { PlanTab } from "./PlanTab";
import { type Draft, RaceTab, raceLength } from "./RaceTab";
import { Wizard } from "./Wizard";

const tabs = [
  { id: "race", etiqueta: t.race, visible: true },
  { id: "plan", etiqueta: t.plan, visible: true },
];

const editingTabs = [tabs[0], { ...tabs[1], ariaDisabled: true }];

// how long «Copiado» stays beside the button
const copiedMs = 4000;

type Selection = { eventId: string; strategyId: string };
type Notice = "importedLegacy" | "recovered";

export function StrategyScreen({ client }: { client: StrategyClient }) {
  const {
    view,
    error,
    pending,
    pollFailed,
    retryPoll,
    whenIdle,
    peek,
    act,
    exportPlan,
    clearError,
  } = useStrategy(client);
  const [screen, setScreen] = useState<"collection" | "wizard" | "race">(
    "collection",
  );
  const [tab, setTab] = useState("race");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  // each refusal of the host remounts the editor, so it starts marked again
  const [refusals, setRefusals] = useState(0);
  // the button that sent us to Carrera is gone: its title takes the focus
  const [focusRaceTitle, setFocusRaceTitle] = useState(false);
  const raceTitle = useRef<HTMLHeadingElement>(null);
  // see `PlanActions.keptFixed`
  const keptFixed = useRef<string | null>(null);
  const [confirmConflict, setConfirmConflict] = useState<HostError>();
  // the conflict answered to a move, a recalculation or a reset of the plan
  const [planConflict, setPlanConflict] = useState<HostError>();
  const [announcement, setAnnouncement] = useState("");
  // the plan was just accepted for the first time: «Deshacer» is offered until saved
  const [firstAccept, setFirstAccept] = useState(false);
  // what came of the last try to copy or save the plan
  const [exported, setExported] = useState<ExportState>(exportIdle);
  const [dismissed, setDismissed] = useState<Notice>();
  const [blocked, setBlocked] = useState<Selection>();
  const active = view?.events.find(({ id }) => id === view.activeEventId);
  const variant = active?.strategies.find(
    ({ id }) => id === view?.activeStrategyId,
  );
  const actions = view && fileActions(view, editing);
  const showRace = screen === "race" && !!active && !!variant;
  const conflict = error?.kind === "strategyConflict";
  const editConflict = conflict && error === confirmConflict;
  const adjustConflict = conflict && error === planConflict;
  const hasForm = !!view?.form;
  // The form can vanish under the editor (another view, another session): the
  // draft goes with it, and nothing stays locked.
  useEffect(() => {
    if (editing && !hasForm) {
      setEditing(false);
      clearError();
    }
  }, [editing, hasForm, clearError]);

  // The calculation this screen started, with the form it sent: if the
  // calculation refuses an input, the editor reopens with that form.
  const launched = useRef<{
    computeId: number | null;
    form: StrategyComputeForm;
  }>(undefined);
  const lastPlanState = useRef<StrategyPlanState>(undefined);
  const lastHadResult = useRef(false);
  const plan = view?.plan;
  // The single status line says what happened to the plan since the last view.
  useEffect(() => {
    if (!plan) return;
    const said = planAnnouncement(
      plan,
      lastPlanState.current,
      lastHadResult.current,
    );
    lastPlanState.current = plan.state;
    lastHadResult.current = plan.result !== null;
    if (said) setAnnouncement(said);
  }, [plan]);
  // The notice of an export is about the plan that was exported: it goes when the
  // plan on view is another (a new calculation, an acceptance, the host's view) and
  // when it is the plan of another strategy or file or the collection is on view: the
  // target of an accepted plan is always the same words. The window to save is still
  // open, so that one stays until it answers.
  const target = plan ? exportTarget(plan) : null;
  const targetKey = JSON.stringify([
    target,
    view?.activeEventId,
    view?.activeStrategyId,
    view?.file?.name,
    showRace,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the target changes
  useEffect(() => {
    setExported((now) => (now.status === "waiting" ? now : exportIdle));
  }, [targetKey]);
  // «Copiado» is a flash; the notices of a file stay until they are put away
  useEffect(() => {
    if (exported.status !== "copied") return;
    const timer = setTimeout(() => setExported(exportIdle), copiedMs);
    return () => clearTimeout(timer);
  }, [exported]);
  useEffect(() => {
    const sent = launched.current;
    if (!sent || !plan || plan.computeId !== sent.computeId) return;
    if (plan.state === "calculating") return;
    launched.current = undefined;
    // someone already editing keeps their own draft
    if (!editing && plan.state === "error" && plan.errorField) {
      setDraft({ form: sent.form, field: plan.errorField });
      setEditing(true);
      setTab("race");
    }
  }, [plan, editing]);

  useEffect(() => {
    if (focusRaceTitle && tab === "race" && raceTitle.current) {
      raceTitle.current.focus();
      setFocusRaceTitle(false);
    }
  }, [focusRaceTitle, tab]);

  function closeEditor() {
    clearError();
    setDraft(undefined);
    setEditing(false);
  }
  // To the Carrera tab; with a field, the editor opens with that field marked.
  function review(field: StrategyField | null) {
    setTab("race");
    if (field && view?.form) {
      setAnnouncement("");
      setDraft({ form: view.form, field });
      setEditing(true);
    } else setFocusRaceTitle(true);
  }
  // The host refused the data of a confirmation. With a field, the editor opens
  // (or starts again) with what was written and that field marked; with none, it
  // stays as it is and the notice says the calculation did not accept the data.
  function refuse(
    form: StrategyComputeForm,
    error: { kind: string; field?: StrategyField | null },
  ) {
    if (error.kind !== "strategyInvalidInput" || !error.field) return;
    clearError();
    setDraft({ form, field: error.field });
    setRefusals((count) => count + 1);
    setEditing(true);
    setTab("race");
  }
  // Starts the calculation with this form. Returns whether the host took it;
  // when it did, the screen moves to the plan. On a conflict the host's view
  // replaces ours and the editor, if open, keeps what the user wrote.
  // With `confirmFirst` (the form comes from the editor) the data are confirmed
  // before the calculation starts: the host drops what a cancelled calculation
  // was given, so cancelling must not be able to lose what was written.
  async function calculate(form: StrategyComputeForm, confirmFirst = false) {
    if (!active || !variant) return false;
    setAnnouncement("");
    if (confirmFirst) {
      const confirmed = await strategyConfirm(act, active.id, variant.id, form);
      if (!confirmed) return false;
      if (!("value" in confirmed)) {
        if (confirmed.error.kind === "strategyConflict")
          setConfirmConflict(confirmed.error);
        else refuse(form, confirmed.error);
        return false;
      }
      // confirmed: nothing written is at risk any more
      setDraft(undefined);
      setEditing(false);
    }
    const result = await strategyCompute(act, active.id, variant.id, form);
    if (!result) return false;
    if ("value" in result) {
      launched.current = { computeId: result.value.plan.computeId, form };
      setDraft(undefined);
      setEditing(false);
      setTab("plan");
      return true;
    }
    if (result.error.kind === "strategyConflict")
      setConfirmConflict(result.error);
    return false;
  }

  // Returns whether the data were confirmed. On a conflict the host's view
  // replaces ours but the editor stays open with what the user wrote.
  async function confirm(form: StrategyComputeForm) {
    if (!active || !variant) return false;
    setAnnouncement("");
    const result = await strategyConfirm(act, active.id, variant.id, form);
    if (!result) return false;
    if ("value" in result) {
      setDraft(undefined);
      setEditing(false);
      setAnnouncement(t.confirmed);
      return true;
    }
    if (result.error.kind === "strategyConflict")
      setConfirmConflict(result.error);
    else refuse(form, result.error);
    return false;
  }

  // The plan moves in memory only: the document, its state in the file bar and
  // the revision are the host's and do not change with these.
  function announceMove(next: StrategyPlanView, stop: number) {
    const lap = next.edit?.stops[stop]?.lap;
    if (next.state === "edited" && lap !== undefined)
      setAnnouncement(t.calc.announce.moved(stop + 1, lap));
  }
  // A conflict on the plan is not one of the file: nothing was written, and the
  // host's plan is shown.
  type Answer = Awaited<ReturnType<typeof act>>;
  function planAnswered(result: Answer) {
    if (result && "error" in result && result.error.kind === "strategyConflict")
      setPlanConflict(result.error);
  }
  // Each resolves to `undefined` when nothing was sent, else whether the host took it.
  async function moveBoundary(index: number, lap: number) {
    if (!view) return undefined;
    const result = await strategyMoveBoundary(act, view.plan, index, lap);
    if (!result) return undefined;
    planAnswered(result);
    if ("value" in result) announceMove(result.value.plan, index);
    return "value" in result;
  }
  async function moveStop(index: number, delta: -1 | 1) {
    if (!view) return undefined;
    const result = await strategyMoveStop(act, view.plan, index, delta);
    if (!result) return undefined;
    planAnswered(result);
    if ("value" in result) announceMove(result.value.plan, index);
    return "value" in result;
  }
  // Fixing what a stop loads. The host validates at once: a refusal is shown by
  // the box it belongs to (`role="alert"`), changes nothing and says nothing here.
  async function setStopService(
    index: number,
    fuelLiters: number | null,
    vePercent: number | null,
    changeTyres: boolean | null,
  ) {
    if (!view) return undefined;
    setAnnouncement("");
    const result = await strategySetStopService(
      act,
      view.plan,
      index,
      fuelLiters,
      vePercent,
      changeTyres,
    );
    if (!result) return undefined;
    planAnswered(result);
    if ("value" in result) {
      // every amount of the stop that changed (going back to automatic can be both)
      const before = view.plan.edit?.stops[index]?.fixed;
      const limits = result.value.plan.edit?.stops[index]?.limits;
      const said = (["fuel", "ve"] as const).flatMap((amount) => {
        const was = amount === "fuel" ? before?.fuelLiters : before?.vePercent;
        const value = amount === "fuel" ? fuelLiters : vePercent;
        if (was === value) return [];
        if (value === null)
          return [amounts.announce.automatic(index + 1, amount)];
        // what the host now says of the amount: it may leave no plan
        const issue =
          limits?.kind === "exact"
            ? limitLines(amount, limits[amount], value).issue
            : null;
        return [
          amounts.announce.fixed(
            index + 1,
            amount,
            `${amountText(value)} ${amounts.unit[amount]}`,
          ),
          ...(issue ? [issue] : []),
        ];
      });
      // the tyres: what was fixed, and what the host says of them if they do not last
      if (before?.changeTyres !== changeTyres) {
        const { edit } = result.value.plan;
        const issue = edit ? tyreLines(edit, index)?.issue : null;
        said.push(
          changeTyres === false
            ? amounts.announce.tyresKeep(index + 1)
            : amounts.announce.tyresChange(index + 1),
        );
        if (issue) said.push(issue);
      }
      if (said.length > 0) setAnnouncement(said.join(" "));
    }
    return result;
  }
  async function clearStopServices() {
    if (!view) return false;
    setAnnouncement("");
    const result = await strategyClearStopServices(act, view.plan);
    planAnswered(result);
    const taken = !!result && "value" in result;
    if (taken) setAnnouncement(amounts.announce.cleared);
    return taken;
  }
  // Accepting, removing and showing the accepted plan act on the plan on view,
  // so a conflict is a conflict of the plan, not of the file.
  async function acceptPlan() {
    if (!view) return;
    setAnnouncement("");
    // Accepting the same stops again (the data changed and the plan stayed) brings
    // the plan up to date: nothing is replaced. «Deshacer» only follows the first.
    const had = view.plan.accepted;
    const replaces = had !== null && had.compare?.same !== true;
    const result = await strategyAccept(act, view.plan);
    if (!result) return;
    planAnswered(result);
    if ("value" in result) {
      setFirstAccept(had === null);
      setAnnouncement(
        replaces ? t.calc.announce.replaced : t.calc.announce.accepted,
      );
    }
  }
  async function removeAccepted() {
    if (!view) return;
    setAnnouncement("");
    const result = await strategyUnaccept(act);
    planAnswered(result);
    if (result && "value" in result) {
      setFirstAccept(false);
      setAnnouncement(t.calc.announce.removed);
    }
  }
  async function showAccepted() {
    if (!view) return;
    setAnnouncement("");
    const result = await strategyShowAccepted(act);
    planAnswered(result);
    if (result && "value" in result) setAnnouncement(t.calc.announce.showing);
  }
  // Copies the plan as text, or saves it as a spreadsheet. What the file is called
  // and where it goes is for the main process and the host; here only the name comes
  // back. A conflict is one of the plan: the host's view is shown.
  async function exportAs(via: "text" | "file") {
    if (!view || !target) return;
    setAnnouncement("");
    setExported(via === "file" ? { status: "waiting" } : exportIdle);
    if (via === "file") setAnnouncement(t.calc.export.announce.waiting);
    const result = await exportPlan(
      via === "file" ? "strategy.exportFile" : "strategy.export",
      target,
    );
    // nothing was sent (another action was running): back to what it was. The
    // buttons are not offered while an action runs, so the screen cannot get here;
    // were it to, it would also clear the «waiting» of an export still open.
    if (!result) return setExported(exportIdle);
    const say = t.calc.export.announce;
    if ("copied" in result) {
      setExported({ status: "copied" });
      setAnnouncement(say.copied);
    } else if ("saved" in result) {
      setExported({ status: "saved", name: result.saved });
      setAnnouncement(say.saved(result.saved));
    } else if ("cancelled" in result) {
      setExported(exportIdle);
      setAnnouncement(say.cancelled);
    } else if (result.error.kind === "strategyConflict") {
      setExported(exportIdle);
      setPlanConflict(result.error);
    } else if (result.error.kind === "strategyPickExpired") {
      setExported({ status: "expired" });
      setAnnouncement(say.expired);
    } else setExported({ status: "failed", kind: result.error.kind, via });
  }
  async function resetEdit() {
    if (!view) return;
    setAnnouncement("");
    const result = await strategyResetEdit(act, view.plan);
    planAnswered(result);
    if (result && "value" in result) setAnnouncement(t.calc.announce.reset);
  }
  // One recalculation at a time. It waits for the action that is running (a lap
  // that was just typed), and then asks for the plan the host has by then.
  const recalculating = useRef(false);
  async function recalculate() {
    if (!view || recalculating.current) return;
    recalculating.current = true;
    setAnnouncement("");
    try {
      await whenIdle();
      // only a plan that is still adjusted can be recalculated: the host would
      // refuse the rest, and asking would wipe the error that explains why
      const plan = peek()?.plan;
      if (plan?.state === "edited")
        planAnswered(await strategyRecalculate(act, plan));
    } finally {
      recalculating.current = false;
    }
  }

  async function save() {
    setAnnouncement("");
    const result = await act({ method: "strategy.save" });
    if (result && "value" in result) {
      setBlocked(undefined);
      setAnnouncement(t.saved);
    }
    return result;
  }
  useEffect(() => {
    function saveShortcut(event: KeyboardEvent) {
      if (
        !event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "s"
      )
        return;
      event.preventDefault();
      if (actions?.save && !pending) void save();
    }
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  });

  async function pick(mode: "open" | "saveAs") {
    setAnnouncement("");
    const result = await act({ method: "strategy.pickFile", mode });
    if (!result || !("value" in result)) return;
    if (
      mode === "open" &&
      (result.value.revision !== view?.revision ||
        result.value.file?.name !== view?.file?.name)
    ) {
      setDismissed(undefined);
      setBlocked(undefined);
      setScreen("collection");
    }
    if (
      mode === "saveAs" &&
      (result.value.file?.name !== view?.file?.name ||
        (view?.dirty && !result.value.dirty))
    )
      setAnnouncement(t.saved);
  }
  function enterRace() {
    setBlocked(undefined);
    setTab("race");
    setScreen("race");
  }
  async function select(next: Selection, from: StrategyView) {
    if (
      next.eventId === from.activeEventId &&
      next.strategyId === from.activeStrategyId
    ) {
      enterRace();
    } else if (from.dirty) {
      setBlocked(next);
    } else {
      const result = await act({ method: "strategy.select", ...next });
      if (result && "value" in result) enterRace();
    }
  }
  function selectEvent(event: StrategyEventSummary) {
    const selected = event.id === active?.id ? variant : event.strategies[0];
    if (view && selected)
      void select({ eventId: event.id, strategyId: selected.id }, view);
  }
  async function discard() {
    setAnnouncement("");
    const result = await act({ method: "strategy.discard" });
    if (result && "value" in result) setBlocked(undefined);
    return result;
  }
  async function finishSwitch(next: Selection, operation: "save" | "discard") {
    const result = await (operation === "save" ? save() : discard());
    if (result && "value" in result) await select(next, result.value);
  }
  async function create(form: StrategyComputeForm) {
    setAnnouncement("");
    const result = await strategyCreate(act, form);
    if (result && "value" in result) {
      setAnnouncement(t.created);
      enterRace();
    }
  }

  const blockedName =
    blocked && view?.events.find(({ id }) => id === blocked.eventId)?.name;
  const dirtyNotice = blocked && blockedName && active && view?.dirty && (
    <div className="strategy-notice" data-tone="warn" role="alert">
      <strong>{t.dirtySwitch}</strong>
      <p>{t.dirtyRace(active.name, blockedName)}</p>
      <div className="strategy-actions">
        <Button
          size="sm"
          disabled={!actions?.save || pending}
          variant="primary"
          onClick={() => void finishSwitch(blocked, "save")}
        >
          {t.saveAndOpen}
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => void finishSwitch(blocked, "discard")}
        >
          {t.discardAndOpen}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setBlocked(undefined)}>
          {t.stay(active.name)}
        </Button>
      </div>
    </div>
  );
  // In Carrera there are no Recalcular or Restablecer: it says where they are.
  // a refused amount is the alert of its own box, not one of the file
  const fileError =
    error &&
    !conflict &&
    error.kind !== "strategyInvalidStopService" &&
    (error.kind === "strategyEditPending" && showRace && tab === "race"
      ? t.calc.adjust.pendingFromRace
      : error.kind in t.errors
        ? t.errors[error.kind as keyof typeof t.errors]
        : t.errors.other);
  return (
    <>
      <SectionChrome
        title={t.title}
        rail={false}
        tabs={showRace ? (editing ? editingTabs : tabs) : undefined}
        activeTab={tab}
        onTabChange={setTab}
      />
      <div className="strategy-screen">
        {view && actions && (
          <div className="strategy-filebar">
            <span className="strategy-file-state" data-state={actions.status}>
              <strong>{t.file[actions.status]}</strong>
              {view.file && (
                <span className="strategy-filename" title={view.file.name}>
                  {view.file.name}
                </span>
              )}
            </span>
            <Button
              size="sm"
              aria-keyshortcuts="Control+S"
              disabled={pending || !actions.save}
              onClick={() => void save()}
            >
              {t.save}
            </Button>
            <Menu.Root modal={false}>
              <Menu.Trigger
                disabled={editing || pending}
                aria-label={t.more}
                className="v-button v-button--neutral v-button--sm"
              >
                {t.symbols.more}
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  className="v-positioner"
                  align="end"
                  sideOffset={6}
                >
                  <Menu.Popup className="v-popup" aria-label={t.fileActions}>
                    <Menu.Item
                      className="v-option"
                      disabled={pending || !actions.saveAs}
                      onClick={() => void pick("saveAs")}
                    >
                      {t.saveAs}
                    </Menu.Item>
                    <Menu.Item
                      className="v-option"
                      disabled={pending || !actions.open}
                      onClick={() => void pick("open")}
                    >
                      {t.open}
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item
                      className="v-option"
                      disabled={pending || !actions.discard}
                      onClick={() => void discard()}
                    >
                      {t.discard}
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        )}
        <div
          role="status"
          className={
            conflict && !editConflict ? "strategy-notice" : "v-sr-only"
          }
          data-tone="error"
        >
          {conflict && !editConflict
            ? adjustConflict
              ? t.calc.adjust.conflict
              : t.conflict
            : announcement}
        </div>
        {editConflict && (
          <div className="strategy-notice" data-tone="error" role="alert">
            {editing ? t.confirmConflict : t.calc.changedOutside}
          </div>
        )}
        {fileError && (
          <div className="strategy-notice" data-tone="error" role="alert">
            {fileError}
          </div>
        )}
        {view && screen === "wizard" && view.state !== "protected" ? (
          <Wizard
            pending={pending}
            close={() => setScreen("collection")}
            create={(form) => void create(form)}
          />
        ) : showRace && active && variant && view ? (
          <div className="strategy-race" data-editing={editing}>
            <div className="strategy-race-head">
              <Button
                size="sm"
                variant="ghost"
                disabled={editing || pending}
                onClick={() => setScreen("collection")}
              >
                {t.returnToCollection}
              </Button>
              <div>
                <h2 ref={raceTitle} tabIndex={-1}>
                  {active.name}
                </h2>
                <p>
                  {[
                    active.class,
                    active.track,
                    view.form && raceLength(view.form),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {active.strategies.length > 1 ? (
                <Select
                  label={t.variant}
                  value={variant.id}
                  options={active.strategies.map(({ id, name }) => ({
                    label: name,
                    value: id,
                  }))}
                  pending={pending}
                  disabled={editing}
                  onChange={(strategyId) =>
                    void select({ eventId: active.id, strategyId }, view)
                  }
                />
              ) : (
                <span className="strategy-chip">{variant.name}</span>
              )}
            </div>
            {dirtyNotice}
            <SectionPanel activeTab={tab}>
              {tab === "race" && (
                <RaceTab
                  // the draft belongs to one strategy: another one starts clean
                  key={`${active.id}/${variant.id}/${refusals}`}
                  form={view.form}
                  editing={editing}
                  draft={draft}
                  pending={pending}
                  plan={view.plan}
                  accept={acceptPlan}
                  viewPlan={() => setTab("plan")}
                  edit={() => {
                    setBlocked(undefined);
                    clearError();
                    setAnnouncement("");
                    setDraft(undefined);
                    setEditing(true);
                  }}
                  cancel={closeEditor}
                  clearError={clearError}
                  confirm={confirm}
                  calculate={(form) => calculate(form, true)}
                />
              )}
              {tab === "plan" && (
                <PlanTab
                  key={`${active.id}/${variant.id}`}
                  plan={view.plan}
                  form={view.form}
                  name={variant.name}
                  actions={{
                    canCalculate: !!view.form,
                    pending,
                    calculate: () => view.form && void calculate(view.form),
                    cancel: () => void strategyCancel(act, view.plan),
                    unreadable: pollFailed,
                    readAgain: retryPoll,
                    review,
                    keptFixed,
                    strategyKey: `${active.id}/${variant.id}`,
                    edit: {
                      moveBoundary,
                      moveStop,
                      recalculate: () => void recalculate(),
                      reset: () => void resetEdit(),
                      setStopService,
                      clearStopServices,
                    },
                    acceptance: {
                      accept: () => void acceptPlan(),
                      showAccepted: () => void showAccepted(),
                      unaccept: () => void removeAccepted(),
                      fresh: firstAccept && view.plan.accepted?.saved === false,
                    },
                    export: {
                      available: target !== null,
                      proposal: target?.kind === "proposal",
                      state: exported,
                      pending,
                      copy: () => void exportAs("text"),
                      save: () => void exportAs("file"),
                      retry: () =>
                        void exportAs(
                          exported.status === "failed" ? exported.via : "file",
                        ),
                      dismiss: () => setExported(exportIdle),
                    },
                  }}
                />
              )}
            </SectionPanel>
          </div>
        ) : view ? (
          <div className="strategy-collection">
            <header>
              <div className="strategy-kicker">{t.title}</div>
              <h2>{t.collection}</h2>
              <p>{t.description}</p>
            </header>
            {view.state === "protected" && (
              <div className="strategy-notice" data-tone="warn" role="alert">
                <strong>{t.protected}</strong>
                <p>{t.protectedDetail}</p>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => void pick("open")}
                >
                  {t.openOther}
                </Button>
              </div>
            )}
            {(view.state === "importedLegacy" || view.state === "recovered") &&
              dismissed !== view.state && (
                <div
                  className="strategy-notice"
                  data-tone={view.state === "recovered" ? "warn" : "info"}
                  role={view.state === "recovered" ? "alert" : undefined}
                >
                  <strong>
                    {view.state === "recovered" ? t.recovered : t.imported}
                  </strong>
                  <p>
                    {view.state === "recovered"
                      ? t.recoveredDetail
                      : t.importedDetail}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDismissed(view.state as Notice)}
                  >
                    {t.understood}
                  </Button>
                </div>
              )}
            {dirtyNotice}
            {view.state !== "protected" &&
              (view.events.length ? (
                <>
                  <div className="strategy-hero">
                    {active && variant && (
                      <section className="strategy-card strategy-continue">
                        <div className="strategy-kicker">{t.continue}</div>
                        <h3>{active.name}</h3>
                        <p>
                          {active.class}
                          {" · "}
                          {active.track}
                        </p>
                        <div className="strategy-actions">
                          <span className="strategy-chip">
                            {t.variantName(variant.name)}
                          </span>
                          <Button variant="primary" onClick={enterRace}>
                            {t.continue}
                          </Button>
                        </div>
                      </section>
                    )}
                    <section className="strategy-card">
                      <span className="strategy-avatar" aria-hidden="true">
                        {t.symbols.add}
                      </span>
                      <h3>{t.new}</h3>
                      <p>{t.newDetail}</p>
                      <Button
                        size="sm"
                        disabled={pending || view.dirty}
                        onClick={() => setScreen("wizard")}
                      >
                        {t.start}
                      </Button>
                    </section>
                  </div>
                  <section className="strategy-saved">
                    <div className="strategy-saved-head">
                      <h3>{t.savedRaces}</h3>
                      <span>{view.events.length}</span>
                      <p>{t.onDevice}</p>
                    </div>
                    <ul>
                      {view.events.map((event) => (
                        <li key={event.id}>
                          <button
                            type="button"
                            className="strategy-row"
                            data-active={event.id === active?.id}
                            disabled={pending || !event.strategies.length}
                            onClick={() => selectEvent(event)}
                          >
                            <span
                              className="strategy-avatar"
                              aria-hidden="true"
                            >
                              {t.symbols.flag}
                            </span>
                            <span className="strategy-row-title">
                              <strong>{event.name}</strong>
                              <small>
                                {event.class}
                                {" · "}
                                {event.track}
                              </small>
                            </span>
                            <span>
                              {t.counts(event.drivers, event.strategies.length)}
                            </span>
                            <span className="strategy-row-data">
                              {event.acceptedPlan !== "none" && (
                                <span
                                  className="strategy-state"
                                  data-tone={
                                    event.acceptedPlan === "stale"
                                      ? "warn"
                                      : "ok"
                                  }
                                >
                                  {event.acceptedPlan === "stale"
                                    ? t.calc.accept.tags.stale
                                    : t.calc.accept.rowAccepted}
                                </span>
                              )}
                            </span>
                            <span>
                              {event.id === active?.id && (
                                <span className="strategy-chip">
                                  {t.opened}
                                </span>
                              )}
                            </span>
                            <span aria-hidden="true">{t.symbols.next}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              ) : (
                <div className="strategy-empty">
                  <span className="strategy-avatar" aria-hidden="true">
                    {t.symbols.flag}
                  </span>
                  <h3>{t.empty}</h3>
                  <p>{t.emptyDetail}</p>
                  <div className="strategy-actions">
                    <Button
                      variant="primary"
                      disabled={pending}
                      onClick={() => setScreen("wizard")}
                    >
                      {t.new}
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() => void pick("open")}
                    >
                      {t.open}
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          !error && <p>{t.loading}</p>
        )}
      </div>
    </>
  );
}
