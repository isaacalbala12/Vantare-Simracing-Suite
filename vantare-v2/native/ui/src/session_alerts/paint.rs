//! Composición r4 v2: panel, franja FCY/Fuel, título de Banderas y píldora Delta.
use super::Settings;
use crate::{
    efficiency::{preview::PaintWindow as Window, text},
    vantare::{
        paint::{Face, Kit},
        style::{Color, Style, Variant, with_opacity},
    },
};
use gpui::App;
use std::fmt::Write;
use vantare_domain::{
    format::Preferences,
    session_alerts::{Kind, Mini, Tone, View},
};

pub(super) fn bounds(settings: &Settings) -> ((f32, f32), (f32, f32)) {
    if settings.companion_for.is_none() {
        return ((480.0, 88.0), (0.0, 0.0));
    }
    let scale = mini_scale(settings);
    (
        (
            210.0 * scale,
            (36.0 * f32::from(settings.mini_limit) + 8.0 * f32::from(settings.mini_limit - 1))
                * scale,
        ),
        (0.0, 0.0),
    )
}
fn mini_scale(settings: &Settings) -> f32 {
    match settings.mini_size.as_str() {
        "s" => 0.85,
        "l" => 1.25,
        _ => 1.0,
    }
}
fn variant(style: &Style, settings: &Settings) -> Variant {
    let mut v = style.styles.neo.clone();
    // Mismos valores de .w.s-car/.s-lim/.s-tr del kit aprobado. Solo cambia el panel.
    match settings.style.as_str() {
        "carmin" => {
            v.top = Color(0x341018, 0.96);
            v.bottom = Color(0x14080c, 0.96);
            v.border_accent = 0.30;
            v.radius = 6.0;
            v.shadow_y = 12.0;
            v.shadow_blur = 28.0;
            v.shadow_alpha = 0.5;
        }
        "limpio" => {
            v.top = Color(0x080809, 0.82);
            v.bottom = v.top;
            v.border = Color(0, 0.0);
            v.border_accent = 0.0;
            v.radius = 4.0;
            v.shadow_alpha = 0.0;
        }
        "transparente" => {
            v.top = Color(0, 0.0);
            v.bottom = v.top;
            v.border = v.top;
            v.border_accent = 0.0;
            v.shadow_alpha = 0.0;
        }
        _ => {}
    }
    v
}
fn alpha(start: u64, end: u64, now: u64, reduced: bool) -> f32 {
    if now >= end {
        return 0.0;
    }
    if reduced {
        return 1.0;
    }
    (now.saturating_sub(start) as f32 / 150.0)
        .min(end.saturating_sub(now) as f32 / 150.0)
        .clamp(0.0, 1.0)
}
pub(super) fn paint(
    settings: &Settings,
    view: &View,
    counter: Option<&Mini>,
    now: u64,
    prefs: Preferences,
    reduced: bool,
    preview: bool,
    window: &mut Window,
    cx: &mut App,
) {
    let style = Style::compiled();
    let v = variant(&style, settings);
    let kit = Kit {
        style: &style,
        variant: &v,
        accent: style.accents.red,
        language: prefs.language,
        width: 480.0,
    };
    if settings.companion_for.is_some() {
        if !settings.mini {
            return;
        }
        let scale = mini_scale(settings);
        if preview && view.minis.is_empty() {
            let ghost = Kit {
                width: 210.0 * scale,
                ..kit
            };
            ghost.panel(window, 36.0 * scale);
            let ink = ghost.ink(Face::Body, 11.0 * scale, 0.3, style.colors.muted.hsla());
            draw_label(
                &ghost,
                settings,
                window,
                cx,
                "Mini cuenta atrás",
                16.0 * scale,
                None,
                0.0,
                36.0 * scale,
                Face::Body,
                &ink,
            );
        }
        for (i, mini) in view.minis.iter().enumerate() {
            let (ox, oy) = text::origin();
            text::with_origin((ox, oy + i as f32 * 44.0 * scale), || {
                let mk = Kit {
                    width: 210.0 * scale,
                    ..kit
                };
                mk.panel(window, 36.0 * scale);
                let label = format!(
                    "{}{}",
                    mini.label,
                    if mini.calendar { " · cal" } else { "" }
                );
                let label_ink = mk.ink(
                    Face::Body,
                    style.delta.pill_label * scale,
                    0.3,
                    style.colors.muted.hsla(),
                );
                let label = text::fit(window, &label, &label_ink, 104.0 * scale);
                draw_label(
                    &mk,
                    settings,
                    window,
                    cx,
                    &label,
                    16.0 * scale,
                    None,
                    0.0,
                    36.0 * scale,
                    Face::Body,
                    &label_ink,
                );
                let color = if mini.tone() == Tone::Final {
                    style.colors.loss
                } else {
                    style.colors.yellow
                };
                let ink = mk.ink(
                    Face::Display,
                    style.delta.pill_value * scale,
                    0.3,
                    color.hsla(),
                );
                draw_label(
                    &mk,
                    settings,
                    window,
                    cx,
                    &mini.value(),
                    0.0,
                    Some(194.0 * scale),
                    0.0,
                    36.0 * scale,
                    Face::Display,
                    &ink,
                );
            });
        }
        return;
    }
    let Some(n) = &view.active else {
        if preview {
            placeholder(&kit, settings, window, cx);
        }
        return;
    };
    with_opacity(alpha(n.started_at_ms, n.ends_at_ms, now, reduced), || {
        kit.panel(window, 88.0);
        let (fill, ink) = match n.tone() {
            Tone::Mild => (style.colors.fcy_fill, style.colors.fcy_text),
            Tone::Final => (style.fuel.low_fill, style.fuel.low_text),
            Tone::Finished => (style.colors.final_fill, style.colors.final_text),
        };
        let mut context = if n.calendar {
            "cal".to_owned()
        } else {
            n.label.clone()
        };
        if view.queued > 0 {
            let _ = write!(context, " · 1/{}", view.queued + 1);
        }
        if !settings.sound {
            context.push_str(" · sin sonido");
        }
        let threshold = match n.kind {
            Kind::Threshold(m) => Some(m),
            _ => None,
        };
        let band = if let Some(m) = threshold {
            if n.calendar {
                format!("Calendario · {m} min")
            } else if m == 1 {
                "Último minuto".into()
            } else {
                format!("Aviso · {m} min")
            }
        } else {
            match n.kind {
                Kind::Finished {
                    qualifying: true, ..
                } => "Qualy terminada",
                Kind::Finished { .. } => "Prácticas terminadas",
                Kind::Formation => "Vuelta de formación",
                _ => "Salida",
            }
            .into()
        };
        kit.band(window, cx, fill, ink, &band, Some(&context), false, None);
        let title = match n.kind {
            Kind::Finished {
                qualifying: true, ..
            } => "QUALY TERMINADA",
            Kind::Finished { .. } => "PRÁCTICAS TERMINADAS",
            Kind::Formation => "VUELTA DE FORMACIÓN",
            Kind::Start => "SALIDA INMINENTE",
            Kind::Threshold(_) if n.calendar => "TU CARRERA EMPIEZA PRONTO",
            Kind::Threshold(_) => "LA SESIÓN ESTÁ POR TERMINAR",
        };
        let result_title = if let Kind::Finished { best_lap_ms, .. } = n.kind {
            Some(best_lap_ms.map_or_else(
                || "SIN VUELTA VÁLIDA".into(),
                |ms| {
                    format!(
                        "MEJOR VUELTA {}",
                        vantare_domain::format::lap_time(Some(ms as f64 / 1000.0))
                    )
                },
            ))
        } else {
            None
        };
        let title = result_title.as_deref().unwrap_or(title);
        let title_ink = kit.ink(Face::Display, 20.0, 1.4, Color(0xfaf7f7, 1.0).hsla());
        let title = text::fit(window, title, &title_ink, 340.0);
        draw_label(
            &kit,
            settings,
            window,
            cx,
            &title,
            14.0,
            None,
            31.0,
            24.0,
            Face::Display,
            &title_ink,
        );
        let detail = if n.calendar {
            n.label.as_str()
        } else if matches!(n.kind, Kind::Finished { .. }) {
            "Resultado de tu clase"
        } else {
            "Tiempo restante de la sesión"
        };
        let detail_ink = kit.ink(Face::Body, 12.0, 0.0, style.colors.header_em.hsla());
        let detail = text::fit(window, detail, &detail_ink, 338.0);
        draw_label(
            &kit,
            settings,
            window,
            cx,
            &detail,
            14.0,
            None,
            57.0,
            16.0,
            Face::Body,
            &detail_ink,
        );
        let value = match n.kind {
            Kind::Finished { position, .. } => {
                position.map_or_else(|| "—".into(), |p| format!("P{p}"))
            }
            _ => counter.map_or_else(|| "—".into(), Mini::value),
        };
        let value_ink = kit.ink(
            Face::Display,
            style.delta.big,
            0.0,
            style.colors.text.hsla(),
        );
        draw_label(
            &kit,
            settings,
            window,
            cx,
            &value,
            0.0,
            Some(466.0),
            27.0,
            38.0,
            Face::Display,
            &value_ink,
        );
        let label = if matches!(n.kind, Kind::Finished { .. }) {
            "POSICIÓN"
        } else if counter.is_some_and(|m| m.distance_m.is_some()) {
            "A LA LÍNEA"
        } else {
            "RESTANTE"
        };
        let small = kit.ink(Face::Mono, 10.0, 0.0, style.colors.muted.hsla());
        draw_label(
            &kit,
            settings,
            window,
            cx,
            label,
            0.0,
            Some(466.0),
            64.0,
            12.0,
            Face::Mono,
            &small,
        );
    });
}
fn placeholder(kit: &Kit<'_>, settings: &Settings, window: &mut Window, cx: &mut App) {
    kit.panel(window, 88.0);
    let c = &kit.style.colors;
    kit.band(
        window,
        cx,
        c.stops_fill,
        c.text,
        "Avisos de sesión",
        Some("vista del Studio"),
        false,
        None,
    );
    let ink = kit.ink(Face::Display, 20.0, 1.4, c.text.hsla());
    draw_label(
        kit,
        settings,
        window,
        cx,
        "SIN AVISOS",
        14.0,
        None,
        31.0,
        24.0,
        Face::Display,
        &ink,
    );
    let detail = kit.ink(Face::Body, 12.0, 0.0, c.header_em.hsla());
    draw_label(
        kit,
        settings,
        window,
        cx,
        "En pista no ocupa nada si no hay avisos",
        14.0,
        None,
        57.0,
        16.0,
        Face::Body,
        &detail,
    );
}
// Transparente conserva legibilidad sobre cielo: sombra del texto del kit CSS.
fn draw_label(
    kit: &Kit<'_>,
    settings: &Settings,
    window: &mut Window,
    cx: &mut App,
    value: &str,
    x: f32,
    right: Option<f32>,
    top: f32,
    height: f32,
    face: Face,
    ink: &text::TextInk<'_>,
) {
    if settings.style == "transparente" {
        let shadow = text::TextInk {
            color: Color(0, 0.9).hsla(),
            ..*ink
        };
        kit.label(
            window,
            cx,
            value,
            x,
            right,
            top + 1.0,
            height,
            face,
            &shadow,
        );
    }
    kit.label(window, cx, value, x, right, top, height, face, ink);
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn approved_geometry_fade_and_panel_styles_share_the_kit() {
        let mut s = Settings::default();
        assert_eq!(bounds(&s).0, (480.0, 88.0));
        assert_eq!(alpha(1000, 9000, 1075, false), 0.5);
        assert_eq!(alpha(1000, 9000, 8925, false), 0.5);
        assert_eq!(alpha(1000, 9000, 1000, true), 1.0);
        s.companion_for = Some("main".into());
        assert_eq!(bounds(&s).0, (210.0, 124.0));
        s.mini_size = "s".into();
        assert_eq!(bounds(&s).0, (178.5, 105.4));
        let style = Style::compiled();
        s.style = "neo".into();
        assert_eq!(variant(&style, &s), style.styles.neo);
        s.style = "limpio".into();
        assert_eq!(variant(&style, &s).shadow_alpha, 0.0);
        s.style = "transparente".into();
        assert_eq!(variant(&style, &s).top.1, 0.0);
    }
}
