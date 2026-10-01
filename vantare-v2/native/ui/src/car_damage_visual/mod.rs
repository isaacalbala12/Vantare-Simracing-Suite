//! Eficiencia: SVG y leyenda del renderer productivo, en coordenadas propias.

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};
use gpui::{
    App, BorderStyle, Corners, Edges, Hsla, PathBuilder, Window, linear_color_stop,
    linear_gradient, point, px, quad,
};
use vantare_domain::{
    Snapshot,
    car_damage_visual::{self, ViewModel},
    format::Preferences,
};

const SIZE: (f32, f32) = (150.0, 191.0);

fn fill(damage: Option<f64>) -> Hsla {
    match damage {
        Some(value) => col(0xff2a3b, 0.2 + value as f32 * 0.6),
        None => col(tokens::INK, 0.1),
    }
}

fn polygon(window: &mut Window, points: &[(f32, f32)], y: f32, color: Hsla) {
    let (ox, oy) = text::origin();
    for (mut builder, color) in [
        (PathBuilder::fill(), color),
        (PathBuilder::stroke(px(1.0)), col(tokens::INK, 0.15)),
    ] {
        builder.move_to(point(px(ox + 15.0 + points[0].0), px(oy + y + points[0].1)));
        for &(x, py) in &points[1..] {
            builder.line_to(point(px(ox + 15.0 + x), px(oy + y + py)));
        }
        builder.close();
        match builder.build() {
            Ok(path) => window.paint_path(path, color),
            Err(error) => eprintln!("car-damage-visual: polígono SVG: {error}"),
        }
    }
}

fn suspension(window: &mut Window, y: f32, color: Hsla) {
    let (ox, oy) = text::origin();
    let pt = |x, py| point(px(ox + 15.0 + x), px(oy + y + py));
    // El quad de GPUI ajusta sus bordes a píxel; el trazo SVG de 1 px
    // necesita conservar medio píxel a cada lado de la geometría original.
    for (mut builder, color) in [
        (PathBuilder::fill(), color),
        (PathBuilder::stroke(px(1.0)), col(tokens::INK, 0.15)),
    ] {
        builder.move_to(pt(22.0, 45.0));
        builder.line_to(pt(98.0, 45.0));
        builder.arc_to(
            point(px(2.0), px(2.0)),
            px(0.0),
            false,
            true,
            pt(100.0, 47.0),
        );
        builder.line_to(pt(100.0, 49.0));
        builder.arc_to(
            point(px(2.0), px(2.0)),
            px(0.0),
            false,
            true,
            pt(98.0, 51.0),
        );
        builder.line_to(pt(22.0, 51.0));
        builder.arc_to(
            point(px(2.0), px(2.0)),
            px(0.0),
            false,
            true,
            pt(20.0, 49.0),
        );
        builder.line_to(pt(20.0, 47.0));
        builder.arc_to(
            point(px(2.0), px(2.0)),
            px(0.0),
            false,
            true,
            pt(22.0, 45.0),
        );
        builder.close();
        match builder.build() {
            Ok(path) => window.paint_path(path, color),
            Err(error) => eprintln!("car-damage-visual: suspensión SVG: {error}"),
        }
    }
}

fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    paint_panel(window, SIZE.0, SIZE.1, 0.87);
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
        let style = ink(12.0, 700.0, 0.0, col(0xe2c568, 1.0));
        // .vf-status tiene 12 px de padding dentro de los 126 px disponibles.
        let lines: &[&str] = match status {
            "DATOS ANTIGUOS" => &["DATOS", "ANTIGUOS"],
            "DATA OUT OF DATE" => &["DATA OUT OF", "DATE"],
            _ => &[status],
        };
        let width = lines
            .iter()
            .map(|line| text::width(window, line, &style))
            .fold(0.0, f32::max);
        let top = (SIZE.1 - lines.len() as f32 * 18.0) / 2.0;
        for (i, line) in lines.iter().enumerate() {
            text::draw(
                window,
                cx,
                line,
                (SIZE.0 - width) / 2.0,
                text::baseline(top + i as f32 * 18.0, 18.0, 12.0),
                &style,
            );
        }
    } else {
        let label = ink(7.0, 600.0, 0.1, col(tokens::MUTED, 1.0));
        let value = ink(14.0, 700.0, 0.0, col(tokens::INK, 1.0));
        let widths = std::array::from_fn::<_, 3, _>(|i| {
            text::width(window, vm.labels[i], &label).max(text::width(
                window,
                &vm.percentages[i],
                &value,
            ))
        });
        let start = usize::from(!vm.show_aero);
        let count = 3 - start;
        let wrapped = widths[start..].iter().sum::<f32>() + (count - 1) as f32 * 14.0 > 126.0;
        // Chrome ajusta el origen del viewport SVG a píxel físico.
        let y = ((SIZE.1 - if wrapped { 144.0 } else { 113.0 }) / 2.0).round();
        polygon(
            window,
            &[
                (35.0, 15.0),
                (85.0, 15.0),
                (105.0, 40.0),
                (100.0, 75.0),
                (40.0, 75.0),
                (35.0, 40.0),
            ],
            y,
            fill(vm.damage[1]),
        );
        polygon(
            window,
            &[(55.0, 12.0), (70.0, 12.0), (75.0, 20.0), (50.0, 20.0)],
            y,
            fill(vm.damage[0]),
        );
        suspension(window, y, fill(vm.damage[2]));
        let first_count = if wrapped { 2 } else { count };
        let first_width = widths[start..start + first_count].iter().sum::<f32>()
            + (first_count - 1) as f32 * 14.0;
        let mut x = (SIZE.0 - first_width) / 2.0;
        for (i, width) in widths.into_iter().enumerate().skip(start) {
            let top = y + 90.0 + if wrapped && i == start + 2 { 31.0 } else { 0.0 };
            if wrapped && i == start + 2 {
                x = (SIZE.0 - width) / 2.0;
            }
            let center = x + width / 2.0;
            text::draw(
                window,
                cx,
                vm.labels[i],
                center - text::width(window, vm.labels[i], &label) / 2.0,
                text::baseline(top, 7.0, 7.0).round(),
                &label,
            );
            text::draw(
                window,
                cx,
                &vm.percentages[i],
                center - text::width(window, &vm.percentages[i], &value) / 2.0,
                text::baseline(top + 9.0, 14.0, 14.0).round(),
                &value,
            );
            x += width + 14.0;
        }
    }
    paint_frame(window, SIZE.0, SIZE.1);
    window.paint_quad(quad(
        rect(0.0, 0.0, SIZE.0, 6.0),
        Corners {
            top_left: px(6.0),
            top_right: px(6.0),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0x000000, 0.0),
        Edges {
            top: px(1.0),
            ..Edges::default()
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_aero: bool,
    pub show_percent: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_aero: true,
            show_percent: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showPercent",
        "CarDamageVisualFunctional muestra porcentajes siempre",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = car_damage_visual::project(snapshot, prefs);
        vm.show_aero = self.show_aero;
        vm
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

    #[allow(clippy::unused_self)] // Firma común; tamaño fijo.
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
    #[allow(clippy::unused_self)] // El productivo no tiene animaciones ni avisos.
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
    fn aero_setting_hides_only_the_legend_and_preserves_svg_damage() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/car-damage-visual.snapshot.json"
        ))
        .expect("scene");
        let normal = Settings::default().project(&snapshot, Preferences::default());
        let hidden = Settings {
            show_aero: false,
            ..Settings::default()
        }
        .project(&snapshot, Preferences::default());
        assert!(!hidden.show_aero);
        assert_eq!(hidden.damage, normal.damage);
        assert_eq!(hidden.percentages, normal.percentages);
    }

    use super::*;
    use vantare_domain::{Capability, Damage, Player, Quality};

    #[test]
    fn frozen_scene_decodes_and_matches_the_productive_damage_values()
    -> Result<(), vantare_ipc::Error> {
        // Workshop default/race/track/ready: dents [1,2,3,4,5,6,7,8]
        // producen daño 1 en las tres partes, es decir, integridad 0.
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/car-damage-visual.snapshot.json"
        ))?;
        let vm = car_damage_visual::project(&snapshot, Preferences::default());
        assert_eq!(vm.status, None);
        assert_eq!(vm.damage, [Some(1.0); 3]);
        assert_eq!(vm.percentages, ["100%"; 3]);
        assert_eq!(vm.labels, ["AERO", "CARROC.", "SUSP"]);
        Ok(())
    }

    #[test]
    fn repaint_tracks_drawn_values_and_language_not_snapshot_sequence() {
        let prefs = Preferences::default();
        let mut data = Snapshot::default();
        data.state.source_state = vantare_domain::SourceState::Live;
        data.state.capabilities.damage = Capability::Fresh;
        data.state.player = Some(Player {
            damage: Damage {
                aero: Quality::Reliable(0.0),
                body: Quality::Reliable(0.0),
                suspension: Quality::Reliable(0.0),
                ..Damage::default()
            },
            ..Player::default()
        });
        let mut widget = Widget::new(&Settings::default(), prefs);
        assert!(widget.ingest(&data, prefs));
        data.sequence += 1;
        assert!(!widget.ingest(&data, prefs));
        assert!(widget.ingest(
            &data,
            Preferences {
                language: vantare_domain::format::Language::En,
                ..prefs
            }
        ));
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }
}
