//! view.rs de GPUI: panel, marca, franja de bandera y contexto de sesión (E2).
use super::{
    Visual,
    model::{self, Status},
    style::Style,
};
use crate::eficiencia::{self as kit, baseline, color, fit, width};
use rune::{Color, El, Shape, TextStyle, canvas, el};
use vantare_domain::{FlagKind, format::Language};

// efficiency::rect: bordes CSS, mitades hacia arriba; toda capa fuera del flujo.
fn rect(x: f32, y: f32, w: f32, h: f32) -> El {
    let snap = |v: f32| (v + 0.5).floor();
    let (left, top) = (snap(x), snap(y));
    kit::rect(
        left,
        top,
        snap(x + w).max(left) - left,
        snap(y + h).max(top) - top,
        Color::TRANSPARENT,
    )
}
fn ink(style: &Style, size: f32, weight: f32, tracking: f32, rgb: u32) -> (TextStyle, Color) {
    (
        kit::font(size, weight as u16, tracking * style.fonts.tracking_scale),
        color(rgb, 1.0),
    )
}
fn label(key: &'static str, value: &str, x: f32, base: f32, ink: (TextStyle, Color)) -> El {
    kit::label(value, x, base, ink.0, ink.1).key(key)
}
pub(super) fn flag_rgb(style: &Style, flag: Option<&FlagKind>) -> u32 {
    match flag {
        None | Some(FlagKind::Other(_)) => style.colors.flag_unknown.0,
        Some(FlagKind::Green) => style.colors.flag_green.0,
        Some(FlagKind::Yellow) => style.colors.flag_yellow.0,
        Some(FlagKind::Blue) => style.colors.flag_blue.0,
        Some(FlagKind::Red) => style.colors.flag_red.0,
        Some(FlagKind::White) => style.colors.white.0,
        Some(FlagKind::Black) => style.colors.flag_black.0,
        Some(FlagKind::Checkered) => style.colors.flag_checkered.0,
    }
}
fn clip_half_plane(poly: &[(f32, f32)], nx: f32, ny: f32, d: f32) -> Vec<(f32, f32)> {
    let mut out = Vec::new();
    for i in 0..poly.len() {
        let (a, b) = (poly[i], poly[(i + 1) % poly.len()]);
        let (da, db) = (nx * a.0 + ny * a.1 - d, nx * b.0 + ny * b.1 - d);
        if da >= 0.0 {
            out.push(a);
        }
        if (da >= 0.0) != (db >= 0.0) {
            let t = da / (da - db);
            out.push((a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t));
        }
    }
    out
}
fn ribbon_size(width: f32, broadcast: bool) -> (f32, f32) {
    if broadcast {
        ((width - 250.0).clamp(0.0, 180.0), 46.0)
    } else {
        (130.0, 50.0)
    }
}
pub(super) fn ribbon_bands(width: f32, broadcast: bool) -> Vec<(Vec<(f32, f32)>, f32)> {
    let (bw, bh) = ribbon_size(width, broadcast);
    let x0 = width - bw;
    let angle = 131.0f32.to_radians();
    let (dx, dy) = (angle.sin(), -angle.cos());
    let length = (bw * angle.sin()).abs() + (bh * angle.cos()).abs();
    let (cx, cy) = (x0 + bw / 2.0, bh / 2.0);
    let base = [(x0, 0.0), (x0 + bw, 0.0), (x0 + bw, bh), (x0, bh)];
    let centre = cx * dx + cy * dy;
    let bands = if broadcast {
        [(0.34, 0.48, 0.30), (0.57, 0.76, 0.23)]
    } else {
        [(0.37, 0.54, 0.28), (0.62, 0.79, 0.17)]
    };
    bands
        .into_iter()
        .map(|(from, to, alpha)| {
            let low = (from - 0.5) * length + centre;
            let high = (to - 0.5) * length + centre;
            let poly = clip_half_plane(&base, dx, dy, low);
            (clip_half_plane(&poly, -dx, -dy, -high), alpha)
        })
        .collect()
}

