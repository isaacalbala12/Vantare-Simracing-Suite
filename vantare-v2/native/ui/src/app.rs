//! Proceso de overlays: widgets GPUI (una ventana por monitor)
//! alimentados por un canal de `Snapshot`s. Cada widget proyecta la instantánea
//! con el `ViewModel` de `domain` que le corresponde y solo repinta cuando ese
//! ViewModel cambia.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;
use std::sync::Arc;
use std::time::{Duration, Instant};

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

#[derive(Default)]
struct WakeDeadline(Option<Instant>);

impl WakeDeadline {
    fn schedule(&mut self, deadline: Instant) -> bool {
        if self.0.is_some_and(|pending| pending <= deadline) {
            return false;
        }
        self.0 = Some(deadline);
        true
    }

    fn fired(&mut self, deadline: Instant) -> bool {
        if self.0 != Some(deadline) {
            return false;
        }
        self.0 = None;
        true
    }
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

/// Layout inicial de un usuario nuevo (#1464) para el monitor `(x, y, ancho, alto)`:
/// Standings a la izquierda, Relative a la derecha, Delta y Pedales abajo al
/// centro. Los márgenes son proporcionales y dejan libre el centro de la vista.
pub(crate) fn starter_layout(monitor: (f32, f32, f32, f32)) -> crate::layout::Layout {
    let (x, y, width, height) = monitor;
    let (top, side, bottom) = (y + height * 0.08, width * 0.02, y + height * 0.94);
    let delta = Kind::Delta.size();
    let pedals = Kind::Pedals.size();
    let delta_x = x + (width - delta.0) / 2.0;
    let placed = [
        ("standings", Kind::Standings, (x + side, top)),
        (
            "relative",
            Kind::Relative,
            (x + width - side - Kind::Relative.size().0, top),
        ),
        ("delta", Kind::Delta, (delta_x, bottom - delta.1)),
        (
            "pedals",
            Kind::Pedals,
            (delta_x + delta.0 + 20.0, bottom - pedals.1),
        ),
    ];
    crate::layout::Layout {
        instances: placed
            .into_iter()
            .map(|(id, kind, (x, y))| crate::layout::Instance {
                geometry: crate::geometry::Geometry::default(),
                id: id.into(),
                x: x.round(),
                y: y.round(),
                visible: true,
                opacity: 1.0,
                settings: Settings::default_for(kind),
            })
            .collect(),
        ..crate::layout::Layout::default()
    }
}

/// Widget de una ventana: proyecta la instantánea y se pinta en un lienzo de su
/// tamaño. No sabe si la ventana es suya o compartida con otros widgets.
pub struct Overlay {
    kind: Kind,
    widget: Widget,
    prefs: Preferences,
    /// Hay un despertar programado (ver `wake_after`).
    wake_deadline: WakeDeadline,
    wake_task: Option<gpui::Task<()>>,
    frame_size: Option<crate::geometry::Size>,
    preview_scale: f32,
    preview_scale_y: f32,
    paused: bool,
    live_projection: bool,
    #[cfg(feature = "paint-stats")]
    profile_photo: Option<(u64, u64)>,
    /// Fondo opaco para la captura con alfa (dos pasadas negro/blanco).
    #[cfg(feature = "parity-capture")]
    pub(crate) backdrop: Option<gpui::Hsla>,
}

impl Overlay {
    /// Solo Workshop suministra un estilo de desarrollo; producto usa valores compilados.
    pub(crate) fn standings_style(
        &mut self,
        style: Arc<crate::standings::style::Style>,
        cx: &mut Context<Self>,
    ) {
        if let Widget::Standings(widget) = &mut self.widget {
            widget.set_style(style);
            cx.notify();
        }
    }

    /// Estilo Vantare en Workshop en vivo (Standings y Relative).
    pub(crate) fn vantare_style(
        &mut self,
        style: Arc<crate::vantare::style::Style>,
        cx: &mut Context<Self>,
    ) {
        match &mut self.widget {
            Widget::Standings(widget) => widget.set_vantare_style(style),
            Widget::Relative(widget) => widget.set_vantare_style(style),
            Widget::FuelStrategy(widget) => widget.set_vantare_style(style),
            Widget::Delta(widget) => widget.set_vantare_style(style),
            _ => return,
        }
        cx.notify();
    }

    /// Workshop: columnas Vantare colocadas del widget.
    pub(crate) fn vantare_columns(&self) -> Option<crate::vantare::columns::ColumnBoxes> {
        match &self.widget {
            Widget::Standings(widget) => widget.vantare_columns(),
            Widget::Relative(widget) => widget.vantare_columns(),
            _ => None,
        }
    }

