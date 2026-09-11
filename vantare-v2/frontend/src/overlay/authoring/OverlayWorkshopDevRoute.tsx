import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import type { DesignSystemId, WidgetInstanceV3, WidgetType } from "../core/profile-document";
import { buildEngineerPresentationFixture } from "../../engineer/engineer-presentation-fixtures";
import {
  buildWorkshopFrameV2,
  createScenarioWidget,
  STANDINGS_REPLAY_FRAME_COUNT,
  type WorkshopV2Scenario,
  type WorkshopV2Variant,
} from "./fixtures/authoring-v2-workshop-frame";
import type { WidgetRuntimeInput } from "../core/widget-definition";
import { getAnimationScene } from "./fixtures/animation-scenes";
import { interpolateSceneAt, sampleAtRate, sceneDurationMs } from "./fixtures/scene-interpolation";
import {
  parseOverlayWorkshopQuery,
  serializeOverlayWorkshopQuery,
  DEFAULT_OVERLAY_WORKSHOP_QUERY,
  type OverlayWorkshopQuery,
} from "./overlay-workshop-query";
import "./overlay-workshop.css";
import { FunctionalStudyControls } from "./FunctionalStudyControls";
import { resolveStandingsMinimumSize } from "../widget-types/standings/standings-frame-layout";
import type { WidgetColumnV3 } from "../widget-types/shared/widget-column";

export const OVERLAY_WORKSHOP_PROFILE_ID = "workshop-fixture";

function createRouteScenarioWidget(query: OverlayWorkshopQuery): WidgetInstanceV3 {
  const widget = createScenarioWidget({
    widget: query.widget,
    system: query.system,
    variant: query.variant,
    ...(query.designId ? { designId: query.designId } : {}),
    ...(query.sceneId ? { sceneId: query.sceneId } : {}),
  });
  // El selector de marca del panel hace de autoridad local (en producción la
  // decisión la inyecta la política nativa de ISA-1105 como brandVisible).
  if (query.brand === "off") {
    widget.visual = {
      ...widget.visual,
      appearanceOverrides: { ...(widget.visual.appearanceOverrides ?? {}), brandVisible: false },
    };
  }
  // The preview switches its lap column explicitly; saved profile content is
  // never changed by the renderer when the live session changes.
  if (query.system === "vantare-functional" && query.variant === "default" && query.session !== "race") {
    const content = widget.content as Record<string, unknown>;
    const columns = (content.columns as Record<string, unknown>[]).map((column) => column.metricId === "lastLap" ? { ...column, enabled: false } : column.metricId === "bestLap" ? { ...column, enabled: true } : column);
    widget.content = { ...content, columns };
  }
  return widget;
}

type PreparedFixture = {
  key: string;
  widget: WidgetInstanceV3;
  base: {
    session: WorkshopV2Scenario["session"];
    location: WorkshopV2Scenario["location"];
    state: WorkshopV2Scenario["state"];
    widget: WidgetType;
    system: DesignSystemId;
    variant: WorkshopV2Variant;
  };
  runtime: WidgetRuntimeInput;
};

function prepareFixture(query: OverlayWorkshopQuery): PreparedFixture {
  const widget = createRouteScenarioWidget(query);
  const base = {
    session: query.session,
    location: query.location,
    state: query.state,
    widget: query.widget,
    system: query.system,
    variant: query.variant,
  };
  const runtime = buildWorkshopFrameV2(base);
  // Keyed without the frame, matching fixtureKey: stepping a scene must not
  // count as a different fixture.
  return { key: serializeOverlayWorkshopQuery({ ...query, sceneFrame: undefined }), widget, base, runtime };
}

function setSearch(query: OverlayWorkshopQuery): void {
  window.history.replaceState(null, "", `/workshop?${serializeOverlayWorkshopQuery(query)}`);
}