pub(super) fn view(v: &Visual, language: Language) -> El {
    let (c, p) = (&v.config, &v.plan);
    let s = &c.style;
    let (w, h) = (c.width, c.height);
    let mut nodes = Vec::new();
    if p.pit_enabled
        && let Some((_, image)) = v.assets.as_ref().and_then(|a| a.shadow.as_ref())
    {
        nodes.push(
            rect(w, 0.0, s.geometry.pit_rail_width, h)
                .key("pit-shadow")
                .pixels(image.pixels()),
        );
    }
    nodes.push(
        kit::panel(w, h)
            .key("efficiency-panel")
            .pin(Some(0.0), Some(0.0), None, None),
    );
    if p.brand_band > 0.0 {
        nodes.push(
            rect(0.0, 0.0, w, s.geometry.brand_band_height).fill(color(s.colors.black.0, 0.10)),
        );
        nodes.push(
            rect(0.0, s.geometry.brand_band_height - 1.0, w, 1.0)
                .key("brand-band-rule")
                .fill(color(s.colors.ink.0, 0.10)),
        );
        if let Some(a) = &v.assets {
            nodes.push(
                rect(
                    10.0,
                    2.0,
                    s.geometry.brand_logo_size,
                    s.geometry.brand_logo_size,
                )
                .key("brand-logo")
                .pixels(a.logo.pixels()),
            );
        }
        nodes.push(label(
            "brand-band-text",
            "VANTARE",
            34.0,
            15.0,
            ink(
                s,
                s.fonts.brand_size,
                s.fonts.bold_weight,
                0.075,
                s.colors.ink.0,
            ),
        ));
    }
    if p.has_header && c.study != "v2-focus" {
        let (bw, bh) = ribbon_size(w, c.broadcast);
        let rgb = if c.broadcast {
            s.colors.broadcast_accent.0
        } else {
            flag_rgb(s, v.content_plan.board.flag.as_ref())
        };
        if c.broadcast {
            nodes.push(
                rect(w - bw, 0.0, bw, bh)
                    .key("flag-ribbon-background")
                    .linear_gradient(
                        110.0f32.to_radians(),
                        [(0.55, color(rgb, 0.0)), (1.0, color(rgb, 0.16))],
                    ),
            );
        }
        for (i, (poly, alpha)) in ribbon_bands(w, c.broadcast).into_iter().enumerate() {
            if poly.len() < 3 {
                continue;
            }
            let points: Vec<_> = poly.into_iter().map(|(x, y)| [x - (w - bw), y]).collect();
            nodes.push(
                canvas(Shape::new().fill(points, color(rgb, alpha)))
                    .key(format!("flag-ribbon-{i}"))
                    .size(bw, bh)
                    .pin(Some(w - bw), Some(0.0), None, None),
            );
        }
    }
    // E3 añade th/filas; E4 añade bandas, pies, espera y badges del rail.
    if p.has_header {
        let top = if p.external_header {
            p.brand_band
        } else {
            p.table_top
        };
        nodes.extend(session_header(v, language, 0.0, top));
    }
    let top_alpha = s.opacity.frame + s.opacity.top_frame * (1.0 - s.opacity.frame);
    nodes.push(kit::outline(w, h, s.opacity.frame, top_alpha));
    let size = v.size();
    let mut root = el()
        .size(size.0, size.1)
        .motion(rune::Spring::NONE)
        .instant_changes();
    for node in nodes {
        root = root.child(node);
    }
    root
}

