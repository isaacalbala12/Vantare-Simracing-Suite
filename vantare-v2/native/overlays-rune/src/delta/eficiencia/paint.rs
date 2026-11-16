//! Paints the Eficiencia delta with the shared tokens: panel, frame, capsule,
//! value, scale, fill, tone cross and notices.
use super::scene::Scene;
use crate::eficiencia::{self, INK, MUTED};
use rune::{Color, El, TextStyle, el};
use vantare_domain::delta::{Event, Tone};

const WIDTH: f32 = 280.0;
const HEIGHT: f32 = 96.0;
const GAIN: u32 = 0x7fb686;
const LOSS: u32 = 0xf25a5a;

fn tone_color(tone: Tone) -> Color {
    match tone {
        Tone::Gaining => eficiencia::color(GAIN, 1.0),
        Tone::Losing => eficiencia::color(LOSS, 1.0),
        Tone::Neutral => eficiencia::color(INK, 1.0),
    }
}

fn tone_hex(tone: Tone) -> u32 {
    match tone {
        Tone::Gaining => GAIN,
        Tone::Losing => LOSS,
        Tone::Neutral => INK,
    }
}

fn mix(from: u32, to: u32, t: f32) -> Color {
    let channel = |shift: u32| {
        let a = ((from >> shift) & 255) as f32;
        let b = ((to >> shift) & 255) as f32;
        (a + (b - a) * t).round() / 255.0
    };
    Color {
        r: channel(16),
        g: channel(8),
        b: channel(0),
        a: 1.0,
    }
}

fn text_at(value: &str, x: f32, base: f32, style: TextStyle, ink: Color) -> El {
    eficiencia::label(value, x, base, style, ink)
}

/// Esquinas del relleno de la cápsula: solo el extremo de salida (GPUI [5,0,0,5]).
fn capsule_corners(gaining: bool) -> [f32; 4] {
    if gaining {
        [5.0, 0.0, 0.0, 5.0]
    } else {
        [0.0, 5.0, 5.0, 0.0]
    }
}

fn soot_at(x: f32, y: f32, color: Color, alpha: f32, blur: f32, width: f32, height: f32) -> El {
    let tint = Color { a: alpha, ..color };
    el().size(width, height)
        .radius(3.0)
        .fill(tint)
        .shadow(0.0, blur, tint)
        .pin(Some(x), Some(y), None, None)
}

