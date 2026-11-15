use super::Delta;
use crate::vantare::{
    Style, alpha,
    paint::{Face, font},
};
use rune::{Align, Color, El, LiveText, Spring, el, text};
use vantare_domain::{
    delta::{Banner, Sector, SectorTone},
    widget_settings::look::Accent,
};

pub(super) fn view(state: &Delta) -> El {
    let s = Style::compiled();
    let d = &s.delta;
    let v = state.variant(&s);
    let size = state.size();
    let mut root = el()
        .key("delta")
        .size(size.width, size.height)
        .motion(Spring::NONE);
    if !state.settings.transparent_background {
        root = root.child(
            el().key("panel")
                .size(
                    size.width,
                    size.height - if state.paused { 22.0 } else { 0.0 },
                )
                .radius(v.radius)
                .linear_gradient(90.0, [(0.0, v.top), (1.0, v.bottom)])
                .border(1.0, v.border),
        );
    }
    if state.settings.size == "pill" {
        if state.paused {
            root = root.child(
                text("Pausa")
                    .key("paused")
                    .absolute(0.0, size.height - 22.0)
                    .h(22.0),
            );
        }
        return root
            .child(label(
                &s,
                "delta-reference",
                &state.labels[2],
                10.0,
                0.0,
                size.width - 20.0,
                d.pill_label,
                Face::Body,
            ))
            .child(
                label(
                    &s,
                    "delta-number",
                    &state.labels[1],
                    10.0,
                    d.pill_label,
                    size.width - 20.0,
                    d.pill_value,
                    Face::Mono,
                )
                .h(d.pill_height - d.pill_label)
                .live_text_color(&state.ink),
            );
    }
    let banner = if state.board.banner.is_some() {
        27.0
    } else {
        0.0
    };
    if let Some(kind) = state.board.banner {
        let value = if kind == Banner::FullCourseYellow {
            "FCY"
        } else {
            "BOX"
        };
        root = root.child(
            el().key("banner")
                .size(size.width, 27.0)
                .fill(s.colors.fcy_fill)
                .child(text(value).color(s.colors.fcy_text).h(27.0)),
        );
    }
    let top = v.padding_y + banner;
    root = root.child(label(
        &s,
        "delta-title",
        &state.labels[0],
        v.padding_x,
        top,
        size.width - 2.0 * v.padding_x,
        v.header_size,
        Face::Display,
    ));
    let number_y = top + v.header_height + v.header_gap;
    if state.message() {
        root = root.child(label(
            &s,
            "delta-status",
            &state.labels[5],
            v.padding_x,
            number_y,
            size.width - 2.0 * v.padding_x,
            s.fonts.body,
            Face::Body,
        ));
    } else {
        root = root
            .child(
                label(
                    &s,
                    "delta-number",
                    &state.labels[1],
                    v.padding_x,
                    number_y,
                    size.width * 0.55,
                    d.big,
                    Face::Mono,
                )
                .live_text_color(&state.ink),
            )
            .child(label(
                &s,
                "delta-reference",
                &state.labels[2],
                size.width * 0.58,
                number_y,
                size.width * 0.4,
                d.pill_label,
                Face::Body,
            ))
            .child(label(
                &s,
                "delta-predicted",
                &state.labels[3],
                size.width * 0.58,
                number_y + 22.0,
                size.width * 0.4,
                d.pill_label,
                Face::Body,
            ))
            .child(label(
                &s,
                "delta-lap",
                &state.labels[4],
                size.width * 0.58,
                number_y + 42.0,
                size.width * 0.4,
                d.pill_label,
                Face::Body,
            ));
    }
    if state.bar_visible() {
        let y = number_y + d.message_height.max(d.big_height);
        root = root
            .child(
                el().key("bar-track")
                    .absolute(v.padding_x, y)
                    .size(size.width - 2.0 * v.padding_x, d.bar)
                    .fill(d.track),
            )
            .child(
                el().key("bar-fill")
                    .live_rect(&state.bar)
                    .live_fill(&state.fill),
            )
            .child(
                el().key("bar-zero")
                    .absolute(size.width / 2.0, y - 2.0)
                    .size(1.0, d.bar + 4.0)
                    .fill(d.center),
            );
    }
    let sectors = state.sectors();
    let width = (size.width - 2.0 * v.padding_x) / sectors.len().max(1) as f32;
    for (index, sector) in sectors.iter().enumerate() {
        let (value, ink, progress) = sector_parts(sector);
        let y = size.height - v.padding_y - d.sector_height - if state.paused { 22.0 } else { 0.0 };
        root = root.child(
            el().key(format!("sector-{index}"))
                .absolute(v.padding_x + index as f32 * width, y)
                .size(width - 4.0, d.sector_height)
                .fill(alpha(ink, 0.15))
                .child(
                    text(format!("S{} · {value}", index + 1))
                        .color(ink)
                        .font(font(
                            &s,
                            Face::Body,
                            s.fonts.small,
                            d.sector_height,
                            0.0,
                            s.fonts.regular_weight,
                        )),
                )
                .child(
                    el().absolute(0.0, d.sector_height - d.sector_bar)
                        .size(progress.unwrap_or(0.0) * (width - 4.0), d.sector_bar)
                        .fill(ink),
                ),
        );
    }
    if state.settings.brand_visible == Some(true) {
        let ink = match state.settings.accent {
            Accent::Red => s.accents.red,
            Accent::Amber => s.accents.amber,
            Accent::Green => s.accents.green,
            Accent::White => s.accents.white,
        };
        root = root.child(
            text("VANTARE")
                .key("brand")
                .absolute(size.width - 84.0, top)
                .color(ink)
                .font(font(
                    &s,
                    Face::Display,
                    12.0,
                    v.header_height,
                    0.0,
                    s.fonts.regular_weight,
                )),
        );
    }
    if !state.message() {
        root = root.child(label(
            &s,
            "delta-status",
            &state.labels[5],
            v.padding_x,
            size.height - 20.0,
            size.width - 2.0 * v.padding_x,
            s.fonts.small,
            Face::Body,
        ));
    }
    if state.paused {
        root = root.child(
            text("Pausa")
                .key("paused")
                .absolute(0.0, size.height - 22.0)
                .h(22.0),
        );
    }
    root
}
pub(super) fn sector_parts(sector: &Sector) -> (String, Color, Option<f32>) {
    let s = Style::compiled();
    match sector {
        Sector::Done(tone, value) => (
            value.map_or_else(|| "—".into(), |v| format!("{v:+.3}")),
            match tone {
                SectorTone::SessionBest => s.colors.purple,
                SectorTone::PersonalBest => s.colors.green,
                SectorTone::Slower => s.colors.yellow,
            },
            None,
        ),
        Sector::Live(progress) => ("…".into(), s.colors.value, progress.map(|p| p as f32)),
        Sector::Pending => ("—".into(), s.colors.sector_pending, None),
    }
}
#[allow(clippy::too_many_arguments)] // Fixed text rectangles keep Live updates out of layout.
fn label(
    s: &Style,
    key: &str,
    value: &LiveText,
    x: f32,
    y: f32,
    width: f32,
    size: f32,
    face: Face,
) -> El {
    text(value.get().to_string())
        .key(key)
        .live_text(value)
        .absolute(x, y)
        .size(width, size * 1.3)
        .font(font(s, face, size, size * 1.3, 0.0, s.fonts.regular_weight))
        .color(s.colors.text)
        .align(Align::Start)
}