fn session_header(v: &Visual, language: Language, left: f32, top: f32) -> Vec<El> {
    let (c, p, content) = (&v.config, &v.plan, &v.content_plan);
    let s = &c.style;
    let f = &s.fonts;
    let mut nodes = Vec::new();
    let mut x = left + 10.0;
    let mid = top
        + if c.broadcast {
            s.geometry.broadcast_header_height
        } else {
            s.geometry.session_header_height
        } / 2.0;
    if p.brand_visible {
        if let Some(a) = &v.assets {
            nodes.push(
                rect(
                    x,
                    mid - s.geometry.logo_size / 2.0,
                    s.geometry.logo_size,
                    s.geometry.logo_size,
                )
                .key("session-logo")
                .pixels(a.logo.pixels()),
            );
        }
        let brand = ink(s, f.brand_size, f.bold_weight, 0.075, s.colors.ink.0);
        let base = baseline(mid - f.brand_size / 2.0, f.brand_size, f.brand_size).round();
        nodes.push(label(
            "session-brand",
            "VANTARE",
            x + s.geometry.logo_size + 6.0,
            base,
            brand,
        ));
        x += s.geometry.logo_size + 6.0 + width("VANTARE", brand.0) + 8.0;
    }
    let labels = model::labels(language);
    let stale = content.status == Status::Stale;
    let session_label = if stale {
        labels.stale
    } else {
        content.session_label()
    };
    let type_ink = ink(
        s,
        f.session_label_size,
        f.semibold_weight,
        0.16,
        if stale {
            s.colors.gold.0
        } else {
            s.colors.session.0
        },
    );
    let clock_ink = ink(
        s,
        f.clock_size,
        f.metric_weight,
        -0.025,
        if stale {
            s.colors.muted.0
        } else {
            s.colors.ink.0
        },
    );
    if p.brand_visible {
        let type_text = fit(session_label, type_ink.0, 68.0);
        let clock_w = width(content.remaining_text(), clock_ink.0);
        let type_w = width(&type_text, type_ink.0);
        let context_w = 10.0 + type_w.max(clock_w);
        let context_h = f.session_label_size + 4.0 + clock_ink.0.line_height;
        let context_top = mid - context_h / 2.0;
        nodes.push(
            rect(x, context_top, 1.0, context_h)
                .key("session-rule")
                .fill(color(
                    s.colors.ink.0,
                    if c.study == "v2-focus" { 0.10 } else { 0.23 },
                )),
        );
        let text_x = x + 1.0 + 10.0;
        nodes.push(label(
            "session-kind",
            &type_text,
            text_x,
            baseline(context_top, f.session_label_size, f.session_label_size).round(),
            type_ink,
        ));
        let clock_top = context_top + f.session_label_size + 4.0;
        nodes.push(label(
            "session-clock",
            content.remaining_text(),
            text_x,
            baseline(clock_top, clock_ink.0.line_height, f.clock_size).round(),
            clock_ink,
        ));
        x += 1.0 + context_w + 8.0;
    } else {
        let kind = (
            kit::font(
                f.footer_value_size,
                f.semibold_weight as u16,
                0.09 * f.tracking_scale,
            ),
            type_ink.1,
        );
        let clock = (
            kit::font(
                f.plain_clock_size,
                f.bold_weight as u16,
                -0.025 * f.tracking_scale,
            ),
            clock_ink.1,
        );
        let line = clock.0.line_height;
        let base = baseline(mid - line / 2.0, line, f.plain_clock_size).round();
        nodes.push(label("session-kind", session_label, x, base, kind));
        x += width(session_label, kind.0) + 7.0;
        nodes.push(label(
            "session-clock",
            content.remaining_text(),
            x,
            base,
            clock,
        ));
        x += width(content.remaining_text(), clock.0) + 8.0;
    }
    let class_text = content
        .active_class()
        .chars()
        .take(3)
        .collect::<String>()
        .to_uppercase();
    let focus = c.study == "v2-focus";
    let class_ink = ink(
        s,
        f.badge_size,
        f.bold_weight,
        0.02,
        if focus { 0xd6d6da } else { s.colors.white.0 },
    );
    let chip_w = width(&class_text, class_ink.0) + 12.0;
    let chip_h = 5.0 + class_ink.0.line_height + 5.0;
    let chip_top = mid - chip_h / 2.0;
    let mut chip = rect(x, chip_top, chip_w, chip_h)
        .key("class-chip")
        .corners([
            s.geometry.chip_radius,
            s.geometry.chip_cut_radius,
            s.geometry.chip_radius,
            s.geometry.chip_radius,
        ])
        .linear_gradient(
            145.0f32.to_radians(),
            [
                (
                    0.0,
                    color(s.colors.class_start.0, if focus { 0.0 } else { 1.0 }),
                ),
                (
                    1.0,
                    color(s.colors.class_end.0, if focus { 0.0 } else { 1.0 }),
                ),
            ],
        );
    if focus {
        chip = chip.border(1.0, color(s.colors.ink.0, 0.22));
    }
    nodes.push(chip);
    nodes.push(label(
        "session-class",
        &class_text,
        x + 6.0,
        baseline(chip_top + 5.0, class_ink.0.line_height, f.badge_size).round(),
        class_ink,
    ));
    nodes
}