    /// QA: misma fase del pulso Fuel en baseline y candidato.
    #[cfg(feature = "parity-capture")]
    pub(crate) fn freeze_for_capture(&mut self) {
        if let Widget::FuelStrategy(w) = &mut self.widget {
            w.freeze_for_capture();
        }
    }
    /// Workshop: da por terminadas las animaciones de las fotos ya ingeridas.
    pub(crate) fn settle(&mut self) {
        match &mut self.widget {
            Widget::Standings(widget) => widget.settle(),
            Widget::Relative(widget) => widget.settle(),
            Widget::FuelStrategy(widget) => widget.settle(),
            Widget::Delta(widget) => widget.settle(),
            _ => {}
        }
    }

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
            wake_deadline: WakeDeadline::default(),
            wake_task: None,
            frame_size: None,
            preview_scale: 1.0,
            preview_scale_y: 1.0,
            paused: false,
            live_projection: false,
            #[cfg(feature = "paint-stats")]
            profile_photo: None,
            #[cfg(feature = "parity-capture")]
            backdrop: None,
        }
    }

    /// Solo cambia presentación: mantiene la proyección y los avisos del widget.
    pub fn set_look(&mut self, look: crate::look::Look) {
        match &mut self.widget {
            Widget::Standings(w) => w.set_look(look, self.prefs),
            Widget::Relative(w) => w.set_look(look, self.prefs),
            Widget::Delta(w) => w.set_look(look, self.prefs),
            Widget::FuelStrategy(w) => w.set_look(look, self.prefs),
            _ => {}
        }
    }

    fn with_snapshot(settings: &Settings, prefs: Preferences, snapshot: Option<&Snapshot>) -> Self {
        let mut overlay = Self::configured(settings, prefs);
        if let Some(snapshot) = snapshot {
            overlay.project_snapshot(snapshot);
        }
        overlay
    }

    /// Conserva el vencimiento más temprano. Reemplazar la tarea cancela el
    /// timer anterior; destruir el Overlay también lo cancela.
    fn wake_after(&mut self, after: Duration, cx: &mut Context<Self>) {
        let Some(deadline) = Instant::now().checked_add(after) else {
            eprintln!("vencimiento de widget fuera del rango del reloj");
            return;
        };
        if !self.wake_deadline.schedule(deadline) {
            return;
        }
        self.wake_task = Some(cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(deadline.saturating_duration_since(Instant::now()))
                .await;
            let _ = this.update(cx, |overlay, cx| {
                if overlay.wake_deadline.fired(deadline) {
                    overlay.wake_task = None;
                    cx.notify();
                }
            });
        }));
    }

    pub fn wanted_size(&self) -> (f32, f32) {
        let (width, height) = self.widget.size();
        (width, height + if self.paused { 22.0 } else { 0.0 })
    }

    pub fn frame_size(&self) -> (f32, f32) {
        self.frame_size
            .map_or_else(|| self.wanted_size(), crate::geometry::Size::tuple)
    }
    /// Extensión pintada del host: escala proporcional por ancho y recorte
    /// por el alto del marco. Un marco alto no añade píxeles al widget.
    pub fn painted_size(&self) -> (f32, f32) {
        let natural = self.wanted_size();
        let frame = self.frame_size();
        (frame.0, frame.1.min(natural.1 * frame.0 / natural.0))
    }
    pub fn set_frame_size(&mut self, size: Option<crate::geometry::Size>) {
        self.frame_size = size;
    }

    /// Solo el host de preview reduce/amplía el renderer. Las ventanas reales
    /// conservan el factor 1; tamaño lógico y ViewModel permanecen iguales.
    pub fn set_preview_scale(&mut self, scale: f32) -> Result<(), &'static str> {
        if !scale.is_finite() || scale <= 0.0 {
            return Err("la escala de preview debe ser finita y positiva");
        }
        self.preview_scale = scale;
        self.preview_scale_y = scale;
        Ok(())
    }

    pub(crate) fn set_preview_axes(&mut self, x: f32, y: f32) -> Result<(), &'static str> {
        if !x.is_finite() || !y.is_finite() || x <= 0.0 || y <= 0.0 {
            return Err("las escalas de preview deben ser finitas y positivas");
        }
        self.preview_scale = x;
        self.preview_scale_y = y;
        Ok(())
    }

    pub(crate) fn workshop_layout(&mut self) {
        if let Widget::Relative(widget) = &mut self.widget {
            widget.workshop_layout();
        }
    }

    pub(crate) fn standings_study(&mut self, study: &str) {
        if let Widget::Standings(widget) = &mut self.widget {
            widget.set_study(study);
        }
    }

    /// Proyecta la instantánea y repinta solo si el ViewModel cambió.
    pub fn ingest(&mut self, snapshot: &Snapshot, cx: &mut Context<Self>) {
        #[cfg(feature = "paint-stats")]
        let _span = crate::profiling::begin(crate::profiling::Stage::Project);
        #[cfg(feature = "paint-stats")]
        crate::stats::ingest(self.kind);
        if crate::rights::denied(self.kind, cx) {
            return;
        }
        if self.project_snapshot(snapshot) {
            #[cfg(feature = "paint-stats")]
            {
                self.profile_photo = Some((snapshot.epoch, snapshot.sequence));
            }
            cx.notify();
        }
    }

    /// La pausa pertenece al host común. Los renderers conservan su última
    /// proyección, incluidas historias y orden; una ventana recién abierta
    /// puede proyectar la foto conservada, sin tratarla como desconectada.
    fn project_snapshot(&mut self, snapshot: &Snapshot) -> bool {
        let paused = snapshot.state.source_state == vantare_domain::SourceState::Paused;
        if paused && self.paused {
            return false;
        }
        let changed = self.paused != paused;
        self.paused = paused;
        if paused && self.live_projection {
            return changed;
        }
        let projected = if paused {
            let mut retained = snapshot.clone();
            retained.state.source_state = vantare_domain::SourceState::Live;
            self.widget.ingest(&retained, self.prefs)
        } else {
            self.widget.ingest(snapshot, self.prefs)
        };
        self.live_projection = paused
            || (snapshot.state.source_state == vantare_domain::SourceState::Live
                && snapshot.state.capabilities.driver_inputs
                    != vantare_domain::Capability::WithData
                && snapshot.state.capabilities.positions != vantare_domain::Capability::WithData);
        changed || projected
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.widget.animating()
    }
}

