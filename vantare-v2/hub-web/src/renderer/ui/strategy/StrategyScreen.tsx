import { Menu } from "@base-ui/react/menu";
import { useEffect, useState } from "react";
import type { HostError } from "../../../contract/generated/contract";
import type {
  StrategyComputeForm,
  StrategyEventSummary,
  StrategyView,
} from "../../../contract/generated/strategy";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { strategy as t } from "../../i18n/strategy";
import { strategyConfirm } from "../../screens/strategy/strategyConfirm";
import { strategyCreate } from "../../screens/strategy/strategyCreate";
import {
  fileActions,
  type StrategyClient,
  useStrategy,
} from "../../screens/strategy/useStrategy";
import { Button } from "../Button";
import { Select } from "../Forms";
import { RaceTab, raceLength } from "./RaceTab";
import { Wizard } from "./Wizard";

const tabs = [
  { id: "race", etiqueta: t.race, visible: true },
  { id: "plan", etiqueta: t.plan, visible: true },
];

const editingTabs = [tabs[0], { ...tabs[1], ariaDisabled: true }];

type Selection = { eventId: string; strategyId: string };
type Notice = "importedLegacy" | "recovered";

export function StrategyScreen({ client }: { client: StrategyClient }) {
  const { view, error, pending, act, clearError } = useStrategy(client);
  const [screen, setScreen] = useState<"collection" | "wizard" | "race">(
    "collection",
  );
  const [tab, setTab] = useState("race");
  const [editing, setEditing] = useState(false);
  const [confirmConflict, setConfirmConflict] = useState<HostError>();
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
  const hasForm = !!view?.form;
  // The form can vanish under the editor (another view, another session): the
  // draft goes with it, and nothing stays locked.
  useEffect(() => {
    if (editing && !hasForm) {
      setEditing(false);
      clearError();
    }
  }, [editing, hasForm, clearError]);

  // Returns whether the data were confirmed. On a conflict the host's view
  // replaces ours but the editor stays open with what the user wrote.
  async function confirm(form: StrategyComputeForm) {
    if (!active || !variant) return false;
    setAnnouncement("");
    const result = await strategyConfirm(act, active.id, variant.id, form);
    if (!result) return false;
    if ("value" in result) {
      setEditing(false);
      setAnnouncement(t.confirmed);
      return true;
    }
    if (result.error.kind === "strategyConflict")
      setConfirmConflict(result.error);
    return false;
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
  const fileError =
    error &&
    !conflict &&
    (error.kind in t.errors
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
          {conflict && !editConflict ? t.conflict : announcement}
        </div>
        {editConflict && (
          <div className="strategy-notice" data-tone="error" role="alert">
            {t.confirmConflict}
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
                <h2>{active.name}</h2>
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
                  form={view.form}
                  editing={editing}
                  pending={pending}
                  edit={() => {
                    setBlocked(undefined);
                    clearError();
                    setAnnouncement("");
                    setEditing(true);
                  }}
                  cancel={() => {
                    clearError();
                    setEditing(false);
                  }}
                  clearError={clearError}
                  confirm={confirm}
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
