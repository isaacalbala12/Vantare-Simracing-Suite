//! Aviso Eficiencia de vuelta rápida. Valores y reglas vienen de domain;
//! geometría del renderer productivo a 480 × 104, captura congelada ISA-1427.

use crate::{
    app::{Paint, Wake},
    efficiency::{
        col, paint_rect, rect,
        text::{self, ink},
    },
};
use gpui::{
    App, BorderStyle, Corners, Edges, Window, linear_color_stop, linear_gradient, px, quad,
};
use std::{
    borrow::Cow,
    time::{Duration, Instant},
};
use vantare_domain::{
    Snapshot,
    fastest_lap::{self, Kind, Records, Timing, Update, ViewModel},
    format::Preferences,
};

pub const SIZE: (f32, f32) = (480.0, 104.0);
const LIFETIME: Duration = Duration::from_secs(6);
const TRANSITION: Duration = Duration::from_millis(220);

// Marca inmutable del recurso en esta App: no registrar la fuente en cada frame.
struct Inter750;
impl gpui::Global for Inter750 {}

struct Notice {
    kind: Kind,
    timing: Timing,
    started: Instant,
}

pub(crate) struct Widget {
    vm: ViewModel,
    records: Records,
    notice: Option<Notice>,
}

impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: fastest_lap::project(&Snapshot::default(), prefs),
            records: Records::default(),
            notice: None,
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let next = fastest_lap::project(snapshot, prefs);
        let labels_changed = self.vm.class_label != next.class_label
            || self.vm.personal_label != next.personal_label
            || self.vm.active_class != next.active_class;
        let update = self.records.accept(next.clone());
        #[cfg(feature = "parity-capture")]
        let preview_changed = self.vm.candidate != next.candidate
            || self.vm.personal != next.personal
            || self.vm.ready != next.ready
            || self.vm.active_class != next.active_class;
        self.vm = next;
        let changed = match update {
            Update::Unchanged => labels_changed && self.notice.is_some(),
            Update::Clear => self.notice.take().is_some(),
            Update::Notice(kind, timing) => {
                self.notice = Some(Notice {
                    kind,
                    timing,
                    started: Instant::now(),
                });
                true
            }
        };
        #[cfg(feature = "parity-capture")]
        {
            changed || preview_changed || labels_changed
        }
        #[cfg(not(feature = "parity-capture"))]
        changed
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        if cfg!(feature = "parity-capture") {
            // El harness productivo previsualiza el récord sin crear un aviso live.
            let vm = self.vm.clone();
            let timing = if vm.ready {
                vm.candidate
                    .clone()
                    .or_else(|| vm.personal.clone())
                    .filter(|timing| timing.best_ms.is_some())
            } else {
                None
            };
            let kind = if vm.candidate.is_some() {
                Kind::Class
            } else {
                Kind::Personal
            };
            (
                Box::new(move |window, cx| {
                    if let Some(timing) = &timing {
                        paint(&vm, kind, timing, 1.0, 0.0, window, cx);
                    }
                }),
                Wake::Idle,
            )
        } else {
            let Some(notice) = &self.notice else {
                return (Box::new(|_, _| {}), Wake::Idle);
            };
            let age = notice.started.elapsed();
            let (alpha, offset, wake) = motion(age);
            if age >= LIFETIME {
                self.notice = None;
                return (Box::new(|_, _| {}), Wake::Idle);
            }
            let vm = self.vm.clone();
            let kind = notice.kind;
            let timing = notice.timing.clone();
            (
                Box::new(move |window, cx| paint(&vm, kind, &timing, alpha, offset, window, cx)),
                wake,
            )
        }
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)]
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

fn motion(age: Duration) -> (f32, f32, Wake) {
    if age >= LIFETIME {
        return (0.0, -6.0, Wake::Idle);
    }
    let exit = LIFETIME.saturating_sub(TRANSITION);
    let progress = if age < TRANSITION {
        ease_out(age.as_secs_f32() / TRANSITION.as_secs_f32())
    } else if age >= exit {
        // ease-in es el reflejo de ease-out; aquí se pinta la opacidad restante.
        ease_out(1.0 - age.saturating_sub(exit).as_secs_f32() / TRANSITION.as_secs_f32())
    } else {
        1.0
    };
    let wake = if age < TRANSITION || age >= exit {
        Wake::Frame
    } else {
        Wake::At(exit.saturating_sub(age))
    };
    (progress, -6.0 * (1.0 - progress), wake)
}

/// CSS cubic-bezier(0, 0, .58, 1), como Standings; pendiente de subir al kit.
fn ease_out(x: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let (mut lo, mut hi) = (0.0, 1.0);
    for _ in 0..30 {
        let t = f32::midpoint(lo, hi);
        let curve_x = 1.74 * (1.0 - t) * t * t + t * t * t;
        if curve_x < x {
            lo = t;
        } else {
            hi = t;
        }
    }
    let t = f32::midpoint(lo, hi);
    t * t * (3.0 - 2.0 * t)
}

