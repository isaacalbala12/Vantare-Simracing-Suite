//! `CarDamageNumbersFunctional`: paneles independientes, sin fondo exterior ni animación.

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{
    col, rect,
    text::{self, ink},
    tokens,
};
use gpui::{App, BorderStyle, Corners, Edges, px, quad};
use vantare_domain::{
    Snapshot,
    car_damage_numbers::{self, ViewModel},
    format::Preferences,
};

pub const SIZE: (f32, f32) = (164.0, 132.0);

fn status_lines(vm: &ViewModel) -> Vec<&'static str> {
    match vm.status_text {
        Some("DATOS ANTIGUOS") => vec!["DATOS", "ANTIGUOS"],
        Some("DATA OUT OF DATE") => vec!["DATA OUT OF", "DATE"],
        Some(status) => vec![status],
        None => vec![],
    }
}

fn height(vm: &ViewModel) -> f32 {
    let rows = if vm.show_tyres { 4.0 } else { 3.0 };
    let status = status_lines(vm);
    let status_h = if status.is_empty() {
        0.0
    } else {
        20.0 + status.len() as f32 * 24.0
    };
    16.0 + status_h + rows * 29.0
}

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let mut top = 8.0;
    let lines = status_lines(vm);
    if !lines.is_empty() {
        let status_ink = ink(14.0, 700.0, 0.0, col(0xe2c568, 1.0));
        for line in lines {
            text::draw(
                window,
                cx,
                line,
                20.0,
                text::baseline(top + 10.0, 24.0, 14.0),
                &status_ink,
            );
            top += 24.0;
        }
        top += 20.0;
    }
    let rows: usize = if vm.show_tyres { 4 } else { 3 };
    // Filas de 29 px: 28 de panel y 1 de separación, texto centrado.
    let row_h = 29.0;
    let label_ink = ink(14.0, 750.0, 0.0, col(tokens::MUTED, 1.0));
    let value_ink = ink(14.0, 750.0, 0.0, col(0x7fb686, 1.0));
    for (label, value) in vm.labels.iter().zip(&vm.values).take(rows) {
        window.paint_quad(quad(
            rect(8.0, top, SIZE.0 - 16.0, row_h - 1.0),
            Corners::all(px(tokens::RADIUS)),
            col(tokens::PANEL, 0.87),
            Edges::all(px(1.0)),
            col(0xffffff, 0.12),
            BorderStyle::default(),
        ));
        text::draw(
            window,
            cx,
            label,
            14.0,
            text::baseline(top, row_h - 1.0, 14.0),
            &label_ink,
        );
        let x = SIZE.0 - 14.0 - text::width(window, value, &value_ink);
        text::draw(
            window,
            cx,
            value,
            x,
            text::baseline(top, row_h - 1.0, 14.0),
            &value_ink,
        );
        top += row_h;
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_tyres: bool,
    pub format: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_tyres: true,
            format: "percent".into(),
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            format: "percent".into(),
            ..self.clone()
        }
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        car_damage_numbers::project(snapshot, prefs, self.show_tyres)
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
    pub(crate) fn size(&self) -> (f32, f32) {
        (SIZE.0, height(&self.vm))
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
    #[allow(clippy::unused_self)] // El productivo no tiene movimientos ni avisos temporales.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::Damage;
        crate::demand::signals(500, &[Damage])
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn tyre_setting_projects_three_slots_instead_of_four() {
        let snapshot = Snapshot::default();
        let settings = Settings {
            show_tyres: false,
            ..Settings::default()
        };
        let vm = settings.project(&snapshot, Preferences::default());
        assert!(!vm.show_tyres);
        assert!(
            height(&vm) < height(&Settings::default().project(&snapshot, Preferences::default()))
        );
    }

    #[test]
    fn rows_and_status_fit_the_reported_height() {
        let prefs = Preferences::default();
        for tyres in [false, true] {
            let mut vm = Settings {
                show_tyres: tyres,
                ..Settings::default()
            }
            .project(&Snapshot::default(), prefs);
            for status in [None, Some("DATOS ANTIGUOS"), Some("DATA OUT OF DATE")] {
                vm.status_text = status;
                let count = if tyres { 4.0 } else { 3.0 };
                let lines = status_lines(&vm).len() as f32;
                let top = 8.0
                    + if lines > 0.0 {
                        20.0 + 24.0 * lines
                    } else {
                        0.0
                    };
                assert_eq!(height(&vm), top + count * 29.0 + 8.0);
            }
        }
    }

    use super::*;
    use vantare_domain::{Capability, Damage, Player, Quality};

    #[test]
    fn reconstructed_workshop_scene_matches_the_frozen_display_values() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/car-damage-numbers.snapshot.json"
        ))
        .expect("escena reconstruida en el DTO v3 vigente");
        let prefs = Preferences::default();
        let vm = car_damage_numbers::project(&snapshot, prefs, true);
        assert_eq!(vm.values, ["100%", "100%", "100%", "13%"]);
        assert_eq!(vm.status_text, None);
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.size(), SIZE);
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }

    #[test]
    fn redraws_only_display_changes_and_never_schedules_animation() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.capabilities.damage = Capability::Fresh;
        snapshot.state.player = Some(Player {
            damage: Damage {
                aero: Quality::Reliable(0.0),
                ..Damage::default()
            },
            ..Player::default()
        });
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, prefs));
        if let Some(player) = &mut snapshot.state.player {
            player.damage.aero = Quality::Reliable(0.001);
        }
        assert!(!widget.ingest(&snapshot, prefs), "mismo porcentaje visible");
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
