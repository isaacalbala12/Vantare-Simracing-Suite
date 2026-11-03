//! Relative multiclase aprobado: ventana física centrada y filas de 24 px.

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::vantare::paint::{Face, Kit, round_rect};
use crate::vantare::style::{Color, Style};
use gpui::App;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    multiclass_relative::{self, ClassMode, Content, ViewModel},
};

const SIZE: (f32, f32) = (440.0, 245.0);

fn paint(vm: &ViewModel, size: (f32, f32), prefs: Preferences, window: &mut Window, cx: &mut App) {
    let style = Style::compiled();
    let kit = Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language: prefs.language,
        width: size.0,
    };
    kit.panel(window, size.1);
    let count = ((size.1 - 77.0) / 24.0).round() as usize;
    let muted = kit.ink(Face::Body, 11.0, 0.3, style.colors.muted.hsla());
    kit.label(
        window,
        cx,
        if kit.es() {
            "RELATIVE MULTICLASE"
        } else {
            "MULTICLASS RELATIVE"
        },
        13.0,
        None,
        11.0,
        18.0,
        Face::Body,
        &muted,
    );
    let badge = format!(
        "{} {} · ±{}",
        if kit.es() { "Tú en" } else { "You in" },
        vm.player_class,
        count / 2
    );
    kit.label(
        window,
        cx,
        &badge.to_uppercase(),
        0.0,
        Some(size.0 - 13.0),
        11.0,
        18.0,
        Face::Body,
        &muted,
    );
    for slot in 0..count {
        let y = 33.0 + slot as f32 * 24.0;
        let Some(row) = vm.rows.iter().find(|r| r.slot == slot) else {
            kit.skeleton(window, y, slot);
            continue;
        };
        if row.is_player {
            kit.highlight(window, y, style.accents.red, 1.0);
        }
        if row.divider {
            round_rect(
                window,
                13.0,
                y,
                size.0 - 26.0,
                1.0,
                0.0,
                style.colors.line.hsla(),
            );
        }
        let class = style.class(&row.class_name);
        round_rect(window, 13.0, y + 4.0, 38.0, 16.0, 3.0, class.dot.hsla());
        let class_ink = kit.ink(
            Face::Display,
            11.0,
            1.0,
            if row.class_label == "GT3" {
                Color(0x06210f, 1.0).hsla()
            } else {
                Color(0xffffff, 1.0).hsla()
            },
        );
        let width = text::width(window, &row.class_label, &class_ink);
        kit.label(
            window,
            cx,
            &row.class_label,
            13.0 + (38.0 - width) / 2.0,
            None,
            y + 4.0,
            16.0,
            Face::Display,
            &class_ink,
        );
        let pos = kit.ink(Face::Display, 14.0, 0.0, style.colors.muted.hsla());
        kit.label(
            window,
            cx,
            &row.place,
            61.0,
            None,
            y,
            24.0,
            Face::Display,
            &pos,
        );
        let number = if row.number == "—" {
            row.number.clone()
        } else {
            format!("#{}", row.number)
        };
        round_rect(
            window,
            93.0,
            y + 4.0,
            34.0,
            16.0,
            3.0,
            Color(0xffffff, 0.06).hsla(),
        );
        let mono = kit.ink(Face::Mono, 11.0, 0.0, Color(0xb0a7a9, 1.0).hsla());
        kit.label(
            window,
            cx,
            &number,
            97.0,
            None,
            y + 4.0,
            16.0,
            Face::Mono,
            &mono,
        );
        let right = size.0 - 13.0;
        let gap = kit.ink(
            Face::Mono,
            12.0,
            0.0,
            if vm.fcy {
                style.colors.frozen.hsla()
            } else if row.is_player {
                style.colors.text.hsla()
            } else {
                style.colors.value.hsla()
            },
        );
        kit.label(
            window,
            cx,
            &row.gap,
            0.0,
            Some(right),
            y,
            24.0,
            Face::Mono,
            &gap,
        );
        let mut edge = right - 56.0;
        if !vm.fcy && row.fast_traffic {
            let nearby = row.nearby;
            let value = if nearby {
                if kit.es() { "▲ encima" } else { "▲ near" }
            } else if kit.es() {
                "▲ cerca"
            } else {
                "▲ closing"
            };
            let ink = kit.ink(
                Face::Mono,
                11.0,
                0.0,
                if nearby {
                    Color(0xffffff, 1.0).hsla()
                } else {
                    Color(0xff8a8a, 1.0).hsla()
                },
            );
            let width = text::width(window, value, &ink);
            if nearby {
                round_rect(
                    window,
                    edge - width - 10.0,
                    y + 4.0,
                    width + 10.0,
                    16.0,
                    3.0,
                    Color(0xf25a5a, 0.75).hsla(),
                );
            }
            kit.label(
                window,
                cx,
                value,
                0.0,
                Some(edge - if nearby { 5.0 } else { 0.0 }),
                y,
                24.0,
                Face::Mono,
                &ink,
            );
            edge -= width + 20.0;
        } else if !vm.fcy
            && let Some((trend, good)) = &row.trend
        {
            let ink = kit.ink(
                Face::Mono,
                11.0,
                0.0,
                if *good {
                    style.colors.gain.hsla()
                } else {
                    style.colors.loss.hsla()
                },
            );
            kit.label(
                window,
                cx,
                trend,
                0.0,
                Some(edge),
                y,
                24.0,
                Face::Mono,
                &ink,
            );
            edge -= 58.0;
        }
        let ink = kit.ink(Face::Body, 13.0, 0.0, style.colors.text.hsla());
        let name = text::fit(window, &row.name, &ink, (edge - 137.0).max(0.0));
        kit.label(window, cx, &name, 137.0, None, y, 24.0, Face::Body, &ink);
    }
    let foot = 39.0 + count as f32 * 24.0;
    round_rect(
        window,
        13.0,
        foot,
        size.0 - 26.0,
        1.0,
        0.0,
        style.colors.line.hsla(),
    );
    let text = vm.status.clone().unwrap_or_else(|| {
        if vm.fcy {
            if kit.es() {
                "Gaps congelados · no adelantar"
            } else {
                "Frozen gaps · no overtaking"
            }
            .into()
        } else {
            let fast = vm.rows.iter().filter(|r| r.fast_traffic).count();
            format!(
                "▲ {fast} {}",
                if kit.es() {
                    "coches más rápidos a menos de 6 s"
                } else {
                    "faster cars within 6 s"
                }
            )
        }
    });
    kit.label(
        window,
        cx,
        &text,
        13.0,
        None,
        foot + 7.0,
        20.0,
        Face::Body,
        &kit.ink(Face::Body, 11.0, 0.0, style.colors.muted.hsla()),
    );
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub row_count: usize,
    pub class_mode: String,
    pub show_class_divider: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            row_count: 7,
            class_mode: "all".into(),
            show_class_divider: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.row_count = multiclass_relative::row_count(value.row_count);
        if !["all", "same", "other"].contains(&value.class_mode.as_str()) {
            value.class_mode = "all".into();
        }
        value
    }
    fn content(&self) -> Content {
        Content {
            row_count: self.row_count,
            class_mode: match self.class_mode.as_str() {
                "same" => ClassMode::Same,
                "other" => ClassMode::Other,
                _ => ClassMode::All,
            },
            show_class_divider: self.show_class_divider,
        }
    }
    fn size(&self) -> (f32, f32) {
        (SIZE.0, SIZE.1 + (self.row_count as f32 - 7.0) * 24.0)
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
    settings: Settings,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: multiclass_relative::project(
                &Snapshot::default(),
                prefs,
                settings.normalized().content(),
            ),
            settings: settings.normalized(),
        }
    }

    #[allow(clippy::unused_self)] // Contrato del registro; tamaño de la configuración por defecto.
    pub(crate) fn size(&self) -> (f32, f32) {
        self.settings.size()
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(
            &mut self.vm,
            multiclass_relative::project(snapshot, prefs, self.settings.content()),
        )
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, _reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let size = self.size();
        (
            Box::new(move |window, cx| paint(&vm, size, prefs, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // El renderer productivo no tiene avisos ni movimientos temporales.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Flags, LapTimes, PitStatus, Positions, Relative};
        crate::demand::signals(33, &[Positions, Relative, PitStatus, LapTimes, Flags])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn approved_rows_keep_the_same_pitch_and_box_with_missing_neighbors() {
        for count in [7, 9] {
            let settings = Settings {
                row_count: count,
                ..Default::default()
            };
            let size = settings.size();
            assert_eq!(size, (440.0, 77.0 + count as f32 * 24.0));
            let prefs = Preferences::default();
            let mut widget = Widget::new(&settings, prefs);
            for snapshot in [source::fixed(), Snapshot::default()] {
                widget.ingest(&snapshot, prefs);
                assert_eq!(widget.size(), size);
            }
        }
    }

    #[test]
    fn class_settings_are_saved_and_filters_always_preserve_the_player() {
        let snapshot = source::fixed();
        let prefs = Preferences::default();
        for mode in ["all", "same", "other"] {
            for count in [7, 9] {
                let settings = Settings {
                    row_count: count,
                    class_mode: mode.into(),
                    show_class_divider: true,
                };
                let saved: Settings =
                    serde_json::from_str(&serde_json::to_string(&settings).expect("guardar"))
                        .expect("cargar");
                assert_eq!(saved.normalized(), settings);
                let mut widget = Widget::new(&settings, prefs);
                widget.ingest(&snapshot, prefs);
                assert_eq!(
                    widget.vm,
                    multiclass_relative::project(&snapshot, prefs, settings.content())
                );
                assert_eq!(
                    widget
                        .vm
                        .rows
                        .iter()
                        .find(|r| r.is_player)
                        .expect("jugador")
                        .slot,
                    count / 2
                );
            }
        }
    }

    #[test]
    fn reconstructed_reference_scene_preserves_identity_and_relative_gaps() {
        // Reconstrucción de tools/widget-reference/scene.tsx desde los
        // metadatos congelados; estas señales no proceden de una captura live.
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/multiclass-relative.snapshot.json"
        ))
        .expect("escena DTO v4");
        assert_eq!(snapshot.state.cars.len(), 20);
        let vm =
            multiclass_relative::project(&snapshot, Preferences::default(), Content::default());
        let expected = [
            (4, "P2", "HY", "A. Giovinazzi", "-13.5"),
            (3, "P1", "GTE", "K. Estre", "-9.0"),
            (2, "P1", "LMP2", "B. Hanley", "-4.5"),
            (1, "P1", "HY", "Tú", "0.0"),
            (20, "P7", "LMP2", "N. Pino", "+4.5"),
            (19, "P7", "HY", "M. Jensen", "+9.0"),
            (18, "P6", "GTE", "M. Engel", "+13.5"),
        ];
        assert_eq!(vm.rows.len(), expected.len());
        for (row, (id, place, class, name, gap)) in vm.rows.iter().zip(expected) {
            assert_eq!(row.id.0, id);
            assert_eq!(
                (&*row.place, &*row.class_label, &*row.name, &*row.gap),
                (place, class, name, gap)
            );
            assert_eq!(row.number, "—");
        }
        assert!(vm.rows[3].is_player);
        assert_eq!(vm.status, None);
    }

    #[test]
    fn snapshot_metadata_and_unrendered_signals_do_not_repaint() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/multiclass-relative-design-system.sequence.json"
        ))
        .expect("escena aprobada")[0]
            .clone();
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        snapshot.epoch += 1;
        snapshot.state.session.remaining_s = vantare_domain::Quality::Reliable(5.0);
        assert!(!widget.ingest(&snapshot, prefs));
        let outside = snapshot
            .state
            .cars
            .iter_mut()
            .find(|car| !widget.vm.rows.iter().any(|row| row.id == car.id))
            .expect("coche fuera de la ventana");
        outside.driver.name = "Cambio fuera de la ventana".into();
        assert!(!widget.ingest(&snapshot, prefs));
        let player = snapshot.state.player.expect("jugador").car;
        snapshot
            .state
            .cars
            .iter_mut()
            .find(|car| car.id == player)
            .expect("coche del jugador")
            .driver
            .name = "Piloto nuevo".into();
        assert!(
            !widget.ingest(&snapshot, prefs),
            "nombre propio oculto tras Tú"
        );
        let rival = widget
            .vm
            .rows
            .iter()
            .find(|r| !r.is_player)
            .expect("rival visible")
            .id;
        snapshot
            .state
            .cars
            .iter_mut()
            .find(|c| c.id == rival)
            .expect("rival")
            .driver
            .name = "Ana Otro".into();
        assert!(widget.ingest(&snapshot, prefs), "cambia el nombre visible");
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
    }
}
