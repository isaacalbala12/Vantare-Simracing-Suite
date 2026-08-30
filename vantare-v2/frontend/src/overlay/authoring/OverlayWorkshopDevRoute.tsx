import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { ALL_WIDGET_TYPES, type DesignSystemId, type WidgetInstanceV3, type WidgetType } from "../core/profile-document";
import { applyWidgetDesign } from "../core/widget-design";
import { buildEngineerPresentationFixture } from "../../engineer/engineer-presentation-fixtures";
import {
  STANDINGS_REPLAY_FRAME_COUNT,
  buildAuthoringFixtureTelemetry,
  buildAuthoringFixtureWidget,
  resetAndSeedAuthoringInputTelemetry,
  type HarnessVariant,
} from "./fixtures/authoring-fixtures";
import { getCrystalHarnessDesign, type AuthoringFixtureWidget } from "./fixtures/authoring-fixtures";
import { getAnimationScene, listAnimationScenes } from "./fixtures/animation-scenes";
import { interpolateSceneAt, sampleAtRate, sceneDurationMs } from "./fixtures/scene-interpolation";
import { projectionGapsFor } from "./fixtures/projection-gaps";
import { listOfficialDesigns } from "../design-systems/official-designs";
import { clearInputTelemetryHistory } from "../widget-types/input-telemetry/input-telemetry-accumulator";
import { buildAuthoringV2Runtime } from "./fixtures/authoring-v2-fixture";
import {
  parseOverlayWorkshopQuery,
  serializeOverlayWorkshopQuery,
  DEFAULT_OVERLAY_WORKSHOP_QUERY,
  type OverlayWorkshopQuery,
} from "./overlay-workshop-query";
import "./overlay-workshop.css";

const SYSTEMS: readonly DesignSystemId[] = ["vantare-original", "vantare-crystal", "vantare-endurance"];
const STATES = ["ready", "stale", "disconnected", "error"] as const;
const SURFACES = ["studio", "desktop", "obs", "harness"] as const;
const VARIANTS: readonly HarnessVariant[] = [
  "default",
  "relative-fill",
  "relative-multiclass",
  "standings-stress60",
  "standings-multiclass",
  "standings-replay",
  "standings-minimal",
  "standings-all-columns",
  "pedals-zero",
  "pedals-full",
];

function createScenarioWidget(query: OverlayWorkshopQuery): WidgetInstanceV3 {
  const crystalDesign = query.designId ? getCrystalHarnessDesign(query.designId) : undefined;
  let widget = buildAuthoringFixtureWidget({
    session: query.session,
    location: query.location,
    state: query.state,
    widget: query.widget,
    system: query.system,
    surface: query.surface,
    variant: query.variant,
    // The scene shapes the widget as well as the snapshot: without it the
    // standings kept the player's class only and the best-lap column off, so
    // the fastest-lap scene handed the crown between two cars that were not
    // on screen and no glyph could appear at all.
    sceneId: query.sceneId,
    ...(crystalDesign ? { designId: crystalDesign.designId } : {}),
  });
  if (query.designId) {
    const design = listOfficialDesigns(query.widget).find((candidate) => candidate.id === query.designId);
    if (design) {
      widget = applyWidgetDesign(widget, design, "1970-01-01T00:00:00.000Z");
    }
  }
  if (crystalDesign) {
    widget.layout = {
      ...widget.layout,
      w: crystalDesign.width,
      h: crystalDesign.height,
    };
  }
  return widget;
}

type PreparedFixture = {
  key: string;
  widget: WidgetInstanceV3;
  snapshot: ReturnType<typeof buildAuthoringFixtureTelemetry>;
};

