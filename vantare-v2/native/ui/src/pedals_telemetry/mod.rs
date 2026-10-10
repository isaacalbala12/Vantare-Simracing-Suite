//! `PedalsAdvancedEfficiency`, composición por defecto de 300 × 112.
//! Volante genérico con steering canónico × 450°, rasterizado por GPUI.

use crate::efficiency::preview::PaintWindow as Window;
use crate::{
    app::{Paint, Wake, replace_if_changed},
    efficiency::{
        col, rect,
        text::{self, ink},
        tokens,
    },
};
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use std::{
    cell::RefCell,
    rc::Rc,
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    pedals_telemetry::{self, Status, ViewModel},
};

mod wheels;

const SIZE: (f32, f32) = (300.0, 112.0);
const TRANSITION: Duration = Duration::from_millis(60);

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub steering_wheel: String,
    pub show_clutch: bool,
    /// Eficiencia no dibuja posición aunque el contenido general la conserve.
    pub show_position: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            steering_wheel: "generic".into(),
            show_clutch: true,
            show_position: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showPosition",
        "PedalsAdvancedEfficiency no dibuja posición",
    )];
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = pedals_telemetry::project(snapshot, prefs);
        vm.steering_wheel = pedals_telemetry::WHEELS
            .iter()
            .copied()
            .find(|id| *id == self.steering_wheel)
            .unwrap_or("generic");
        vm.show_clutch = self.show_clutch;
        vm
    }

    #[must_use]
    pub fn normalized(&self) -> Self {
        if pedals_telemetry::WHEELS.contains(&self.steering_wheel.as_str()) {
            self.clone()
        } else {
            Self {
                steering_wheel: "generic".into(),
                ..self.clone()
            }
        }
    }
}

#[derive(Default)]
struct WheelArtwork {
    key: Option<(u64, bool, &'static str)>,
    image: Option<Arc<gpui::RenderImage>>,
}

pub(crate) struct Widget {
    settings: Settings,
    wheel: Rc<RefCell<WheelArtwork>>,
    vm: ViewModel,
    from: [Option<f64>; 3],
    started: Option<Instant>,
    epoch: u64,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            wheel: Rc::default(),
            vm: settings.project(&Snapshot::default(), prefs),
            settings,
            from: [None; 3],
            started: None,
            epoch: 0,
        }
    }

    #[allow(clippy::unused_self)] // Contrato común, tamaño por defecto fijo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        self.ingest_at(snapshot, prefs, Instant::now())
    }

    fn ingest_at(&mut self, snapshot: &Snapshot, prefs: Preferences, now: Instant) -> bool {
        let next = self.settings.project(snapshot, prefs);
        let reset = self.epoch != snapshot.epoch;
        self.epoch = snapshot.epoch;
        let pedals_changed = self.vm.pedals != next.pedals;
        let from = self.bars_at(now);
        let changed = replace_if_changed(&mut self.vm, next);
        if reset {
            let moving = self.moving_at(now);
            self.started = None;
            return changed || moving;
        }
        if !changed {
            return false;
        }
        if !pedals_changed {
            return true;
        }
        self.from = from;
        // No interpolar desde/hacia ausencia, ni entre épocas del productor.
        let moving = from
            .iter()
            .zip(self.vm.pedals)
            .any(|(a, b)| a.is_some() && b.is_some() && *a != b);
        self.started = moving.then_some(now);
        true
    }

    fn moving_at(&self, now: Instant) -> bool {
        self.started
            .is_some_and(|start| now.saturating_duration_since(start) < TRANSITION)
    }

    fn bars_at(&self, now: Instant) -> [Option<f64>; 3] {
        let Some(start) = self.started else {
            return self.vm.pedals;
        };
        let progress = (now.saturating_duration_since(start).as_secs_f64()
            / TRANSITION.as_secs_f64())
        .min(1.0);
        std::array::from_fn(|i| match (self.from[i], self.vm.pedals[i]) {
            (Some(from), Some(to)) => Some(from + (to - from) * progress),
            (_, to) => to,
        })
    }

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
        self.frame_with_motion(prefs, false)
    }
    pub(crate) fn frame_with_motion(
        &mut self,
        _prefs: Preferences,
        reduced: bool,
    ) -> (Paint, Wake) {
        let now = Instant::now();
        let moving = !reduced && self.moving_at(now);
        let bars = if reduced {
            self.vm.pedals
        } else {
            self.bars_at(now)
        };
        if !moving {
            self.started = None;
        }
        let vm = self.vm.clone();
        let wheel = Rc::clone(&self.wheel);
        (
            Box::new(move |window, cx| paint(&vm, bars, &wheel, window, cx)),
            if moving { Wake::Frame } else { Wake::Idle },
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.moving_at(Instant::now())
    }
}