pub(super) fn view(scene: &Scene) -> El {
    if scene.capsule {
        return capsule(scene);
    }
    let s = scene;
    let mut root = el()
        .key("delta-eficiencia")
        .size(WIDTH, HEIGHT)
        .motion(rune::Spring::NONE)
        .child(eficiencia::panel(WIDTH, HEIGHT))
        .child(eficiencia::outline(WIDTH, HEIGHT, 0.12, 0.24));
    let color = tone_color(s.tone);
    let value_style = eficiencia::font(27.0, 700, -0.025);
    let value_width = eficiencia::width(&s.delta_text, value_style);
    let left = (WIDTH - value_width - 20.0) / 2.0;
    let baseline = eficiencia::baseline(14.5, 40.5, 27.0);
    let arrow = match s.tone {
        Tone::Gaining => "▲",
        Tone::Losing => "▼",
        Tone::Neutral => "",
    };
    let arrow_style = eficiencia::font(13.0, 700, -0.025);
    let arrow_width = eficiencia::width(arrow, arrow_style);
    root = root
        .child(text_at(&s.delta_text, left + 20.0, baseline, value_style, color).key("delta-value"))
        .child(
            text_at(
                arrow,
                left + (12.0 - arrow_width) / 2.0,
                baseline,
                arrow_style,
                color,
            )
            .key("delta-arrow"),
        );
    root = root.child(
        el().key("delta-track")
            .pin(Some(16.0), Some(68.0), None, None)
            .size(248.0, 5.0)
            .radius(3.0)
            .fill(eficiencia::color(INK, 0.08)),
    );
    for (x, alpha) in [(16.0, 0.22), (77.5, 0.16), (201.5, 0.16), (263.0, 0.22)] {
        root = root.child(
            el().pin(Some(x), Some(68.0), None, None)
                .size(1.0, 5.0)
                .fill(eficiencia::color(INK, alpha)),
        );
    }
    let (cross, cross_alpha) = (s.cross, s.cross_alpha);
    let center_hex = cross.map_or(INK, tone_hex);
    let center = mix(INK, center_hex, cross_alpha);
    let center_alpha = if cross.is_some() {
        0.5 + cross_alpha * 0.5
    } else {
        0.5
    };
    if let Some(tone) = cross {
        root = root.child(
            soot_at(
                140.0,
                65.0,
                tone_color(tone),
                0.7 * cross_alpha,
                8.0,
                1.0,
                11.0,
            )
            .key("delta-cross"),
        );
    }
    root = root.child(
        el().pin(Some(140.0), Some(65.0), None, None)
            .size(1.0, 11.0)
            .fill(Color {
                a: center_alpha,
                ..center
            }),
    );
    let [offset, width] = s.fill;
    if width > 0.0 {
        let x = 16.0 + 248.0 * offset;
        let w = 248.0 * width;
        let (a, b) = if s.tone == Tone::Gaining {
            (0.3, 1.0)
        } else {
            (1.0, 0.3)
        };
        root = root
            .child(soot_at(x, 68.0, color, 0.4, 7.0, w, 5.0))
            .child(
                el().key("delta-fill")
                    .pin(Some(x), Some(68.0), None, None)
                    .size(w, 5.0)
                    .radius(3.0)
                    .linear_gradient(
                        90.0_f32.to_radians(),
                        [(0.0, Color { a, ..color }), (1.0, Color { a: b, ..color })],
                    ),
            );
    }
    let scale_style = eficiencia::font(11.0, 400, 0.04);
    for (label, x) in [("-1.5", 16.0), ("0", 140.0), ("+1.5", 264.0)] {
        let width = eficiencia::width(label, scale_style);
        let x = if label == "0" {
            x - width / 2.0
        } else if label == "+1.5" {
            x - width
        } else {
            x
        };
        root = root.child(text_at(
            label,
            x,
            eficiencia::baseline(77.0, 11.0, 11.0),
            scale_style,
            eficiencia::color(INK, 1.0),
        ));
    }
    root = notices(root, s, false);
    let status_style = eficiencia::font(7.0, 600, 0.08);
    if let Some(status) = s.status {
        root = root.child(text_at(
            status,
            8.0,
            10.0,
            status_style,
            eficiencia::color(MUTED, 1.0),
        ));
    }
    if let Some(detail) = s.reference_notice {
        root = root.child(text_at(
            detail,
            8.0,
            61.0,
            status_style,
            eficiencia::color(MUTED, 1.0),
        ));
    }
    root
}

fn notices(mut root: El, s: &Scene, capsule: bool) -> El {
    let Some(event) = s.event else {
        return root;
    };
    if event == Event::PersonalBest {
        root = notice(
            root,
            "notice-best",
            s.best_label,
            &s.best_lap_text,
            false,
            GAIN,
            s.notice_alpha,
            capsule,
        );
    }
    notice(
        root,
        "notice-last",
        s.last_label,
        &s.last_lap_text,
        true,
        INK,
        s.notice_alpha,
        capsule,
    )
}

fn notice(
    root: El,
    key: &str,
    label: &str,
    value: &str,
    right: bool,
    color: u32,
    alpha: f32,
    capsule: bool,
) -> El {
    let slide = 6.0 * (1.0 - alpha) * if right { 1.0 } else { -1.0 };
    let mut root = root;
    for (value_text, top, height, style, is_label) in [
        (
            label,
            if capsule { 37.0 } else { 26.75 },
            7.0,
            eficiencia::font(7.0, 600, 0.1),
            true,
        ),
        (
            value,
            if capsule { 47.0 } else { 36.75 },
            12.0,
            eficiencia::font(12.0, 650, 0.0),
            false,
        ),
    ] {
        let fitted = eficiencia::fit(value_text, style, 75.0);
        let ink = eficiencia::color(if is_label { MUTED } else { color }, alpha);
        let x = if right {
            (if capsule { 264.0 } else { 272.0 }) - eficiencia::width(&fitted, style)
        } else if capsule {
            16.0
        } else {
            8.0
        };
        root = root.child(
            text_at(
                &fitted,
                x + slide,
                eficiencia::baseline(top, height, style.size),
                style,
                ink,
            )
            .key(format!("{key}-{}", if is_label { "label" } else { "value" })),
        );
    }
    root
}

