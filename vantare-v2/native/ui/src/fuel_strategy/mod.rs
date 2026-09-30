//! Eficiencia: composición congelada de 680 × 204 (`fuel-strategy.geometry.json`).
//! El historial se omite como en el productivo cuando no hay filas canónicas.
//! No hay animaciones ni avisos temporales en `FuelStrategyFunctional.tsx`.

use gpui::{
    App, BorderStyle, Corners, Edges, Window, linear_color_stop, linear_gradient, px, quad,
};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    fuel_strategy::{self, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, Ink, ink};
use crate::efficiency::{col, paint_highlighted_frame, paint_panel, paint_rect, rect, tokens};

pub const SIZE: (f32, f32) = (680.0, 204.0);
const MAIN_WIDTH: f32 = 680.0 * 1.2 / 2.2;
const CONTENT_WIDTH: f32 = MAIN_WIDTH - 40.0;

fn draw(window: &mut Window, cx: &mut App, value: &str, x: f32, top: f32, style: &Ink) {
    text::draw(
        window,
        cx,
        value,
        x,
        text::baseline(top, style.size, style.size),
        style,
    );
}

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    paint_panel(window, SIZE.0, SIZE.1, 0.87);
    // Igual al panel Standings; el kit aún no expone el brillo común.
    window.paint_quad(quad(
        rect(0.0, 0.0, SIZE.0, SIZE.1),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0x000000, 0.0),
        BorderStyle::default(),
    ));
    if let Some(status) = vm.status {
        let style = ink(9.0, 600.0, 0.14, col(tokens::MUTED, 1.0));
        draw(
            window,
            cx,
            status,
            (MAIN_WIDTH - text::width(window, status, &style)) / 2.0,
            (SIZE.1 - 9.0) / 2.0,
            &style,
        );
    } else {
        paint_main(vm, window, cx);
    }
    paint_highlighted_frame(window, SIZE.0, SIZE.1);
}

fn paint_main(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let muted = col(tokens::MUTED, 1.0);
    let label = ink(8.0, 600.0, 0.16, muted);
    let value = ink(28.0, 700.0, -0.02, col(tokens::INK, 1.0));
    draw(window, cx, vm.labels[0], 20.0, 28.0, &label);
    draw(
        window,
        cx,
        &vm.fuel,
        MAIN_WIDTH - 20.0 - text::width(window, &vm.fuel, &value),
        18.0,
        &value,
    );

    // El productivo deja fuelPercent sin definir aunque haya capacidad: barra vacía.
    window.paint_quad(quad(
        rect(20.0, 65.33, CONTENT_WIDTH, 8.0),
        Corners::all(px(4.0)),
        col(0xffffff, 0.07),
        Edges::all(px(1.0)),
        col(0xffffff, 0.10),
        BorderStyle::default(),
    ));
    let cell_width = (CONTENT_WIDTH - 16.0) / 3.0;
    let small = ink(7.0, 600.0, 0.12, muted);
    for (index, value) in [&vm.average, &vm.laps, &vm.required]
        .into_iter()
        .enumerate()
    {
        let x = 20.0 + index as f32 * (cell_width + 8.0);
        window.paint_quad(quad(
            rect(x, 98.67, cell_width, 42.0),
            Corners::all(px(5.0)),
            col(0xffffff, 0.03),
            Edges::all(px(1.0)),
            col(0xffffff, 0.06),
            BorderStyle::default(),
        ));
        let center = x + cell_width / 2.0;
        let label = vm.labels[index + 1];
        draw(
            window,
            cx,
            label,
            center - text::width(window, label, &small) / 2.0,
            107.67,
            &small,
        );
        let style = ink(
            14.0,
            650.0,
            0.0,
            col(if index == 2 { 0xe2c568 } else { tokens::INK }, 1.0),
        );
        draw(
            window,
            cx,
            value,
            center - text::width(window, value, &style) / 2.0,
            117.67,
            &style,
        );
    }
    paint_rect(
        window,
        20.0,
        166.0,
        CONTENT_WIDTH,
        1.0,
        col(tokens::INK, 0.10),
    );
    let footer = ink(8.0, 600.0, 0.12, muted);
    let required = ink(9.0, 650.0, 0.12, col(0xe2c568, 1.0));
    draw(window, cx, vm.labels[4], 20.0, 178.0, &footer);
    draw(
        window,
        cx,
        &vm.required,
        MAIN_WIDTH - 20.0 - text::width(window, &vm.required, &required),
        177.0,
        &required,
    );
}

empty_settings!();

pub(crate) struct Widget {
    vm: ViewModel,
}

impl Widget {
    pub(crate) fn new(_settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: fuel_strategy::project(&Snapshot::default(), prefs),
        }
    }

    #[allow(clippy::unused_self)] // Contrato común del registro, tamaño fijo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, fuel_strategy::project(snapshot, prefs))
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let vm = self.vm.clone();
        (
            Box::new(move |window, cx| paint(&vm, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // El productivo no anima este widget.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Capabilities, Capability, Fuel, Player, Quality, State};

    #[test]
    fn reference_scene_preserves_fuel_and_does_not_turn_session_laps_into_range() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/fuel-strategy.snapshot.json"
        ))
        .expect("escena Workshop de combustible en DTO v3");
        let player = snapshot.state.player.expect("jugador de la escena");
        assert_eq!(snapshot.state.capabilities.fuel, Capability::Fresh);
        assert_eq!(player.fuel.level_l, Quality::Reliable(42.0));
        assert_eq!(player.fuel.capacity_l, Quality::Reliable(100.0));
        assert_eq!(player.fuel.per_lap_l, Quality::Reliable(2.14));
        assert_eq!(player.fuel.laps_left, Quality::Unavailable);
        assert_eq!(snapshot.state.session.laps_remaining, Quality::Reliable(79));
        let vm = fuel_strategy::project(&snapshot, Preferences::default());
        assert_eq!(vm.status, None);
        assert_eq!(
            (vm.fuel.as_str(), vm.average.as_str()),
            ("42.0 L", "2.14 L")
        );
        assert_eq!(vm.laps, vantare_domain::format::PLACEHOLDER);
        assert_eq!(vm.required, vantare_domain::format::PLACEHOLDER);
    }

    #[test]
    fn only_visual_changes_repaint_and_frames_are_idle() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings, prefs);
        let mut data = Snapshot {
            state: State {
                capabilities: Capabilities {
                    fuel: Capability::Fresh,
                    ..Capabilities::default()
                },
                player: Some(Player {
                    fuel: Fuel {
                        level_l: Quality::Reliable(42.0),
                        ..Fuel::default()
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        };
        assert!(widget.ingest(&data, prefs));
        data.sequence += 1;
        assert!(!widget.ingest(&data, prefs));
        if let Some(player) = &mut data.state.player {
            player.fuel.level_l = Quality::Reliable(42.01);
            player.fuel.capacity_l = Quality::Reliable(100.0);
        }
        assert!(
            !widget.ingest(&data, prefs),
            "mismo texto, porcentaje ausente"
        );
        if let Some(player) = &mut data.state.player {
            player.fuel.level_l = Quality::Unavailable;
        }
        assert!(widget.ingest(&data, prefs));
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        let english = Preferences {
            language: vantare_domain::format::Language::En,
            ..prefs
        };
        assert!(widget.ingest(&data, english));
        assert_eq!(widget.frame(english).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
