//! Pintura del Look Vantare: capas posicionadas sobre la geometría del plan.
use super::{Standings, motion};
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
    let l = &state.scene.layout;
    let mut root = el()
        .key("standings-vantare")
        .size(l.width, l.height)
        .motion(Spring::NONE)
        .child(
            el().key("panel")
                .pin(Some(0.0), Some(0.0), None, None)
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
        &state.scene.display.title,
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
        &state.scene.display.right,
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
        .pin(Some(x), Some(y), None, None)
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
    let l = &state.scene.layout;
    let s = Style::compiled();
    if !state.scene.display.banner.is_empty() {
        root = root.child(
            el().key("banner")
                .size(l.width, l.banner)
                .fill(s.colors.fcy_fill)
                .child(label(
                    "banner-text",
                    &state.scene.display.banner,
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
            &state.scene.display.labels[index],
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
    // Los fantasmas van debajo: la fila viva siempre se lee por encima.
    for ghost in &state.visual.ghosts {
        root = root.child(row_el(
            &ghost.row,
            l,
            ghost.top,
            ghost.alpha,
            &motion::RowVis::default(),
            &s,
            &label,
        ));
    }
    for (index, row) in state.scene.display.rows.iter().enumerate() {
        let vis = state.visual.rows.get(&row.id).copied().unwrap_or_default();
        root = root.child(row_el(
            row,
            l,
            l.rows[index] + vis.dy,
            vis.alpha,
            &vis,
            &s,
            &label,
        ));
    }
    if !state.scene.display.status.is_empty() {
        root = root.child(label(
            "status",
            &state.scene.display.status,
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
/// Una fila de la tabla en su `y` viva y con su opacidad; sirve a vivos y fantasmas.
fn row_el(
    row: &super::scene::Row,
    l: &super::layout::Layout,
    y: f32,
    alpha: f32,
    vis: &motion::RowVis,
    s: &Style,
    label: &impl Fn(&str, &str, f32, f32, f32, f32, Color, Align) -> El,
) -> El {
    let mut item = el()
        .key(format!("car-{}", row.id))
        .pin(Some(0.0), Some(y), None, None)
        .size(l.width, l.row)
        .opacity(alpha)
        .motion(Spring::NONE);
    if row.player {
        item = item
            .child(
                el().key("player-fill")
                    .pin(Some(0.0), Some(0.0), None, None)
                    .size(l.width, l.row)
                    .fill(vantare::alpha(s.class(&row.class).tint, 0.17)),
            )
            .child(
                el().key("player-marker")
                    .pin(Some(0.0), Some(2.0), None, None)
                    .size(2.0, l.row - 4.0)
                    .fill(s.accents.red),
            );
    }
    // Efectos de GPUI: destello, chip, barrido, batalla, rombo y boxes.
    if let Some((kind, strength)) = vis.flash {
        let color = match kind {
            motion::Flash::Gain | motion::Flash::PersonalBest => s.colors.flash_gain,
            motion::Flash::Loss => s.colors.flash_loss,
            motion::Flash::Lead => s.colors.leader,
            motion::Flash::Best => s.colors.purple,
            motion::Flash::Pit => s.colors.box_fill,
        };
        let v = &s.styles.neo;
        let bleed = v.player_bleed;
        item = item.child(
            el().key("row-flash")
                .pin(Some(bleed), Some((l.row - s.geometry.row_height) / 2.0), None, None)
                .size((l.width - 2.0 * bleed).max(0.0), s.geometry.row_height)
                .radius(v.player_radius)
                .linear_gradient(
                    90.0_f32.to_radians(),
                    [
                        (
                            0.0,
                            vantare::alpha(color, v.player_from * strength),
                        ),
                        (
                            1.0,
                            vantare::alpha(color, v.player_to * strength),
                        ),
                    ],
                ),
        );
    }
    let driver = l
        .columns
        .iter()
        .find(|c| c.setting.metric_id == "driverName");
    if let (Some(column), Some((places, chip_alpha))) = (driver, vis.chip) {
        let sign = if places > 0 { "+" } else { "-" };
        item = item.child(
            text(format!("{sign}{}", places.abs()))
                .key("position-chip")
                .font(font(
                    s,
                    Face::Body,
                    s.fonts.badge_size,
                    l.row,
                    -0.039,
                    s.fonts.bold_weight,
                ))
                .color(vantare::alpha(s.colors.text, chip_alpha))
                .size(19.0, l.row)
                .align(Align::End)
                .pin(
                    Some(column.x + column.width - 19.0),
                    Some(text_top(s, Face::Body, 0.0)),
                    None,
                    None,
                ),
        );
    }
    if let Some(column) = driver
        && vis.battle > 0.0
    {
        let bn = column.x + s.geometry.cell_padding;
        let bw = column.width - 2.0 * s.geometry.cell_padding;
        item = item.child(
            el().key("battle")
                .pin(Some(bn), Some(l.row - 3.0), None, None)
                .size(bw.max(0.0), 2.0)
                .linear_gradient(
                    90.0_f32.to_radians(),
                    [
                        (0.0, vantare::alpha(s.colors.leader, 0.55 * vis.battle)),
                        (0.8, vantare::alpha(s.colors.leader, 0.10 * vis.battle)),
                    ],
                ),
        );
    }
    let best = l.columns.iter().find(|c| c.setting.metric_id == "bestLap");
    if let Some(column) = best {
        if let Some((session, sweep_alpha, frac)) = vis.sweep {
            let base = if session {
                vantare::alpha(s.colors.purple, 0.45)
            } else {
                vantare::alpha(s.colors.gain, 0.35)
            };
            let x = column.x + frac * column.width;
            item = item
                .child(
                    el().key("sweep-a")
                        .pin(Some(x), Some(1.0), None, None)
                        .size(column.width, l.row - 2.0)
                        .linear_gradient(
                            100.0_f32.to_radians(),
                            [
                                (0.0, vantare::alpha(base, 0.0)),
                                (0.5, vantare::alpha(base, sweep_alpha)),
                            ],
                        ),
                )
                .child(
                    el().key("sweep-b")
                        .pin(Some(x + column.width / 2.0), Some(1.0), None, None)
                        .size(column.width / 2.0, l.row - 2.0)
                        .linear_gradient(
                            100.0_f32.to_radians(),
                            [
                                (0.0, vantare::alpha(base, sweep_alpha)),
                                (1.0, vantare::alpha(base, 0.0)),
                            ],
                        ),
                );
        }
        if vis.best_marker > 0.0 {
            item = item.child(
                text("◆")
                    .key("best-marker")
                    .font(font(
                        s,
                        Face::Body,
                        s.fonts.badge_size * 0.6,
                        10.0,
                        0.0,
                        s.fonts.regular_weight,
                    ))
                    .color(vantare::alpha(s.colors.purple, vis.best_marker))
                    .size(12.0, 10.0)
                    .align(Align::End)
                    .pin(
                        Some(column.x + column.width - 15.0),
                        Some(text_top(s, Face::Body, 3.0)),
                        None,
                        None,
                    ),
            );
        }
    }
    if vis.pit_alpha > 0.001
        && let Some(column) = l.columns.iter().find(|c| c.setting.metric_id == "pit")
    {
        item = item.child(
            el().key("pit-badge")
                .pin(
                    Some(column.x + vis.pit_dx),
                    Some((l.row - 26.0) / 2.0),
                    None,
                    None,
                )
                .size(column.width, 26.0)
                .corners([0.0, s.geometry.chip_radius, s.geometry.chip_radius, 0.0])
                .fill(vantare::alpha(s.colors.box_fill, vis.pit_alpha))
                .shadow(
                    0.0,
                    8.0,
                    vantare::alpha(s.colors.box_fill, 0.22 * vis.pit_alpha),
                ),
        );
    }
    for (column_index, (cell, column)) in row.cells.iter().zip(&l.columns).enumerate() {
        if let Some(fill) = cell.fill {
            item = item.child(
                el().key(format!("chip-{column_index}"))
                    .pin(Some(column.x), Some(4.0), None, None)
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
                        .pin(
                            Some(column.x + segment as f32 * (width + gap)),
                            Some((l.row - s.geometry.sector_height) / 2.0),
                            None,
                            None,
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
    item
}

fn footer(
    mut root: El,
    state: &Standings,
    label: impl Fn(&str, &str, f32, f32, f32, f32) -> El,
) -> El {
    let l = &state.scene.layout;
    if l.footer > 0.0 {
        let w = (l.width - 2.0 * l.pad) / 3.0;
        for (index, value) in state.scene.display.footer.iter().enumerate() {
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
    if state.scene.display.paused {
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

fn text_top(style: &Style, face: Face, top: f32) -> f32 {
    top + match face {
        Face::Display => style.fonts.display_baseline,
        Face::Mono => style.fonts.mono_baseline,
        Face::Body => 0.0,
    }
}
