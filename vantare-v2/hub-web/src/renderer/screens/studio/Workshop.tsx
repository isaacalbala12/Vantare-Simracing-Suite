import { Select } from "@base-ui/react/select";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import type {
  CoreStatus,
  WidgetKind,
} from "../../../contract/generated/contract";
import type { WorkshopReply } from "../../../contract/generated/workshop";
import { useHost } from "../../app/Host";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { useUi } from "../../app/UiState";
import { Icon } from "../../assets/icons/Icon";
import { homeText } from "../../i18n/home";
import { workshopText as t } from "../../i18n/workshop";
import { Button } from "../../ui/Button";
import { previewAuthority } from "../../ui/studio/previewPhoto";
import { usePreviewPhoto } from "../../ui/studio/usePreviewPhoto";

const widgetGroups: { title: string; kinds: WidgetKind[] }[] = [
  {
    title: "Carrera",
    kinds: [
      "standings",
      "relative",
      "multiclass-relative",
      "broadcast-tower",
      "head-to-head",
      "fastest-lap",
      "session-alerts",
      "racing-flags",
    ],
  },
  {
    title: "Pilotaje",
    kinds: [
      "delta",
      "delta-trace",
      "pedals",
      "pedals-telemetry",
      "input-telemetry",
      "radar",
    ],
  },
  {
    title: "Coche",
    kinds: ["car-damage-visual", "car-damage-numbers", "fuel-strategy"],
  },
  { title: "Pista", kinds: ["track-map", "track-weather"] },
];

function Picker({
  label,
  selected,
  current,
  count,
  blocked,
  reason,
  previous,
  next,
  children,
  onChange,
}: {
  label: string;
  selected: string;
  current?: string;
  count?: string;
  blocked: boolean;
  reason?: string;
  previous?: () => void;
  next?: () => void;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div className="v-workshop-picker">
      <Button
        type="button"
        disabled={blocked || !previous}
        focusableWhenDisabled
        aria-label={`${label} anterior`}
        aria-describedby={reason}
        onClick={previous}
      >
        <Icon name="chevron-left" />
      </Button>
      <Select.Root
        value={current ?? null}
        modal={false}
        readOnly={blocked}
        onValueChange={(value) => {
          if (!blocked && value !== null) onChange(value);
        }}
      >
        <Select.Trigger
          className="v-workshop-select"
          aria-disabled={blocked || undefined}
          aria-label={`${label}: ${selected}`}
          aria-describedby={reason}
        >
          <span className="v-workshop-select-icon">
            <Icon name={label === t.scene ? "v-studio" : "v-studio"} />
          </span>
          <span>
            <small>{label}</small>
            <strong>{selected}</strong>
          </span>
          {count && <small>{count}</small>}
          <Icon name="down" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            className="v-positioner"
            alignItemWithTrigger={false}
            sideOffset={6}
          >
            <Select.Popup className="v-popup v-workshop-popup">
              <Select.List>{children}</Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      <Button
        type="button"
        disabled={blocked || !next}
        focusableWhenDisabled
        aria-label={`${label} siguiente`}
        aria-describedby={reason}
        onClick={next}
      >
        <Icon name="right" />
      </Button>
    </div>
  );
}

