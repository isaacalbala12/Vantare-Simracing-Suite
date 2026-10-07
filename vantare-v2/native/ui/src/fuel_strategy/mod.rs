//! Eficiencia: tabla de 523 × 272, filas de 23 px y datos canónicos de la VM.
//! El historial se omite como en el productivo cuando no hay filas canónicas.
//! No hay animaciones ni avisos temporales en `FuelStrategyFunctional.tsx`.

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    fuel_strategy::{self, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, Ink, ink};
use crate::efficiency::{col, paint_highlighted_frame, paint_panel, paint_rect, rect, tokens};

pub const SIZE: (f32, f32) = (523.0, 272.0);
const ROW_HEIGHT: f32 = 23.0;
const HISTORY_TOP: f32 = 173.0;

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
        let style = ink(14.0, 600.0, 0.14, col(tokens::MUTED, 1.0));
        draw(
            window,
            cx,
            status,
            (SIZE.0 - text::width(window, status, &style)) / 2.0,
            (SIZE.1 - 14.0) / 2.0,
            &style,
        );
    } else {
        paint_main(vm, window, cx);
        paint_history(vm, window, cx);
    }
    paint_highlighted_frame(window, SIZE.0, SIZE.1);
}

fn paint_main(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let label = ink(11.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
    let fuel = ink(28.0, 700.0, 0.0, col(tokens::INK, 1.0));
    draw(window, cx, vm.labels[0], 7.0, 22.0, &label);
    draw(
        window,
        cx,
        &vm.fuel,
        SIZE.0 - 7.0 - text::width(window, &vm.fuel, &fuel),
        14.0,
        &fuel,
    );
    for (index, value) in [&vm.average, &vm.laps, &vm.required, &vm.finish]
        .into_iter()
        .enumerate()
    {
        if !vm.show_projection && index > 0 {
            continue;
        }
        let top = 58.0 + index as f32 * ROW_HEIGHT;
        paint_rect(window, 7.0, top, SIZE.0 - 14.0, 1.0, col(tokens::INK, 0.08));
        let style = ink(
            14.0,
            650.0,
            0.0,
            col(if index >= 2 { 0xe2c568 } else { tokens::INK }, 1.0),
        );
        text::draw(
            window,
            cx,
            vm.labels[index + 1],
            7.0,
            text::baseline(top, ROW_HEIGHT, 11.0).round(),
            &label,
        );
        text::draw(
            window,
            cx,
            value,
            SIZE.0 - 7.0 - text::width(window, value, &style),
            text::baseline(top, ROW_HEIGHT, 14.0).round(),
            &style,
        );
    }
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
    let title = ink(11.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
    text::draw(
        window,
        cx,
        vm.history_label,
        7.0,
        text::baseline(HISTORY_TOP - ROW_HEIGHT, ROW_HEIGHT, 11.0).round(),
        &title,
    );
    let value = ink(14.0, 700.0, 0.0, col(tokens::INK, 1.0));
    // Up to eight canonical laps fit in two columns, retaining 23 px rows.
    let columns = vm.history.len().div_ceil(4);
    let width = (SIZE.0 - 14.0) / columns as f32;
    for (index, row) in vm.history.iter().enumerate() {
        let left = 7.0 + (index / 4) as f32 * width;
        let top = HISTORY_TOP + (index % 4) as f32 * ROW_HEIGHT;
        paint_rect(
            window,
            left,
            top,
            width,
            ROW_HEIGHT - 1.0,
            col(tokens::INK, 0.03),
        );
        text::draw(
            window,
            cx,
            &row.lap,
            left + 6.0,
            text::baseline(top, ROW_HEIGHT, 11.0).round(),
            &title,
        );
        text::draw(
            window,
            cx,
            &row.consumed,
            left + width - 6.0 - text::width(window, &row.consumed, &value),
            text::baseline(top, ROW_HEIGHT, 14.0).round(),
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

impl Settings {
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{FuelEstimate, FuelLevel, LapsRemaining};
        let mut demand = crate::demand::signals(500, &[FuelLevel, FuelEstimate]);
        if self.show_projection {
            demand.request(LapsRemaining, 500);
        }
        demand
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
        assert!(HISTORY_TOP + 4.0 * ROW_HEIGHT <= SIZE.1 - 6.0);
        assert_eq!(vm.history.len().div_ceil(4), 2);
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
