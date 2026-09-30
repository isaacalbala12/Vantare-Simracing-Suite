//! Porte de `HeadToHeadFunctional.tsx` (360 × 128). El productivo no tiene
//! animaciones ni avisos temporales: `Wake::Idle`, sin un reloj adicional.
//! La dirección configurada selecciona el rival en la proyección pura.
//! Referencia Workshop congelada: líder mirando delante, SIN RIVAL; 20 coches
//! presentes. `compare.ps1`: 635/46080 px (1,3780 %), umbral RGBA 8, sin máscaras.

use gpui::{
    App, BorderStyle, Corners, Edges, Window, linear_color_stop, linear_gradient, px, quad,
};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    head_to_head::{self, Target, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, paint_rect, rect, tokens};

pub const SIZE: (f32, f32) = (360.0, 128.0);

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
    paint_panel(window, width, height, 0.87);
    // Igual que Standings: el segundo brillo es < 1 % y queda pendiente para
    // el kit junto con el marco superior al 24 % (segundo consumidor real).
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
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

    let list_height = if vm.rows.is_empty() {
        38.0
    } else {
        vm.rows.len() as f32 * 22.0 + (vm.rows.len() - 1) as f32 * 4.0
    };
    let top = (height - 24.0 - list_height) / 2.0;
    let header = ink(9.0, 600.0, 0.08, col(tokens::MUTED, 1.0));
    text::draw(
        window,
        cx,
        &vm.header,
        12.0,
        text::baseline(top, 9.0, 9.0),
        &header,
    );
    paint_rect(window, 12.0, top + 15.0, 336.0, 1.0, col(tokens::INK, 0.10));
    let list_top = top + 24.0;
    if vm.rows.is_empty() {
        let status = ink(12.0, 700.0, 0.0, col(0xe2c568, 1.0));
        text::draw(
            window,
            cx,
            &vm.no_rival,
            24.0,
            text::baseline(list_top + 10.0, 18.0, 12.0),
            &status,
        );
    }
    for (index, row) in vm.rows.iter().enumerate() {
        let y = list_top + index as f32 * 26.0;
        if row.is_player {
            window.paint_quad(quad(
                rect(12.0, y, 336.0, 22.0),
                Corners::all(px(4.0)),
                col(0xbfc2ca, 0.23),
                Edges::all(px(0.0)),
                col(0x000000, 0.0),
                BorderStyle::default(),
            ));
        }
        // Grid CSS: 26 34 1fr 44 56 48, gap 5, padding 5px 8px.
        let columns = [
            (&row.place, 20.0, 26.0, 12.0, 650.0, tokens::INK, false),
            (&row.number, 51.0, 34.0, 10.0, 600.0, tokens::MUTED, false),
            (&row.name, 90.0, 87.0, 11.0, 650.0, tokens::INK, false),
            (
                &row.class_name,
                182.0,
                44.0,
                8.0,
                600.0,
                tokens::MUTED,
                false,
            ),
            (
                &row.gap,
                231.0,
                56.0,
                11.0,
                650.0,
                if row.selected {
                    tokens::LOSS
                } else {
                    tokens::INK
                },
                true,
            ),
            (&row.label, 292.0, 48.0, 8.0, 600.0, tokens::MUTED, true),
        ];
        for (value, left, cell_width, font_size, weight, color, right) in columns {
            let style = ink(font_size, weight, 0.0, col(color, 1.0));
            let value = if left == 90.0 {
                text::fit(window, value, &style, cell_width)
            } else {
                value.clone()
            };
            let x = if right {
                left + cell_width - text::width(window, &value, &style)
            } else {
                left
            };
            text::draw(
                window,
                cx,
                &value,
                x,
                text::baseline(y + 5.0 + (12.0 - font_size) / 2.0, font_size, font_size),
                &style,
            );
        }
    }
    paint_frame(window, width, height);
    // CSS ::after: blanco 24 % arriba sobre el mismo panel redondeado.
    window.paint_quad(quad(
        rect(0.0, 0.0, width, 6.0),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0x000000, 0.0),
        Edges {
            top: px(1.0),
            ..Edges::all(px(0.0))
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub target: String,
    /// Compatibilidad: Eficiencia tampoco dibuja sectorComparisons.
    pub show_sectors: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            target: "ahead".into(),
            show_sectors: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showSectors",
        "HeadToHeadFunctional no dibuja sectores; no se inventa una variante",
    )];
    fn target(&self) -> Target {
        if self.target == "behind" {
            Target::Behind
        } else {
            Target::Ahead
        }
    }

    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut settings = self.clone();
        if settings.target != "behind" {
            settings.target = "ahead".into();
        }
        settings
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
    target: Target,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self {
            vm: head_to_head::project(&Snapshot::default(), prefs, settings.target()),
            target: settings.target(),
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(
            &mut self.vm,
            head_to_head::project(snapshot, prefs, self.target),
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
    #[allow(clippy::unused_self)]
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Car, CarId, Player, Quality::Reliable};

    #[test]
    fn configured_direction_projects_the_selected_rival() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/head-to-head.snapshot.json"
        ))
        .expect("escena");
        let prefs = Preferences::default();
        let mut widget = Widget::new(
            &Settings {
                target: "behind".into(),
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&snapshot, prefs);
        assert_eq!(widget.vm.header, "H2H · DETRÁS");
        assert_eq!(widget.vm.rows[1].name, "Ben Hanley");
        assert!(widget.vm.rows[1].selected);
        assert_eq!(
            widget.vm,
            head_to_head::project(&snapshot, prefs, Target::Behind)
        );
        assert_eq!(
            Settings {
                target: "invalid".into(),
                show_sectors: false
            }
            .normalized()
            .target,
            "ahead"
        );
    }

    #[test]
    fn frozen_workshop_scene_contains_the_rival_without_changing_the_player() {
        // El golden tiene al líder mirando delante: SIN RIVAL. Detrás sí está
        // Ben Hanley; no ocultar coches para conseguir la captura vacía.
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/head-to-head.snapshot.json"
        ))
        .expect("escena Workshop DTO v4 válida");
        let prefs = Preferences::default();
        assert_eq!(snapshot.state.cars.len(), 20);
        assert_eq!(
            snapshot.state.player_car().expect("jugador").driver.name,
            "André Lotterer"
        );
        assert!(
            head_to_head::project(&snapshot, prefs, Target::Ahead)
                .rows
                .is_empty()
        );
        let behind = head_to_head::project(&snapshot, prefs, Target::Behind);
        assert_eq!(behind.rows[1].name, "Ben Hanley");
        assert!(behind.rows[1].selected);
        // Gap reconstruido desde reference/head-to-head.geometry.json,
        // generado por tools/widget-reference/scene.tsx; no es telemetría live.
        assert_eq!(behind.rows[1].gap, "+4.500");
    }

    #[test]
    fn only_visible_changes_repaint_and_frames_finish() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.cars = [1, 2]
            .map(|id| Car {
                id: CarId(id),
                position: Reliable(id),
                ..Car::default()
            })
            .into();
        snapshot.state.player = Some(Player {
            car: CarId(2),
            ..Player::default()
        });
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        snapshot.state.cars[1].best_lap_s = Reliable(90.0);
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.cars[0].driver.name = "Rival".into();
        assert!(widget.ingest(&snapshot, prefs));
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