// Estas claves legacy se conservan en el documento, pero no se proyectan.
fn settings_limit(settings: &Settings) -> Option<&'static str> {
    match settings {
        Settings::Standings(options)
            if options.header_first != "none" || options.header_second != "none" =>
        {
            Some("headerFirst/headerSecond legacy persistidos; no se usan en la cabecera")
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
        #[cfg(feature = "paint-stats")]
        let _span = crate::profiling::begin(crate::profiling::Stage::Render);
        if crate::rights::denied(self.kind, cx) {
            // Sin licencia el widget queda vacío: el aviso único lo pinta `Screen`.
            return div()
                .w(px(self.frame_size().0 * self.preview_scale))
                .h(px(self.frame_size().1 * self.preview_scale_y))
                .into_any_element();
        }
        #[cfg(feature = "paint-stats")]
        let kind = self.widget.kind();
        #[cfg(feature = "paint-stats")]
        crate::stats::render(kind);
        let size = self.wanted_size();
        let paused = self.paused;
        let pause_label = match self.prefs.language {
            vantare_domain::format::Language::Es => "EN PAUSA",
            vantare_domain::format::Language::En => "PAUSED",
        };
        let frame = self.painted_size();
        let factor = frame.0 / size.0;
        let scale = self.preview_scale * factor;
        let scale_y = self.preview_scale_y * factor;
        let reduced = cx
            .try_global::<crate::MotionPolicy>()
            .is_some_and(|policy| policy.0);
        let (paint, wake) = self.widget.frame_with_motion(self.prefs, reduced);
        #[cfg(feature = "paint-stats")]
        let profile_photo = self.profile_photo.take();
        #[cfg(feature = "parity-capture")]
        let backdrop = self.backdrop;
        let element = canvas(
            |_, _, _| (),
            move |bounds, (), window, cx| {
                #[cfg(feature = "paint-stats")]
                let _span = crate::profiling::begin(crate::profiling::Stage::Paint);
                #[cfg(feature = "paint-stats")]
                crate::stats::paint(kind);
                let origin = (f32::from(bounds.origin.x), f32::from(bounds.origin.y));
                text::with_origin(origin, || {
                    let mut window = PaintWindow::new(window, bounds.origin, scale, scale_y);
                    #[cfg(feature = "parity-capture")]
                    if let Some(color) = backdrop {
                        // La marca fuera del recorte confirma la pasada sin asumir
                        // que el widget tenga un margen transparente.
                        crate::efficiency::paint_rect(
                            &mut window,
                            0.0,
                            0.0,
                            size.0.ceil(),
                            size.1.ceil() + crate::capture::MARGIN as f32,
                            color,
                        );
                    }
                    paint(&mut window, cx);
                    if paused {
                        // Franja añadida fuera del widget: no tapa ningún dato.
                        crate::efficiency::paint_rect(
                            &mut window,
                            0.0,
                            size.1 - 22.0,
                            size.0,
                            22.0,
                            crate::efficiency::col(0x101113, 0.95),
                        );
                        text::draw(
                            &mut window,
                            cx,
                            pause_label,
                            8.0,
                            size.1 - 6.0,
                            &text::ink(11.0, 600.0, 0.02, gpui::white()),
                        );
                    }
                });
                #[cfg(feature = "paint-stats")]
                if crate::profiling::enabled()
                    && let Some((epoch, sequence)) = profile_photo
                {
                    crate::profiling::photo("ui_paint", epoch, sequence);
                }
            },
        )
        .w(px(frame.0 * self.preview_scale))
        .h(px(frame.1 * self.preview_scale_y));
        // Sin datos nuevos ni animación en curso no se pide ningún fotograma.
        match wake {
            Wake::Frame => window.request_animation_frame(),
            Wake::At(after) => self.wake_after(after, cx),
            Wake::Idle => {}
        }
        // Preserve the natural renderer path: only a custom frame needs clipping.
        if self.frame_size.is_none() {
            return element.into_any_element();
        }
        div()
            .w(px(frame.0 * self.preview_scale))
            .h(px(frame.1 * self.preview_scale_y))
            .overflow_hidden()
            .child(element)
            .into_any_element()
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
    connection_owner: bool,
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
        crate::stats::frame(window);
        attach(&mut self.hwnd, window, self.origin);
        // Un único aviso discreto en la esquina del primer widget, no uno por widget.
        let notice = self
            .widgets
            .iter()
            .find(|first| crate::rights::denied(first.view.read(cx).kind, cx))
            .map(|first| license_notice(first.at, crate::rights::notice(cx)));
        div()
            .size_full()
            .children(notice)
            .children(self.widgets.iter().map(|placed| {
                // Una vista cacheada se coloca y dimensiona por estilo, no por contenido.
                let (w, h) = placed.view.read(cx).frame_size();
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
            .when(
                self.connection_owner && crate::connection::incompatible(cx),
                |root| {
                    root.child(license_notice(
                        (16.0, 16.0),
                        vantare_ipc::INCOMPATIBLE_COMPONENTS,
                    ))
                },
            )
    }
}

/// Pastilla Orbit/Eficiencia: panel oscuro, punto de acento y texto pequeño.
fn license_notice(at: (f32, f32), message: &'static str) -> gpui::Div {
    use crate::efficiency::tokens;
    div()
        .absolute()
        .left(px(at.0))
        .top(px(at.1))
        .flex()
        .items_center()
        .gap(px(8.0))
        .px(px(12.0))
        .py(px(6.0))
        .rounded_full()
        .bg(crate::efficiency::col(tokens::PANEL, 0.92))
        .border_1()
        .border_color(crate::efficiency::col(tokens::INK, 0.08))
        .font_family("Inter W500")
        .text_size(px(12.0))
        .text_color(crate::efficiency::col(tokens::MUTED, 1.0))
        .child(
            div()
                .size(px(6.0))
                .rounded_full()
                .bg(crate::efficiency::col(tokens::LOSS, 1.0)),
        )
        .child(message)
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
    let mut connection_owner = true;
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
                connection_owner,
                widgets,
                origin,
                hwnd: None,
            })
        });
        connection_owner = false;
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
    cadences: HashMap<String, crate::performance::Cadence>,
    usage_widgets: Option<Vec<String>>,
    /// Último layout aplicado y su ocultación desde la bandeja.
    layout: crate::layout::Layout,
    hidden: bool,
    screens: Vec<(DisplayId, WindowHandle<Screen>)>,
    widgets: HashMap<String, LiveWidget<Entity<Overlay>>>,
    prefs: Preferences,
    last: Option<Arc<Snapshot>>,
    last_demand: vantare_ipc::Demand,
    required: vantare_ipc::Demand,
}

