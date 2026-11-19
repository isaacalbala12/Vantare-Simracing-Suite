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
import { planAnnouncement } from "../../screens/strategy/planText";
import {
  strategyCancel,
  strategyCompute,
} from "../../screens/strategy/strategyCompute";
import { strategyConfirm } from "../../screens/strategy/strategyConfirm";
import { strategyCreate } from "../../screens/strategy/strategyCreate";
import {
  strategyMoveBoundary,
  strategyMoveStop,
  strategyRecalculate,
  strategyResetEdit,
} from "../../screens/strategy/strategyEdit";
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

type Selection = { eventId: string; strategyId: string };
type Notice = "importedLegacy" | "recovered";

export function StrategyScreen({ client }: { client: StrategyClient }) {
  const {
    view,
    error,
    pending,
    pollFailed,
    retryPoll,
    recalculated,
    whenIdle,
    peek,
    act,
    clearError,
  } = useStrategy(client);
  const [screen, setScreen] = useState<"collection" | "wizard" | "race">(
    "collection",
  );
  const [tab, setTab] = useState("race");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  // the button that sent us to Carrera is gone: its title takes the focus
  const [focusRaceTitle, setFocusRaceTitle] = useState(false);
  const raceTitle = useRef<HTMLHeadingElement>(null);
  const [confirmConflict, setConfirmConflict] = useState<HostError>();
  // the conflict answered to a move, a recalculation or a reset of the plan
  const [planConflict, setPlanConflict] = useState<HostError>();
  const [announcement, setAnnouncement] = useState("");
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
  const fileError =
    error &&
    !conflict &&
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
                  key={`${active.id}/${variant.id}`}
                  form={view.form}
                  editing={editing}
                  draft={draft}
                  pending={pending}
                  plan={view.plan}
                  trial={recalculated}
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
                  trial={recalculated}
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
                    edit: {
                      moveBoundary,
                      moveStop,
                      recalculate: () => void recalculate(),
                      reset: () => void resetEdit(),
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
                            {/* Reserved for hasInputs once E4-datos lands. */}
                            <span
                              className="strategy-row-data"
                              aria-hidden="true"
                            />
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