function WorkshopSurface({ prepared, profileId, surface, query, comparison = false }: { prepared: PreparedFixture; profileId: string; surface: OverlayWorkshopQuery["surface"]; query: OverlayWorkshopQuery; comparison?: boolean }): React.ReactElement {
  const width = query.width ?? prepared.widget.layout.w;
  const height = query.height ?? prepared.widget.layout.h;
  const runtime = {
    ...prepared.runtime,
    relativeViewModelInstanceKey: `${profileId}:${prepared.widget.id}`,
  };
  return <div className="overlay-workshop-surface" data-overlay-workshop-surface={surface} data-overlay-workshop-comparison={comparison || undefined}>
    {surface !== "obs" && <span className="overlay-workshop-surface-label">{surface}</span>}
    <div className="overlay-workshop-widget-root" data-overlay-workshop-widget-root style={{ width, height, transform: `scale(${query.scale})`, transformOrigin: "center" }}>
      <WidgetVisualViewport widgetType={prepared.widget.type} visual={prepared.widget.visual} layout={{ ...prepared.widget.layout, w: width, h: height }} testId="overlay-workshop-viewport">
        <WidgetVisualHost widget={{ ...prepared.widget, layout: { ...prepared.widget.layout, w: width, h: height } }} renderMode={surface}
          runtime={prepared.widget.type === "engineer-radio" ? { ...runtime, engineerPresentation: query.state === "ready" ? buildEngineerPresentationFixture() : null } : runtime} />
      </WidgetVisualViewport>
    </div>
  </div>;
}

