//! Pintura del Look Vantare: capas posicionadas sobre la geometría del plan.
use super::Standings;
use crate::vantare::{
    self, Style,
    paint::{Face, font},
};
use rune::{Align, Color, El, Spring, el, text};
use vantare_domain::{
    format::Language,
    widget_settings::look::{Accent, Tone},
};

/// Migración cerrada: sin resortes implícitos ni reloj permanente. El
/// movimiento de filas usará la escena común, nunca el reloj de un Look.
pub(super) fn view(state: &Standings) -> El {
    let s = Style::compiled();
    let v = if state.settings.style == Tone::Neo {
        &s.styles.neo
    } else {
        &s.styles.neutro
    };
    let accent = match state.settings.accent {
        Accent::Red => s.accents.red,
        Accent::Amber => s.accents.amber,
        Accent::Green => s.accents.green,
        Accent::White => s.accents.white,
    };
    let l = &state.layout;
    let mut root = el()
        .key("standings-vantare")
        .size(l.width, l.height)
        .motion(Spring::NONE)
        .child(
            el().key("panel")
                .size(l.width, l.content_height)
                .radius(v.radius)
                .linear_gradient(90.0, [(0.0, v.top), (1.0, v.bottom)])
                .border(
                    1.0,
                    if v.border_accent > 0.0 {
                        vantare::alpha(accent, v.border_accent)
                    } else {
                        v.border
                    },
                ),
        );
    let header_y = if l.banner > 0.0 { l.banner } else { 0.0 };
    root = root.child(vlabel(
        &s,
        "title",
        &state.display.title,
        l.pad,
        header_y,
        l.width * 0.55,
        l.header,
        if v.header_display {
            Face::Display
        } else {
            Face::Body
        },
        v.header_size,
        v.header_color,
    ));
    root = root.child(vlabel(
        &s,
        "session",
        &state.display.right,
        l.width * 0.55,
        header_y,
        l.width * 0.45 - l.pad,
        l.header,
        Face::Body,
        s.fonts.small,
        s.colors.muted,
    ));
    if state
        .settings
        .brand_visible
        .unwrap_or(state.settings.show_brand)
    {
        root = root.child(vlabel(
            &s,
            "brand",
            "VANTARE",
            l.width - 90.0,
            header_y,
            80.0,
            12.0,
            Face::Display,
            12.0,
            accent,
        ));
    }
    root = table(root, state, |key, value, x, y, w, h, ink, align| {
        vlabel(&s, key, value, x, y, w, h, Face::Body, s.fonts.body, ink).align(align)
    });
    footer(root, state, |key, value, x, y, w, h| {
        vlabel(
            &s,
            key,
            value,
            x,
            y,
            w,
            h,
            Face::Body,
            s.fonts.small,
            s.colors.muted,
        )
    })
}

#[allow(clippy::too_many_arguments)] // A positioned text cell; no presentation policy hidden in it.
fn vlabel(
    s: &Style,
    key: &str,
    value: &str,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    face: Face,
    size: f32,
    ink: Color,
) -> El {
    text(value)
        .key(key)
        .absolute(x, y)
        .size(w.max(0.0), h)
        .color(ink)
        .font(font(s, face, size, h, 0.0, s.fonts.regular_weight))
        .truncate()
}