function prepareFixture(query: OverlayWorkshopQuery): PreparedFixture {
  const crystalDesign = query.designId ? getCrystalHarnessDesign(query.designId) : undefined;
  const widget = createScenarioWidget(query);
  const snapshot = buildAuthoringFixtureTelemetry({
    session: query.session,
    location: query.location,
    state: query.state,
    widget: query.widget,
    system: query.system,
    surface: query.surface,
    variant: query.variant,
    ...(crystalDesign ? { designId: crystalDesign.designId } : {}),
  });
  // Keyed without the frame, matching fixtureKey: stepping a scene must not
  // count as a different fixture.
  return { key: serializeOverlayWorkshopQuery({ ...query, sceneFrame: undefined }), widget, snapshot };
}

const PRESET_DIMENSIONS = { "720p": [1280, 720], "1080p": [1920, 1080], "1440p": [2560, 1440] } as const;

function setSearch(query: OverlayWorkshopQuery): void {
  window.history.replaceState(null, "", `/workshop?${serializeOverlayWorkshopQuery(query)}`);
}

function SelectField(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  children: ReactNode;
}): React.ReactElement {
  return (
    <label className="overlay-workshop-control">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.children}
      </select>
    </label>
  );
}

function DimensionField(props: { label: string; value: string; onChange(value: string): void }): React.ReactElement {
  const max = props.label === "Width" ? 3840 : 2160;
  return <label className="overlay-workshop-control"><span>{props.label}</span><input type="number" min="64" max={max} step="1" value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function compatibleSystems(widget: WidgetType): readonly DesignSystemId[] {
  return widget === "engineer-radio" ? ["vantare-crystal"] : SYSTEMS;
}

function defaultSystem(widget: WidgetType): DesignSystemId {
  return compatibleSystems(widget)[0]!;
}

function WorkshopSurface({ prepared, surface, query, comparison = false }: { prepared: PreparedFixture; surface: OverlayWorkshopQuery["surface"]; query: OverlayWorkshopQuery; comparison?: boolean }): React.ReactElement {
  const width = query.width ?? prepared.widget.layout.w;
  const height = query.height ?? prepared.widget.layout.h;
  const runtime = buildAuthoringV2Runtime(prepared.widget.type, prepared.snapshot);
  return <div className="overlay-workshop-surface" data-overlay-workshop-surface={surface} data-overlay-workshop-comparison={comparison || undefined}>
    {surface !== "obs" && <span className="overlay-workshop-surface-label">{surface}</span>}
    <div className="overlay-workshop-widget-root" data-overlay-workshop-widget-root style={{ width, height, transform: `scale(${query.scale})`, transformOrigin: "center" }}>
      <WidgetVisualViewport widgetType={prepared.widget.type} visual={prepared.widget.visual} layout={{ ...prepared.widget.layout, w: width, h: height }} testId="overlay-workshop-viewport">
        <WidgetVisualHost widget={{ ...prepared.widget, layout: { ...prepared.widget.layout, w: width, h: height } }} snapshot={prepared.snapshot} renderMode={surface}
          runtime={prepared.widget.type === "engineer-radio" ? { ...runtime, engineerPresentation: query.state === "ready" ? buildEngineerPresentationFixture() : null } : runtime} />
      </WidgetVisualViewport>
    </div>
  </div>;
}

function OverlayWorkshopPage({ initialQuery }: { initialQuery: OverlayWorkshopQuery }): React.ReactElement {
  const [parsed, setQuery] = useState<OverlayWorkshopQuery>(initialQuery);
  const [prepared, setPrepared] = useState<PreparedFixture | null>(null);
  const [dimensionDraft, setDimensionDraft] = useState({
    width: initialQuery.width?.toString() ?? "",
    height: initialQuery.height?.toString() ?? "",
  });
  const [scaleDraft, setScaleDraft] = useState(String(initialQuery.scale));
  const update = (next: OverlayWorkshopQuery) => {
    setSearch(next);
    setQuery(next);
  };

  const designs = listOfficialDesigns(parsed.widget).filter((design) => design.systemId === parsed.system);
  // The frame is deliberately excluded: it changes the snapshot, not the
  // fixture. Including it remounted the widget on every step, which threw away
  // the previous ViewModel the motion engines diff against — so discrete
  // animations (overtake flash, crown flight, relative crossing) could never
  // fire in the Workshop, which is the one place they need to be visible.
  const fixtureKey = serializeOverlayWorkshopQuery({ ...parsed, sceneFrame: undefined });

  const [replayFrame, setReplayFrame] = useState(0);
  useEffect(() => {
    if (parsed.variant !== "standings-replay") {
      return;
    }
    const timer = setInterval(
      () => setReplayFrame((frame) => (frame + 1) % STANDINGS_REPLAY_FRAME_COUNT),
      1400,
    );
    return () => clearInterval(timer);
  }, [parsed.variant, fixtureKey]);

  // Scene transport. The frame lives in local state while playing so the URL is
  // not rewritten sixty times a minute; pausing or stepping parks it in the
  // query, which is what makes a single frame linkable.
  const scene = parsed.sceneId ? getAnimationScene(parsed.sceneId) : undefined;
  // Nothing plays until asked. Selecting an animation arms it at rest; a run
  // plays that animation once, start to finish, and stops on its last frame.
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(
    () =>
      (initialQuery.sceneFrame ?? 0) *
      (initialQuery.sceneId ? (getAnimationScene(initialQuery.sceneId)?.frameMs ?? 0) : 0),
  );
  const elapsedRef = useRef(0);
  const scenesForWidget = listAnimationScenes(parsed.widget as AuthoringFixtureWidget);

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  // Playhead in milliseconds, advanced on every animation frame. The scene's
  // frames are keyframes; what plays between them is interpolated, so a gap
  // closing or a pedal going down moves instead of stepping.
  useEffect(() => {
    if (!scene || !playing) {
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const offset = elapsedRef.current;
    const total = sceneDurationMs(scene);
    const tick = (now: number) => {
      if (start === null) {
        start = now;
      }
      const next = offset + (now - start);
      if (!loop && next >= total) {
        setElapsedMs(total);
        setPlaying(false);
        return;
      }
      setElapsedMs(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, playing, loop]);

  // In a race the world is continuous but telemetry is sampled: a widget only
  // sees a new snapshot at its own updateHz (standings 15, delta 30). Playing
  // the interpolation straight at 60fps made the Workshop four times smoother
  // than the product, which is the wrong thing to judge a design against.
  // The clock advances at frame rate; the data is quantised to the widget's rate.
  const updateHz = prepared?.widget.behavior.updateHz ?? 30;
  const playhead = scene ? interpolateSceneAt(scene, sampleAtRate(elapsedMs, updateHz), loop) : null;
  const currentKeyframe = playhead?.keyframe ?? 0;

  const parkFrame = (frame: number) => {
    setPlaying(false);
    setElapsedMs(scene ? frame * scene.frameMs : 0);
    update({ ...parsed, sceneFrame: frame });
  };
  const stepFrame = (delta: number) => {
    if (!scene) return;
    const count = scene.frames.length;
    parkFrame((((currentKeyframe + delta) % count) + count) % count);
  };
  /** Selects an animation and leaves it at rest, without playing anything. */
  const chooseScene = (value: string) => {
    setPlaying(false);
    setElapsedMs(0);
    update({ ...parsed, sceneId: value || undefined, sceneFrame: value ? 0 : undefined });
  };
  /** One click: this animation, from the top, once, at frame rate. */
  const runScene = (sceneId: string) => {
    setElapsedMs(0);
    update({ ...parsed, sceneId, sceneFrame: 0 });
    setPlaying(true);
  };

  useLayoutEffect(() => {
    const fixtureQuery = parseOverlayWorkshopQuery(fixtureKey);
    if ("error" in fixtureQuery) {
      throw new Error(`invalid serialized fixture query: ${fixtureQuery.error}`);
    }
    const next = prepareFixture(fixtureQuery);
    resetAndSeedAuthoringInputTelemetry(next.widget, next.snapshot);
    let active = true;
    queueMicrotask(() => {
      if (active) setPrepared(next);
    });
    return () => {
      active = false;
      clearInputTelemetryHistory(next.widget.id);
    };
  }, [fixtureKey]);

  const liveFixtureInput = {
    session: parsed.session,
    location: parsed.location,
    state: parsed.state,
    widget: parsed.widget,
    system: parsed.system,
    surface: parsed.surface,
    variant: parsed.variant,
  } as const;

  const preparedForRender = !prepared
    ? prepared
    : scene && playhead
      ? {
          ...prepared,
          snapshot: buildAuthoringFixtureTelemetry({
            ...liveFixtureInput,
            sceneId: scene.id,
            sceneState: playhead.frame,
          }),
        }
      : parsed.variant === "standings-replay"
        ? {
            ...prepared,
            snapshot: buildAuthoringFixtureTelemetry({ ...liveFixtureInput, replayFrame }),
          }
        : prepared;

  const chooseWidget = (value: string) => {
    const widgetType = value as WidgetType;
    const system = compatibleSystems(widgetType).includes(parsed.system) ? parsed.system : defaultSystem(widgetType);
    update({ ...parsed, widget: widgetType, system, designId: undefined, variant: "default" });
  };
  const chooseSystem = (value: string) => update({ ...parsed, system: value as DesignSystemId, designId: undefined });
  const chooseDesign = (value: string) => update({ ...parsed, ...(value ? { designId: value } : { designId: undefined }) });
  const chooseState = (value: string) => update({ ...parsed, state: value as OverlayWorkshopQuery["state"] });
  const chooseSurface = (value: string) => update({ ...parsed, surface: value as OverlayWorkshopQuery["surface"] });
  const chooseVariant = (value: string) => update({ ...parsed, variant: value as HarnessVariant });
  const chooseSession = (value: string) => update({ ...parsed, session: value as OverlayWorkshopQuery["session"] });
  const chooseLocation = (value: string) => update({ ...parsed, location: value as OverlayWorkshopQuery["location"] });
  const chooseBackground = (value: string) => update({ ...parsed, background: value as OverlayWorkshopQuery["background"] });
  const chooseScale = (value: string) => {
    setScaleDraft(value);
    const scale = Number(value);
    if (value !== "" && Number.isFinite(scale) && scale >= 0.25 && scale <= 2) update({ ...parsed, scale });
  };
  const choosePreset = (value: string) => update({ ...parsed, preset: value as OverlayWorkshopQuery["preset"] });
  const chooseCompare = (value: string) => update({ ...parsed, ...(value ? { compare: value as OverlayWorkshopQuery["surface"] } : { compare: undefined }) });
  const reset = () => {
    setDimensionDraft({ width: "", height: "" });
    setScaleDraft(String(DEFAULT_OVERLAY_WORKSHOP_QUERY.scale));
    update({ ...DEFAULT_OVERLAY_WORKSHOP_QUERY });
  };
  const applyPreset = () => {
    const [width, height] = PRESET_DIMENSIONS[parsed.preset];
    setDimensionDraft({ width: String(width), height: String(height) });
    update({ ...parsed, width, height });
  };
  const chooseDimension = (field: "width" | "height", value: string) => {
    const next = { ...dimensionDraft, [field]: value };
    setDimensionDraft(next);
    const width = Number(next.width);
    const height = Number(next.height);
    const widthValid = next.width !== "" && Number.isInteger(width) && width >= 64 && width <= 3840;
    const heightValid = next.height !== "" && Number.isInteger(height) && height >= 64 && height <= 2160;
    if (widthValid && heightValid) update({ ...parsed, width, height });
  };

  return (
    <main className="overlay-workshop" data-overlay-workshop-page>
      <header className="overlay-workshop-header">
        <div className="overlay-workshop-header__title">
          <span className="overlay-workshop-badge">solo desarrollo</span>
          <h1>Overlay Workshop</h1>
        </div>
        <span data-overlay-workshop-query>{serializeOverlayWorkshopQuery(parsed)}</span>
      </header>
      {/* Three groups, in the order the questions actually get asked: what am I
          looking at, what is it being fed, and how is it being presented. */}
      <section className="overlay-workshop-controls" aria-label="Selección del Workshop">
        <fieldset className="overlay-workshop-group">
          <legend>Qué</legend>
          <SelectField label="Widget" value={parsed.widget} onChange={chooseWidget}>
            {ALL_WIDGET_TYPES.map((widgetType) => <option key={widgetType} value={widgetType}>{widgetType}</option>)}
          </SelectField>
          <SelectField label="Sistema" value={parsed.system} onChange={chooseSystem}>
            {compatibleSystems(parsed.widget).map((system) => <option key={system} value={system}>{system}</option>)}
          </SelectField>
          <SelectField label="Diseño" value={parsed.designId ?? ""} onChange={chooseDesign}>
            <option value="">Ajustes por defecto del renderer</option>
            {designs.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}
          </SelectField>
        </fieldset>

        <fieldset className="overlay-workshop-group">
          <legend>Datos</legend>
          <SelectField label="Estado" value={parsed.state} onChange={chooseState}>
            {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
          </SelectField>
          <SelectField label="Sesión" value={parsed.session} onChange={chooseSession}>
            {(["practice", "qualifying", "race"] as const).map((session) => <option key={session} value={session}>{session}</option>)}
          </SelectField>
          <SelectField label="Ubicación" value={parsed.location} onChange={chooseLocation}>
            {(["track", "pits"] as const).map((location) => <option key={location} value={location}>{location}</option>)}
          </SelectField>
          <SelectField label="Variante" value={parsed.variant} onChange={chooseVariant}>
            {VARIANTS.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
          </SelectField>
        </fieldset>

        <fieldset className="overlay-workshop-group">
          <legend>Presentación</legend>
          <SelectField label="Superficie" value={parsed.surface} onChange={chooseSurface}>
            {SURFACES.map((surface) => <option key={surface} value={surface}>{surface}</option>)}
          </SelectField>
          <SelectField label="Comparar con" value={parsed.compare ?? ""} onChange={chooseCompare}>
            <option value="">Sin comparar</option>{SURFACES.filter((surface) => surface !== parsed.surface).map((surface) => <option key={surface} value={surface}>{surface}</option>)}
          </SelectField>
          <SelectField label="Fondo" value={parsed.background} onChange={chooseBackground}>
            {(["transparent", "grid", "solid", "context"] as const).map((background) => <option key={background} value={background}>{background}</option>)}
          </SelectField>
          <label className="overlay-workshop-control"><span>Escala</span><input type="number" min="0.25" max="2" step="0.05" value={scaleDraft} onChange={(event) => chooseScale(event.target.value)} /></label>
          <SelectField label="Resolución" value={parsed.preset} onChange={choosePreset}>
            {(["720p", "1080p", "1440p"] as const).map((preset) => <option key={preset} value={preset}>{preset}</option>)}
          </SelectField>
          <DimensionField label="Ancho" value={dimensionDraft.width} onChange={(value) => chooseDimension("width", value)} />
          <DimensionField label="Alto" value={dimensionDraft.height} onChange={(value) => chooseDimension("height", value)} />
          <div className="overlay-workshop-group__actions">
            <button type="button" onClick={applyPreset}>Aplicar tamaño declarado</button>
            <button type="button" className="overlay-workshop-button--quiet" onClick={reset}>Restablecer</button>
          </div>
        </fieldset>
      </section>
      <section className="overlay-workshop-scenes" aria-label="Animaciones" data-overlay-workshop-scenes>
        <div className="overlay-workshop-scenes__head">
          <h2>Animaciones de {parsed.widget}</h2>
          <p>Pulsa una para reproducirla una vez.</p>
        </div>
        {projectionGapsFor(parsed.widget).length > 0 ? (
          <div className="overlay-workshop-scenes__gaps" data-testid="workshop-projection-gaps">
            <strong>Aquí se ve más de lo que llega en carrera.</strong> La telemetría real no entrega:
            <ul>
              {projectionGapsFor(parsed.widget).map((gap) => (
                <li key={gap.field}>
                  <code>{gap.field}</code> — {gap.consequence}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="overlay-workshop-scenes__list" data-testid="workshop-scene-list">
          {scenesForWidget.length === 0 ? (
            <p className="overlay-workshop-scenes__empty">Este widget todavía no tiene animaciones declaradas.</p>
          ) : (
            scenesForWidget.map((item) => (
              <button
                key={item.id}
                type="button"
                className="overlay-workshop-scenes__item"
                data-active={item.id === parsed.sceneId ? "true" : undefined}
                data-testid={`workshop-scene-run-${item.id}`}
                onClick={() => runScene(item.id)}
              >
                <span className="overlay-workshop-scenes__play" aria-hidden="true">▶</span>
                {item.label}
              </button>
            ))
          )}
          {scene ? (
            <button
              type="button"
              className="overlay-workshop-scenes__item overlay-workshop-scenes__item--clear"
              onClick={() => chooseScene("")}
              data-testid="workshop-scene-clear"
            >
              Salir de la animación
            </button>
          ) : null}
        </div>
        {scene ? (
          <div className="overlay-workshop-transport" data-overlay-workshop-transport>
            <div className="overlay-workshop-transport__buttons">
              <button type="button" onClick={() => stepFrame(-1)} data-testid="workshop-scene-prev" aria-label="Fotograma anterior">◀</button>
              <button
                type="button"
                onClick={() => (playing ? setPlaying(false) : runScene(scene.id))}
                data-testid="workshop-scene-play"
                aria-pressed={playing}
              >
                {playing ? "❙❙ Pausa" : "▶ Reproducir de nuevo"}
              </button>
              <button type="button" onClick={() => stepFrame(1)} data-testid="workshop-scene-next" aria-label="Fotograma siguiente">▶</button>
              <label className="overlay-workshop-transport__loop">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(event) => setLoop(event.target.checked)}
                  data-testid="workshop-scene-loop"
                />
                En bucle
              </label>
            </div>
            <label className="overlay-workshop-transport__scrub">
              <span>
                Paso {currentKeyframe + 1} de {scene.frames.length} · {(sceneDurationMs(scene) / 1000).toFixed(1)}s · datos a {updateHz} Hz, como en juego
              </span>
              <input
                type="range"
                min={0}
                max={scene.frames.length - 1}
                step={1}
                value={currentKeyframe}
                onChange={(event) => parkFrame(Number(event.target.value))}
                data-testid="workshop-scene-scrub"
              />
            </label>
            <p className="overlay-workshop-transport__caption" data-testid="workshop-scene-caption">
              {playhead?.frame.caption}
            </p>
            <p className="overlay-workshop-transport__watch" data-testid="workshop-scene-watch">
              <strong>Qué mirar:</strong> {scene.watchFor}
            </p>
            {scene.unsupportedSignal ? (
              <p className="overlay-workshop-transport__unsupported" data-testid="workshop-scene-unsupported">
                <strong>Solo en el mock:</strong> esta animación necesita{" "}
                <code>{scene.unsupportedSignal}</code>, que la proyección de telemetría actual no
                entrega. Aquí se ve; en una carrera real no se dispara.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
      <section className={`overlay-workshop-stage overlay-workshop-stage--${parsed.background}`} data-overlay-workshop-stage>
        {prepared?.key === fixtureKey && (
          <><WorkshopSurface prepared={preparedForRender ?? prepared} surface={parsed.surface} query={parsed} />
          {parsed.compare && <WorkshopSurface prepared={preparedForRender ?? prepared} surface={parsed.compare} query={parsed} comparison />}</>
        )}
      </section>
    </main>
  );
}

export function OverlayWorkshopDevRoute({ search = window.location.search }: { search?: string }): React.ReactElement {
  const parsed = parseOverlayWorkshopQuery(search);
  if ("error" in parsed) {
    return (
      <main className="overlay-workshop-error" data-overlay-workshop-error role="alert">
        Workshop selection rejected: {parsed.error}
      </main>
    );
  }
  return <OverlayWorkshopPage initialQuery={parsed} />;
}