fn wheel(
    cache: &RefCell<WheelArtwork>,
    window: &mut Window,
    cx: &App,
    steering: Option<f64>,
    stale: bool,
    selected: &'static str,
) {
    let angle = steering.unwrap_or(0.0) * 450.0;
    let key = (angle.to_bits(), stale, selected);
    let mut artwork = cache.borrow_mut();
    if artwork.key != Some(key) {
        artwork.key = Some(key);
        let svg = wheels::svg(selected).replacen(
            "<g>",
            &format!(
                "<g transform=\"rotate({angle} 32 32)\" opacity=\"{}\">",
                if stale { 0.55 } else { 1.0 }
            ),
            1,
        );
        artwork.image = match cx.svg_renderer().render_single_frame(svg.as_bytes(), 1.0) {
            Ok(image) => Some(image),
            Err(error) => {
                eprintln!("pedals-telemetry: artwork SVG: {error}");
                None
            }
        };
    }
    if let Some(image) = &artwork.image {
        let bounds = rect(181.0, 20.0, 72.0, 72.0);
        if let Err(error) = window.paint_image(
            bounds,
            bounds,
            Corners::all(px(0.0)),
            image.clone(),
            0,
            false,
        ) {
            eprintln!("pedals-telemetry: pintar volante: {error}");
        }
    }
}

