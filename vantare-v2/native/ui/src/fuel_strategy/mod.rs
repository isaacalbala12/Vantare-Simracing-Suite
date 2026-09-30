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
        paint_history(vm, window, cx);
    }
    paint_highlighted_frame(window, SIZE.0, SIZE.1);
}

fn pane_height(vm: &ViewModel) -> f32 {
    // CSS grid-auto-rows conserva el mínimo intrínseco del historial.
    SIZE.1.max(59.0 + vm.history.len() as f32 * 34.0)
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

    let extra_height = pane_height(vm) - SIZE.1;
    let bar_top = if vm.show_projection {
        65.33 + extra_height / 3.0
    } else {
        81.0 + extra_height / 2.0
    };
    let stat_top = if vm.show_projection {
        98.67 + extra_height * 2.0 / 3.0
    } else {
        130.0 + extra_height
    };

    // El productivo deja fuelPercent sin definir aunque haya capacidad: barra vacía.
    window.paint_quad(quad(
        rect(20.0, bar_top, CONTENT_WIDTH, 8.0),
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
        if !vm.show_projection && index > 0 {
            continue;
        }
        let x = 20.0 + index as f32 * (cell_width + 8.0);
        window.paint_quad(quad(
            rect(x, stat_top, cell_width, 42.0),
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
            stat_top + 9.0,
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
            stat_top + 19.0,
            &style,
        );
    }
    if !vm.show_projection {
        return;
    }
    paint_rect(
        window,
        20.0,
        166.0 + extra_height,
        CONTENT_WIDTH,
        1.0,
        col(tokens::INK, 0.10),
    );
    let footer = ink(8.0, 600.0, 0.12, muted);
    let required = ink(9.0, 650.0, 0.12, col(0xe2c568, 1.0));
    draw(
        window,
        cx,
        vm.labels[4],
        20.0,
        178.0 + extra_height,
        &footer,
    );
    draw(
        window,
        cx,
        &vm.finish,
        MAIN_WIDTH - 20.0 - text::width(window, &vm.finish, &required),
        177.0 + extra_height,
        &required,
    );
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub history_rows: u8,
    pub show_projection: bool,
    pub source: String,
    pub units: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            history_rows: 4,
            show_projection: true,
            source: "fuel".into(),
            units: "liters".into(),
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "source=virtual-energy:live",
        "Solo estado no disponible; Snapshot no publica energía virtual",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            history_rows: self.history_rows.clamp(1, 8),
            source: if self.source == "virtual-energy" {
                "virtual-energy"
            } else {
                "fuel"
            }
            .into(),
            units: "liters".into(),
            ..self.clone()
        }
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        fuel_strategy::project_with_config(
            snapshot,
            prefs,
            fuel_strategy::Config {
                history_rows: self.history_rows,
                show_projection: self.show_projection,
                virtual_energy: self.source == "virtual-energy",
            },
        )
    }
}

fn paint_history(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    if vm.history.is_empty() {
        return;
    }
    let left = MAIN_WIDTH + 21.0;
    let width = SIZE.0 - left - 20.0;
    paint_rect(
        window,
        MAIN_WIDTH,
        0.0,
        SIZE.0 - MAIN_WIDTH,
        pane_height(vm),
        col(0, 0.16),
    );
    paint_rect(window, MAIN_WIDTH, 0.0, 1.0, SIZE.1, col(tokens::INK, 0.10));
    let title = ink(8.0, 600.0, 0.16, col(tokens::MUTED, 1.0));
    draw(window, cx, vm.history_label, left, 18.0, &title);
    paint_rect(window, left, 34.0, width, 1.0, col(tokens::INK, 0.10));
    let label = ink(8.0, 600.0, 0.10, col(tokens::MUTED, 1.0));
    // <b> más específico que el font:650 del padre; Inter disponible W800.
    let value = ink(12.0, 800.0, 0.0, col(tokens::INK, 1.0));
    let rows_height = vm.history.len() as f32 * 34.0 - 2.0;
    let top = if vm.history.len() > 4 {
        43.0
    } else {
        43.0 + (143.0 - rows_height) / 2.0
    };
    for (index, row) in vm.history.iter().enumerate() {
        let y = top + index as f32 * 34.0;
        window.paint_quad(quad(
            rect(left, y, width, 32.0),
            Corners::all(px(4.0)),
            col(0xffffff, 0.02),
            Edges::all(px(1.0)),
            col(0xffffff, 0.04),
            BorderStyle::default(),
        ));
        draw(window, cx, &row.lap, left + 9.0, y + 13.0, &label);
        draw(
            window,
            cx,
            &row.consumed,
            left + width - 9.0 - text::width(window, &row.consumed, &value),
            y + 10.0,
            &value,
        );
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            settings: settings.clone(),
            vm: settings.project(&Snapshot::default(), prefs),
        }
    }

    #[allow(clippy::unused_self)] // Contrato común del registro, tamaño fijo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, self.settings.project(snapshot, prefs))
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
    #[test]
    fn eight_lap_scene_projects_all_canonical_rows() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("scenes/eight-laps.snapshot.json"))
                .expect("escena DTO v4 de variante");
        let settings = Settings {
            history_rows: 8,
            ..Settings::default()
        };
        let vm = settings.project(&snapshot, Preferences::default());
        assert_eq!(vm.history.len(), 8);
        assert_eq!(pane_height(&vm), 331.0);
        assert_eq!(
            pane_height(&Settings::default().project(&snapshot, Preferences::default())),
            204.0
        );
    }

    use vantare_domain::{Capabilities, Capability, Fuel, Player, Quality, State};

    #[test]
    fn reference_scene_preserves_fuel_and_does_not_turn_session_laps_into_range() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/fuel-strategy.snapshot.json"
        ))
        .expect("escena Workshop de combustible en DTO v4");
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
        assert_eq!(vm.laps, "79.0");
        assert_eq!(vm.laps_basis, Some(fuel_strategy::LapsBasis::Session));
        assert_eq!(vm.history.len(), 4);
        assert_eq!(vm.required, "169.1 L");
    }

    #[test]
    fn only_visual_changes_repaint_and_frames_are_idle() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut data = Snapshot {
            state: State {
                source_state: vantare_domain::SourceState::Live,
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
