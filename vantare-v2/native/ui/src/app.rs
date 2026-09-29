//! Proceso de overlays: widgets GPUI (una ventana por widget o una por monitor)
//! alimentados por un canal de `Snapshot`s. Cada widget proyecta la instantánea
//! con el `ViewModel` de `domain` que le corresponde y solo repinta cuando ese
//! ViewModel cambia.

use std::sync::Arc;
use std::time::{Duration, Instant};

use gpui::{
    App, Bounds, Context, Entity, IntoElement, Pixels, Render, StyleRefinement, Window,
    WindowBackgroundAppearance, WindowBounds, WindowKind, WindowOptions, canvas, div, point,
    prelude::*, px,
};
use vantare_domain::format::Preferences;
use vantare_domain::{Snapshot, pedals, radar, standings};

use crate::overlay::{self, Hwnd};
use crate::standings::model::{self, Config, Metric, Plan, Status, Vm};
use crate::standings::{
    motion::{Motion, Wake},
    view,
};
use crate::{pedals as pedals_view, radar as radar_view, text};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Standings,
    Radar,
    Pedals,
}

struct Standings {
    config: Config,
    vm: Vm,
    plan: Plan,
    motion: Motion,
}

/// Cómo se pinta un widget en el lienzo que GPUI le da.
type Paint = Box<dyn Fn(&mut Window, &mut App)>;

enum Widget {
    Standings(Box<Standings>),
    Radar(radar::ViewModel),
    Pedals(pedals::ViewModel),
}

/// Widget de una ventana: proyecta la instantánea y se pinta en un lienzo de su
/// tamaño. No sabe si la ventana es suya o compartida con otros widgets.
pub struct Overlay {
    widget: Widget,
    prefs: Preferences,
    /// Hay un despertar programado (ver `wake_after`).
    wake_pending: bool,
    /// Fondo opaco para la captura con alfa (dos pasadas negro/blanco).
    #[cfg(feature = "parity-capture")]
    pub(crate) backdrop: Option<gpui::Hsla>,
}

impl Overlay {
    fn new(kind: Kind, prefs: Preferences) -> Self {
        let widget = match kind {
            Kind::Standings => Widget::Standings(Box::new(Standings::new())),
            Kind::Radar => Widget::Radar(radar::project(&Snapshot::default())),
            Kind::Pedals => Widget::Pedals(pedals::project(&Snapshot::default(), prefs)),
        };
        Self {
            widget,
            prefs,
            wake_pending: false,
            #[cfg(feature = "parity-capture")]
            backdrop: None,
        }
    }

    /// Repinta al cabo de `after` (un aviso quieto que caduca). Un solo despertar
    /// pendiente a la vez: los avisos caducan en el orden en que nacieron.
    fn wake_after(&mut self, after: Duration, cx: &mut Context<Self>) {
        if self.wake_pending {
            return;
        }
        self.wake_pending = true;
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(after).await;
            let _ = this.update(cx, |overlay, cx| {
                overlay.wake_pending = false;
                cx.notify();
            });
        })
        .detach();
    }

    #[cfg(feature = "paint-stats")]
    fn kind(&self) -> Kind {
        match &self.widget {
            Widget::Standings(_) => Kind::Standings,
            Widget::Radar(_) => Kind::Radar,
            Widget::Pedals(_) => Kind::Pedals,
        }
    }

    pub(crate) fn wanted_size(&self) -> (f32, f32) {
        match &self.widget {
            Widget::Standings(s) => (s.config.width + model::PIT_RAIL_WIDTH, s.config.height),
            Widget::Radar(_) => radar_view::SIZE,
            Widget::Pedals(_) => pedals_view::SIZE,
        }
    }

    /// Proyecta la instantánea y repinta solo si el ViewModel cambió.
    pub fn ingest(&mut self, snapshot: &Snapshot, cx: &mut Context<Self>) {
        let prefs = self.prefs;
        let changed = match &mut self.widget {
            Widget::Standings(s) => s.ingest(snapshot, prefs),
            Widget::Radar(current) => replace_if_changed(current, radar::project(snapshot)),
            Widget::Pedals(current) => {
                replace_if_changed(current, pedals::project(snapshot, prefs))
            }
        };
        if changed {
            cx.notify();
        }
    }

    /// `true` mientras el movimiento de Standings sigue en curso.
    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        match &self.widget {
            Widget::Standings(s) => s.motion.animating(Instant::now()),
            _ => false,
        }
    }
}

