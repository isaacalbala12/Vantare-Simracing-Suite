//! Proceso de overlays: widgets GPUI (una ventana por monitor)
//! alimentados por un canal de `Snapshot`s. Cada widget proyecta la instantánea
//! con el `ViewModel` de `domain` que le corresponde y solo repinta cuando ese
//! ViewModel cambia.

use std::sync::Arc;
use std::time::Duration;

use gpui::{
    App, Bounds, Context, Entity, IntoElement, Pixels, Render, StyleRefinement, Window,
    WindowBackgroundAppearance, WindowBounds, WindowKind, WindowOptions, canvas, div, point,
    prelude::*, px,
};
use vantare_domain::Snapshot;
use vantare_domain::format::Preferences;

use crate::efficiency::text;
use crate::overlay::{self, Hwnd};
use crate::{Kind, Widget};

/// Cómo se pinta un widget en el lienzo que GPUI le da.
pub(crate) type Paint = Box<dyn Fn(&mut Window, &mut App)>;

/// Lo que un widget pide al host tras pintar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Wake {
    Frame,
    At(Duration),
    Idle,
}

impl Kind {
    /// Tamaño del widget (px) con su contenido inicial.
    fn size(self) -> (f32, f32) {
        Overlay::new(self, Preferences::default()).wanted_size()
    }
}

/// Coloca los widgets en una fila que empieza en `origin`, separados 20 px.
pub fn layout_row(kinds: &[Kind], origin: (f32, f32)) -> Vec<(Kind, (f32, f32))> {
    let mut x = origin.0;
    kinds
        .iter()
        .map(|&kind| {
            let at = (x, origin.1);
            x += kind.size().0 + 20.0;
            (kind, at)
        })
        .collect()
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
    pub(crate) fn new(kind: Kind, prefs: Preferences) -> Self {
        let widget = Widget::new(kind, prefs);
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

    pub(crate) fn wanted_size(&self) -> (f32, f32) {
        self.widget.size()
    }

    /// Proyecta la instantánea y repinta solo si el ViewModel cambió.
    pub fn ingest(&mut self, snapshot: &Snapshot, cx: &mut Context<Self>) {
        if self.widget.ingest(snapshot, self.prefs) {
            cx.notify();
        }
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.widget.animating()
    }
}

/// Actualiza el ViewModel sin repintados por datos idénticos.
pub(crate) fn replace_if_changed<T: PartialEq>(current: &mut T, next: T) -> bool {
    let changed = *current != next;
    if changed {
        *current = next;
    }
    changed
}

impl Render for Overlay {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(feature = "paint-stats")]
        let kind = self.widget.kind();
        #[cfg(feature = "paint-stats")]
        crate::stats::render(kind);
        let size = self.wanted_size();
        let (paint, wake) = self.widget.frame(self.prefs);
        #[cfg(feature = "parity-capture")]
        let backdrop = self.backdrop;
        let element = canvas(
            |_, _, _| (),
            move |bounds, (), window, cx| {
                #[cfg(feature = "paint-stats")]
                crate::stats::paint(kind);
                let origin = (f32::from(bounds.origin.x), f32::from(bounds.origin.y));
                text::with_origin(origin, || {
                    #[cfg(feature = "parity-capture")]
                    if let Some(color) = backdrop {
                        // La marca fuera del recorte confirma la pasada sin asumir
                        // que el widget tenga un margen transparente.
                        crate::efficiency::paint_rect(
                            window,
                            0.0,
                            0.0,
                            size.0.ceil(),
                            size.1.ceil() + 2.0,
                            color,
                        );
                    }
                    paint(window, cx);
                });
            },
        )
        .w(px(size.0))
        .h(px(size.1));
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
    let placed = (0..windows).map(|i| (kind_of(i), origin_of(i))).collect();
    run_placed(placed, snapshots, prefs);
}

/// Como [`run`], con los widgets y sus posiciones (px globales de pantalla) dados.
pub fn run_placed(
    placed: Vec<(Kind, (f32, f32))>,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    prefs: Preferences,
) {
    gpui_platform::application().run(move |cx: &mut App| {
        if !init(cx) {
            return;
        }
        #[cfg(feature = "paint-stats")]
        crate::stats::report();
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
    use gpui::size;

    #[test]
    fn registry_names_roundtrip_and_each_widget_accepts_a_snapshot() {
        for (index, &kind) in Kind::ALL.iter().enumerate() {
            assert_eq!(kind.name().parse(), Ok(kind));
            assert!(!Kind::ALL[..index].iter().any(|k| k.name() == kind.name()));
            let mut widget = Widget::new(kind, Preferences::default());
            widget.ingest(&crate::source::fixed(), Preferences::default());
            let (w, h) = widget.size();
            assert!(w > 0.0 && h > 0.0 && w.is_finite() && h.is_finite());
        }
        assert!("unknown".parse::<Kind>().is_err());
    }

    #[test]
    fn parity_scenes_use_the_existing_snapshot_wire_format() {
        let standings =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/standings-legacy.snapshot.json"))
                .expect("escena de referencia");
        assert_eq!(standings, crate::source::fixed());
        let reference_scene =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/standings.snapshot.json"))
                .expect("escena Standings fase 2");
        assert_eq!(reference_scene.state.cars.len(), 20);
        assert_eq!(reference_scene.state.cars[0].driver.name, "André Lotterer");
        let radar =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/radar.snapshot.json"))
                .expect("escena radar");
        let radar = vantare_domain::radar::project(&radar);
        assert_eq!(radar.cars.len(), 3);
        assert_eq!((radar.cars[0].right_m, radar.cars[0].ahead_m), (-4.0, 0.0));
        let pedals =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/pedals.snapshot.json"))
                .expect("escena pedales");
        let pedals = vantare_domain::pedals::project(&pedals, Preferences::default());
        assert_eq!(
            (pedals.throttle, pedals.brake, pedals.clutch),
            (Some(0.75), Some(0.125), Some(0.06))
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