struct LiveWidget<T> {
    settings: Settings,
    visible: bool,
    view: T,
}

fn reconcile_widgets<T>(
    mut previous: HashMap<String, LiveWidget<T>>,
    instances: &[crate::layout::Instance],
    mut create: impl FnMut(&crate::layout::Instance) -> T,
) -> HashMap<String, LiveWidget<T>> {
    instances
        .iter()
        .map(|instance| {
            let view = match previous.remove(&instance.id) {
                Some(old)
                    if old.settings == instance.settings
                        || old.settings.look_change(&instance.settings).is_some() =>
                {
                    old.view
                }
                _ => create(instance),
            };
            (
                instance.id.clone(),
                LiveWidget {
                    settings: instance.settings.clone(),
                    visible: instance.visible,
                    view,
                },
            )
        })
        .collect()
}

impl LiveScreens {
    /// «Mostrar/Ocultar overlays» de la bandeja: vacía las pantallas sin
    /// tocar el documento ni el estado de cada widget.
    #[cfg(windows)]
    fn toggle(&mut self, cx: &mut App) {
        self.hidden = !self.hidden;
        let layout = self.layout.clone();
        self.apply(&layout, cx);
    }

    fn apply(&mut self, layout: &crate::layout::Layout, cx: &mut App) {
        if self.layout.performance != layout.performance {
            self.cadences.clear();
        }
        self.layout.clone_from(layout);
        self.cadences
            .retain(|id, _| layout.instances.iter().any(|item| &item.id == id));
        let mut widget_types: Vec<_> = layout
            .instances
            .iter()
            .filter(|i| i.visible)
            .map(|i| i.settings.kind().name().to_owned())
            .collect();
        widget_types.sort();
        widget_types.dedup();
        if self.usage_widgets.as_ref() != Some(&widget_types) {
            vantare_services::diagnostics::record_usage(
                &vantare_services::diagnostics::Usage::LayoutWidgets {
                    widget_types: widget_types.clone(),
                },
            );
            self.usage_widgets = Some(widget_types);
        }
        self.prefs = layout.preferences;
        self.required = layout.demand();
        let look_changes: std::collections::HashSet<_> = layout
            .instances
            .iter()
            .filter_map(|i| {
                self.widgets
                    .get(&i.id)
                    .and_then(|old| old.settings.look_change(&i.settings))
                    .map(|_| i.id.clone())
            })
            .collect();
        self.widgets = reconcile_widgets(
            std::mem::take(&mut self.widgets),
            &layout.instances,
            |instance| {
                cx.new(|_| {
                    Overlay::with_snapshot(
                        &instance.settings,
                        self.prefs,
                        self.last.as_deref().filter(|_| {
                            instance.visible && self.last_demand.covers(&instance.settings.demand())
                        }),
                    )
                })
            },
        );
        // Las pantallas solo colocan referencias. La entidad pertenece al ID,
        // incluso oculta o fuera de un monitor; preferencias reproyectan sin reset.
        for (id, widget) in &self.widgets {
            widget.view.update(cx, |overlay, cx| {
                let reproject = overlay.prefs != self.prefs || !look_changes.contains(id);
                overlay.prefs = self.prefs;
                if let Some(look) = widget.settings.look() {
                    overlay.set_look(look);
                }
                overlay.set_frame_size(
                    layout
                        .instances
                        .iter()
                        .find(|i| &i.id == id)
                        .and_then(|i| i.geometry.size),
                );
                cx.notify();
                if widget.visible
                    && reproject
                    && let Some(snapshot) = self
                        .last
                        .as_deref()
                        .filter(|_| self.last_demand.covers(&widget.settings.demand()))
                {
                    overlay.ingest(snapshot, cx);
                }
            });
        }
        let displays = cx.displays();
        let bounds: Vec<_> = displays.iter().map(|display| display.bounds()).collect();
        // Una instancia oculta conserva la ocupación de su monitor y su HWND.
        let placed: Vec<_> = layout
            .instances
            .iter()
            .filter(|_| !self.hidden)
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
                .filter(|(instance, _)| instance.visible && !self.hidden)
                .map(|(instance, at)| {
                    let view = self.widgets[&instance.id].view.clone();
                    PlacedOverlay {
                        view,
                        at,
                        opacity: instance.opacity,
                    }
                })
                .collect();
            if let Some(handle) = existing {
                match handle.update(cx, |screen, _, cx| {
                    screen.connection_owner = occupied.first() == Some(&display.id());
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
                        connection_owner: occupied.first() == Some(&display.id()),
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
        let now = Instant::now();
        for (id, widget) in self.widgets.iter().filter(|(_, widget)| widget.visible) {
            let hz = self.layout.performance.hz(id, widget.settings.kind());
            if self.cadences.entry(id.clone()).or_default().due(
                hz,
                (snapshot.epoch, snapshot.state.source_state),
                now,
            ) {
                widget
                    .view
                    .update(cx, |overlay, cx| overlay.ingest(&snapshot, cx));
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
    run_layout_feed(
        path,
        snapshots,
        rights,
        vantare_ipc::Photo::full,
        None,
        false,
    )
}

pub fn run_layout_requested(
    path: PathBuf,
    photos: flume::Receiver<vantare_ipc::Photo>,
    rights: Option<vantare_ipc::control::Feed>,
    demand: crate::source::DemandHandle,
) -> Result<(), crate::layout::Error> {
    run_layout_requested_hidden(path, photos, rights, demand, false)
}

pub fn run_layout_requested_hidden(
    path: PathBuf,
    photos: flume::Receiver<vantare_ipc::Photo>,
    rights: Option<vantare_ipc::control::Feed>,
    demand: crate::source::DemandHandle,
    start_hidden: bool,
) -> Result<(), crate::layout::Error> {
    run_layout_feed(
        path,
        photos,
        rights,
        std::convert::identity,
        Some(demand),
        start_hidden,
    )
}

fn run_layout_feed<T: Send + 'static>(
    path: PathBuf,
    snapshots: flume::Receiver<T>,
    rights: Option<vantare_ipc::control::Feed>,
    decode: impl Fn(T) -> vantare_ipc::Photo + Send + 'static,
    demand: Option<crate::source::DemandHandle>,
    start_hidden: bool,
) -> Result<(), crate::layout::Error> {
    let mut presentation = crate::layout::Presentation::watch(&path)?;
    let mut document = crate::layout::Document::open(path)?;
    gpui_platform::application().run(move |cx: &mut App| {
        if !init(cx) {
            return;
        }
        crate::rights::install(rights, cx);
        if let Some(display) = cx.primary_display() {
            let bounds = display.bounds();
            let monitor = (
                f32::from(bounds.origin.x),
                f32::from(bounds.origin.y),
                f32::from(bounds.size.width),
                f32::from(bounds.size.height),
            );
            if let Err(error) = document.initialize(monitor) {
                eprintln!("layout inicial no guardado: {error}");
            }
        }
        // Windows usa LastWindowClosed por defecto. Un layout vacío debe poder
        // recuperar sus ventanas al guardar el documento, sin reiniciar el proceso.
        cx.set_quit_mode(gpui::QuitMode::Explicit);
        #[cfg(feature = "paint-stats")]
        crate::stats::report();
        crate::connection::install(
            demand.as_ref().map(crate::source::DemandHandle::connection),
            cx,
        );
        let screens = Rc::new(RefCell::new(LiveScreens {
            cadences: HashMap::new(),
            usage_widgets: None,
            layout: crate::layout::Layout::default(),
            hidden: start_hidden,
            screens: Vec::new(),
            widgets: HashMap::new(),
            prefs: document.layout().preferences,
            last: None,
            last_demand: vantare_ipc::Demand::default(),
            required: document.layout().demand(),
        }));
        if let Some(demand) = &demand {
            demand.set(document.layout().demand());
        }
        screens.borrow_mut().apply(document.layout(), cx);
        #[cfg(windows)]
        match crate::tray::spawn() {
            Ok(actions) => {
                let tray_screens = screens.clone();
                cx.spawn(async move |cx| {
                    while let Ok(action) = actions.recv_async().await {
                        cx.update(|cx| match action {
                            crate::tray::Action::Toggle => tray_screens.borrow_mut().toggle(cx),
                            crate::tray::Action::Quit => cx.quit(),
                        });
                    }
                })
                .detach();
            }
            Err(error) => eprintln!("icono de bandeja no disponible: {error}"),
        }
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
                match presentation.poll() {
                    Ok(true) => cx.update(|cx| {
                        let mut screens = screens.borrow_mut();
                        screens.hidden = false;
                        let layout = screens.layout.clone();
                        screens.apply(&layout, cx);
                    }),
                    Ok(false) => {}
                    Err(error) => eprintln!("solicitud de mostrar en pista: {error}"),
                }
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
    crate::motion_policy::install(cx);
    // Inter para todos; Rajdhani y Space Mono para el sistema Vantare.
    match text::register_fonts(cx).and_then(|()| crate::theme::register_fonts(cx)) {
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
    run_placed_authorized(placed, snapshots, prefs, rights, None);
}

/// Abre los widgets y sus posiciones (px globales de pantalla) dados.
pub fn run_placed(
    placed: Vec<(Kind, (f32, f32))>,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    prefs: Preferences,
) {
    run_placed_authorized(placed, snapshots, prefs, None, None);
}

/// Abre la campaña con un único aviso del estado de conexión en el host.
pub fn run_with_connection(
    windows: usize,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    prefs: Preferences,
    rights: Option<vantare_ipc::control::Feed>,
    connection: Option<vantare_ipc::ConnectionStatus>,
) {
    let placed = (0..windows).map(|i| (kind_of(i), origin_of(i))).collect();
    run_placed_authorized(placed, snapshots, prefs, rights, connection);
}

fn run_placed_authorized(
    placed: Vec<(Kind, (f32, f32))>,
    snapshots: flume::Receiver<Arc<Snapshot>>,
    prefs: Preferences,
    rights: Option<vantare_ipc::control::Feed>,
    connection: Option<vantare_ipc::ConnectionStatus>,
) {
    gpui_platform::application().run(move |cx: &mut App| {
        if !init(cx) {
            return;
        }
        crate::rights::install(rights, cx);
        crate::connection::install(connection, cx);
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
    fn reduced_motion_never_requests_animation_frames_for_any_widget() {
        let prefs = Preferences::default();
        for &kind in Kind::ALL {
            let path = format!(
                "{}/fixtures/{}.snapshot.json",
                env!("CARGO_MANIFEST_DIR"),
                kind.name()
            );
            let json = std::fs::read_to_string(path).expect("fixture");
            let snapshot = vantare_ipc::snapshot_from_json(&json).expect("snapshot");
            let mut widget = crate::Widget::new(&crate::Settings::default_for(kind), prefs);
            widget.ingest(&snapshot, prefs);
            for _ in 0..3 {
                assert_ne!(
                    widget.frame_with_motion(prefs, true).1,
                    Wake::Frame,
                    "{}",
                    kind.name()
                );
            }
        }
    }
    #[test]
    fn reduced_motion_settles_new_vantare_race_sequences() {
        let prefs = Preferences::default();
        for (kind, scene) in [
            (
                Kind::Standings,
                include_str!("../fixtures/standings-vantare-carrera.scene.json"),
            ),
            (
                Kind::Relative,
                include_str!("../fixtures/relative-vantare-carrera.scene.json"),
            ),
            (
                Kind::Delta,
                include_str!("../fixtures/delta-vantare-carrera.scene.json"),
            ),
            (
                Kind::FuelStrategy,
                include_str!("../fixtures/fuel-vantare-carrera.scene.json"),
            ),
        ] {
            let scene: serde_json::Value = serde_json::from_str(scene).expect("escena");
            let mut widget = crate::Widget::new(&crate::Settings::default_for(kind), prefs);
            for frame in scene["frames"].as_array().expect("fases") {
                let snapshot =
                    vantare_ipc::snapshot_from_json(&frame["snapshot"].to_string()).expect("foto");
                widget.ingest(&snapshot, prefs);
                assert_ne!(
                    widget.frame_with_motion(prefs, true).1,
                    Wake::Frame,
                    "{}",
                    kind.name()
                );
            }
        }
    }
    #[test]
    fn frame_geometry_scales_shared_host_and_intrinsic_size_stays_canonical() {
        let mut overlay = Overlay::new(Kind::Standings, Preferences::default());
        let natural = overlay.wanted_size();
        let size = crate::geometry::Size {
            width: natural.0 * 1.5,
            height: natural.1 * 0.7,
        };
        overlay.set_frame_size(Some(size));
        overlay.set_preview_scale(0.5).expect("canvas scale");
        assert_eq!(overlay.frame_size(), size.tuple());
        assert_eq!(overlay.wanted_size(), natural);
        overlay.set_frame_size(None);
        assert_eq!(overlay.frame_size(), natural);
    }
    #[test]
    fn painted_bounds_exclude_blank_frame_height_and_preserve_short_frame_clipping() {
        for &kind in Kind::ALL {
            let mut overlay = Overlay::new(kind, Preferences::default());
            let natural = overlay.wanted_size();
            assert_eq!(overlay.painted_size(), natural);
            for scale in [0.5, 1.0, 2.0] {
                let scaled = (natural.0 * scale, natural.1 * scale);
                overlay.set_frame_size(Some(crate::geometry::Size {
                    width: scaled.0,
                    height: scaled.1 * 2.0,
                }));
                assert_eq!(overlay.painted_size(), scaled, "{kind:?}");
                overlay.set_frame_size(Some(crate::geometry::Size {
                    width: scaled.0,
                    height: scaled.1 * 0.5,
                }));
                assert_eq!(
                    overlay.painted_size(),
                    (scaled.0, scaled.1 * 0.5),
                    "{kind:?}"
                );
                assert_eq!(overlay.wanted_size(), natural);
            }
        }
    }
    #[test]
    fn identical_samples_request_no_repaint_for_all_widgets() {
        let prefs = Preferences::default();
        for &kind in Kind::ALL {
            let path = format!(
                "{}/fixtures/{}.snapshot.json",
                env!("CARGO_MANIFEST_DIR"),
                kind.name()
            );
            let json = std::fs::read_to_string(path).expect("escena del widget");
            let snapshot = vantare_ipc::snapshot_from_json(&json).expect("foto");
            let mut overlay = Overlay::new(kind, prefs);
            overlay.project_snapshot(&snapshot);
            let repaints = (0..100)
                .filter(|_| overlay.project_snapshot(&snapshot))
                .count();
            assert_eq!(repaints, 0, "{}: misma muestra", kind.name());
        }
    }

    #[test]
    fn new_samples_with_unchanged_values_request_no_repaint_without_histories() {
        for &kind in Kind::ALL {
            if matches!(kind, Kind::InputTelemetry | Kind::DeltaTrace) {
                continue;
            }
            let path = format!(
                "{}/fixtures/{}.snapshot.json",
                env!("CARGO_MANIFEST_DIR"),
                kind.name()
            );
            let json = std::fs::read_to_string(path).expect("escena del widget");
            let mut snapshot = vantare_ipc::snapshot_from_json(&json).expect("foto");
            let mut overlay = Overlay::new(kind, Preferences::default());
            overlay.project_snapshot(&snapshot);
            for _ in 0..100 {
                snapshot.sequence += 1;
                snapshot.origin.received_at += Duration::from_millis(100);
                assert!(
                    !overlay.project_snapshot(&snapshot),
                    "{}: mismos valores",
                    kind.name()
                );
            }
        }
    }

    #[test]
    fn unchanged_values_still_extend_input_and_delta_histories() {
        for kind in [Kind::InputTelemetry, Kind::DeltaTrace] {
            let path = format!(
                "{}/fixtures/{}.snapshot.json",
                env!("CARGO_MANIFEST_DIR"),
                kind.name()
            );
            let json = std::fs::read_to_string(path).expect("escena del widget");
            let mut snapshot = vantare_ipc::snapshot_from_json(&json).expect("foto");
            let mut overlay = Overlay::new(kind, Preferences::default());
            overlay.project_snapshot(&snapshot);
            snapshot.sequence += 1;
            snapshot.origin.received_at += Duration::from_millis(100);
            assert!(
                overlay.project_snapshot(&snapshot),
                "{}: nueva muestra",
                kind.name()
            );
            assert!(
                !overlay.project_snapshot(&snapshot),
                "{}: duplicado",
                kind.name()
            );
        }
    }

    #[test]
    fn layout_spatial_edits_and_visibility_preserve_the_same_widget_state() {
        let prefs = Preferences::default();
        let snapshots = crate::workshop::snapshots_from_json(include_str!(
            "../fixtures/input-telemetry.sequence.json"
        ))
        .expect("historia observada");
        let mut instance = crate::layout::Instance {
            geometry: crate::geometry::Geometry::default(),
            id: "inputs".into(),
            x: 20.0,
            y: 30.0,
            visible: true,
            opacity: 1.0,
            settings: Settings::default_for(Kind::InputTelemetry),
        };
        let mut widgets = reconcile_widgets(HashMap::new(), &[instance.clone()], |instance| {
            let mut overlay = Box::new(Overlay::new(instance.settings.kind(), prefs));
            for snapshot in &snapshots {
                overlay.widget.ingest(snapshot, prefs);
            }
            overlay
        });
        let identity = std::ptr::from_ref(widgets["inputs"].view.as_ref());
        for (x, y, opacity, visible) in [
            (-1200.0, 60.0, 0.5, true),
            (8000.0, 60.0, 0.5, false),
            (20.0, 30.0, 1.0, true),
        ] {
            instance.x = x;
            instance.y = y;
            instance.opacity = opacity;
            instance.visible = visible;
            widgets = reconcile_widgets(widgets, &[instance.clone()], |instance| {
                Box::new(Overlay::with_snapshot(
                    &instance.settings,
                    prefs,
                    snapshots.last(),
                ))
            });
            assert_eq!(
                std::ptr::from_ref(widgets["inputs"].view.as_ref()),
                identity,
                "misma entidad y su historia"
            );
            assert_eq!(widgets["inputs"].visible, visible);
        }
        let latest = snapshots.last().expect("última foto");
        assert!(
            !widgets
                .get_mut("inputs")
                .expect("widget")
                .view
                .widget
                .ingest(latest, prefs)
        );
    }

    #[test]
    fn layout_look_changes_reuse_the_same_renderer_entity() {
        for kind in [
            Kind::Standings,
            Kind::Relative,
            Kind::Delta,
            Kind::FuelStrategy,
        ] {
            let mut instance = crate::layout::Instance {
                geometry: crate::geometry::Geometry::default(),
                id: "board".into(),
                x: 20.0,
                y: 30.0,
                visible: true,
                opacity: 1.0,
                settings: Settings::default_for(kind).normalized(),
            };
            let mut widgets =
                reconcile_widgets(HashMap::new(), &[instance.clone()], |_| Box::new(17));
            let identity = std::ptr::from_ref(widgets["board"].view.as_ref());
            for &look in crate::look::Look::ALL
                .iter()
                .rev()
                .chain(crate::look::Look::ALL)
            {
                instance.settings.set_look(look);
                widgets = reconcile_widgets(widgets, &[instance.clone()], |_| {
                    panic!("Look conserva entidad y estado")
                });
                assert_eq!(std::ptr::from_ref(widgets["board"].view.as_ref()), identity);
            }
        }
    }

    #[test]
    fn layout_recreates_only_changed_settings_types_new_ids_and_deleted_widgets() {
        let mut instance = crate::layout::Instance {
            geometry: crate::geometry::Geometry::default(),
            id: "inputs".into(),
            x: 20.0,
            y: 30.0,
            visible: true,
            opacity: 1.0,
            settings: Settings::default_for(Kind::InputTelemetry),
        };
        let mut created = 0;
        let mut apply = |previous, instances: &[crate::layout::Instance]| {
            reconcile_widgets(previous, instances, |_| {
                created += 1;
                created
            })
        };
        let widgets = apply(HashMap::new(), &[instance.clone()]);
        assert_eq!(widgets["inputs"].view, 1);
        let widgets = apply(widgets, &[instance.clone()]);
        assert_eq!(widgets["inputs"].view, 1);
        if let Settings::InputTelemetry(options) = &mut instance.settings {
            options.show_clutch = false;
        }
        let widgets = apply(widgets, &[instance.clone()]);
        assert_eq!(widgets["inputs"].view, 2);
        instance.settings = Settings::default_for(Kind::Radar);
        let widgets = apply(widgets, &[instance.clone()]);
        assert_eq!(widgets["inputs"].view, 3);
        instance.id = "radar".into();
        let widgets = apply(widgets, &[instance]);
        assert!(!widgets.contains_key("inputs"));
        assert_eq!(widgets["radar"].view, 4);
        let widgets = apply(widgets, &[]);
        assert!(widgets.is_empty());
        assert_eq!(created, 4, "borrar no construye una entidad");
    }

    #[test]
    fn wake_deadline_replaces_a_long_notice_with_an_earlier_expiry() {
        let now = Instant::now();
        let long = now + Duration::from_secs(4);
        let short = now + Duration::from_millis(750);
        let mut pending = WakeDeadline::default();
        assert!(pending.schedule(long));
        assert!(pending.schedule(short), "el aviso de cruce vence antes");
        assert!(!pending.schedule(long));
        assert!(!pending.fired(long), "callback sustituido");
        assert_eq!(pending.0, Some(short));
        assert!(pending.fired(short));
        assert!(!pending.fired(short), "solo notifica una vez");
        assert!(pending.schedule(long));
    }

    #[cfg(windows)]
    #[test]
    fn dropping_an_overlay_cancels_its_pending_task() {
        struct Released(flume::Sender<()>);
        impl Drop for Released {
            fn drop(&mut self) {
                let _ = self.0.send(()); // El receptor puede haber terminado el test.
            }
        }
        let application = gpui_platform::application();
        let executor = application.background_executor();
        let (started_tx, started_rx) = flume::bounded(1);
        let (released_tx, released_rx) = flume::bounded(1);
        let task = executor.spawn(async move {
            let _released = Released(released_tx);
            started_tx.send(()).expect("tarea iniciada");
            std::future::pending::<()>().await;
        });
        started_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("inicio");
        let mut overlay = Overlay::new(Kind::Delta, Preferences::default());
        overlay.wake_task = Some(task);
        drop(overlay);
        released_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("cancelación");
    }

    #[test]
    fn pause_is_shared_by_every_widget_and_does_not_ingest_repeated_photos() {
        let live =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/pedals.snapshot.json"))
                .expect("foto real guardada");
        let mut paused = live.clone();
        paused.state.source_state = vantare_domain::SourceState::Paused;
        for &kind in Kind::ALL {
            let settings = Settings::default_for(kind);
            let mut overlay =
                Overlay::with_snapshot(&settings, Preferences::default(), Some(&live));
            let normal_size = overlay.wanted_size();
            assert!(
                overlay.project_snapshot(&paused),
                "aviso de pausa en {kind:?}"
            );
            assert_eq!(overlay.wanted_size(), (normal_size.0, normal_size.1 + 22.0));
            paused.sequence += 1;
            assert!(
                !overlay.project_snapshot(&paused),
                "no añade historia ni repinta {kind:?}"
            );
            let opened = Overlay::with_snapshot(&settings, Preferences::default(), Some(&paused));
            assert!(opened.paused, "abrir durante pausa en {kind:?}");
            assert_eq!(opened.wanted_size(), overlay.wanted_size());
            assert!(
                overlay.project_snapshot(&live),
                "quita aviso al reanudar {kind:?}"
            );
            assert_eq!(overlay.wanted_size(), normal_size);
        }
    }

    #[test]
    fn pausing_after_inputs_expire_restores_the_retained_pedals_without_an_old_data_notice() {
        let live =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/pedals.snapshot.json"))
                .expect("foto guardada");
        let mut overlay = Overlay::with_snapshot(
            &Settings::default_for(Kind::Pedals),
            Preferences::default(),
            Some(&live),
        );
        let mut outdated = live.clone();
        vantare_domain::degrade(&mut outdated.state);
        outdated.state.source_state = vantare_domain::SourceState::Live;
        assert!(overlay.project_snapshot(&outdated));
        let mut paused = live.clone();
        paused.state.source_state = vantare_domain::SourceState::Paused;
        assert!(overlay.project_snapshot(&paused));
        assert!(
            !overlay.widget.ingest(&live, Preferences::default()),
            "el ViewModel ya contiene los mismos datos y estado que la foto viva conservada"
        );
    }

    #[test]
    fn supported_variants_do_not_report_a_pending_port() {
        for value in [
            serde_json::json!({"kind":"delta", "templateId":"capsule"}),
            serde_json::json!({"kind":"pedals", "transparentBackground":true}),
            serde_json::json!({"kind":"broadcast-tower", "driverCarousel":true}),
            serde_json::json!({"kind":"pedals-telemetry", "steeringWheel":"ferrari-499p"}),
            serde_json::json!({"kind":"racing-flags", "textColor":"#abcdef"}),
            serde_json::json!({"kind":"head-to-head", "target":"behind"}),
            serde_json::json!({"kind":"standings", "templateId":"broadcast", "showBrand":true,
                "footerFirst":"remaining", "footerSecond":"rain",
                "footerSlots":["trackTemperature", "rain", "wetness"]}),
        ] {
            let settings: Settings = serde_json::from_value(value).expect("variante soportada");
            assert_eq!(
                settings.normalized().normalized(),
                settings.normalized(),
                "migración idempotente"
            );
            assert_eq!(
                settings_limit(&settings),
                None,
                "{}",
                settings.kind().name()
            );
        }
    }

    #[test]
    fn ignored_legacy_header_keys_still_report_their_actual_limit() {
        for key in ["headerFirst", "headerSecond"] {
            let mut value = serde_json::json!({"kind":"standings"});
            value[key] = "track".into();
            let settings: Settings = serde_json::from_value(value).expect("cabecera legacy");
            assert_eq!(
                settings_limit(&settings),
                Some("headerFirst/headerSecond legacy persistidos; no se usan en la cabecera")
            );
        }
    }

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
        let initial = Settings::Standings(crate::standings::Settings::eficiencia());
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
            assert_eq!(
                parsed.normalized(),
                Settings::default_for(kind).normalized()
            );
            assert_eq!(parsed.normalized().normalized(), parsed.normalized());
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
    fn starter_layout_fits_the_monitor_without_overlaps_or_covering_the_center() {
        for monitor in [
            (0.0, 0.0, 1920.0, 1080.0),
            (0.0, 0.0, 2560.0, 1440.0),
            (-1280.0, 0.0, 3440.0, 1440.0),
        ] {
            let (mx, my, mw, mh) = monitor;
            let layout = starter_layout(monitor);
            let boxes: Vec<_> = layout
                .instances
                .iter()
                .map(|instance| {
                    let (w, h) = instance.settings.kind().size();
                    (instance.x, instance.y, instance.x + w, instance.y + h)
                })
                .collect();
            assert_eq!(boxes.len(), 4);
            let overlaps = |a: (f32, f32, f32, f32), b: (f32, f32, f32, f32)| {
                a.0 < b.2 && b.0 < a.2 && a.1 < b.3 && b.1 < a.3
            };
            let center = (mx + mw * 0.3, my + mh * 0.3, mx + mw * 0.7, my + mh * 0.7);
            for (index, &area) in boxes.iter().enumerate() {
                assert!(
                    area.0 >= mx && area.1 >= my && area.2 <= mx + mw && area.3 <= my + mh,
                    "{monitor:?}: {area:?} fuera del monitor"
                );
                assert!(
                    !overlaps(area, center),
                    "{monitor:?}: {area:?} tapa el centro"
                );
                for &other in &boxes[index + 1..] {
                    assert!(!overlaps(area, other), "{monitor:?}: {area:?} y {other:?}");
                }
            }
            assert_eq!(
                crate::layout::Layout::from_json(&serde_json::to_vec(&layout).expect("json"))
                    .expect("documento válido"),
                layout
            );
        }
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