function Option({
  value,
  name,
  detail,
  count,
}: {
  value: string;
  name: string;
  detail?: string;
  count: string;
}) {
  return (
    <Select.Item
      className="v-option v-workshop-option"
      value={value}
      label={detail ? `${name} ${detail}` : name}
    >
      <Select.ItemText>
        {name}
        {detail && <small>{detail}</small>}
      </Select.ItemText>
      <small>{count}</small>
      <Select.ItemIndicator>
        <Icon name="check" />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

export function Workshop({
  core,
  chrome,
}: {
  core: CoreStatus;
  chrome: ComponentProps<typeof SectionChrome>;
}) {
  const { client, issue } = useHost();
  const navigate = useUi((state) => state.navigate);
  const [catalog, setCatalog] = useState<WorkshopReply>();
  const [catalogError, setCatalogError] = useState(false);
  const [kind, setKind] = useState<string>();
  const [sceneId, setScene] = useState<string>();
  const [frame, setFrame] = useState(0);
  const [manual, setManual] = useState(core.live);
  const note = useId();
  const [accountGeneration] = useState(core.accountGeneration);
  const permitted = !issue && previewAuthority(core, accountGeneration);

  useEffect(() => {
    if (core.live) setManual(true);
  }, [core.live]);
  useEffect(() => {
    if (!client || issue) return;
    let active = true;
    void client
      .request({ method: "workshop.catalog" })
      .then((reply) => {
        if (active && reply.method === "workshop.catalog") setCatalog(reply);
      })
      .catch(() => {
        if (active) setCatalogError(true);
      });
    return () => {
      active = false;
    };
  }, [client, issue]);

  const widgets = widgetGroups.flatMap(({ kinds }) =>
    kinds.flatMap(
      (kind) => catalog?.widgets.find((widget) => widget.kind === kind) ?? [],
    ),
  );
  const widget = widgets.find((value) => value.kind === kind) ?? widgets[0];
  const widgetName = widget ? homeText.widgets[widget.kind] : t.empty;
  const scenes = widget
    ? [
        ...widget.scenes.filter((scene) => scene.frameMs !== null),
        ...widget.scenes.filter((scene) => scene.frameMs === null),
      ]
    : [];
  const scene = scenes.find(({ id }) => id === sceneId) ?? scenes[0];
  const photo = usePreviewPhoto(
    widget && scene
      ? { kind: "scene", widget: widget.kind, sceneId: scene.id, frame }
      : undefined,
    undefined,
    permitted && !manual,
  );
  const n = frame + 1;
  const frames = scene?.frames ?? 0;
  const pending =
    !!scene && permitted && !manual && photo.status === "preparing";
  const loose = scene?.frameMs === null;
  const denied = !!scene && permitted && !manual && photo.status === "denied";
  const frameBlocked =
    pending || core.live || manual || !permitted || denied || frames <= 1;
  const why = pending
    ? t.pending
    : core.live || manual
      ? t.liveFrames
      : !permitted
        ? t.noFrameRights
        : denied
          ? t.deniedFrames
          : !frames
            ? t.noScenesFrames
            : loose
              ? t.oneLoose
              : frames === 1
                ? t.oneFrame
                : undefined;

  function chooseWidget(value: string) {
    if (pending || widget?.kind === value) return;
    setKind(value);
    setScene(undefined);
    setFrame(0);
  }
  function chooseScene(value: string) {
    if (pending || scene?.id === value) return;
    setScene(value);
    setFrame(0);
  }
  function go(next: number) {
    if (frameBlocked || next < 0 || next >= frames || next === frame) return;
    setFrame(next);
  }
  function keyboard(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.target instanceof Element &&
        event.target.closest(
          '[role="combobox"],[role="listbox"],input,textarea',
        ))
    )
      return;
    const destination =
      event.key === "Home"
        ? 0
        : event.key === "ArrowLeft"
          ? frame - 1
          : event.key === "ArrowRight"
            ? frame + 1
            : undefined;
    if (destination === undefined) return;
    event.preventDefault();
    go(destination);
  }
  const account = () => navigate("account");
  const testing = () => navigate("testing");
  const result = !!scene && permitted && !manual;
  const ready = result && photo.status === "photo";
  const image = ready || pending ? photo.src : undefined;
  const displayedFrame = (photo.frame ?? frame) + 1;
  let message: string | undefined;
  let detail: string | undefined;
  let action: ReactNode;
  let alert = false;

  if (core.live || manual) {
    message = t.live;
    detail = t.liveDetails;
    action = (
      <>
        <Button
          type="button"
          variant="primary"
          disabled={core.live || !permitted || !scene || photo.sceneInFlight}
          focusableWhenDisabled
          aria-describedby={core.live ? note : undefined}
          onClick={() => setManual(false)}
        >
          {t.capture}
        </Button>
        {core.live && <small>{t.availableAfterLive}</small>}
      </>
    );
  } else if (!permitted) {
    message = t.noPhotoRights;
    detail = t.noPhotoRightsDetails;
  } else if (catalogError) {
    message = t.unavailable;
    alert = true;
  } else if (widget && !scene) {
    message = t.noScenes(widgetName);
    detail = t.noScenesDetails;
    action = <Button onClick={testing}>{t.testing}</Button>;
  } else if (result && !ready && !pending) {
    alert = true;
    switch (photo.status) {
      case "busy":
        message = t.busy;
        detail = t.busyDetails;
        action = (
          <Button variant="primary" onClick={photo.regenerate}>
            {t.retry}
          </Button>
        );
        break;
      case "timeout":
      case "captureFailed":
      case "gpuUnavailable":
        message = t.failedFrame(n);
        detail = photo.status === "timeout" ? t.timeout : t.failedDetails;
        action = (
          <Button variant="primary" onClick={photo.regenerate}>
            {t.retry}
          </Button>
        );
        break;
      case "denied":
        message = t.denied(widgetName);
        detail = t.deniedDetails;
        action = <Button onClick={account}>{t.account}</Button>;
        break;
      case "noDemo":
      case "tooLarge":
        message = t[photo.status];
        detail =
          photo.status === "noDemo" ? t.noDemoDetails : t.tooLargeDetails;
        action = <Button onClick={testing}>{t.testing}</Button>;
        break;
      case "graphicsDisabled":
      case "invalidInput":
      case "unavailable":
        message = t[photo.status];
        break;
    }
  }

  const rail = (
    <aside
      className="v-workshop-rail"
      aria-label="Fotograma y escena"
      onKeyDown={keyboard}
    >
      <section>
        <h2>{t.frame(1, 1).split(" ")[0]}</h2>
        <div className="v-workshop-number">
          <strong>{frames ? n : "–"}</strong>
          <span>{frames ? `de ${frames}` : t.noFrame}</span>
          {pending && <small>{t.onWay}</small>}
        </div>
        {frames > 0 && (
          <ol className="v-workshop-frames" aria-hidden="true">
            {Array.from({ length: frames }, (_, index) => index + 1).map(
              (value) => (
                <li key={value} data-current={n === value}>
                  {value}
                </li>
              ),
            )}
          </ol>
        )}
        <fieldset className="v-workshop-frame-actions">
          <legend className="v-sr-only">Cambiar de fotograma</legend>
          <Button
            type="button"
            size="sm"
            disabled={frameBlocked || frame === 0}
            focusableWhenDisabled
            aria-keyshortcuts="Home"
            aria-describedby={why ? note : undefined}
            onClick={() => go(0)}
          >
            {t.first}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={frameBlocked || frame === 0}
            focusableWhenDisabled
            aria-keyshortcuts="ArrowLeft"
            aria-describedby={why ? note : undefined}
            onClick={() => go(frame - 1)}
          >
            {t.previous}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={frameBlocked || frame + 1 >= frames}
            focusableWhenDisabled
            aria-keyshortcuts="ArrowRight"
            aria-describedby={why ? note : undefined}
            onClick={() => go(frame + 1)}
          >
            {t.next}
          </Button>
        </fieldset>
        {why && <p id={note}>{why}</p>}
        <p>
          <kbd>←</kbd> <kbd>→</kbd> {t.keyHelp}
        </p>
        <p>{t.frameHelp}</p>
      </section>
      <section>
        <h2>{t.scene}</h2>
        {scene ? (
          <>
            <strong>{scene.label}</strong>
            <span>{`${loose ? t.loose : t.scene} de ${widgetName} · ${t.count(frames, "fotograma", "fotogramas")}`}</span>
            <div className="v-workshop-watch">
              <span>{t.watching}</span>
              <p>{scene.watchFor ?? t.noWatch}</p>
            </div>
            <p>{t.factory}</p>
            <div className="v-workshop-id">
              <span>{t.identifier}</span>
              <code>{scene.id}</code>
            </div>
          </>
        ) : (
          <p>{t.noScene}</p>
        )}
      </section>
    </aside>
  );

  const wi = widgets.findIndex((item) => item.kind === widget?.kind);
  const si = scenes.findIndex((item) => item.id === scene?.id);
  return (
    <>
      <SectionChrome {...chrome} rail={rail} />
      <SectionPanel activeTab="workshop">
        <section
          className="v-workshop"
          aria-label={t.title}
          onKeyDown={keyboard}
        >
          <div className="v-workshop-pickers">
            <Picker
              label={t.widget}
              selected={widgetName}
              current={widget?.kind}
              count={widget && t.count(scenes.length, "escena", "escenas")}
              blocked={pending || !widget}
              reason={pending ? note : undefined}
              previous={
                wi > 0 ? () => chooseWidget(widgets[wi - 1].kind) : undefined
              }
              next={
                wi >= 0 && wi + 1 < widgets.length
                  ? () => chooseWidget(widgets[wi + 1].kind)
                  : undefined
              }
              onChange={chooseWidget}
            >
              {widgetGroups.map(({ title, kinds }) => (
                <Select.Group key={title}>
                  <Select.GroupLabel>{title}</Select.GroupLabel>
                  {widgets
                    .filter((widget) => kinds.includes(widget.kind))
                    .map((widget) => (
                      <Option
                        key={widget.kind}
                        value={widget.kind}
                        name={homeText.widgets[widget.kind]}
                        count={t.count(
                          widget.scenes.length,
                          "escena",
                          "escenas",
                        )}
                      />
                    ))}
                </Select.Group>
              ))}
            </Picker>
            <Picker
              label={t.scene}
              selected={scene?.label ?? t.empty}
              current={scene?.id}
              count={
                scene &&
                (loose ? t.loose : t.count(frames, "fotograma", "fotogramas"))
              }
              blocked={pending || !scene}
              reason={pending ? note : undefined}
              previous={
                si > 0 ? () => chooseScene(scenes[si - 1].id) : undefined
              }
              next={
                si >= 0 && si + 1 < scenes.length
                  ? () => chooseScene(scenes[si + 1].id)
                  : undefined
              }
              onChange={chooseScene}
            >
              {[false, true].map((photos) => {
                const items = scenes.filter(
                  (item) => (item.frameMs === null) === photos,
                );
                return (
                  items.length > 0 && (
                    <Select.Group key={String(photos)}>
                      <Select.GroupLabel>{`${photos ? "Fotos sueltas" : "Escenas"} · ${items.length}`}</Select.GroupLabel>
                      {items.map((item) => (
                        <Option
                          key={item.id}
                          value={item.id}
                          name={item.label}
                          detail={photos ? item.id : undefined}
                          count={t.count(
                            item.frames,
                            "fotograma",
                            "fotogramas",
                          )}
                        />
                      ))}
                    </Select.Group>
                  )
                );
              })}
            </Picker>
          </div>
          {!permitted && !core.live && (
            <div className="v-workshop-rights" role="alert">
              <div>
                <strong>{t.rights}</strong>
                <p>{t.rightsDetails}</p>
              </div>
              <Button onClick={account}>{t.account}</Button>
            </div>
          )}
          <figure
            className="v-workshop-photo"
            aria-busy={pending || (!catalog && !catalogError) || undefined}
          >
            <figcaption>
              <strong>
                {pending && image ? t.previousPhoto : t.photo}
                {scene && (!pending || image)
                  ? ` · ${loose ? t.loose.toLowerCase() : `fotograma ${pending ? displayedFrame : n}`}`
                  : ""}
              </strong>
              {image && photo.image && (
                <small>{`${photo.image.width} × ${photo.image.height} px · a 1×`}</small>
              )}
            </figcaption>
            <div className="v-workshop-photo-area">
              {image && scene && (
                <img
                  data-dim={pending}
                  src={image}
                  alt={t.photoAlt(
                    widgetName,
                    scene.label,
                    displayedFrame,
                    frames,
                  )}
                />
              )}
              {pending && (
                <div className="v-workshop-loading">
                  <span aria-hidden="true" className="v-spinner" />
                  <div>
                    <strong>{image ? t.pendingFrame(n) : t.firstPhoto}</strong>
                    <p>{image ? t.pendingHelp : t.firstHelp}</p>
                  </div>
                </div>
              )}
              {message && (
                <div
                  className="v-workshop-message"
                  role={alert ? "alert" : undefined}
                >
                  <h2>{message}</h2>
                  {detail && <p>{detail}</p>}
                  {action}
                </div>
              )}
            </div>
          </figure>
          {scene && (
            <div className="v-workshop-caption">
              <strong>{t.frame(n, frames)}</strong>
              {loose && <p>{t.noDescription}</p>}
            </div>
          )}
          {ready && (
            <span
              role="status"
              className="v-sr-only"
            >{`${t.frame(n, frames)} listo.`}</span>
          )}
        </section>
      </SectionPanel>
    </>
  );
}
