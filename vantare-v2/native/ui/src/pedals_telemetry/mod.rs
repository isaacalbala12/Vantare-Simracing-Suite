//! `PedalsAdvancedEfficiency`, composición por defecto de 300 × 112.
//! Volante genérico con steering canónico × 450°, rasterizado por GPUI.

use crate::{
    app::{Paint, Wake, replace_if_changed},
    efficiency::{
        col, rect,
        text::{self, ink},
        tokens,
    },
};
use gpui::{
    App, BorderStyle, Corners, Edges, Window, linear_color_stop, linear_gradient, px, quad,
};
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

const SIZE: (f32, f32) = (300.0, 112.0);
const TRANSITION: Duration = Duration::from_millis(60);

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub steering_wheel: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            steering_wheel: "generic".into(),
        }
    }
}
impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        const WHEELS: &[&str] = &[
            "generic",
            "alpine-a424",
            "aston-martin-valkyrie",
            "bmw-m-hybrid-v8-pre-le-mans",
            "bmw-m-hybrid-v8",
            "cadillac-v-series-r",
            "ferrari-499p",
            "genesis-gmr-001",
            "glickenhaus-scg007",
            "isotta-fraschini-tipo6",
            "lamborghini-sc63",
            "peugeot-9x8",
            "peugeot-9x8-2024",
            "porsche-963",
            "toyota-gr010",
            "toyota-tr010",
            "vanwall-vandervell-680",
            "aston-martin-vantage-gt3",
            "bmw-m4-gt3",
            "corvette-z06-gt3",
            "ferrari-296-gt3",
            "ford-mustang-gt3",
            "lamborghini-huracan-gt3",
            "lexus-rc-f-gt3",
            "mclaren-720s-gt3",
            "mercedes-amg-gt3",
            "porsche-911-gt3-r",
            "oreca-07",
            "adess-ad25",
            "duqueine-d09",
            "ginetta-g61-lt-p3-evo",
            "ligier-js-p325",
        ];
        if WHEELS.contains(&self.steering_wheel.as_str()) {
            self.clone()
        } else {
            Self::default()
        }
    }
}

#[derive(Default)]
struct WheelArtwork {
    key: Option<(u64, bool)>,
    image: Option<Arc<gpui::RenderImage>>,
}

pub(crate) struct Widget {
    wheel: Rc<RefCell<WheelArtwork>>,
    vm: ViewModel,
    from: [Option<f64>; 3],
    started: Option<Instant>,
    epoch: u64,
}

impl Widget {
    pub(crate) fn new(_settings: &Settings, prefs: Preferences) -> Self {
        Self {
            wheel: Rc::default(),
            vm: pedals_telemetry::project(&Snapshot::default(), prefs),
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
        let next = pedals_telemetry::project(snapshot, prefs);
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

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let now = Instant::now();
        let moving = self.moving_at(now);
        let bars = self.bars_at(now);
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
) {
    let angle = steering.unwrap_or(0.0) * 450.0;
    let key = (angle.to_bits(), stale);
    let mut artwork = cache.borrow_mut();
    if artwork.key != Some(key) {
        artwork.key = Some(key);
        let svg = include_str!("wheel.svg").replacen(
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
    let speed_ink = ink(12.0, 700.0, 0.0, col(0xf1f1f2, alpha));
    let unit_ink = ink(12.0, 500.0, 0.0, col(0xf1f1f2, alpha));
    let unit = format!(" {}", vm.speed_unit);
    let speed_w = text::width(window, &vm.speed, &speed_ink);
    let x = 46.0 - f32::midpoint(speed_w, text::width(window, &unit, &unit_ink));
    let baseline = text::baseline(60.4, 18.0, 12.0);
    text::draw(window, cx, &vm.speed, x, baseline, &speed_ink);
    text::draw(window, cx, &unit, x + speed_w, baseline, &unit_ink);
    let rpm_ink = ink(10.0, 400.0, 0.0, col(0x929399, alpha));
    let rpm = format!("{} rpm", vm.rpm);
    text::draw(
        window,
        cx,
        &rpm,
        46.0 - text::width(window, &rpm, &rpm_ink) / 2.0,
        text::baseline(79.4, 15.0, 10.0),
        &rpm_ink,
    );

    for (i, (value, color)) in bars
        .into_iter()
        .zip([0xc9a15c, tokens::LOSS, 0x6fae7d])
        .enumerate()
    {
        let x = 86.0 + i as f32 * 20.0;
        window.paint_quad(quad(
            rect(x, 10.0, 14.0, 92.0),
            Corners::all(px(3.0)),
            col(0x0c0c0e, 0.85 * alpha),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        if let Some(value) = value.filter(|v| *v > 0.0) {
            let height = value as f32 * 92.0;
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
    );
    let status_ink = ink(9.0, 600.0, 0.06, col(0xc1121f, 1.0));
    text::draw(
        window,
        cx,
        vm.status_text,
        14.0,
        text::baseline(4.0, 13.5, 9.0),
        &status_ink,
    );
}

#[cfg(test)]
mod tests {
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
