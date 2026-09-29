//! Proceso de overlays: una ventana GPUI por widget, alimentadas por un canal de
//! `Snapshot`s. Cada ventana proyecta la instantánea con el `ViewModel` de
//! `domain` que le corresponde y solo repinta cuando ese ViewModel cambia.

use std::sync::Arc;
use std::time::Instant;

use gpui::{
    App, Bounds, Context, Entity, IntoElement, Render, Window, WindowBackgroundAppearance,
    WindowBounds, WindowKind, WindowOptions, canvas, point, prelude::*, px, size,
};
use vantare_domain::format::Preferences;
use vantare_domain::{Snapshot, pedals, radar, standings};

use crate::overlay::{self, Hwnd};
use crate::standings::model::{self, Config, Metric, Plan, Status, Vm};
use crate::standings::{motion::Motion, view};
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

enum Widget {
    Standings(Box<Standings>),
    Radar(radar::ViewModel),
    Pedals(pedals::ViewModel),
}

pub struct Overlay {
    widget: Widget,
    prefs: Preferences,
    hwnd: Option<Hwnd>,
    /// Tamaño de lienzo aplicado a la ventana.
    window_size: (f32, f32),
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
        let mut overlay = Self {
            widget,
            prefs,
            hwnd: None,
            window_size: (0.0, 0.0),
            #[cfg(feature = "parity-capture")]
            backdrop: None,
        };
        overlay.window_size = overlay.wanted_size();
        overlay
    }

    fn wanted_size(&self) -> (f32, f32) {
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

    #[cfg(feature = "parity-capture")]
    pub(crate) fn hwnd(&self) -> Option<Hwnd> {
        self.hwnd
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
    fn render(&mut self, window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        if self.hwnd.is_none() {
            self.hwnd = overlay::hwnd_of(window);
            if let Some(hwnd) = self.hwnd {
                overlay::apply(hwnd);
            }
        }
        // El alto de Standings sigue a las filas visibles (SPEC §7). Se redimensiona
        // por Win32: `Window::resize` de GPUI volvería a sumar el marco de sistema.
        let wanted = self.wanted_size();
        if self.window_size != wanted {
            self.window_size = wanted;
            if let Some(hwnd) = self.hwnd {
                let scale = window.scale_factor();
                overlay::resize(
                    hwnd,
                    (wanted.0 * scale).round() as i32,
                    (wanted.1 * scale).round() as i32,
                );
            }
        }
        match &mut self.widget {
            Widget::Standings(s) => {
                let now = Instant::now();
                let frame = s.motion.frame(&s.vm, s.plan.visible_rows, now);
                if s.motion.animating(now) {
                    window.request_animation_frame();
                }
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
                canvas(
                    |_, _, _| (),
                    move |_, (), window, cx| view::paint(&scene, window, cx),
                )
                .size_full()
                .into_any_element()
            }
            Widget::Radar(vm) => {
                let vm = vm.clone();
                canvas(
                    |_, _, _| (),
                    move |_, (), window, cx| radar_view::paint(&vm, window, cx),
                )
                .size_full()
                .into_any_element()
            }
            Widget::Pedals(vm) => {
                let vm = vm.clone();
                canvas(
                    |_, _, _| (),
                    move |_, (), window, cx| pedals_view::paint(&vm, window, cx),
                )
                .size_full()
                .into_any_element()
            }
        }
    }
}

/// Abre una ventana overlay en `origin` (px de pantalla) para el widget `kind`.
pub(crate) fn open_window(
    cx: &mut App,
    kind: Kind,
    prefs: Preferences,
    origin: (f32, f32),
) -> gpui::Result<Entity<Overlay>> {
    let overlay = Overlay::new(kind, prefs);
    let canvas_size = overlay.window_size;
    let bounds = Bounds::new(
        point(px(origin.0), px(origin.1)),
        size(px(canvas_size.0), px(canvas_size.1)),
    );
    let options = WindowOptions {
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
    };
    let handle = cx.open_window(options, |_, cx| cx.new(|_| overlay))?;
    handle.entity(cx)
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

/// Reparte los widgets entre las ventanas (Standings, Radar, Pedals, ... en ese
/// orden) y las escalona en pantalla. Solo para la campaña de medición: el
/// colocado real vendrá de la configuración de layout.
fn kind_of(index: usize) -> Kind {
    [Kind::Standings, Kind::Radar, Kind::Pedals][index % 3]
}

fn origin_of(index: usize) -> (f32, f32) {
    (
        20.0 + (index % 4) as f32 * 470.0,
        20.0 + (index / 4) as f32 * 60.0,
    )
}

/// Abre `windows` ventanas y reenvía cada `Snapshot` del canal a todas. Vuelve
/// cuando se cierra la última ventana.
pub fn run(windows: usize, snapshots: flume::Receiver<Arc<Snapshot>>, prefs: Preferences) {
    gpui_platform::application().run(move |cx: &mut App| {
        if !init(cx) {
            return;
        }
        let mut views = Vec::with_capacity(windows);
        for index in 0..windows {
            match open_window(cx, kind_of(index), prefs, origin_of(index)) {
                Ok(view) => views.push(view.downgrade()),
                Err(error) => eprintln!("no se pudo abrir la ventana {index}: {error}"),
            }
        }
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
}