fn capsule(s: &Scene) -> El {
    let color = tone_color(s.tone);
    let mut root = el()
        .key("delta-eficiencia")
        .size(WIDTH, HEIGHT)
        .motion(rune::Spring::NONE);
    root = root.child(
        el().key("delta-capsule-track")
            .pin(Some(10.0), Some(8.0), None, None)
            .size(260.0, 17.0)
            .radius(8.5)
            .fill(eficiencia::color(0x0a0a0e, 0.88))
            .box_shadow(rune::Shadow {
                x: 0.0,
                y: 2.0,
                blur: 6.0,
                spread: 0.0,
                color: eficiencia::color(0x000000, 0.7),
                inset: true,
            }),
    );
    let mut clipped = el()
        .pin(Some(10.0), Some(8.0), None, None)
        .size(260.0, 17.0)
        .clip_rounded(8.5);
    let [offset, width] = s.fill;
    if width > 0.0 {
        let x = offset * 260.0;
        let w = width * 260.0;
        let gaining = s.tone == Tone::Gaining;
        let corners = capsule_corners(gaining);
        clipped = clipped
            .child(soot_at(x, 3.0, color, 0.45, 10.0, w, 11.0))
            .child(
                el().key("delta-fill")
                    .pin(Some(x), Some(3.0), None, None)
                    .size(w, 11.0)
                    .corners(corners)
                    .linear_gradient(
                        90.0_f32.to_radians(),
                        [
                            (
                                0.0,
                                Color {
                                    a: if gaining { 0.35 } else { 1.0 },
                                    ..color
                                },
                            ),
                            (
                                1.0,
                                Color {
                                    a: if gaining { 1.0 } else { 0.35 },
                                    ..color
                                },
                            ),
                        ],
                    ),
            );
    }
    let cross = s.cross;
    let cross_alpha = s.cross_alpha;
    let center_hex = cross.map_or(INK, tone_hex);
    let center = mix(INK, center_hex, cross_alpha);
    if let Some(tone) = cross {
        clipped = clipped.child(
            soot_at(
                130.0,
                0.0,
                tone_color(tone),
                0.7 * cross_alpha,
                8.0,
                1.0,
                17.0,
            )
            .key("delta-cross"),
        );
    }
    clipped = clipped.child(
        el().pin(Some(130.0), Some(0.0), None, None)
            .size(1.0, 17.0)
            .fill(Color {
                a: 0.55 + 0.45 * cross_alpha,
                ..center
            }),
    );
    root = root.child(clipped);
    let value_style = eficiencia::font(14.0, 750, -0.01);
    let arrow = match s.tone {
        Tone::Gaining => "▲",
        Tone::Losing => "▼",
        Tone::Neutral => "",
    };
    let arrow_style = eficiencia::font(10.0, 750, -0.01);
    let arrow_width = eficiencia::width(arrow, arrow_style);
    let width = eficiencia::width(&s.delta_text, value_style) + arrow_width + 6.0 + 34.0;
    let left = (WIDTH - width) / 2.0;
    root = root.child(
        el().pin(Some(left), Some(31.0), None, None)
            .size(width, 27.0)
            .radius(13.0)
            .fill(eficiencia::color(0x121216, 0.92))
            .border(
                1.0,
                if s.tone == Tone::Neutral {
                    eficiencia::color(0xffffff, 0.11)
                } else {
                    Color { a: 0.4, ..color }
                },
            ),
    );
    let baseline = eficiencia::baseline(34.0, 21.0, 14.0);
    root = root
        .child(text_at(arrow, left + 17.0, baseline, arrow_style, color))
        .child(text_at(
            &s.delta_text,
            left + 17.0 + arrow_width + 6.0,
            baseline,
            value_style,
            color,
        ));
    root = notices(root, s, true);
    let status_style = eficiencia::font(7.0, 600, 0.08);
    if let Some(status) = s.status {
        root = root.child(text_at(
            status,
            12.0,
            74.0,
            status_style,
            eficiencia::color(MUTED, 1.0),
        ));
    }
    if let Some(detail) = s.reference_notice {
        root = root.child(text_at(
            detail,
            12.0,
            86.0,
            status_style,
            eficiencia::color(MUTED, 1.0),
        ));
    }
    root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tone_colors_and_the_cross_mix_match_the_efficiency_tokens() {
        assert_eq!(tone_color(Tone::Gaining), eficiencia::color(GAIN, 1.0));
        assert_eq!(tone_color(Tone::Neutral), eficiencia::color(INK, 1.0));
        let half = mix(INK, GAIN, 0.5);
        let red = ((INK >> 16) & 255) as f32;
        let green = ((GAIN >> 16) & 255) as f32;
        assert!((half.r * 255.0 - (red + green) / 2.0).abs() < 1.0);
    }
}
