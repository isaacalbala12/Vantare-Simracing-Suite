//! Proceso de overlays: widgets GPUI (una ventana por monitor)
//! alimentados por un canal de `Snapshot`s. Cada widget proyecta la instantánea
//! con el `ViewModel` de `domain` que le corresponde y solo repinta cuando ese
//! ViewModel cambia.

use std::cell::RefCell;
use std::path::PathBuf;
use std::rc::Rc;
use std::sync::Arc;
use std::time::Duration;

use gpui::{
    App, Bounds, Context, DisplayId, Entity, IntoElement, Pixels, Render, StyleRefinement, Window,
    WindowBackgroundAppearance, WindowBounds, WindowHandle, WindowKind, WindowOptions, canvas, div,
    point, prelude::*, px,
};
use vantare_domain::Snapshot;
use vantare_domain::format::Preferences;

use crate::efficiency::preview::PaintWindow;
use crate::efficiency::text;
use crate::overlay::{self, Hwnd};
use crate::{Kind, Settings, Widget};

/// Cómo se pinta un widget en el lienzo que GPUI le da.
pub(crate) type Paint = Box<dyn Fn(&mut PaintWindow<'_>, &mut App)>;

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
    kind: Kind,
    widget: Widget,
    prefs: Preferences,
    /// Hay un despertar programado (ver `wake_after`).
    wake_pending: bool,
    preview_scale: f32,
    /// Fondo opaco para la captura con alfa (dos pasadas negro/blanco).
    #[cfg(feature = "parity-capture")]
    pub(crate) backdrop: Option<gpui::Hsla>,
}

impl Overlay {
    pub fn new(kind: Kind, prefs: Preferences) -> Self {
        Self::configured(&Settings::default_for(kind), prefs)
    }

    /// Renderer compartido por Studio y overlays; posición y persistencia viven fuera.
    pub fn configured(settings: &Settings, prefs: Preferences) -> Self {
        if let Some(limit) = settings_limit(settings) {
            eprintln!("{}: {limit}", settings.kind().name());
        }
        let widget = Widget::new(settings, prefs);
        Self {
            kind: settings.kind(),
            widget,
            prefs,
            wake_pending: false,
            preview_scale: 1.0,
            #[cfg(feature = "parity-capture")]
            backdrop: None,
        }
    }

    fn with_snapshot(settings: &Settings, prefs: Preferences, snapshot: Option<&Snapshot>) -> Self {
        let mut overlay = Self::configured(settings, prefs);
        if let Some(snapshot) = snapshot {
            overlay.widget.ingest(snapshot, prefs);
        }
        overlay
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

    pub fn wanted_size(&self) -> (f32, f32) {
        self.widget.size()
    }

    /// Solo el host de preview reduce/amplía el renderer. Las ventanas reales
    /// conservan el factor 1; tamaño lógico y ViewModel permanecen iguales.
    pub fn set_preview_scale(&mut self, scale: f32) -> Result<(), &'static str> {
        if !scale.is_finite() || scale <= 0.0 {
            return Err("la escala de preview debe ser finita y positiva");
        }
        self.preview_scale = scale;
        Ok(())
    }

    /// Proyecta la instantánea y repinta solo si el ViewModel cambió.
    pub fn ingest(&mut self, snapshot: &Snapshot, cx: &mut Context<Self>) {
        if crate::rights::denied(self.kind, cx) {
            return;
        }
        if self.widget.ingest(snapshot, self.prefs) {
            cx.notify();
        }
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.widget.animating()
    }
}

