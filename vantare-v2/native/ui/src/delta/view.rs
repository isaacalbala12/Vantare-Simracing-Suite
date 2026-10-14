use super::eficiencia::Labels as ViewModel;
use super::motion::Frame;
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, paint_rect, rect, tokens};
use gpui::{
    App, BorderStyle, BoxShadow, ContentMask, Corners, Edges, linear_color_stop, linear_gradient,
    point, px, quad,
};
use vantare_domain::delta::{Event, Tone};

fn tone_color(tone: Tone) -> u32 {
    match tone {
        Tone::Gaining => 0x7fb686,
        Tone::Losing => tokens::LOSS,
        Tone::Neutral => tokens::INK,
    }
}

fn mix(from: u32, to: u32, t: f32) -> u32 {
    let channel = |shift: u32| {
        let a = ((from >> shift) & 255) as f32;
        let b = ((to >> shift) & 255) as f32;
        ((a + (b - a) * t).round() as u32) << shift
    };
    channel(16) | channel(8) | channel(0)
}

pub(super) fn paint(vm: &ViewModel, frame: Frame, window: &mut Window, cx: &mut App) {
    if vm.capsule {
        paint_capsule(vm, frame, window, cx);
        return;
    }
    paint_panel(window, 280.0, 96.0, 0.87);
    window.paint_quad(quad(
        rect(0.0, 0.0, 280.0, 96.0),
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
    paint_frame(window, 280.0, 96.0);
    // ::after tiene el borde superior al 24 %, el resto al 12 %.
    paint_rect(window, 6.0, 0.0, 268.0, 1.0, col(0xffffff, 0.136));
    let color = tone_color(vm.tone);
    let value_ink = ink(27.0, 700.0, -0.025, col(color, 1.0));
    let arrow = match vm.tone {
        Tone::Gaining => "▲",
        Tone::Losing => "▼",
        Tone::Neutral => "",
    };
    // El span vacío sigue ocupando 12 px + el gap de 8 px, también en neutro.
    let value_w = text::width(window, &vm.delta_text, &value_ink);
    let left = (280.0 - value_w - 20.0) / 2.0;
    let baseline = text::baseline(14.5, 40.5, 27.0);
    text::draw(
        window,
        cx,
        &vm.delta_text,
        left + 20.0,
        baseline,
        &value_ink,
    );
    let arrow_ink = ink(13.0, 700.0, -0.025, col(color, 1.0));
    text::draw(
        window,
        cx,
        arrow,
        left + (12.0 - text::width(window, arrow, &arrow_ink)) / 2.0,
        baseline,
        &arrow_ink,
    );

    window.paint_quad(quad(
        rect(16.0, 68.0, 248.0, 5.0),
        Corners::all(px(3.0)),
        col(tokens::INK, 0.08),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));
    for (x, alpha) in [(16.0, 0.22), (77.5, 0.16), (201.5, 0.16), (263.0, 0.22)] {
        paint_rect(window, x, 68.0, 1.0, 5.0, col(tokens::INK, alpha));
    }
    let center_tone = frame.cross.map_or(tokens::INK, tone_color);
    let center = mix(tokens::INK, center_tone, frame.cross_alpha);
    let center_alpha = if frame.cross.is_some() {
        0.5 + frame.cross_alpha * 0.5
    } else {
        0.5
    };
    if frame.cross.is_some() {
        glow(
            window,
            (140.0, 65.0, 1.0, 11.0),
            center_tone,
            0.7 * frame.cross_alpha,
            8.0,
        );
    }
    paint_rect(window, 140.0, 65.0, 1.0, 11.0, col(center, center_alpha));
    let [offset, width] = frame.fill;
    if width > 0.0 {
        let x = 16.0 + 248.0 * offset;
        let w = 248.0 * width;
        glow(window, (x, 68.0, w, 5.0), color, 0.4, 7.0);
        let (a, b) = if vm.tone == Tone::Gaining {
            (0.3, 1.0)
        } else {
            (1.0, 0.3)
        };
        window.paint_quad(quad(
            rect(x, 68.0, w, 5.0),
            Corners::all(px(3.0)),
            linear_gradient(
                90.0,
                linear_color_stop(col(color, a), 0.0),
                linear_color_stop(col(color, b), 1.0),
            ),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
    }
    // El kit solo registra Inter: conservar las cajas de JetBrains Mono del golden.
    let scale_ink = ink(11.0, 400.0, 0.04, col(tokens::INK, 1.0));
    for (label, x) in [("-1.5", 16.0), ("0", 140.0), ("+1.5", 264.0)] {
        text::draw(
            window,
            cx,
            label,
            if label == "0" {
                x - text::width(window, label, &scale_ink) / 2.0
            } else if label == "+1.5" {
                x - text::width(window, label, &scale_ink)
            } else {
                x
            },
            text::baseline(77.0, 11.0, 11.0),
            &scale_ink,
        );
    }
    if let Some(event) = frame.event {
        if event == Event::PersonalBest {
            notice(
                window,
                cx,
                vm.best_label,
                &vm.best_lap_text,
                false,
                0x7fb686,
                frame.notice_alpha,
                false,
            );
        }
        notice(
            window,
            cx,
            vm.last_label,
            &vm.last_lap_text,
            true,
            tokens::INK,
            frame.notice_alpha,
            false,
        );
    }
    let status_ink = ink(7.0, 600.0, 0.08, col(tokens::MUTED, 1.0));
    if let Some(status) = vm.status_text {
        text::draw(window, cx, status, 8.0, 10.0, &status_ink);
    }
    if let Some(detail) = vm.reference_notice {
        text::draw(window, cx, detail, 8.0, 61.0, &status_ink);
    }
}

fn glow(window: &mut Window, bounds: (f32, f32, f32, f32), color: u32, alpha: f32, blur: f32) {
    let (x, y, w, h) = bounds;
    window.paint_drop_shadows(
        rect(x, y, w, h),
        Corners::all(px(3.0)),
        &[BoxShadow {
            color: col(color, alpha),
            offset: point(px(0.0), px(0.0)),
            blur_radius: px(blur),
            spread_radius: px(0.0),
            inset: false,
        }],
    );
}

fn notice(
    window: &mut Window,
    cx: &mut App,
    label: &str,
    value: &str,
    right: bool,
    color: u32,
    alpha: f32,
    capsule: bool,
) {
    let slide = 6.0 * (1.0 - alpha) * if right { 1.0 } else { -1.0 };
    for (text_value, top, height, style) in [
        (
            label,
            if capsule { 37.0 } else { 26.75 },
            7.0,
            ink(7.0, 600.0, 0.1, col(tokens::MUTED, alpha)),
        ),
        (
            value,
            if capsule { 47.0 } else { 36.75 },
            12.0,
            ink(12.0, 650.0, 0.0, col(color, alpha)),
        ),
    ] {
        let fitted = text::fit(window, text_value, &style, 75.0);
        let x = if right {
            (if capsule { 264.0 } else { 272.0 }) - text::width(window, &fitted, &style)
        } else if capsule {
            16.0
        } else {
            8.0
        };
        text::draw(
            window,
            cx,
            &fitted,
            x + slide,
            text::baseline(top, height, style.size),
            &style,
        );
    }
}

// `vf-delta-capsule`: sin panel raíz; pista de 17 px y valor en píldora.
fn paint_capsule(vm: &ViewModel, frame: Frame, window: &mut Window, cx: &mut App) {
    let color = tone_color(vm.tone);
    let track = rect(10.0, 8.0, 260.0, 17.0);
    window.paint_quad(quad(
        track,
        Corners::all(px(8.5)),
        col(0x0a0a0e, 0.88),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));
    window.paint_drop_shadows(
        track,
        Corners::all(px(8.5)),
        &[BoxShadow {
            color: col(0, 0.7),
            offset: point(px(0.0), px(2.0)),
            blur_radius: px(6.0),
            spread_radius: px(0.0),
            inset: true,
        }],
    );
    let center_tone = frame.cross.map_or(tokens::INK, tone_color);
    let center = mix(tokens::INK, center_tone, frame.cross_alpha);
    window.with_content_mask(Some(ContentMask { bounds: track }), |window| {
        let [offset, width] = frame.fill;
        if width > 0.0 {
            let x = 10.0 + offset * 260.0;
            let width = width * 260.0;
            let gaining = vm.tone == Tone::Gaining;
            glow(window, (x, 11.0, width, 11.0), color, 0.45, 10.0);
            window.paint_quad(quad(
                rect(x, 11.0, width, 11.0),
                Corners {
                    top_left: px(if gaining { 5.0 } else { 0.0 }),
                    bottom_left: px(if gaining { 5.0 } else { 0.0 }),
                    top_right: px(if gaining { 0.0 } else { 5.0 }),
                    bottom_right: px(if gaining { 0.0 } else { 5.0 }),
                },
                linear_gradient(
                    90.0,
                    linear_color_stop(col(color, if gaining { 0.35 } else { 1.0 }), 0.0),
                    linear_color_stop(col(color, if gaining { 1.0 } else { 0.35 }), 1.0),
                ),
                Edges::all(px(0.0)),
                col(0, 0.0),
                BorderStyle::default(),
            ));
        }
        if frame.cross.is_some() {
            glow(
                window,
                (140.0, 8.0, 1.0, 17.0),
                center_tone,
                0.7 * frame.cross_alpha,
                8.0,
            );
        }
        paint_rect(
            window,
            140.0,
            8.0,
            1.0,
            17.0,
            col(center, 0.55 + 0.45 * frame.cross_alpha),
        );
    });
    let value = ink(14.0, 750.0, -0.01, col(color, 1.0));
    let arrow = match vm.tone {
        Tone::Gaining => "▲",
        Tone::Losing => "▼",
        Tone::Neutral => "",
    };
    let arrow_ink = ink(10.0, 750.0, -0.01, col(color, 1.0));
    let arrow_width = text::width(window, arrow, &arrow_ink);
    // El span vacío mantiene el gap de 6 px, como inline-flex del productivo.
    let width = text::width(window, &vm.delta_text, &value) + arrow_width + 6.0 + 34.0;
    let left = (280.0 - width) / 2.0;
    window.paint_quad(quad(
        rect(left, 31.0, width, 27.0),
        Corners::all(px(13.0)),
        col(0x121216, 0.92),
        Edges::all(px(1.0)),
        if vm.tone == Tone::Neutral {
            col(0xffffff, 0.11)
        } else {
            col(color, 0.4)
        },
        BorderStyle::default(),
    ));
    let baseline = text::baseline(34.0, 21.0, 14.0);
    text::draw(window, cx, arrow, left + 17.0, baseline, &arrow_ink);
    text::draw(
        window,
        cx,
        &vm.delta_text,
        left + 17.0 + arrow_width + 6.0,
        baseline,
        &value,
    );
    if let Some(event) = frame.event {
        if event == Event::PersonalBest {
            notice(
                window,
                cx,
                vm.best_label,
                &vm.best_lap_text,
                false,
                0x7fb686,
                frame.notice_alpha,
                true,
            );
        }
        notice(
            window,
            cx,
            vm.last_label,
            &vm.last_lap_text,
            true,
            tokens::INK,
            frame.notice_alpha,
            true,
        );
    }
    let status = ink(7.0, 600.0, 0.08, col(tokens::MUTED, 1.0));
    if let Some(value) = vm.status_text {
        text::draw(window, cx, value, 12.0, 74.0, &status);
    }
    if let Some(value) = vm.reference_notice {
        text::draw(window, cx, value, 12.0, 86.0, &status);
    }
}