fn replace_if_changed<T: PartialEq>(current: &mut T, next: T) -> bool {
    let changed = *current != next;
    if changed {
        *current = next;
    }
    changed
}

impl Standings {
    fn new() -> Self {
        let mut config = Config::reference();
        // Tamaño inicial de una lista llena; solo cambia si hay menos coches.
        config.fit(config.row_count);
        let vm = Vm::unavailable(Status::Disconnected);
        let plan = model::plan(&config, &vm);
        Self {
            config,
            vm,
            plan,
            motion: Motion::new(),
        }
    }

    fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let domain = standings::project(snapshot, prefs);
        let identity = format!("{}:{}", snapshot.state.session.id.0, snapshot.epoch);
        let mut next = Vm::from_domain(
            &domain,
            prefs,
            self.config.row_count,
            identity,
            snapshot.sequence,
        );
        // Alto del widget = cabecera + filas visibles + pie (SPEC §1).
        self.config.fit(next.rows.len());
        let plan = model::plan(&self.config, &next);
        // El número de secuencia cambia siempre y no se ve: no cuenta.
        let sequence = std::mem::replace(&mut next.sequence, self.vm.sequence);
        let changed = next != self.vm || plan.visible_rows != self.plan.visible_rows;
        next.sequence = sequence;
        if changed {
            let lap_visible = plan.columns.iter().any(|c| c.metric == Metric::BestLap);
            self.motion
                .update(&next, plan.visible_rows, lap_visible, Instant::now());
            self.vm = next;
            self.plan = plan;
        }
        changed
    }
}

impl Render for Overlay {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(feature = "paint-stats")]
        let kind = self.kind();
        #[cfg(feature = "paint-stats")]
        crate::stats::render(kind);
        let size = self.wanted_size();
        // Cada widget pinta en coordenadas propias; `with_origin` lo coloca donde
        // GPUI haya puesto el lienzo (esquina de la ventana o posición en la
        // ventana compartida).
        let lienzo = |paint: Paint| {
            canvas(
                |_, _, _| (),
                move |bounds, (), window, cx| {
                    #[cfg(feature = "paint-stats")]
                    crate::stats::paint(kind);
                    let origin = (f32::from(bounds.origin.x), f32::from(bounds.origin.y));
                    text::with_origin(origin, || paint(window, cx));
                },
            )
            .w(px(size.0))
            .h(px(size.1))
            .into_any_element()
        };
        let mut wake = Wake::Idle;
        let element = match &mut self.widget {
            Widget::Standings(s) => {
                let now = Instant::now();
                let frame = s.motion.frame(&s.vm, s.plan.visible_rows, now);
                wake = s.motion.wake(now);
                let scene = view::Scene {
                    config: s.config.clone(),
                    vm: s.vm.clone(),
                    plan: s.plan.clone(),
                    frame,
                    language: self.prefs.language,
                    #[cfg(feature = "parity-capture")]
                    backdrop: self.backdrop,
                    height: s.config.height,
                };
                lienzo(Box::new(move |window, cx| view::paint(&scene, window, cx)))
            }
            Widget::Radar(vm) => {
                let vm = vm.clone();
                lienzo(Box::new(move |window, cx| {
                    radar_view::paint(&vm, window, cx);
                }))
            }
            Widget::Pedals(vm) => {
                let vm = vm.clone();
                lienzo(Box::new(move |window, cx| {
                    pedals_view::paint(&vm, window, cx);
                }))
            }
        };
        // Sin datos nuevos ni animación en curso no se pide ningún fotograma.
        match wake {
            Wake::Frame => window.request_animation_frame(),
            Wake::At(after) => self.wake_after(after, cx),
            Wake::Idle => {}
        }
        element
    }
}

/// Convierte la ventana en overlay la primera vez, con su esquina en `origin`
/// (px lógicos de pantalla).
fn attach(hwnd: &mut Option<Hwnd>, window: &Window, origin: (f32, f32)) {
    if hwnd.is_none() {
        *hwnd = overlay::hwnd_of(window);
        if let Some(hwnd) = *hwnd {
            let scale = window.scale_factor();
            overlay::apply(
                hwnd,
                (
                    (origin.0 * scale).round() as i32,
                    (origin.1 * scale).round() as i32,
                ),
            );
        }
    }
}

/// Una ventana del tamaño del monitor con todos sus widgets dentro, en su
/// posición. Los widgets van en vistas cacheadas: cuando uno cambia, GPUI vuelve
/// a pintar solo ese y reutiliza las primitivas de los demás (ver README,
/// «Repintado en la ventana grande»). La ventana no cambia de tamaño: el alto de
/// Standings, que depende de las filas visibles, lo gobierna el propio widget.
struct Screen {
    widgets: Vec<(Entity<Overlay>, (f32, f32))>,
    origin: (f32, f32),
    hwnd: Option<Hwnd>,
}

