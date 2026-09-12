import { useEffect, useMemo, useRef, useState } from "react";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import type { WidgetInstanceV3 } from "../core/profile-document";
import { buildEngineerPresentationFixture } from "../../engineer/engineer-presentation-fixtures";
import {
  buildWorkshopFrameV2,
  buildWorkshopWidget,
  STANDINGS_REPLAY_FRAME_COUNT,
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

export const OVERLAY_WORKSHOP_PROFILE_ID = "workshop-fixture";

function setSearch(query: OverlayWorkshopQuery): void {
  window.history.replaceState(null, "", `/workshop?${serializeOverlayWorkshopQuery(query)}`);
}

function WorkshopSurface({ widget, runtime, profileId, surface, query, comparison = false }: { widget: WidgetInstanceV3; runtime: WidgetRuntimeInput; profileId: string; surface: OverlayWorkshopQuery["surface"]; query: OverlayWorkshopQuery; comparison?: boolean }): React.ReactElement {
  const width = query.width ?? widget.layout.w;
  const height = query.height ?? widget.layout.h;
  const runtimeInput = {
    ...runtime,
    relativeViewModelInstanceKey: `${profileId}:${widget.id}`,
  };
  return <div className="overlay-workshop-surface" data-overlay-workshop-surface={surface} data-overlay-workshop-comparison={comparison || undefined}>
    {surface !== "obs" && <span className="overlay-workshop-surface-label">{surface}</span>}
    <div className="overlay-workshop-widget-root" data-overlay-workshop-widget-root style={{ width, height, transform: `scale(${query.scale})`, transformOrigin: "center" }}>
      <WidgetVisualViewport widgetType={widget.type} visual={widget.visual} layout={{ ...widget.layout, w: width, h: height }} testId="overlay-workshop-viewport">
        <WidgetVisualHost widget={{ ...widget, layout: { ...widget.layout, w: width, h: height } }} renderMode={surface}
          runtime={widget.type === "engineer-radio" ? { ...runtimeInput, engineerPresentation: query.state === "ready" ? buildEngineerPresentationFixture() : null } : runtimeInput} />
      </WidgetVisualViewport>
    </div>
  </div>;
}

function OverlayWorkshopPage({ initialQuery, initialError, profileId }: { initialQuery: OverlayWorkshopQuery; initialError?: string; profileId: string }): React.ReactElement {
  const [parsed, setQuery] = useState<OverlayWorkshopQuery>(initialQuery);
  const update = (next: OverlayWorkshopQuery) => {
    setSearch(next);
    setQuery(next);
  };

  // El widget es una función pura de la selección completa: buildWorkshopWidget
  // es el ÚNICO lugar que decide su forma (variante → diseño → sesión → marca
  // → módulos). Sin preparación diferida — lo que la URL dice es lo que se
  // renderiza, y una combinación inválida cae al error visible con los
  // controles vivos.
  const built = useMemo(() => {
    try {
      return { widget: buildWorkshopWidget(parsed), error: null as string | null };
    } catch (error) {
      return { widget: null, error: error instanceof Error ? error.message : "invalid workshop widget" };
    }
  }, [parsed]);
  const widget = built.widget;
  const fixtureError = built.error;
  // La mesa de módulos/tamaño del estudio es solo de Standings.
  const isStudyTable = parsed.system === "vantare-functional" && parsed.widget === "standings" && parsed.variant === "standings-functional-study";

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
  }, [parsed.variant]);

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
  // Última muestra cuantizada ya empujada al estado — el reloj corre a ritmo
  // de rAF pero el widget solo debe re-renderizar cuando cambia SU muestra
  // (updateHz), no a los 120 Hz del monitor.
  const lastSampledRef = useRef(-1);

  const updateHz = widget?.behavior.updateHz ?? 30;

  useEffect(() => {
    elapsedRef.current = elapsedMs;
    // Un seek/cambio de escena aparca el playhead fuera del tick: hay que
    // re-sincronizar la muestra empujada o el siguiente tick la saltaría.
    lastSampledRef.current = sampleAtRate(elapsedMs, updateHz);
  }, [elapsedMs, updateHz]);

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
        lastSampledRef.current = sampleAtRate(total, updateHz);
        setElapsedMs(total);
        setPlaying(false);
        return;
      }
      const sampled = sampleAtRate(next, updateHz);
      if (sampled !== lastSampledRef.current) {
        lastSampledRef.current = sampled;
        setElapsedMs(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, playing, loop, updateHz]);

  // In a race the world is continuous but telemetry is sampled: a widget only
  // sees a new snapshot at its own updateHz (standings 15, delta 30). Playing
  // the interpolation straight at 60fps made the Workshop four times smoother
  // than the product, which is the wrong thing to judge a design against.
  // The clock advances at frame rate; the data is quantised to the widget's rate.
  const sampledMs = scene ? sampleAtRate(elapsedMs, updateHz) : 0;
  const playhead = scene ? interpolateSceneAt(scene, sampledMs, loop) : null;
  const currentKeyframe = playhead?.keyframe ?? 0;

  // El runtime también es una función pura: selección + posición del playhead.
  // Estable mientras está aparcado (mismo objeto, mismo frame); se recalcula
  // por muestra cuantizada durante la reproducción, igual que antes — el host
  // nunca remonta por ello porque el widget memoizado no cambia.
  const runtime = useMemo<WidgetRuntimeInput | null>(() => {
    if (!widget) return null;
    try {
      const head = scene ? interpolateSceneAt(scene, sampledMs, loop) : null;
      return buildWorkshopFrameV2({
        session: parsed.session,
        location: parsed.location,
        state: parsed.state,
        widget: parsed.widget,
        system: parsed.system,
        variant: parsed.variant,
        ...(head && scene ? { sceneId: scene.id, sceneState: head.frame } : {}),
        ...(parsed.variant === "standings-replay" ? { replayFrame } : {}),
      });
    } catch {
      return null;
    }
  }, [parsed, widget, sampledMs, replayFrame, scene, loop]);

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

  const reset = () => {
    setPlaying(false);
    update({ ...DEFAULT_OVERLAY_WORKSHOP_QUERY });
  };

  const studySize = isStudyTable && widget?.type === "standings" ? resolveStandingsMinimumSize(widget) : undefined;
  // La banda ambiental opcional (~30 px) no entra en el mínimo del contenido:
  // el estudio la añade a la altura para que no recorte la última fila.
  const displayQuery = studySize ? { ...parsed, width: studySize.width, height: studySize.height === undefined ? undefined : studySize.height + 34, scale: 1 } : parsed;

  return (
    // La vista de estudio es el único harness: no hay chrome genérico que se
    // pueda mezclar; todas las selecciones viven en el panel lateral.
    <main className="overlay-workshop functional-study" data-overlay-workshop-page data-study-style={parsed.studyStyle}>
      <FunctionalStudyControls query={parsed} update={update} onRunScene={runScene} onReset={reset} />
      <section className={`overlay-workshop-stage overlay-workshop-stage--${parsed.background}`} data-overlay-workshop-stage data-stage-label={`${parsed.widget.toUpperCase().replace(/-/g, " ")} / ESTUDIO 01`}>
        {initialError && <p className="overlay-workshop-alert" role="alert" data-overlay-workshop-rejected>URL rechazada ({initialError}) — se cargaron los valores por defecto.</p>}
        {fixtureError && <p className="overlay-workshop-alert" role="alert" data-overlay-workshop-fixture-error>Selección inválida: {fixtureError}</p>}
        {!fixtureError && widget && runtime && (
          <><WorkshopSurface widget={widget} runtime={runtime} profileId={profileId} surface={parsed.surface} query={displayQuery} />
          {parsed.compare && <WorkshopSurface widget={widget} runtime={runtime} profileId={profileId} surface={parsed.compare} query={displayQuery} comparison />}</>
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