// El encargo permite Settings/constructores; los portes de variantes que exigen
// editar ingest/paint siguen pendientes. No anunciar una opción ignorada como aplicada.
fn settings_limit(settings: &Settings) -> Option<&'static str> {
    match settings {
        Settings::Delta(options) if options.template_id != "instrument" => {
            Some("templateId persistido; el renderer actual solo pinta instrument")
        }
        Settings::Pedals(options) if options.transparent_background => {
            Some("transparentBackground persistido; variante aún sin portar")
        }
        Settings::BroadcastTower(options) if options.driver_carousel => {
            Some("driverCarousel persistido; variante aún sin portar")
        }
        Settings::PedalsTelemetry(options) if options.steering_wheel != "generic" => {
            Some("steeringWheel persistido; el renderer actual solo pinta generic")
        }
        Settings::RacingFlags(options) if options.text_color != "#000000" => {
            Some("textColor persistido; variante aún sin portar")
        }
        Settings::HeadToHead(options) if options.target != "ahead" => {
            Some("target persistido; el renderer actual solo proyecta ahead")
        }
        Settings::Standings(options)
            if options.template_id != "signature"
                || options.header_first != "none"
                || options.header_second != "none"
                || options.show_brand
                || options.footer_slots.is_some()
                || [&options.footer_first, &options.footer_second]
                    .iter()
                    .any(|value| !["none", "track", "estimatedLaps"].contains(&value.as_str())) =>
        {
            Some("opciones persistidas; variantes y métricas adicionales aún sin portar")
        }
        _ => None,
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
        if crate::rights::denied(self.kind, cx) {
            return div()
                .w(px(self.wanted_size().0 * self.preview_scale))
                .h(px(self.wanted_size().1 * self.preview_scale))
                .when(self.preview_scale != 1.0, |view| {
                    view.text_size(window.rem_size() * self.preview_scale)
                })
                .bg(gpui::rgba(0x181818ee))
                .text_color(gpui::white())
                .child("Requiere licencia vigente")
                .into_any_element();
        }
        #[cfg(feature = "paint-stats")]
        let kind = self.widget.kind();
        #[cfg(feature = "paint-stats")]
        crate::stats::render(kind);
        let size = self.wanted_size();
        let scale = self.preview_scale;
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
                    let mut window = PaintWindow::new(window, bounds.origin, scale);
                    #[cfg(feature = "parity-capture")]
                    if let Some(color) = backdrop {
                        // La marca fuera del recorte confirma la pasada sin asumir
                        // que el widget tenga un margen transparente.
                        crate::efficiency::paint_rect(
                            &mut window,
                            0.0,
                            0.0,
                            size.0.ceil(),
                            size.1.ceil() + 2.0,
                            color,
                        );
                    }
                    paint(&mut window, cx);
                });
            },
        )
        .w(px(size.0 * scale))
        .h(px(size.1 * scale));
        // Sin datos nuevos ni animación en curso no se pide ningún fotograma.
        match wake {
            Wake::Frame => window.request_animation_frame(),
            Wake::At(after) => self.wake_after(after, cx),
            Wake::Idle => {}
        }
        element.into_any_element()
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
    widgets: Vec<PlacedOverlay>,
    origin: (f32, f32),
    hwnd: Option<Hwnd>,
}

struct PlacedOverlay {
    view: Entity<Overlay>,
    at: (f32, f32),
    opacity: f32,
}