impl Render for Screen {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(feature = "paint-stats")]
        crate::stats::frame();
        attach(&mut self.hwnd, window, self.origin);
        div()
            .size_full()
            .children(self.widgets.iter().map(|(widget, (x, y))| {
                // Una vista cacheada se coloca y dimensiona por estilo, no por contenido.
                let (w, h) = widget.read(cx).wanted_size();
                widget.clone().cached(
                    StyleRefinement::default()
                        .absolute()
                        .left(px(*x))
                        .top(px(*y))
                        .w(px(w))
                        .h(px(h)),
                )
            }))
    }
}

fn popup(bounds: Bounds<Pixels>) -> WindowOptions {
    WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(bounds)),
        titlebar: None,
        focus: false,
        show: true,
        kind: WindowKind::PopUp,
        is_movable: false,
        is_resizable: false,
        is_minimizable: false,
        inactive_frame_interval: None,
        window_background: WindowBackgroundAppearance::Transparent,
        ..Default::default()
    }
}

type Placed = Vec<(Kind, (f32, f32))>;

/// Reparte los widgets (posición global) entre los monitores: cada uno recibe
/// los que tienen la esquina dentro, con la posición relativa a su esquina.
fn partition(monitors: &[Bounds<Pixels>], placed: &[(Kind, (f32, f32))]) -> Vec<Placed> {
    monitors
        .iter()
        .map(|monitor| {
            let (ox, oy) = (f32::from(monitor.origin.x), f32::from(monitor.origin.y));
            placed
                .iter()
                .filter(|(_, (x, y))| monitor.contains(&point(px(*x), px(*y))))
                .map(|&(kind, (x, y))| (kind, (x - ox, y - oy)))
                .collect()
        })
        .collect()
}

/// Abre una ventana por monitor que tenga widgets y devuelve los widgets
/// creados. Los monitores sin widgets no reciben ventana.
pub(crate) fn open_screens(
    cx: &mut App,
    placed: &[(Kind, (f32, f32))],
    prefs: Preferences,
) -> Vec<Entity<Overlay>> {
    let displays = cx.displays();
    let bounds: Vec<_> = displays.iter().map(|d| d.bounds()).collect();
    let mut all = Vec::new();
    for ((display, bounds), mine) in displays
        .iter()
        .zip(bounds.iter())
        .zip(partition(&bounds, placed))
    {
        if mine.is_empty() {
            continue;
        }
        let widgets: Vec<_> = mine
            .into_iter()
            .map(|(kind, at)| (cx.new(|_| Overlay::new(kind, prefs)), at))
            .collect();
        all.extend(widgets.iter().map(|(widget, _)| widget.clone()));
        let mut options = popup(*bounds);
        options.display_id = Some(display.id());
        let origin = (f32::from(bounds.origin.x), f32::from(bounds.origin.y));
        let opened = cx.open_window(options, move |_, cx| {
            cx.new(|_| Screen {
                widgets,
                origin,
                hwnd: None,
            })
        });
        if let Err(error) = opened {
            eprintln!("no se pudo abrir la ventana del monitor: {error}");
        }
    }
    all
}

/// Registra las fuentes Inter embebidas; sin ellas el texto sale mal medido.
pub(crate) fn init(cx: &mut App) -> bool {
    match text::register_fonts(cx) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("{error}");
            cx.quit();
            false
        }
    }
}

/// Reparte los widgets (Standings, Radar, Pedals, ... en ese orden) y los
/// escalona en pantalla. Solo para la campaña de medición: el colocado real
/// vendrá de la configuración de layout.
fn kind_of(index: usize) -> Kind {
    [Kind::Standings, Kind::Radar, Kind::Pedals][index % 3]
}

/// Desplazamiento de toda la cuadrícula (`VANTARE_DESPLAZAMIENTO=x,y`, px): sirve
/// para probar varios monitores empujando parte de los widgets al segundo.
fn layout_offset() -> (f32, f32) {
    std::env::var("VANTARE_DESPLAZAMIENTO")
        .ok()
        .and_then(|text| {
            let (x, y) = text.split_once(',')?;
            Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
        })
        .unwrap_or((0.0, 0.0))
}