function OverlayWorkshopPage({ initialQuery, initialError, profileId }: { initialQuery: OverlayWorkshopQuery; initialError?: string; profileId: string }): React.ReactElement {
  const [parsed, setQuery] = useState<OverlayWorkshopQuery>(initialQuery);
  const [studyModules, setStudyModules] = useState<string[]>(["gap", "bestLap"]);
  // La mesa de módulos/tamaño del estudio es solo de Standings.
  const isStudyTable = parsed.system === "vantare-functional" && parsed.widget === "standings" && parsed.variant === "standings-functional-study";
  const [prepared, setPrepared] = useState<PreparedFixture | null>(null);
  const update = (next: OverlayWorkshopQuery) => {
    setSearch(next);
    setQuery(next);
  };

  // The frame is deliberately excluded: it changes the snapshot, not the
  // fixture. Including it remounted the widget on every step, which threw away
  // the previous ViewModel the motion engines diff against — so discrete
  // animations (overtake flash, crown flight, relative crossing) could never
  // fire in the Workshop, which is the one place they need to be visible.
  // studyStyle también queda fuera: es una piel CSS del estudio, no cambia la
  // fixture.
  const fixtureKey = serializeOverlayWorkshopQuery({ ...parsed, sceneFrame: undefined, studyStyle: undefined });

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

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  // Una escena que llega desde la URL o desde un aterrizaje de estudio aparca
  // el playhead en su fotograma declarado. Se ajusta durante el render (no en
  // un efecto) y solo cuando cambia la escena: el transporte interno ya
  // mantiene elapsedMs al moverse entre fotogramas de la misma animación.
  const [elapsedScene, setElapsedScene] = useState(initialQuery.sceneId);
  if (elapsedScene !== parsed.sceneId) {
    setElapsedScene(parsed.sceneId);
    setElapsedMs(scene ? (parsed.sceneFrame ?? 0) * scene.frameMs : 0);
  }

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
  /** One click: this animation, from the top, once, at frame rate. */
  const runScene = (sceneId: string) => {
    setElapsedMs(0);
    update({ ...parsed, sceneId, sceneFrame: 0 });
    setPlaying(true);
  };

  // Una selección inválida nunca tira la página: el error vive en el escenario
  // y los controles siguen operativos para corregirla.
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  useLayoutEffect(() => {
    const fixtureQuery = parseOverlayWorkshopQuery(fixtureKey);
    let active = true;
    if ("error" in fixtureQuery) {
      queueMicrotask(() => {
        if (active) setFixtureError(fixtureQuery.error);
      });
      return () => {
        active = false;
      };
    }
    const next = prepareFixture(fixtureQuery);
    queueMicrotask(() => {
      if (active) {
        setFixtureError(null);
        setPrepared(next);
      }
    });
    return () => {
      active = false;
    };
  }, [fixtureKey]);

  const preparedForRender = !prepared
    ? prepared
    : scene && playhead
      ? {
          ...prepared,
          runtime: buildWorkshopFrameV2({
            ...prepared.base,
            sceneId: scene.id,
            sceneState: playhead.frame,
          }),
        }
      : parsed.variant === "standings-replay"
        ? {
            ...prepared,
            runtime: buildWorkshopFrameV2({ ...prepared.base, replayFrame }),
          }
        : prepared;

  const reset = () => {
    setPlaying(false);
    update({ ...DEFAULT_OVERLAY_WORKSHOP_QUERY });
  };

  const sourcePrepared = preparedForRender ?? prepared;
  // Mientras la nueva fixture se prepara `prepared` aún trae el widget
  // anterior: el parche de columnas solo es válido si ya es un Standings.
  const displayPrepared = isStudyTable && sourcePrepared?.widget.type === "standings" ? {
    ...sourcePrepared,
    widget: { ...sourcePrepared.widget, content: {
      ...sourcePrepared.widget.content,
      columns: ((sourcePrepared.widget.content as { columns: WidgetColumnV3[] }).columns).map((column) => ({ ...column, widthPreset: "auto" as const, enabled: column.metricId === "position" || column.metricId === "driverName" || studyModules.includes(column.metricId) })),
      rowCount: 10,
    } },
  } : sourcePrepared;
  const studySize = isStudyTable && displayPrepared?.widget.type === "standings" ? resolveStandingsMinimumSize(displayPrepared.widget) : undefined;
  // La banda ambiental opcional (~30 px) no entra en el mínimo del contenido:
  // el estudio la añade a la altura para que no recorte la última fila.
  const displayQuery = studySize ? { ...parsed, width: studySize.width, height: studySize.height === undefined ? undefined : studySize.height + 34, scale: 1 } : parsed;

  return (
    // La vista de estudio es el único harness: no hay chrome genérico que se
    // pueda mezclar; todas las selecciones viven en el panel lateral.
    <main className="overlay-workshop functional-study" data-overlay-workshop-page data-study-style={parsed.studyStyle}>
      <FunctionalStudyControls query={parsed} update={update} modules={studyModules} onModules={setStudyModules} onRunScene={runScene} onReset={reset} />
      <section className={`overlay-workshop-stage overlay-workshop-stage--${parsed.background}`} data-overlay-workshop-stage data-stage-label={`${parsed.widget.toUpperCase().replace(/-/g, " ")} / ESTUDIO 01`}>
        {initialError && <p className="overlay-workshop-alert" role="alert" data-overlay-workshop-rejected>URL rechazada ({initialError}) — se cargaron los valores por defecto.</p>}
        {fixtureError && <p className="overlay-workshop-alert" role="alert" data-overlay-workshop-fixture-error>Selección inválida: {fixtureError}</p>}
        {!fixtureError && prepared?.key === fixtureKey && (
          <><WorkshopSurface prepared={displayPrepared ?? prepared} profileId={profileId} surface={parsed.surface} query={displayQuery} />
          {parsed.compare && <WorkshopSurface prepared={displayPrepared ?? prepared} profileId={profileId} surface={parsed.compare} query={displayQuery} comparison />}</>
        )}
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
    </main>
  );
}

export function OverlayWorkshopDevRoute({ search = window.location.search, profileId = OVERLAY_WORKSHOP_PROFILE_ID }: { search?: string; profileId?: string }): React.ReactElement {
  const parsed = parseOverlayWorkshopQuery(search);
  if ("error" in parsed) {
    // Una URL vieja o mal editada ya no deja la página muerta: se abre el
    // estado por defecto con el motivo visible y todos los controles vivos.
    return <OverlayWorkshopPage initialQuery={DEFAULT_OVERLAY_WORKSHOP_QUERY} initialError={parsed.error} profileId={profileId} />;
  }
  return <OverlayWorkshopPage initialQuery={parsed} profileId={profileId} />;
}