impl Render for Screen {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(feature = "paint-stats")]
        crate::stats::frame();
        attach(&mut self.hwnd, window, self.origin);
        div()
            .size_full()
            .children(self.widgets.iter().map(|placed| {
                // Una vista cacheada se coloca y dimensiona por estilo, no por contenido.
                let (w, h) = placed.view.read(cx).wanted_size();
                // Entity::cached usa el estilo para layout, pero no compone su
                // opacity. Div sí la propaga al pintado bajo nivel del canvas.
                div()
                    .absolute()
                    .left(px(placed.at.0))
                    .top(px(placed.at.1))
                    .w(px(w))
                    .h(px(h))
                    .opacity(placed.opacity)
                    .child(
                        placed
                            .view
                            .clone()
                            .cached(StyleRefinement::default().w(px(w)).h(px(h))),
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

type Placed<T> = Vec<(T, (f32, f32))>;

/// Reparte los widgets (posición global) entre los monitores: cada uno recibe
/// los que tienen la esquina dentro, con la posición relativa a su esquina.
fn partition<T: Clone>(monitors: &[Bounds<Pixels>], placed: &[(T, (f32, f32))]) -> Vec<Placed<T>> {
    monitors
        .iter()
        .map(|monitor| {
            let (ox, oy) = (f32::from(monitor.origin.x), f32::from(monitor.origin.y));
            placed
                .iter()
                .filter(|(_, (x, y))| monitor.contains(&point(px(*x), px(*y))))
                .map(|(widget, (x, y))| (widget.clone(), (x - ox, y - oy)))
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
            .map(|(kind, at)| PlacedOverlay {
                view: cx.new(|_| Overlay::new(kind, prefs)),
                at,
                opacity: 1.0,
            })
            .collect();
        all.extend(widgets.iter().map(|placed| placed.view.clone()));
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

#[derive(Debug, PartialEq, Eq)]
enum WindowAction {
    ReplaceContents,
    Open,
    Close,
    None,
}

fn window_action(existing: bool, occupied: bool) -> WindowAction {
    match (existing, occupied) {
        (true, true) => WindowAction::ReplaceContents,
        (false, true) => WindowAction::Open,
        (true, false) => WindowAction::Close,
        (false, false) => WindowAction::None,
    }
}

struct LiveScreens {
    screens: Vec<(DisplayId, WindowHandle<Screen>)>,
    prefs: Preferences,
    last: Option<Arc<Snapshot>>,
    last_demand: vantare_ipc::Demand,
    required: vantare_ipc::Demand,
}

impl LiveScreens {
    fn apply(&mut self, layout: &crate::layout::Layout, cx: &mut App) {
        self.prefs = layout.preferences;
        self.required = layout.demand();
        let displays = cx.displays();
        let bounds: Vec<_> = displays.iter().map(|display| display.bounds()).collect();
        // Una instancia oculta conserva la ocupación de su monitor y su HWND.
        let placed: Vec<_> = layout
            .instances
            .iter()
            .map(|instance| (instance, (instance.x, instance.y)))
            .collect();
        let parts = partition(&bounds, &placed);
        let occupied: Vec<_> = displays
            .iter()
            .zip(&parts)
            .filter(|(_, mine)| !mine.is_empty())
            .map(|(display, _)| display.id())
            .collect();
        self.screens.retain(|(id, handle)| {
            if window_action(true, occupied.contains(id)) == WindowAction::Close {
                if let Err(error) = handle.update(cx, |_, window, _| window.remove_window()) {
                    eprintln!("cerrar monitor de layout: {error}");
                }
                false
            } else {
                true
            }
        });
        let mut reused = 0;
        let mut opened = 0;
        for ((display, bounds), mine) in displays.iter().zip(&bounds).zip(parts) {
            let existing = self
                .screens
                .iter()
                .find(|(id, _)| *id == display.id())
                .map(|(_, handle)| *handle);
            let action = window_action(existing.is_some(), !mine.is_empty());
            if matches!(action, WindowAction::None | WindowAction::Close) {
                continue;
            }
            let widgets = mine
                .into_iter()
                .filter(|(instance, _)| instance.visible)
                .map(|(instance, at)| {
                    let view = cx.new(|_| {
                        Overlay::with_snapshot(
                            &instance.settings,
                            self.prefs,
                            self.last
                                .as_deref()
                                .filter(|_| self.last_demand.covers(&instance.settings.demand())),
                        )
                    });
                    PlacedOverlay {
                        view,
                        at,
                        opacity: instance.opacity,
                    }
                })
                .collect();
            if let Some(handle) = existing {
                match handle.update(cx, |screen, _, cx| {
                    screen.widgets = widgets;
                    cx.notify();
                }) {
                    Ok(()) => reused += 1,
                    Err(error) => eprintln!("aplicar layout en monitor existente: {error}"),
                }
            } else {
                let mut options = popup(*bounds);
                options.display_id = Some(display.id());
                let origin = (f32::from(bounds.origin.x), f32::from(bounds.origin.y));
                match cx.open_window(options, |_, cx| {
                    cx.new(|_| Screen {
                        widgets,
                        origin,
                        hwnd: None,
                    })
                }) {
                    Ok(handle) => {
                        self.screens.push((display.id(), handle));
                        opened += 1;
                    }
                    Err(error) => eprintln!("abrir monitor de layout: {error}"),
                }
            }
        }
        eprintln!(
            "layout aplicado: {} instancias visibles, {reused} ventanas reutilizadas, {opened} creadas, {} activas",
            layout
                .instances
                .iter()
                .filter(|instance| instance.visible)
                .count(),
            self.screens.len()
        );
    }

    fn ingest(&mut self, photo: vantare_ipc::Photo, cx: &mut App) {
        if !photo.demand.covers(&self.required) {
            return;
        }
        let snapshot = photo.snapshot;
        self.last_demand = photo.demand;
        for (_, handle) in &self.screens {
            if let Err(error) = handle.update(cx, |screen, _, cx| {
                for placed in &screen.widgets {
                    placed
                        .view
                        .update(cx, |overlay, cx| overlay.ingest(&snapshot, cx));
                }
            }) {
                eprintln!("actualizar monitor de layout: {error}");
            }
        }
        self.last = Some(snapshot);
    }
}

/// Vigila el documento cada 500 ms. El proceso sigue vivo incluso sin ventanas;
/// solo cambia sus HWND cuando cambia el conjunto de monitores ocupados.
pub fn run_layout_with_rights(
    path: PathBuf,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    rights: Option<vantare_ipc::control::Feed>,
) -> Result<(), crate::layout::Error> {
    run_layout_feed(path, snapshots, rights, vantare_ipc::Photo::full, None)
}

pub fn run_layout_requested(
    path: PathBuf,
    photos: flume::Receiver<vantare_ipc::Photo>,
    rights: Option<vantare_ipc::control::Feed>,
    demand: crate::source::DemandHandle,
) -> Result<(), crate::layout::Error> {
    run_layout_feed(path, photos, rights, std::convert::identity, Some(demand))
}

fn run_layout_feed<T: Send + 'static>(
    path: PathBuf,
    snapshots: flume::Receiver<T>,
    rights: Option<vantare_ipc::control::Feed>,
    decode: impl Fn(T) -> vantare_ipc::Photo + Send + 'static,
    demand: Option<crate::source::DemandHandle>,
) -> Result<(), crate::layout::Error> {
    let mut document = crate::layout::Document::open(path)?;
    gpui_platform::application().run(move |cx: &mut App| {
        if !init(cx) {
            return;
        }
        crate::rights::install(rights, cx);
        // Windows usa LastWindowClosed por defecto. Un layout vacío debe poder
        // recuperar sus ventanas al guardar el documento, sin reiniciar el proceso.
        cx.set_quit_mode(gpui::QuitMode::Explicit);
        #[cfg(feature = "paint-stats")]
        crate::stats::report();
        let screens = Rc::new(RefCell::new(LiveScreens {
            screens: Vec::new(),
            prefs: document.layout().preferences,
            last: None,
            last_demand: vantare_ipc::Demand::default(),
            required: document.layout().demand(),
        }));
        if let Some(demand) = &demand {
            demand.set(document.layout().demand());
        }
        screens.borrow_mut().apply(document.layout(), cx);
        let feed_screens = screens.clone();
        cx.spawn(async move |cx| {
            while let Ok(snapshot) = snapshots.recv_async().await {
                cx.update(|cx| feed_screens.borrow_mut().ingest(decode(snapshot), cx));
            }
        })
        .detach();
        cx.spawn(async move |cx| {
            let mut last_error = None;
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(500))
                    .await;
                match document.poll() {
                    Ok(true) => {
                        last_error = None;
                        if let Some(demand) = &demand {
                            demand.set(document.layout().demand());
                        }
                        cx.update(|cx| screens.borrow_mut().apply(document.layout(), cx));
                    }
                    Ok(false) => last_error = None,
                    Err(error) => {
                        let message = error.to_string();
                        if last_error.as_ref() != Some(&message) {
                            eprintln!("layout conservado: {message}");
                            last_error = Some(message);
                        }
                    }
                }
            }
        })
        .detach();
    });
    Ok(())
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

/// Abre la cuadrícula de widgets y reenvía cada foto a todas sus ventanas.
/// Si se pasa `rights`, instala la política de acceso en los overlays.
pub fn run_with_rights(
    windows: usize,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    prefs: Preferences,
    rights: Option<vantare_ipc::control::Feed>,
) {
    let placed = (0..windows).map(|i| (kind_of(i), origin_of(i))).collect();
    run_placed_authorized(placed, snapshots, prefs, rights);
}

/// Abre los widgets y sus posiciones (px globales de pantalla) dados.
pub fn run_placed(
    placed: Vec<(Kind, (f32, f32))>,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    prefs: Preferences,
) {
    run_placed_authorized(placed, snapshots, prefs, None);
}

fn run_placed_authorized(
    placed: Vec<(Kind, (f32, f32))>,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    prefs: Preferences,
    rights: Option<vantare_ipc::control::Feed>,
) {
    gpui_platform::application().run(move |cx: &mut App| {
        if !init(cx) {
            return;
        }
        crate::rights::install(rights, cx);
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
    #[test]
    fn preview_scale_does_not_resize_the_logical_widget_and_rejects_invalid_factors() {
        let mut overlay = super::Overlay::new(
            crate::Kind::Standings,
            vantare_domain::format::Preferences::default(),
        );
        let size = overlay.wanted_size();
        assert_eq!(overlay.preview_scale, 1.0);
        overlay.set_preview_scale(700.0 / 1920.0).expect("preview");
        assert_eq!(overlay.wanted_size(), size);
        for invalid in [0.0, -0.5, f32::NAN, f32::INFINITY] {
            assert!(overlay.set_preview_scale(invalid).is_err());
            assert_eq!(overlay.preview_scale, 700.0 / 1920.0);
        }
    }
    use super::*;
    use gpui::size;

    #[test]
    fn changed_settings_recreate_the_widget_and_reingest_the_latest_snapshot() {
        let snapshot = crate::source::fixed();
        let prefs = Preferences::default();
        let initial = Settings::default_for(Kind::Standings);
        let before = Overlay::with_snapshot(&initial, prefs, Some(&snapshot));
        let Settings::Standings(mut options) = initial else {
            panic!("Standings");
        };
        options.show_session_footer = false;
        let mut after =
            Overlay::with_snapshot(&Settings::Standings(options), prefs, Some(&snapshot));
        assert_eq!(after.wanted_size().0, before.wanted_size().0);
        assert_eq!(
            before.wanted_size().1 - after.wanted_size().1,
            crate::standings::model::FOOTER_HEIGHT
        );
        assert!(
            !after.widget.ingest(&snapshot, prefs),
            "la nueva vista ya recibió la última foto"
        );
    }

    #[test]
    fn layout_preferences_reproject_the_latest_photo_without_waiting_for_telemetry() {
        use vantare_domain::format::{Language, Units};
        let layout = crate::layout::Layout {
            preferences: Preferences {
                units: Units::Imperial,
                language: Language::En,
            },
            ..Default::default()
        };
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/pedals.snapshot.json"))
                .expect("fixture de pedales con velocidad disponible");
        let mut overlay = Overlay::with_snapshot(
            &Settings::default_for(Kind::Pedals),
            layout.preferences,
            Some(&snapshot),
        );
        assert_eq!(overlay.prefs, layout.preferences);
        assert!(!overlay.widget.ingest(&snapshot, layout.preferences));
        assert!(
            overlay.widget.ingest(&snapshot, Preferences::default()),
            "el formato anterior produce otra proyección"
        );
    }

    #[test]
    fn applying_reuses_occupied_monitor_windows_and_hiding_all_keeps_occupancy() {
        let mut layout =
            crate::layout::Layout::from_json(include_bytes!("../fixtures/layout.json"))
                .expect("fixture");
        let monitors = [Bounds::new(
            point(px(0.0), px(0.0)),
            size(px(1920.0), px(1080.0)),
        )];
        let occupied = |layout: &crate::layout::Layout| {
            let placed: Vec<_> = layout
                .instances
                .iter()
                .map(|instance| (instance.id.as_str(), (instance.x, instance.y)))
                .collect();
            !partition(&monitors, &placed)[0].is_empty()
        };
        assert_eq!(window_action(false, occupied(&layout)), WindowAction::Open);
        for instance in &mut layout.instances {
            instance.visible = false;
        }
        assert_eq!(
            window_action(true, occupied(&layout)),
            WindowAction::ReplaceContents
        );
        layout.instances.clear();
        assert_eq!(window_action(true, occupied(&layout)), WindowAction::Close);
        assert_eq!(window_action(false, occupied(&layout)), WindowAction::None);
        // QuitMode::Explicit permite recuperar un layout vacío sin reiniciar;
        // la QA de ventana comprueba ese ciclo.
    }

    #[test]
    fn settings_defaults_partial_json_and_normalization_match_manifest_keys() {
        for &kind in Kind::ALL {
            let parsed: Settings = serde_json::from_value(serde_json::json!({"kind": kind.name()}))
                .expect("opciones parciales");
            assert_eq!(parsed, Settings::default_for(kind));
            assert_eq!(parsed.normalized(), parsed);
            assert!(settings_limit(&parsed).is_none());
        }
        let parsed: Settings = serde_json::from_value(
            serde_json::json!({"kind":"racing-flags","textColor":"#aBc123"}),
        )
        .expect("color");
        assert_eq!(
            serde_json::to_value(parsed.normalized()).expect("serializar")["textColor"],
            "#abc123"
        );
        let parsed: Settings =
            serde_json::from_value(serde_json::json!({"kind":"racing-flags","textColor":"rojo"}))
                .expect("color inválido");
        assert_eq!(
            parsed.normalized(),
            Settings::default_for(Kind::RacingFlags)
        );
        for (kind, key) in [
            (Kind::Delta, "templateId"),
            (Kind::HeadToHead, "target"),
            (Kind::PedalsTelemetry, "steeringWheel"),
        ] {
            let mut value = serde_json::json!({"kind":kind.name()});
            value[key] = "desconocido".into();
            let settings: Settings = serde_json::from_value(value).expect("opciones");
            assert_eq!(settings.normalized(), Settings::default_for(kind));
        }
    }

    #[test]
    fn registry_names_roundtrip_and_each_widget_accepts_a_snapshot() {
        for (index, &kind) in Kind::ALL.iter().enumerate() {
            assert_eq!(kind.name().parse(), Ok(kind));
            assert!(!Kind::ALL[..index].iter().any(|k| k.name() == kind.name()));
            let settings = Settings::default_for(kind);
            let bytes = serde_json::to_vec(&settings).expect("serializar opciones");
            assert_eq!(
                serde_json::from_slice::<Settings>(&bytes).expect("opciones"),
                settings
            );
            assert_eq!(settings.kind(), kind);
            let mut widget = Widget::new(&settings, Preferences::default());
            widget.ingest(&crate::source::fixed(), Preferences::default());
            let (w, h) = widget.size();
            assert!(w > 0.0 && h > 0.0 && w.is_finite() && h.is_finite());
        }
        assert!("unknown".parse::<Kind>().is_err());
    }

    #[test]
    fn parity_scenes_use_the_existing_snapshot_wire_format() {
        let standings = vantare_ipc::snapshot_from_json(include_str!(
            "../fixtures/standings-legacy.snapshot.json"
        ))
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