fn paint(
    vm: &ViewModel,
    kind: Kind,
    timing: &Timing,
    alpha: f32,
    offset: f32,
    window: &mut Window,
    cx: &mut App,
) {
    if !cx.has_global::<Inter750>() {
        if let Err(error) = cx
            .text_system()
            .add_fonts(vec![Cow::Borrowed(include_bytes!("Inter-750.ttf"))])
        {
            eprintln!("fuente Inter 750: {error}");
            return;
        }
        cx.set_global(Inter750);
    }
    let (ox, oy) = text::origin();
    text::with_origin((ox, oy + offset), || {
        window.paint_quad(quad(
            rect(0.0, 0.0, SIZE.0, SIZE.1),
            Corners::all(px(12.0)),
            linear_gradient(
                115.0,
                linear_color_stop(col(0x18191c, alpha), 0.0),
                linear_color_stop(col(0x0e0f12, alpha), 1.0),
            ),
            Edges::all(px(1.0)),
            col(0xffffff, 0.24 * alpha),
            BorderStyle::default(),
        ));
        // ::after productivo, recortado al interior redondo del panel.
        if let Err(error) = window.paint_svg(
            rect(0.0, 0.0, SIZE.0, SIZE.1),
            "fastest-lap/stripes.svg".into(),
            Some(include_bytes!("stripes.svg")),
            gpui::TransformationMatrix::default(),
            col(0xd31120, 0.22 * alpha),
            cx,
        ) {
            eprintln!("franjas de vuelta rápida: {error}");
        }
        paint_rect(window, 77.0, 13.0, 1.0, 78.0, col(0xffffff, 0.24 * alpha));
        stopwatch(window, cx, alpha);
        paint_content(vm, kind, timing, alpha, window, cx);
    });
}

fn paint_content(
    vm: &ViewModel,
    kind: Kind,
    timing: &Timing,
    alpha: f32,
    window: &mut Window,
    cx: &mut App,
) {
    let heading = match kind {
        Kind::Class => &vm.class_label,
        Kind::Personal => &vm.personal_label,
    };
    // Al faltar el piloto, CSS centra las dos líneas restantes.
    let top_shift = if timing.driver.is_empty() {
        10.615
    } else {
        0.0
    };
    let heading_ink = ink(11.718, 750.0, 0.14, col(0xc05bff, alpha));
    text::draw(
        window,
        cx,
        heading,
        96.0,
        text::baseline(15.91 + top_shift, 17.577, 11.718).round(),
        &heading_ink,
    );
    if kind == Kind::Class
        && let Some(class) = &vm.active_class
    {
        let class_ink = ink(8.2026, 750.0, 0.06, col(0xb7a2c6, alpha));
        let x = 96.0 + text::width(window, heading, &heading_ink) + 10.0;
        let label = text::fit(window, class, &class_ink, 455.0 - x);
        text::draw(
            window,
            cx,
            &label,
            x,
            text::baseline(18.91 + top_shift, 12.3039, 8.2026).round(),
            &class_ink,
        );
    }
    let time_ink = ink(30.38, 750.0, 0.015, col(0xf4f4f6, alpha));
    text::draw(
        window,
        cx,
        &timing.text(),
        96.0,
        text::baseline(36.48 + top_shift, 30.38, 30.38).round(),
        &time_ink,
    );
    let driver_ink = ink(12.152, 600.0, 0.0, col(0xc6c7cd, alpha));
    let driver = text::fit(window, &timing.driver, &driver_ink, 359.0);
    text::draw(
        window,
        cx,
        &driver,
        96.0,
        text::baseline(69.86, 18.228, 12.152).round(),
        &driver_ink,
    );
}

fn stopwatch(window: &mut Window, cx: &App, alpha: f32) {
    // SVG productivo: GPUI conserva curvas, uniones y extremos redondos.
    if let Err(error) = window.paint_svg(
        rect(0.0, 0.0, SIZE.0, SIZE.1),
        "fastest-lap/stopwatch.svg".into(),
        Some(include_bytes!("stopwatch.svg")),
        gpui::TransformationMatrix::default(),
        col(0xc05bff, alpha),
        cx,
    ) {
        eprintln!("cronómetro de vuelta rápida: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(feature = "parity-capture"))]
    #[test]
    fn live_widget_is_silent_until_improvement_and_expires_without_ingest() {
        use vantare_domain::{Capability, Car, CarId, Class, Driver, Player, Quality};
        let prefs = Preferences::default();
        let mut snapshot = Snapshot {
            sequence: 1,
            ..Snapshot::default()
        };
        snapshot.state.capabilities.lap_times = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars.push(Car {
            id: CarId(1),
            driver: Driver {
                name: "Isaac".into(),
                ..Driver::default()
            },
            class: Some(Class {
                name: "GT3".into(),
                ..Class::default()
            }),
            best_lap_s: Quality::Reliable(90.0),
            ..Car::default()
        });
        let mut widget = Widget::new(prefs);
        assert!(!widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        snapshot.sequence = 2;
        snapshot.state.cars[0].best_lap_s = Quality::Reliable(89.0);
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs).1, Wake::Frame));
        widget.notice.as_mut().expect("notice").started =
            Instant::now().checked_sub(LIFETIME).expect("clock");
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        assert!(widget.notice.is_none());
        snapshot.sequence = 3;
        snapshot.state.cars[0].best_lap_s = Quality::Reliable(88.0);
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.epoch += 1;
        assert!(widget.ingest(&snapshot, prefs));
        assert!(widget.notice.is_none());
    }

    #[test]
    fn notice_requests_frames_only_during_transitions_and_ends_without_data() {
        for (ms, state) in [
            (0, 0),
            (219, 0),
            (220, 1),
            (5779, 1),
            (5780, 0),
            (5999, 0),
            (6000, 2),
            (9000, 2),
        ] {
            let (alpha, _, wake) = motion(Duration::from_millis(ms));
            assert!((0.0..=1.0).contains(&alpha));
            assert!(matches!(
                (state, wake),
                (0, Wake::Frame) | (1, Wake::At(_)) | (2, Wake::Idle)
            ));
        }
    }
}
