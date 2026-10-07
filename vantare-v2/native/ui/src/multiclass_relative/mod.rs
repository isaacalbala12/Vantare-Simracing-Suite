//! Renderer Eficiencia: cabecera de 36 px y filas de 29 px en un panel de 470 px.
//! Sin animaciones propias en MulticlassRelativeFunctional.tsx/tokens.css.

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    multiclass_relative::{self, ClassMode, Content, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::{
    col, paint_frame, paint_panel, paint_rect, rect,
    text::{self, ink},
    tokens,
};

const SIZE: (f32, f32) = (470.0, 181.0);
// Fallback explícito del ViewModel v2 productivo: classColor no es telemetría.
const CLASS_COLOR: u32 = 0x8b93a7;

fn paint_background(size: (f32, f32), window: &mut Window) {
    let (width, height) = size;
    let transparent = col(0x000000, 0.0);
    paint_panel(window, width, height, 0.87);
    // Misma aproximación del degradado 120° que Standings. El kit aún no
    // comparte este brillo (el resto del CSS suma menos de 1 % de blanco).
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        transparent,
        BorderStyle::default(),
    ));
}

fn paint(vm: &ViewModel, size: (f32, f32), prefs: Preferences, window: &mut Window, cx: &mut App) {
    let (width, height) = size;
    let transparent = col(0x000000, 0.0);
    paint_background(size, window);
    let header = ink(14.0, 650.0, 0.0, col(tokens::INK, 1.0));
    let label = match prefs.language {
        vantare_domain::format::Language::Es => "RELATIVE MULTICLASE",
        vantare_domain::format::Language::En => "MULTICLASS RELATIVE",
    };
    text::draw(
        window,
        cx,
        label,
        6.0,
        text::baseline(0.0, 36.0, 14.0),
        &header,
    );
    paint_rect(window, 1.0, 35.0, width - 2.0, 1.0, col(tokens::INK, 0.10));
    let main = ink(14.0, 650.0, 0.0, col(tokens::INK, 1.0));
    let number = ink(11.0, 600.0, 0.0, col(tokens::MUTED, 1.0));
    let badge = ink(11.0, 700.0, 0.0, col(0xffffff, 1.0));
    // El número configurado de filas cambia la altura; conserva el mismo pitch.
    let row_height = ((height - 36.0) / vm.rows.len().max(1) as f32).min(29.0);
    let mut top = 36.0;
    for (index, row) in vm.rows.iter().enumerate() {
        window.paint_quad(quad(
            rect(12.0, top, 458.0, row_height),
            Corners::all(px(4.0)),
            if row.is_player {
                col(0xbfc2ca, 0.23)
            } else {
                transparent
            },
            Edges::all(px(0.0)),
            col(tokens::INK, 0.10),
            BorderStyle::default(),
        ));
        let content_top = top + (row_height - 18.0) / 2.0;
        let base = text::baseline(top, row_height, 14.0);
        text::draw(window, cx, &row.place, 20.0, base, &main);
        window.paint_quad(quad(
            rect(49.0, content_top, 40.0, 18.0),
            Corners::all(px(3.0)),
            col(CLASS_COLOR, 1.0),
            Edges::all(px(0.0)),
            transparent,
            BorderStyle::default(),
        ));
        let badge_x = 49.0 + (40.0 - text::width(window, &row.class_label, &badge)) / 2.0;
        text::draw(
            window,
            cx,
            &row.class_label,
            badge_x,
            text::baseline(content_top, 18.0, 11.0),
            &badge,
        );
        text::draw(
            window,
            cx,
            &row.number,
            95.0,
            text::baseline(top, row_height, 11.0),
            &number,
        );
        let name = text::fit(window, &row.name, &main, 252.0);
        text::draw(window, cx, &name, 121.0, base, &main);
        let gap_x = 464.0 - text::width(window, &row.gap, &main);
        text::draw(window, cx, &row.gap, gap_x, base, &main);
        paint_rect(
            window,
            12.0,
            top + row_height - 1.0,
            458.0,
            1.0,
            col(
                tokens::INK,
                if vm.rows.get(index + 1).is_some_and(|next| next.divider) {
                    0.20
                } else {
                    0.10
                },
            ),
        );
        top += row_height;
    }
    if let Some(status) = &vm.status {
        let status_ink = ink(12.0, 700.0, 0.0, col(0xe2c568, 1.0));
        text::draw(
            window,
            cx,
            status,
            24.0,
            text::baseline(top + 10.0, 24.0, 12.0),
            &status_ink,
        );
    }
    paint_frame(window, width, height);
    window.paint_quad(quad(
        rect(0.0, 0.0, width, 6.0),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        transparent,
        Edges {
            top: px(1.0),
            ..Edges::all(px(0.0))
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
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
            row_count: 5,
            class_mode: "all".into(),
            show_class_divider: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.row_count = value.row_count.clamp(3, 7);
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
        (SIZE.0, SIZE.1 + (self.row_count as f32 - 5.0) * 29.0)
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

    pub(crate) fn frame(&mut self, prefs: Preferences) -> (Paint, Wake) {
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
        use vantare_ipc::Signal::{PitStatus, Positions, Relative};
        crate::demand::signals(33, &[Positions, Relative, PitStatus])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn configured_rows_keep_the_same_pitch_and_fit_the_panel() {
        for count in 3..=7 {
            let settings = Settings {
                row_count: count,
                ..Settings::default()
            };
            let (width, height) = settings.size();
            assert_eq!(width, 470.0);
            assert_eq!(height, 36.0 + count as f32 * 29.0);
        }
    }

    #[test]
    fn configured_class_rows_and_dividers_project_independently() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/multiclass-relative.snapshot.json"
        ))
        .expect("escena");
        let prefs = Preferences::default();
        for mode in ["all", "same", "other"] {
            for count in [3, 5, 7] {
                for divider in [false, true] {
                    let settings = Settings {
                        row_count: count,
                        class_mode: mode.into(),
                        show_class_divider: divider,
                    };
                    let mut widget = Widget::new(&settings, prefs);
                    widget.ingest(&snapshot, prefs);
                    assert_eq!(
                        widget.vm,
                        multiclass_relative::project(&snapshot, prefs, settings.content())
                    );
                    assert_eq!(
                        widget.vm.rows.len(),
                        count.min(if mode == "same" { 7 } else { 13 })
                    );
                    if mode == "same" {
                        assert!(widget.vm.rows.iter().all(|r| r.class_label == "HC"));
                    }
                    if mode == "other" {
                        assert!(widget.vm.rows.iter().all(|r| r.class_label != "HC"));
                    }
                    if !divider {
                        assert!(widget.vm.rows.iter().all(|r| !r.divider));
                    }
                }
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
            ("1", "HC", "André Lotterer", "0.0"),
            ("2", "LMP", "Ben Hanley", "+4.5"),
            ("3", "GTE", "Kévin Estre", "+9.0"),
            ("4", "HC", "Antonio Giovinazzi", "+13.5"),
            ("5", "LMP", "Filipe Albuquerque", "+18.0"),
        ];
        assert_eq!(vm.rows.len(), expected.len());
        for (row, (place, class, name, gap)) in vm.rows.iter().zip(expected) {
            assert_eq!(
                (&*row.place, &*row.class_label, &*row.name, &*row.gap),
                (place, class, name, gap)
            );
            assert_eq!(row.number, "—");
        }
        assert!(vm.rows[0].is_player);
        assert_eq!(vm.status, None);
    }

    #[test]
    fn snapshot_metadata_and_unrendered_signals_do_not_repaint() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = source::synthetic(0);
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
        assert!(widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
    }
}
