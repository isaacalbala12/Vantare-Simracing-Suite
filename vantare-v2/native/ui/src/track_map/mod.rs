//! `TrackMap` Eficiencia (`TrackMapFunctional.tsx`). El SVG de 304 × 209 y
//! el pie producen 320 × 248, aunque el layout base declare 320 × 220.
//! Sin geometría en `Snapshot` se muestra PISTA SIN MAPA, nunca un mapa ficticio.

use gpui::{
    App, BorderStyle, Corners, Edges, Hsla, PathBuilder, Pixels, Point, Window, linear_color_stop,
    linear_gradient, point, px, quad,
};
use vantare_domain::format::Preferences;
use vantare_domain::{Snapshot, track_map};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, paint_rect, rect, tokens};

const WIDTH: f32 = 320.0;
const SCALE: f32 = 0.95; // preserveAspectRatio: 304 / 320 = 209 / 220.

pub(crate) struct Widget {
    vm: track_map::ViewModel,
}

impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: track_map::project(&Snapshot::default(), prefs),
        }
    }

    pub(crate) fn size(&self) -> (f32, f32) {
        (WIDTH, height(&self.vm))
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, track_map::project(snapshot, prefs))
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

fn height(vm: &track_map::ViewModel) -> f32 {
    if vm.track_label.is_some() {
        248.0
    } else {
        220.0
    }
}

fn svg_point(p: track_map::Point) -> Point<Pixels> {
    let (ox, oy) = text::origin();
    point(
        px(ox + 8.0 + p.x as f32 * SCALE),
        px(oy + 8.0 + p.y as f32 * SCALE),
    )
}

/// Como el helper productivo: GTE usa unknown; solo GT3/LMGT3 usan verde.
fn class_color(class: Option<&str>) -> u32 {
    match class.unwrap_or_default().to_ascii_uppercase().as_str() {
        "HYPERCAR" => 0xc1121f,
        "LMP2" => 0x0055a4,
        "LMP3" => 0xf59e0b,
        "GT3" | "LMGT3" => 0x2ecc71,
        _ => 0x6b7280,
    }
}

fn draw_path(window: &mut Window, builder: PathBuilder, color: Hsla) {
    match builder.build() {
        Ok(path) => window.paint_path(path, color),
        Err(error) => eprintln!("track-map: no se pudo trazar la geometría: {error}"),
    }
}

/// Círculo SVG sin el ajuste a píxel de los rectángulos del kit.
fn circle(builder: &mut PathBuilder, center: Point<Pixels>, radius: f32) {
    let r = px(radius);
    let k = px(radius * 0.552_284_8);
    let p = |dx: Pixels, dy: Pixels| point(center.x + dx, center.y + dy);
    builder.move_to(p(r, px(0.0)));
    builder.cubic_bezier_to(p(px(0.0), r), p(r, k), p(k, r));
    builder.cubic_bezier_to(p(-r, px(0.0)), p(-k, r), p(-r, k));
    builder.cubic_bezier_to(p(px(0.0), -r), p(-r, -k), p(-k, -r));
    builder.cubic_bezier_to(p(r, px(0.0)), p(k, -r), p(r, -k));
    builder.close();
}

fn paint(vm: &track_map::ViewModel, window: &mut Window, cx: &mut App) {
    let height = height(vm);
    paint_panel(window, WIDTH, height, 0.87);
    // Mismo primer tramo del degradado que Standings; el resto aporta <1%.
    window.paint_quad(quad(
        rect(0.0, 0.0, WIDTH, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));
    if let Some(first) = vm.outline.first() {
        let mut builder = PathBuilder::stroke(px(3.0 * SCALE));
        builder.move_to(svg_point(*first));
        for &point in &vm.outline[1..] {
            builder.line_to(svg_point(point));
        }
        builder.close();
        draw_path(window, builder, col(tokens::INK, 0.35));
        for marker in &vm.markers {
            let center = svg_point(marker.point);
            let radius = if marker.is_player { 5.5 } else { 4.0 } * SCALE;
            let mut fill = PathBuilder::fill();
            circle(&mut fill, center, radius);
            let color = if marker.is_player {
                0xc1121f
            } else {
                class_color(marker.class_name.as_deref())
            };
            draw_path(window, fill, col(color, 1.0));
            let mut border = PathBuilder::stroke(px(1.5 * SCALE));
            circle(&mut border, center, radius);
            draw_path(window, border, col(tokens::PANEL, 0.8));
        }
    } else {
        let style = ink(10.0, 600.0, 0.08, col(tokens::MUTED, 1.0));
        let x = (WIDTH - text::width(window, &vm.empty_text, &style)) / 2.0;
        text::draw(
            window,
            cx,
            &vm.empty_text,
            x,
            text::baseline((height - 12.0) / 2.0, 12.0, 10.0),
            &style,
        );
    }
    if let Some(label) = &vm.track_label {
        paint_rect(window, 8.0, 223.0, 304.0, 1.0, col(tokens::INK, 0.1));
        let style = ink(10.0, 650.0, 0.0, col(tokens::INK, 1.0));
        text::draw(
            window,
            cx,
            label,
            8.0,
            text::baseline(230.0, 10.0, 10.0),
            &style,
        );
        if let Some(reference) = &vm.reference_text {
            let style = ink(7.0, 600.0, 0.1, col(tokens::MUTED, 1.0));
            let x = 312.0 - text::width(window, reference, &style);
            text::draw(
                window,
                cx,
                reference,
                x,
                text::baseline(231.5, 7.0, 7.0),
                &style,
            );
        }
    }
    paint_frame(window, WIDTH, height);
    // ::after tiene el borde superior al 24%, los otros al 12%.
    window.paint_quad(quad(
        rect(0.0, 0.0, WIDTH, 6.0),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_right: px(0.0),
            bottom_left: px(0.0),
        },
        col(0, 0.0),
        Edges {
            top: px(1.0),
            right: px(0.0),
            bottom: px(0.0),
            left: px(0.0),
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::format::Language;

    #[test]
    fn repaint_tracks_only_visible_changes_and_empty_is_idle() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.session.track_name = vantare_domain::Quality::Reliable("Sebring".into());
        assert!(
            !widget.ingest(&snapshot, prefs),
            "sin geometría el dibujo no cambia"
        );
        let english = Preferences {
            language: Language::En,
            ..prefs
        };
        assert!(widget.ingest(&snapshot, english));
        assert!(!widget.ingest(&snapshot, english));
        assert_eq!(widget.size(), (320.0, 220.0));
        assert_eq!(widget.frame(english).1, Wake::Idle);
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
    }

    #[test]
    fn class_colors_match_the_productive_helper() {
        for (class, expected) in [
            (None, 0x6b7280),
            (Some("gte"), 0x6b7280),
            (Some("hypercar"), 0xc1121f),
            (Some("LMP2"), 0x0055a4),
            (Some("lmp3"), 0xf59e0b),
            (Some("GT3"), 0x2ecc71),
            (Some("LMGT3"), 0x2ecc71),
        ] {
            assert_eq!(class_color(class), expected);
        }
    }
}