fn paint(
    vm: &ViewModel,
    bars: [Option<f64>; 3],
    wheel_cache: &RefCell<WheelArtwork>,
    window: &mut Window,
    cx: &mut App,
) {
    let panel = rect(0.0, 0.0, SIZE.0, SIZE.1);
    window.paint_quad(quad(
        panel,
        Corners::all(px(10.0)),
        col(tokens::PANEL, 0.92),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));
    window.paint_quad(quad(
        panel,
        Corners::all(px(10.0)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));

    let alpha = if vm.status == Status::Stale {
        0.55
    } else {
        1.0
    };
    let gear_ink = ink(44.0, 800.0, -0.03, col(0xf1f1f2, alpha));
    text::draw(
        window,
        cx,
        &vm.gear,
        46.0 - text::width(window, &vm.gear, &gear_ink) / 2.0,
        text::baseline(17.6, 41.8, 44.0),
        &gear_ink,
    );
    let speed_ink = ink(14.0, 700.0, 0.0, col(0xf1f1f2, alpha));
    let unit_ink = ink(11.0, 500.0, 0.0, col(0xf1f1f2, alpha));
    let unit = format!(" {}", vm.speed_unit);
    let speed_w = text::width(window, &vm.speed, &speed_ink);
    let x = 46.0 - f32::midpoint(speed_w, text::width(window, &unit, &unit_ink));
    let baseline = text::baseline(60.4, 18.0, 14.0);
    text::draw(window, cx, &vm.speed, x, baseline, &speed_ink);
    text::draw(window, cx, &unit, x + speed_w, baseline, &unit_ink);
    let rpm_ink = ink(11.0, 400.0, 0.0, col(0x929399, alpha));
    let rpm = format!("{} rpm", vm.rpm);
    text::draw(
        window,
        cx,
        &rpm,
        46.0 - text::width(window, &rpm, &rpm_ink) / 2.0,
        text::baseline(79.4, 15.0, 11.0),
        &rpm_ink,
    );

    for (i, (value, color)) in bars
        .into_iter()
        .zip([0xc9a15c, tokens::LOSS, 0x6fae7d])
        .enumerate()
    {
        if i == 0 && !vm.show_clutch {
            continue;
        }
        let index = if vm.show_clutch { i } else { i - 1 };
        let x = 86.0 + index as f32 * 24.0;
        let label_top = if vm.status_text.is_empty() {
            10.0
        } else {
            24.0
        };
        let bar_top = label_top + 14.0;
        let bar_height = 102.0 - bar_top;
        let label = value.map_or_else(|| "—".into(), |value| format!("{:.0}", value * 100.0));
        let label_ink = ink(11.0, 700.0, 0.0, col(0xf1f1f2, alpha));
        text::draw(
            window,
            cx,
            &label,
            x + 7.0 - text::width(window, &label, &label_ink) / 2.0,
            text::baseline(label_top, 14.0, 11.0),
            &label_ink,
        );
        window.paint_quad(quad(
            rect(x, bar_top, 14.0, bar_height),
            Corners::all(px(3.0)),
            col(0x0c0c0e, 0.85 * alpha),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        if let Some(value) = value.filter(|v| *v > 0.0) {
            let height = value as f32 * bar_height;
            // CSS overflow:hidden recorta el relleno por las esquinas del slot.
            let radius = 3.0f32.min(height / 2.0);
            window.paint_quad(quad(
                rect(x, 102.0 - height, 14.0, height),
                Corners {
                    top_left: px(if value >= 1.0 { 3.0 } else { 0.0 }),
                    top_right: px(if value >= 1.0 { 3.0 } else { 0.0 }),
                    bottom_left: px(radius),
                    bottom_right: px(radius),
                },
                col(color, alpha),
                Edges::all(px(0.0)),
                col(0, 0.0),
                BorderStyle::default(),
            ));
        }
    }
    wheel(
        wheel_cache,
        window,
        cx,
        vm.steering,
        vm.status == Status::Stale,
        vm.steering_wheel,
    );
    let status_ink = ink(11.0, 600.0, 0.06, col(0xc1121f, 1.0));
    text::draw(
        window,
        cx,
        vm.status_text,
        14.0,
        text::baseline(4.0, 13.5, 11.0),
        &status_ink,
    );
}

impl Settings {
    #[allow(clippy::unused_self)] // El estado de ausencia también depende de clutch, aunque su barra esté oculta.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Clutch, Pedals, Powertrain, Steering};
        crate::demand::signals(16, &[Pedals, Clutch, Steering, Powertrain])
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_productive_wheel_projects_and_has_its_own_artwork() {
        let snapshot = Snapshot::default();
        for id in pedals_telemetry::WHEELS {
            let settings = Settings {
                steering_wheel: (*id).into(),
                show_clutch: false,
                ..Settings::default()
            };
            let vm = settings.project(&snapshot, Preferences::default());
            assert_eq!(vm.steering_wheel, *id);
            assert!(!vm.show_clutch);
            assert!(wheels::svg(id).contains("<svg"));
            if *id != "generic" {
                assert_ne!(wheels::svg(id), wheels::svg("generic"));
            }
        }
        let settings = Settings {
            steering_wheel: "unknown".into(),
            show_clutch: false,
            ..Settings::default()
        }
        .normalized();
        assert_eq!(settings.steering_wheel, "generic");
        assert!(!settings.show_clutch);
    }

    use super::*;
    use vantare_domain::{Player, Quality};

    #[test]
    fn frozen_workshop_scene_decodes_to_the_visible_product_values() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/pedals-telemetry.snapshot.json"
        ))
        .expect("escena Workshop en DTO v3");
        let prefs = Preferences::default();
        let vm = pedals_telemetry::project(&snapshot, prefs);
        assert_eq!(vm.status, Status::Ready);
        assert_eq!(vm.pedals, [Some(0.06), Some(0.13), Some(0.75)]);
        assert_eq!(vm.steering, Some(0.08));
        assert_eq!(
            (
                vm.gear.as_str(),
                vm.speed.as_str(),
                vm.speed_unit.as_str(),
                vm.rpm.as_str()
            ),
            ("4", "180", "km/h", "7.2k")
        );
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.size(), (300.0, 112.0));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        assert!(!widget.ingest(&snapshot, prefs));
    }

    #[test]
    fn transitions_end_and_missing_inputs_clear_without_a_zero_tween() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        let mut player = Player::default();
        player.telemetry.throttle = Quality::Reliable(0.0);
        snapshot.state.player = Some(player);
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs));
        player.telemetry.throttle = Quality::Reliable(1.0);
        snapshot.state.player = Some(player);
        assert!(widget.ingest(&snapshot, prefs));
        let now = Instant::now();
        widget.started = Some(now);
        for (ms, expected, moving) in [
            (0, 0.0, true),
            (30, 0.5, true),
            (60, 1.0, false),
            (1000, 1.0, false),
        ] {
            let at = now + Duration::from_millis(ms);
            assert_eq!(widget.bars_at(at)[2], Some(expected));
            assert_eq!(widget.moving_at(at), moving);
        }
        widget.started = Some(now.checked_sub(TRANSITION).expect("reloj del test"));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        player.telemetry.throttle = Quality::Unavailable;
        snapshot.state.player = Some(player);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.vm.pedals[2], None);
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
    }

    #[test]
    fn a_new_epoch_does_not_animate_from_the_old_producer() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        widget.vm.pedals = [Some(0.0); 3];
        let mut snapshot = Snapshot {
            epoch: 1,
            state: vantare_domain::State {
                source_state: vantare_domain::SourceState::Live,
                ..Default::default()
            },
            ..Snapshot::default()
        };
        let mut player = Player::default();
        player.telemetry.throttle = Quality::Reliable(1.0);
        snapshot.state.player = Some(player);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        assert_eq!(widget.bars_at(Instant::now())[2], Some(1.0));
        snapshot.epoch = 2;
        assert!(
            !widget.ingest(&snapshot, prefs),
            "misma escena quieta, sin repintado"
        );
    }

    #[test]
    fn instruments_do_not_restart_bars_and_retargeting_starts_at_the_visible_value() {
        let prefs = Preferences::default();
        let now = Instant::now();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        let mut player = Player::default();
        player.telemetry.throttle = Quality::Reliable(0.0);
        snapshot.state.player = Some(player);
        assert!(widget.ingest_at(&snapshot, prefs, now));
        player.telemetry.throttle = Quality::Reliable(1.0);
        snapshot.state.player = Some(player);
        assert!(widget.ingest_at(&snapshot, prefs, now));
        let halfway = now + Duration::from_millis(30);
        player.telemetry.gear = Quality::Reliable(4);
        snapshot.state.player = Some(player);
        assert!(widget.ingest_at(&snapshot, prefs, halfway));
        assert_eq!(widget.started, Some(now));
        assert_eq!(widget.bars_at(halfway)[2], Some(0.5));
        player.telemetry.throttle = Quality::Reliable(0.0);
        snapshot.state.player = Some(player);
        assert!(widget.ingest_at(&snapshot, prefs, halfway));
        assert_eq!(widget.bars_at(halfway)[2], Some(0.5));
        assert_eq!(widget.bars_at(halfway + TRANSITION)[2], Some(0.0));
        assert!(!widget.moving_at(halfway + TRANSITION));
    }
}
