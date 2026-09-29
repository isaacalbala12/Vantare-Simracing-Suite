//! `CarDamageNumbersFunctional`: paneles independientes, sin fondo exterior ni animación.

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::{
    col, rect,
    text::{self, ink},
    tokens,
};
use gpui::{App, BorderStyle, Corners, Edges, Window, px, quad};
use vantare_domain::{
    Snapshot,
    car_damage_numbers::{self, ViewModel},
    format::Preferences,
};

pub const SIZE: (f32, f32) = (140.0, 149.0);

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
    SIZE.1
        .max(16.0 + status_h + rows * 25.0 + (rows - 1.0) * 4.0)
}

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let mut top = 8.0;
    let lines = status_lines(vm);
    if !lines.is_empty() {
        let status_ink = ink(12.0, 700.0, 0.0, col(0xe2c568, 1.0));
        for line in lines {
            text::draw(
                window,
                cx,
                line,
                20.0,
                text::baseline(top + 10.0, 24.0, 12.0),
                &status_ink,
            );
            top += 24.0;
        }
        top += 20.0;
    }
    let rows: usize = if vm.show_tyres { 4 } else { 3 };
    // El min-height de las celdas conserva borde + padding + línea de 13 px.
    // Con avisos largos el CSS permite desbordar la altura mínima del widget.
    let row_h = ((height(vm) - 8.0 - top - (rows - 1) as f32 * 4.0) / rows as f32).max(25.0);
    let label_ink = ink(12.0, 750.0, 0.0, col(tokens::MUTED, 1.0));
    let value_ink = ink(13.0, 750.0, 0.0, col(0x7fb686, 1.0));
    for (label, value) in vm.labels.iter().zip(&vm.values).take(rows) {
        window.paint_quad(quad(
            rect(8.0, top, 124.0, row_h),
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
            17.0,
            text::baseline(top + (row_h - 12.0) / 2.0, 12.0, 12.0),
            &label_ink,
        );
        let x = 123.0 - text::width(window, value, &value_ink);
        text::draw(
            window,
            cx,
            value,
            x,
            text::baseline(top + (row_h - 13.0) / 2.0, 13.0, 13.0),
            &value_ink,
        );
        top += row_h + 4.0;
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
}
impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: car_damage_numbers::project(&Snapshot::default(), prefs, true),
        }
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        (SIZE.0, height(&self.vm))
    }
    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(
            &mut self.vm,
            car_damage_numbers::project(snapshot, prefs, true),
        )
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

#[cfg(test)]
mod tests {
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
        let mut widget = Widget::new(prefs);
        assert!(widget.ingest(&snapshot, prefs));
        assert_eq!(widget.size(), SIZE);
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }

    #[test]
    fn redraws_only_display_changes_and_never_schedules_animation() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
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