fn table(
    mut root: El,
    state: &Standings,
    label: impl Fn(&str, &str, f32, f32, f32, f32, Color, Align) -> El,
) -> El {
    let l = &state.layout;
    let s = Style::compiled();
    if !state.display.banner.is_empty() {
        root = root.child(
            el().key("banner")
                .size(l.width, l.banner)
                .fill(s.colors.fcy_fill)
                .child(label(
                    "banner-text",
                    &state.display.banner,
                    8.0,
                    0.0,
                    l.width - 16.0,
                    l.banner,
                    s.colors.fcy_text,
                    Align::Start,
                )),
        );
    }
    for (index, column) in l.columns.iter().enumerate() {
        root = root.child(label(
            &format!("column-{index}"),
            &state.display.labels[index],
            column.x,
            l.header + l.banner,
            column.width,
            l.column_header,
            s.colors.muted,
            Align::Start,
        ));
    }
    for (y, class) in &l.classes {
        root = root.child(label(
            &format!("class-{class}"),
            class,
            l.pad,
            *y,
            l.width - 2.0 * l.pad,
            20.0,
            s.class(class).ink,
            Align::Start,
        ));
    }
    for (index, row) in state.display.rows.iter().enumerate() {
        let y = l.rows[index];
        let mut item = el()
            .key(format!("car-{}", row.id))
            .absolute(0.0, y)
            .size(l.width, l.row)
            .motion(Spring::NONE);
        if row.player {
            item = item
                .child(
                    el().key("player-fill")
                        .size(l.width, l.row)
                        .fill(vantare::alpha(s.class(&row.class).tint, 0.17)),
                )
                .child(
                    el().key("player-marker")
                        .size(2.0, l.row - 4.0)
                        .absolute(0.0, 2.0)
                        .fill(s.accents.red),
                );
        }
        for (column_index, (cell, column)) in row.cells.iter().zip(&l.columns).enumerate() {
            if let Some(fill) = cell.fill {
                item = item.child(
                    el().key(format!("chip-{column_index}"))
                        .absolute(column.x, 4.0)
                        .size(column.width, (l.row - 8.0).max(0.0))
                        .radius(s.geometry.chip_radius)
                        .fill(fill),
                );
            }
            if !cell.segments.is_empty() {
                let gap = s.geometry.sector_gap;
                let width = ((column.width - gap * (cell.segments.len().saturating_sub(1)) as f32)
                    / cell.segments.len() as f32)
                    .max(0.0);
                for (segment, ink) in cell.segments.iter().enumerate() {
                    item = item.child(
                        el().key(format!("sector-{column_index}-{segment}"))
                            .absolute(
                                column.x + segment as f32 * (width + gap),
                                (l.row - s.geometry.sector_height) / 2.0,
                            )
                            .size(width, s.geometry.sector_height)
                            .radius(s.geometry.sector_radius)
                            .fill(*ink),
                    );
                }
                continue;
            }
            item = item.child(label(
                &format!("cell-{column_index}"),
                &cell.text,
                column.x,
                0.0,
                column.width,
                l.row,
                cell.ink,
                cell.align,
            ));
        }
        root = root.child(item);
    }
    if !state.display.status.is_empty() {
        root = root.child(label(
            "status",
            &state.display.status,
            l.pad,
            l.header + l.column_header + l.banner,
            l.width - 2.0 * l.pad,
            22.0,
            s.colors.muted,
            Align::Center,
        ));
    }
    root
}
fn footer(
    mut root: El,
    state: &Standings,
    label: impl Fn(&str, &str, f32, f32, f32, f32) -> El,
) -> El {
    let l = &state.layout;
    if l.footer > 0.0 {
        let w = (l.width - 2.0 * l.pad) / 3.0;
        for (index, value) in state.display.footer.iter().enumerate() {
            root = root.child(label(
                &format!("footer-{index}"),
                value,
                l.pad + (index % 3) as f32 * w,
                l.content_height - l.footer + (index / 3) as f32 * 14.0,
                w,
                14.0,
            ));
        }
    }
    if state.display.paused {
        let text = if state.prefs.language == Language::Es {
            "Pausa · última imagen"
        } else {
            "Paused · last frame"
        };
        root = root.child(label("paused", text, 0.0, l.height - 22.0, l.width, 22.0));
    }
    root
}

#[cfg(test)]
mod truncation_tests {
    use super::*;
    use rune::{Env, Runtime};

    #[test]
    fn long_driver_labels_paint_an_ellipsis_and_keep_the_full_accessible_name() {
        const LONG: &str = "Alexander von Longname International Motorsport Racing Team";
        fn view(_: &(), _: &mut rune::Cx<()>) -> El {
            let s = Style::compiled();
            el().size(160.0, 30.0).child(vlabel(
                &s,
                "v",
                LONG,
                0.0,
                0.0,
                64.0,
                24.0,
                Face::Body,
                14.0,
                s.colors.text,
            ))
        }
        for scale in [1.0, 1.25, 1.5] {
            let mut runtime = Runtime::with_text(
                (),
                view,
                (160.0, 30.0),
                Env::new(true, scale),
                rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
            );
            // A CPU atlas path makes the ellipsis observable without a GPU outline store.
            runtime.set_font_smoothing(rune::text::FontSmoothing::Off);
            runtime.frame(0.0);
            runtime.settle_all();
            runtime.frame(0.0);
            let s = Style::compiled();
            let style = font(&s, Face::Body, 14.0, 24.0, 0.0, s.fonts.regular_weight);
            assert_eq!(
                runtime
                    .elements()
                    .iter()
                    .find(|e| e.key.as_deref() == Some("v"))
                    .expect("label")
                    .text
                    .as_deref(),
                Some(LONG)
            );
            let rect = runtime.presented("v").expect("label box").0;
            let mut ellipsis = Vec::new();
            // Rune's atlas distinguishes 60 horizontal and four vertical mask phases.
            for x in 0..60 {
                for y in 0..4 {
                    runtime.text.glyphs(
                        "…",
                        style,
                        scale,
                        [x as f32 / 60.0, y as f32 / 4.0],
                        &mut ellipsis,
                    );
                }
            }

            assert!(!ellipsis.is_empty());
            assert!(
                ellipsis
                    .iter()
                    .any(|g| runtime.instances.iter().any(|i| i.params[1]
                        == rune::render::KIND_GLYPH
                        && i.uv[..2] == g.atlas_uv()
                        && i.params[2] == g.atlas_page() as f32
                        && (rect[0] * scale..=(rect[0] + rect[2]) * scale)
                            .contains(&(i.rect[0] + i.rect[2] / 2.0))
                        && (rect[1] * scale..=(rect[1] + rect[3]) * scale)
                            .contains(&(i.rect[1] + i.rect[3] / 2.0)))),
                "the actual painter must contain the ellipsis glyph, not a plain clipped line"
            );
        }
    }
}
