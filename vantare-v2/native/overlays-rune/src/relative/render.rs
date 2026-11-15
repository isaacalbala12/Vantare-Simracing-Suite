//! Vantare presentation; data projection and finite motion live in the parent.
use super::{
    Relative, RowLive,
    layout::{Footer, Item, Kind},
};
use crate::vantare::{Style, alpha};
use rune::{Align, Color, El, Family, LiveText, Shape, TextStyle, canvas, el, row, text};
use vantare_domain::{DriverRating, format::Language, relative::Banner};
const WHITE: Color = Color {
    r: 1.0,
    g: 1.0,
    b: 1.0,
    a: 1.0,
};
#[derive(Clone, Copy)]
enum Face {
    Body,
    Display,
    Mono,
}
fn font(s: &Style, face: Face, size: f32, height: f32, tracking: f32, weight: f32) -> TextStyle {
    let family = match face {
        Face::Body => "Inter",
        Face::Display => s.fonts.display_family,
        Face::Mono => s.fonts.mono_family,
    };
    TextStyle {
        family: Family::Named(family),
        features: "'tnum' 1",
        line_height: height,
        tracking,
        ..TextStyle::new(size, weight)
    }
}
#[allow(clippy::too_many_arguments)] // A single text primitive mirrors the canonical painter.
fn label(
    s: &Style,
    value: &LiveText,
    key: impl Into<String>,
    width: f32,
    height: f32,
    face: Face,
    size: f32,
    weight: f32,
    ink: Color,
    align: Align,
) -> El {
    text(value.get().to_string())
        .key(key)
        .live_text(value)
        .font(font(s, face, size, height, 0.0, weight))
        .color(ink)
        .size(width, height)
        .align(align)
        .truncate()
}
fn fixed(s: &Style, value: &str, height: f32, size: f32, ink: Color) -> El {
    text(value)
        .font(font(
            s,
            Face::Body,
            size,
            height,
            0.0,
            s.fonts.regular_weight,
        ))
        .color(ink)
        .h(height)
}
fn pill(s: &Style, value: &LiveText, key: impl Into<String>, fill: Color, ink: Color) -> El {
    text(value.get().to_string())
        .key(key)
        .live_text(value)
        .font(font(
            s,
            Face::Body,
            s.fonts.pill,
            s.geometry.pill_height,
            s.fonts.pill_tracking,
            s.fonts.pill_weight,
        ))
        .color(ink)
        .h(s.geometry.pill_height)
        .pl(s.geometry.pill_padding)
        .pr(s.geometry.pill_padding)
        .fill(fill)
        .radius(s.geometry.chip_radius)
}
pub(super) fn header_values(state: &Relative) -> [String; 6] {
    let es = state.prefs.language == Language::Es;
    let banner = state
        .board
        .banner
        .as_ref()
        .map(|b| match b {
            Banner::FullCourseYellow => "FCY".into(),
            Banner::LocalYellow(_) => state.labels.yellow.clone(),
            Banner::InPits => if es { "En boxes" } else { "In the pits" }.into(),
        })
        .unwrap_or_default();
    let banner: String = banner.to_uppercase();
    let right = if state.board.banner == Some(Banner::InPits) && state.board.pit_limiter {
        if es { "limitador" } else { "limiter" }
    } else {
        ""
    };
    let footer = state.plan.items.iter().find_map(|(_, i)| {
        if let Item::Footer(f) = i {
            Some(*f)
        } else {
            None
        }
    });
    let (left, end) = match footer {
        Some(Footer::Waiting) => (
            if es {
                "Esperando al simulador"
            } else {
                "Waiting for the simulator"
            }
            .into(),
            String::new(),
        ),
        Some(Footer::Traffic) => (
            state.labels.traffic.clone(),
            if es {
                "deja hueco en la curva"
            } else {
                "leave room in the corner"
            }
            .into(),
        ),
        Some(Footer::Pits) => (state.labels.exit.clone(), state.labels.loss.clone()),
        Some(Footer::Legend) => (
            if es {
                "▲▼ s/vuelta recortados"
            } else {
                "▲▼ s/lap gained"
            }
            .into(),
            String::new(),
        ),
        Some(Footer::Session) => {
            let value = if state.board.session.to_lowercase().starts_with("pr") {
                if es { "Tanda —" } else { "Run —" }
            } else if es {
                "Delta de vuelta lanzada —"
            } else {
                "Flying lap delta —"
            };
            (value.into(), String::new())
        }
        None => (String::new(), String::new()),
    };
    [
        state.labels.title.clone(),
        state.labels.header.clone(),
        banner,
        right.into(),
        left,
        end,
    ]
}
pub(super) fn view(state: &Relative) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let width = state.plan.width;
    let border = if v.border_accent > 0.0 {
        alpha(state.options.accent(s), v.border_accent)
    } else {
        v.border
    };
    let mut root = el()
        .key("relative-view")
        .size(width, state.size().height)
        .motion(rune::Spring::NONE)
        .child(
            el().size(width, state.plan.content)
                .radius(v.radius)
                .border(1.0, border)
                .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
                .shadow(
                    v.shadow_y,
                    v.shadow_blur,
                    alpha(
                        Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 1.0,
                        },
                        v.shadow_alpha,
                    ),
                ),
        );
    for id in &state.order {
        if let Some(live) = state.rows.get(id)
            && !live.active
        {
            root = root.child(car_row(state, live));
        }
    }
    for &(y, item) in &state.plan.items {
        root = match item {
            Item::Header => root.child(header(state, y)),
            Item::Banner => root.child(banner(state)),
            Item::Strip => root.child(strip(state, y)),
            Item::Slot(index) => {
                if let Some(row) = state
                    .board
                    .slots
                    .get(index)
                    .and_then(Option::as_ref)
                    .and_then(|r| state.rows.get(&r.id.0))
                {
                    root.child(car_row(state, row))
                } else {
                    root
                }
            }
            Item::Skeleton(index, me) => root.child(skeleton(state, y, index, me)),
            Item::Footer(kind) => root.child(footer(state, y, kind)),
        };
    }
    if state.paused {
        let title = if state.prefs.language == Language::Es {
            "EN PAUSA"
        } else {
            "PAUSED"
        };
        root = root.child(
            el().key("pause-band")
                .size(width, 22.0)
                .fill(rune::color::hex("#101113f2").expect("pause color"))
                .pin(Some(0.0), Some(state.plan.height), None, None)
                .child(
                    text(title)
                        .font(font(s, Face::Body, 11.0, 22.0, 0.22, 600.0))
                        .color(WHITE)
                        .h(22.0)
                        .pin(Some(8.0), Some(0.0), None, None),
                ),
        );
    }
    root
}
fn highlight(state: &Relative, color: Color) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let x = v.padding_x - s.geometry.player_bleed;
    let node = el()
        .size(state.plan.width - 2.0 * x, s.geometry.row_height)
        .radius(v.player_radius)
        .pin(Some(x), Some(0.0), None, None);
    if v.player_white > 0.0 {
        node.fill(alpha(
            color,
            if color == WHITE { v.player_white } else { 0.3 },
        ))
    } else {
        node.linear_gradient(
            if v.player_vertical {
                std::f32::consts::PI
            } else {
                std::f32::consts::FRAC_PI_2
            },
            [
                (0.0, alpha(color, v.player_from)),
                (1.0, alpha(color, v.player_to)),
            ],
        )
    }
}
fn car_row(state: &Relative, live: &RowLive) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let f = &s.fonts;
    let r = &s.relative;
    let c = &s.colors;
    let v = state.options.variant(s);
    let h = g.row_height;
    let class = s.class(&live.data.class);
    let mut root = el()
        .key(format!("car-{}", live.data.id.0))
        .size(state.plan.width, h)
        .pin(Some(0.0), Some(0.0), None, None)
        .live_offset(&live.position)
        .live_opacity(&live.opacity);
    if live.data.is_player {
        root = root.child(
            highlight(
                state,
                if v.player_white > 0.0 {
                    WHITE
                } else {
                    state.options.accent(s)
                },
            )
            .live_opacity(&live.own),
        );
    }
    let x = v.padding_x - g.player_bleed;
    let layer = || {
        el().size(state.plan.width - 2.0 * x, h)
            .radius(v.player_radius)
            .pin(Some(x), Some(0.0), None, None)
            .linear_gradient(
                if v.player_vertical {
                    0.0
                } else {
                    std::f32::consts::FRAC_PI_2
                },
                [(0.0, super::CLEAR), (1.0, super::CLEAR)],
            )
    };
    root = root
        .child(layer().live_gradient(&live.pulse, &live.pulse_end))
        .child(layer().live_gradient(&live.flash, &live.flash_end));
    root = root.child(
        el().size(g.class_dot, g.class_dot)
            .radius(if v.square_dots {
                0.0
            } else {
                g.class_dot / 2.0
            })
            .fill(class.dot)
            .pin(Some(v.padding_x), Some((h - g.class_dot) / 2.0), None, None),
    );
    for column in &state.plan.columns {
        let index = column.kind as usize;
        let value = &live.texts[index];
        let key = format!("cell-{}-{}", live.data.id.0, column.kind.metric());
        let node = match column.kind {
            Kind::Position => label(
                s,
                value,
                key,
                column.width,
                h,
                Face::Display,
                r.position_size,
                600.0,
                c.muted,
                Align::End,
            )
            .live_text_color(&live.inks[index]),
            Kind::Number => text(value.get().to_string())
                .key(key)
                .live_text(value)
                .font(font(
                    s,
                    Face::Mono,
                    f.mono_small,
                    g.number_height,
                    0.0,
                    400.0,
                ))
                .color(class.ink)
                .h(g.number_height)
                .min_w(g.number_min_width)
                .pl(g.number_padding)
                .pr(g.number_padding)
                .fill(class.tint)
                .radius(g.chip_radius),
            Kind::Driver => {
                let body = font(s, Face::Body, f.body, h, 0.0, 400.0);
                let box_width = if live.data.in_pits {
                    rune::text::measure(
                        "BOX",
                        &[],
                        font(
                            s,
                            Face::Body,
                            f.pill,
                            g.pill_height,
                            f.pill_tracking,
                            f.pill_weight,
                        ),
                        None,
                    )
                    .0 + 2.0 * g.pill_padding
                        + g.cell_gap
                } else {
                    0.0
                };
                let available = (column.width - box_width).max(0.0);
                let used = rune::text::measure(&value.get(), &[], body, None)
                    .0
                    .min(available);
                let name = label(
                    s,
                    value,
                    key,
                    used,
                    h,
                    Face::Body,
                    f.body,
                    400.0,
                    c.text,
                    Align::Start,
                );
                let mut names =
                    el().size(available, h)
                        .child(name.pin(Some(0.0), Some(0.0), None, None));
                let rest = available - used;
                if state.options.cols.vehicle && rest > 12.0 {
                    names = names.child(
                        label(
                            s,
                            &live.detail,
                            format!("detail-{}", live.data.id.0),
                            rest,
                            h,
                            Face::Body,
                            f.small,
                            400.0,
                            c.muted,
                            Align::Start,
                        )
                        .pin(Some(used), Some(0.0), None, None),
                    );
                }
                let mut cell = row()
                    .size(column.width, h)
                    .items_center()
                    .gap(g.cell_gap)
                    .child(names);
                if live.data.in_pits {
                    cell = cell.child(
                        text("BOX")
                            .font(font(
                                s,
                                Face::Body,
                                f.pill,
                                g.pill_height,
                                f.pill_tracking,
                                f.pill_weight,
                            ))
                            .color(c.box_text)
                            .fill(c.box_fill)
                            .h(g.pill_height)
                            .pl(g.pill_padding)
                            .pr(g.pill_padding)
                            .radius(g.chip_radius),
                    );
                }
                cell
            }
            Kind::Laps => {
                if let Some(laps) = live.data.lap_delta.filter(|n| *n != 0) {
                    let (fill, ink) = if laps < 0 {
                        (r.laps_down_fill, r.laps_down_text)
                    } else {
                        (r.laps_up_fill, r.laps_up_text)
                    };
                    pill(s, value, key, fill, ink)
                } else {
                    el().size(column.width, h)
                }
            }
            Kind::Rating => {
                let (fill, ink) = match live.data.rating {
                    Some(DriverRating::Platinum) => (r.platinum_fill, r.platinum_text),
                    Some(DriverRating::Gold) => (r.gold_fill, r.gold_text),
                    Some(DriverRating::Silver) => (r.silver_fill, r.silver_text),
                    Some(DriverRating::Bronze) => (r.bronze_fill, r.bronze_text),
                    None => (super::CLEAR, c.even),
                };
                if live.data.rating.is_some() {
                    pill(s, value, key, fill, ink)
                        .w(column.width)
                        .align(Align::Center)
                } else {
                    label(
                        s,
                        value,
                        key,
                        column.width,
                        h,
                        Face::Body,
                        f.small,
                        400.0,
                        ink,
                        Align::Start,
                    )
                }
            }
            Kind::Safety | Kind::Trend | Kind::Gap => label(
                s,
                value,
                key,
                column.width,
                h,
                Face::Mono,
                f.mono,
                400.0,
                c.value,
                Align::End,
            )
            .live_text_color(&live.inks[index]),
        };
        let cell_height = match column.kind {
            Kind::Number => g.number_height,
            Kind::Laps if live.data.lap_delta.is_some_and(|n| n != 0) => g.pill_height,
            Kind::Rating if live.data.rating.is_some() => g.pill_height,
            _ => h,
        };
        root = root.child(node.pin(
            Some(column.x),
            Some(
                (h - cell_height) / 2.0
                    + if column.kind == Kind::Position {
                        f.display_baseline
                    } else {
                        0.0
                    },
            ),
            None,
            None,
        ));
    }
    root
}
fn header(state: &Relative, y: f32) -> El {
    let s = &state.style;
    let v = state.options.variant(s);
    let h = v.header_height - if v.header_rule > 0.0 { 6.0 } else { 0.0 };
    let pad = v.padding_x;
    let width = state.plan.width;
    let face = if v.header_display {
        Face::Display
    } else {
        Face::Body
    };
    let title = text(state.header[0].get().to_string())
        .key("header-title")
        .live_text(&state.header[0])
        .font(font(
            s,
            face,
            v.header_size,
            h,
            v.header_tracking,
            if v.header_display { 600.0 } else { 400.0 },
        ))
        .color(v.header_color)
        .h(h)
        .grow(1.0)
        .min_w(0.0)
        .truncate();
    let range = text(state.header[1].get().to_string())
        .key("header-range")
        .live_text(&state.header[1])
        .font(font(
            s,
            face,
            v.header_size,
            h,
            v.header_tracking,
            if v.header_display { 600.0 } else { 400.0 },
        ))
        .color(v.header_color)
        .h(h);
    let mut line = row()
        .size(width - 2.0 * pad, h)
        .items_center()
        .gap(s.brand.margin)
        .child(title)
        .child(range);
    if state.options.brand {
        let scale = s.brand.symbol_height / 41.0;
        let points = [
            [9.0, 51.0],
            [32.0, 10.0],
            [55.0, 51.0],
            [42.0, 51.0],
            [32.0, 32.0],
            [22.0, 51.0],
        ]
        .map(|[x, y]| [(x - 9.0) * scale, (y - 10.0) * scale]);
        line = line.child(
            row()
                .h(h)
                .items_center()
                .gap(s.brand.gap)
                .child(
                    canvas(Shape::new().fill(points.to_vec(), s.brand.symbol))
                        .key("brand-symbol")
                        .size(46.0 * scale, s.brand.symbol_height),
                )
                .child(
                    text("VANTARE")
                        .font(font(
                            s,
                            Face::Display,
                            s.brand.size,
                            h,
                            s.brand.tracking,
                            600.0,
                        ))
                        .color(s.colors.muted)
                        .h(h),
                ),
        );
    }
    let mut root = el()
        .size(width, v.header_height)
        .pin(Some(0.0), Some(y), None, None)
        .child(line.pin(Some(pad), Some(0.0), None, None));
    if v.header_rule > 0.0 {
        root = root.child(
            el().size(width - 2.0 * pad, 1.0)
                .fill(alpha(state.options.accent(s), v.header_rule))
                .pin(Some(pad), Some(v.header_height - 1.0), None, None),
        );
    }
    root
}
fn banner(state: &Relative) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let c = &s.colors;
    let pad = state.options.variant(s).padding_x;
    let (fill, ink, line) = match state.board.banner {
        Some(Banner::FullCourseYellow) => (c.fcy_fill, c.fcy_text, None),
        Some(Banner::LocalYellow(_)) => (c.yellow_fill, c.yellow_text, Some(c.yellow_line)),
        _ => (c.stops_fill, c.text, Some(c.line)),
    };
    let mut node = el()
        .size(state.plan.width, g.banner_height)
        .fill(fill)
        .child(
            label(
                s,
                &state.header[2],
                "banner-left",
                state.plan.width - 2.0 * pad,
                g.banner_height,
                Face::Display,
                s.fonts.banner,
                600.0,
                ink,
                Align::Start,
            )
            .font(font(
                s,
                Face::Display,
                s.fonts.banner,
                g.banner_height,
                s.fonts.banner_tracking,
                600.0,
            ))
            .pin(Some(pad), Some(0.0), None, None),
        )
        .child(
            label(
                s,
                &state.header[3],
                "pit-limiter",
                state.plan.width - 2.0 * pad,
                g.banner_height,
                Face::Mono,
                s.fonts.mono_small,
                400.0,
                ink,
                Align::End,
            )
            .pin(Some(pad), Some(0.0), None, None),
        );
    if let Some(line) = line {
        node = node.child(el().size(state.plan.width, 1.0).fill(line).pin(
            Some(0.0),
            Some(g.banner_height - 1.0),
            None,
            None,
        ));
    }
    node
}
fn strip(state: &Relative, y: f32) -> El {
    let s = &state.style;
    let r = &s.relative;
    let pad = state.options.variant(s).padding_x;
    let width = state.plan.width;
    let mut root = el()
        .key("track-strip")
        .size(width, r.strip_height)
        .pin(Some(0.0), Some(y), None, None)
        .child(el().size(width - 2.0 * pad, 2.0).fill(r.strip_line).pin(
            Some(pad),
            Some(10.0),
            None,
            None,
        ))
        .child(el().size(1.0, 14.0).fill(r.strip_tick).pin(
            Some(width / 2.0),
            Some(4.0),
            None,
            None,
        ))
        .child(
            text("−10 s")
                .font(font(s, Face::Mono, r.strip_label, 11.0, 0.0, 400.0))
                .color(r.strip_text)
                .size(50.0, 11.0)
                .pin(Some(pad), Some(17.0), None, None),
        )
        .child(
            text("+10 s")
                .font(font(s, Face::Mono, r.strip_label, 11.0, 0.0, 400.0))
                .color(r.strip_text)
                .size(50.0, 11.0)
                .align(Align::End)
                .pin(None, Some(17.0), Some(pad), None),
        );
    for id in state
        .dot_order
        .iter()
        .filter(|id| state.dots.get(id).is_some_and(|d| !d.player))
        .chain(
            state
                .dot_order
                .iter()
                .filter(|id| state.dots.get(id).is_some_and(|d| d.player)),
        )
    {
        let d = &state.dots[id];
        let size = if d.player { r.strip_me } else { r.strip_dot };
        let mut dot = el()
            .key(format!("strip-car-{}", d.id.0))
            .size(size, size)
            .radius(size / 2.0)
            .fill(if d.player {
                state.options.accent(s)
            } else {
                s.class(&d.class).dot
            })
            .live_offset(&d.position)
            .pin(Some(-size / 2.0), Some(11.0 - size / 2.0), None, None);
        if d.player {
            dot = dot.border(2.0, WHITE);
        }
        root = root.child(dot);
    }
    root
}
fn skeleton(state: &Relative, y: f32, index: usize, me: bool) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let v = state.options.variant(s);
    let ink = s.colors.skeleton;
    let mut root = el()
        .key(format!("skeleton-{index}"))
        .size(state.plan.width, g.row_height)
        .pin(Some(0.0), Some(y), None, None);
    if me {
        root = root.child(
            highlight(
                state,
                if v.player_white > 0.0 {
                    WHITE
                } else {
                    state.options.accent(s)
                },
            )
            .opacity(0.6),
        );
    }
    let top = (g.row_height - g.skeleton_bar) / 2.0;
    root.child(el().size(16.0, g.skeleton_bar).radius(2.0).fill(ink).pin(
        Some(v.padding_x),
        Some(top),
        None,
        None,
    ))
    .child(
        el().size(g.class_dot, g.class_dot)
            .radius(g.class_dot / 2.0)
            .fill(ink)
            .pin(
                Some(v.padding_x + 16.0 + g.cell_gap),
                Some((g.row_height - g.class_dot) / 2.0),
                None,
                None,
            ),
    )
    .child(
        el().size(110.0 + ((index * 37) % 70) as f32, g.skeleton_bar)
            .radius(2.0)
            .fill(ink)
            .pin(
                Some(v.padding_x + 16.0 + 2.0 * g.cell_gap + g.class_dot),
                Some(top),
                None,
                None,
            ),
    )
    .child(el().size(48.0, g.skeleton_bar).radius(2.0).fill(ink).pin(
        None,
        Some(top),
        Some(v.padding_x),
        None,
    ))
}
fn footer(state: &Relative, y: f32, kind: Footer) -> El {
    let s = &state.style;
    let g = &s.geometry;
    let c = &s.colors;
    let pad = state.options.variant(s).padding_x;
    let width = state.plan.width;
    let top = 1.0 + g.footer_gap;
    let es = state.prefs.language == Language::Es;
    let mut root = el()
        .key("relative-footer")
        .size(width, top + g.footer_height)
        .pin(Some(0.0), Some(y), None, None)
        .child(el().size(width - 2.0 * pad, 1.0).fill(c.line).pin(
            Some(pad),
            Some(0.0),
            None,
            None,
        ));
    let left = pad
        + if kind == Footer::Waiting {
            g.pulse + g.cell_gap
        } else if kind == Footer::Traffic {
            8.0 + g.cell_gap
        } else {
            0.0
        };
    if kind == Footer::Waiting {
        root = root.child(
            el().size(g.pulse, g.pulse)
                .radius(g.pulse / 2.0)
                .fill(c.pulse)
                .pin(
                    Some(pad),
                    Some(top + (g.footer_height - g.pulse) / 2.0),
                    None,
                    None,
                ),
        );
    }
    if kind == Footer::Traffic {
        root = root.child(fixed(s, "▲ ", g.footer_height, s.fonts.header, c.loss).pin(
            Some(pad),
            Some(top),
            None,
            None,
        ));
    }
    if kind == Footer::Legend {
        let minus = LiveText::new(if es { "−V" } else { "−L" });
        let plus = LiveText::new(if es { "+V" } else { "+L" });
        let legend = row()
            .h(g.footer_height)
            .items_center()
            .gap(g.cell_gap)
            .child(pill(
                s,
                &minus,
                "legend-down",
                s.relative.laps_down_fill,
                s.relative.laps_down_text,
            ))
            .child(fixed(
                s,
                if es { "doblado" } else { "lapped" },
                g.footer_height,
                s.fonts.header,
                c.muted,
            ))
            .child(pill(
                s,
                &plus,
                "legend-up",
                s.relative.laps_up_fill,
                s.relative.laps_up_text,
            ))
            .child(fixed(
                s,
                if es { "te dobla" } else { "laps you" },
                g.footer_height,
                s.fonts.header,
                c.muted,
            ));
        root = root.child(legend.pin(None, Some(top), Some(pad), None));
    }
    root.child(
        label(
            s,
            &state.header[4],
            "footer-left",
            width - 2.0 * pad,
            g.footer_height,
            Face::Body,
            s.fonts.header,
            400.0,
            c.muted,
            Align::Start,
        )
        .pin(Some(left), Some(top), None, None),
    )
    .child(
        label(
            s,
            &state.header[5],
            "footer-right",
            width - 2.0 * pad,
            g.footer_height,
            Face::Body,
            s.fonts.header,
            400.0,
            c.muted,
            Align::End,
        )
        .pin(Some(pad), Some(top), None, None),
    )
}