fn origin_of(index: usize) -> (f32, f32) {
    let (dx, dy) = layout_offset();
    (
        dx + 20.0 + (index % 4) as f32 * 470.0,
        dy + 20.0 + (index / 4) as f32 * 60.0,
    )
}

/// Abre `windows` widgets, una ventana por monitor con widgets, y reenvía cada
/// `Snapshot` del canal a todos. Vuelve cuando se cierra la última ventana.
pub fn run(windows: usize, snapshots: flume::Receiver<Arc<Snapshot>>, prefs: Preferences) {
    gpui_platform::application().run(move |cx: &mut App| {
        if !init(cx) {
            return;
        }
        #[cfg(feature = "paint-stats")]
        crate::stats::report();
        let placed: Vec<_> = (0..windows).map(|i| (kind_of(i), origin_of(i))).collect();
        let widgets = open_screens(cx, &placed, prefs);
        let views: Vec<_> = widgets.iter().map(Entity::downgrade).collect();
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.spawn(async move |cx| {
            while let Ok(snapshot) = snapshots.recv_async().await {
                for view in &views {
                    // `Err`: la ventana ya se cerró; el resto sigue.
                    let _ = view.update(cx, |overlay, cx| overlay.ingest(&snapshot, cx));
                }
            }
        })
        .detach();
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;
    use gpui::size;

    #[test]
    fn standings_repaint_only_when_what_is_drawn_changes() {
        let prefs = Preferences::default();
        let mut standings = Standings::new();
        let first = source::fixed();
        assert!(standings.ingest(&first, prefs), "el primer estado se pinta");

        let mut same = first.clone();
        same.sequence += 1;
        assert!(
            !standings.ingest(&same, prefs),
            "otra secuencia, mismo dibujo"
        );

        let mut hidden = first.clone();
        hidden.sequence += 2;
        hidden.state.cars[30].driver.name = "OTRO".into();
        assert!(
            !standings.ingest(&hidden, prefs),
            "un coche fuera de las filas visibles"
        );

        let mut clock = first;
        clock.sequence += 3;
        clock.state.session.remaining_s = vantare_domain::Quality::Reliable(3491.0);
        assert!(standings.ingest(&clock, prefs), "el reloj cambió");
    }

    #[test]
    fn radar_and_pedals_repaint_only_on_a_new_view_model() {
        let mut vm = radar::project(&source::synthetic(0));
        assert!(!replace_if_changed(
            &mut vm,
            radar::project(&source::synthetic(0))
        ));
        assert!(replace_if_changed(
            &mut vm,
            radar::project(&source::synthetic(300))
        ));
    }

    /// Cuántas veces pediría repintar Standings en un minuto a 30 Hz.
    fn standings_repaints(scene: fn(u64) -> Snapshot) -> usize {
        let mut standings = Standings::new();
        (0..30 * 60)
            .filter(|&tick| standings.ingest(&scene(tick), Preferences::default()))
            .count()
    }

    #[test]
    fn realistic_feed_repaints_standings_rarely() {
        let realistic = standings_repaints(source::realistic);
        assert!(
            (30..=240).contains(&realistic),
            "reloj cada segundo y algún gap o adelantamiento: {realistic}"
        );
        assert_eq!(
            standings_repaints(source::quiet),
            1,
            "solo el primer estado"
        );
        assert!(
            standings_repaints(source::synthetic) > 900,
            "el de estrés lo cambia casi todo"
        );
    }

    #[test]
    fn each_monitor_gets_only_its_widgets_relative_to_its_corner() {
        let monitor =
            |x: f32, y: f32, w: f32, h: f32| Bounds::new(point(px(x), px(y)), size(px(w), px(h)));
        // Principal 1920x1080 y otro a su izquierda (coordenadas negativas) y uno vacío.
        let monitors = [
            monitor(0.0, 0.0, 1920.0, 1080.0),
            monitor(-1280.0, 0.0, 1280.0, 1024.0),
            monitor(5000.0, 0.0, 800.0, 600.0),
        ];
        let placed = vec![
            (Kind::Standings, (20.0, 20.0)),
            (Kind::Radar, (-1200.0, 50.0)),
            (Kind::Pedals, (1900.0, 1079.0)),
        ];

        let parts = partition(&monitors, &placed);

        assert_eq!(
            parts[0],
            [
                (Kind::Standings, (20.0, 20.0)),
                (Kind::Pedals, (1900.0, 1079.0))
            ]
        );
        assert_eq!(parts[1], [(Kind::Radar, (80.0, 50.0))]);
        assert!(parts[2].is_empty(), "sin widgets no hay ventana");
    }
}
