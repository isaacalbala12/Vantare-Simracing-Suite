//! Piezas visuales compartidas por todas las vistas del calendario. Solo
//! pintan: el estado y las acciones viven en `Calendar`.
use super::model::{ClassChip, Series};
use crate::orbit;
use gpui::{Div, Hsla, SharedString, Stateful, div, prelude::*, px, rgb};

/// Tema claro u oscuro según la luminosidad del fondo de tarjeta.
/// Copia de los tokens: así el borrow de `cx` no impide pasar `&mut cx` a las vistas.
pub(super) fn skin(cx: &gpui::App) -> orbit::skin::Skin {
    orbit::skin(cx).clone()
}

pub(super) fn light(cx: &gpui::App) -> bool {
    let [_, r, g, b] = orbit::skin(cx).l1.to_be_bytes();
    (0.299 * f32::from(r) + 0.587 * f32::from(g) + 0.114 * f32::from(b)) > 150.0
}

/// Color con alfa 0..1 desde `0xRRGGBB`.
pub(super) fn tint(color: u32, alpha: f32) -> Hsla {
    orbit::tint(color, alpha)
}

pub(super) fn acc(cx: &gpui::App) -> u32 {
    orbit::skin(cx).accent
}
/// Texto de acento legible sobre superficies (rojo claro en oscuro).
pub(super) fn acct(cx: &gpui::App) -> u32 {
    orbit::skin(cx).accent_bright
}
pub(super) fn acc_bg(cx: &gpui::App) -> Hsla {
    orbit::alpha(orbit::skin(cx).accent_tint)
}
pub(super) fn acc_line(cx: &gpui::App) -> Hsla {
    orbit::alpha(orbit::skin(cx).hero_ring)
}

pub(super) fn class_color(name: &str, cx: &gpui::App) -> u32 {
    let l = light(cx);
    match (name, l) {
        ("Hypercar", false) => 0xE1_4A54,
        ("Hypercar", true) => 0xD2_333E,
        ("LMP2", false) => 0x4F_8EF7,
        ("LMP2", true) => 0x2F_6BD8,
        ("LMP3", false) => 0xB2_6BFF,
        ("LMP3", true) => 0x8B_4FE0,
        ("LMGT3", false) => 0xF0_8A2C,
        ("LMGT3", true) => 0xD9_741A,
        ("LMGTE Am" | "GTE", false) => 0xD6_B83A,
        ("LMGTE Am" | "GTE", true) => 0xB3_9400,
        _ => orbit::skin(cx).text3,
    }
}

/// Texto Inter con la escala Orbit.
pub(super) fn t(s: impl Into<SharedString>, size: f32, w: u16, color: u32, cx: &gpui::App) -> Div {
    orbit::text(s, size, w, color, cx).line_height(px((size * 1.3).ceil()))
}
pub(super) fn mono(s: impl Into<SharedString>, size: f32, color: u32, cx: &gpui::App) -> Div {
    orbit::mono_text(s, size, color, cx)
}
pub(super) fn bold_mono(s: impl Into<SharedString>, size: f32, color: u32, cx: &gpui::App) -> Div {
    orbit::mono_text(s, size, color, cx).font_weight(gpui::FontWeight(700.0))
}
/// Título Rajdhani.
pub(super) fn disp(s: impl Into<SharedString>, size: f32, color: u32, cx: &gpui::App) -> Div {
    orbit::display(s, size, color, cx).line_height(px(size.ceil() + 2.0))
}
/// Rótulo en mayúsculas con tracking (cabeceras de grupo y columnas).
pub(super) fn cap(s: &str, color: u32, cx: &gpui::App) -> Div {
    orbit::caps(s, 10.5, color, cx)
}

pub(super) fn icon(name: &'static str, size: f32, color: u32) -> gpui::Svg {
    orbit::icon(name, size, color).flex_none()
}

pub(super) fn star(on: bool, size: f32, cx: &gpui::App) -> gpui::Svg {
    if on {
        icon("star", size, acc(cx))
    } else {
        icon("star-line", size, orbit::skin(cx).text3)
    }
}

/// Insignia de nivel: Bronce, Plata, Oro, Semanal o Especial.
pub(super) fn tier(series: &Series, cx: &gpui::App) -> Div {
    let (color, bg): (u32, Hsla) = match (series.rank(), light(cx)) {
        ((_, true) | (3, _), false) => (0xFF_8A91, tint(0xE1_4A54, 0.15)),
        ((_, true) | (3, _), true) => (0xA6_1B26, rgb(0xFB_E2E4).into()),
        ((0, _), false) => (0xE8_AE7E, tint(0xCD_7F32, 0.16)),
        ((0, _), true) => (0x8A_4A16, rgb(0xF6_E6D8).into()),
        ((1, _), false) => (0xD3_D8DE, tint(0xC9_CED4, 0.13)),
        ((1, _), true) => (0x4A_525C, rgb(0xE9_ECEF).into()),
        (_, false) => (0xEB_CB6E, tint(0xE7_C86A, 0.14)),
        (_, true) => (0x7A_5A00, rgb(0xF8_EECB).into()),
    };
    tier_label(series.tier_label(), color, bg, cx)
}
fn tier_label(label: &'static str, color: u32, bg: Hsla, cx: &gpui::App) -> Div {
    div()
        .flex_none()
        .px(px(6.0))
        .py(px(2.0))
        .rounded(px(4.0))
        .bg(bg)
        .child(orbit::text(label, 10.5, 700, color, cx).whitespace_nowrap())
}

/// Punto de color de una clase (7 px).
pub(super) fn class_dot(name: &str, cx: &gpui::App) -> Div {
    div()
        .size(px(7.0))
        .flex_none()
        .rounded_full()
        .bg(rgb(class_color(name, cx)))
}

pub(super) fn class_chip(chip: &ClassChip, cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(5.0))
        .child(class_dot(&chip.name, cx))
        .child(t(chip.name.clone(), 11.5, 400, skin.text2, cx).whitespace_nowrap())
        .when_some(chip.extra.clone(), |row, extra| {
            row.child(t(format!("· {extra}"), 11.5, 400, skin.cap, cx).whitespace_nowrap())
        })
}

#[derive(Clone, Copy)]
pub(super) enum Tone {
    Ok,
    Warn,
    Err,
    Acc,
    Neutral,
}

pub(super) fn pill(label: impl Into<SharedString>, tone: Tone, cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    let light = light(cx);
    let (color, bg): (u32, Hsla) = match (tone, light) {
        (Tone::Ok, false) => (0x7F_E0A3, tint(0x22_C55E, 0.13)),
        (Tone::Ok, true) => (0x16_6534, tint(0x15_803D, 0.10)),
        (Tone::Warn, false) => (0xF8_C46A, tint(0xF5_9E0B, 0.12)),
        (Tone::Warn, true) => (0x92_400E, tint(0xD9_7706, 0.12)),
        (Tone::Err, false) => (0xFF_9A9A, tint(0xF2_5A5A, 0.12)),
        (Tone::Err, true) => (0xA6_1B26, tint(0xC4_2B36, 0.09)),
        (Tone::Acc, _) => (skin.accent_bright, orbit::alpha(skin.accent_tint)),
        (Tone::Neutral, _) => (skin.text2, rgb(skin.l3).into()),
    };
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(5.0))
        .px(px(8.0))
        .py(px(2.0))
        .rounded_full()
        .bg(bg)
        .child(orbit::text(label, 11.0, 600, color, cx).whitespace_nowrap())
}

/// Botón neutro de 34 px (o 28 px `small`).
pub(super) fn btn(
    id: impl Into<gpui::ElementId>,
    label: &str,
    small: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    let hover = skin.l3;
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .h(px(if small { 28.0 } else { 34.0 }))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .gap(px(8.0))
        .px(px(if small { 10.0 } else { 14.0 }))
        .rounded(px(8.0))
        .border_1()
        .border_color(orbit::alpha(skin.line2))
        .bg(rgb(skin.l2))
        .cursor_pointer()
        .hover(move |s| s.bg(rgb(hover)))
        .focus_visible(|s| s.border_color(orbit::alpha(skin.selection)))
        .when(!label.is_empty(), |b| {
            b.child(
                orbit::text(
                    label.to_owned(),
                    if small { 12.5 } else { 13.0 },
                    500,
                    skin.text1,
                    cx,
                )
                .whitespace_nowrap(),
            )
        })
}

/// Botón principal carmín.
pub(super) fn btn_pri(
    id: impl Into<gpui::ElementId>,
    label: &str,
    large: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    let hover = skin.button_hover;
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .h(px(if large { 40.0 } else { 34.0 }))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .gap(px(8.0))
        .px(px(if large { 18.0 } else { 14.0 }))
        .rounded(px(8.0))
        .bg(gpui::linear_gradient(
            180.0,
            gpui::linear_color_stop(rgb(0xC5_2F3B), 0.0),
            gpui::linear_color_stop(rgb(0xB9_2A35), 1.0),
        ))
        .shadow(vec![orbit::kit_shadow(0xffff_ff30, 1.0, 0.0, 0.0, true)])
        .cursor_pointer()
        .hover(move |s| s.bg(orbit::ramp(hover, 180.0)))
        .focus_visible(|s| s.border_2().border_color(rgb(skin.text1)))
        .child(icon("play", 13.0, 0x00ff_ffff))
        .child(
            orbit::text(
                label.to_owned(),
                if large { 14.0 } else { 13.0 },
                600,
                0x00ff_ffff,
                cx,
            )
            .whitespace_nowrap(),
        )
}

/// Botón principal carmín solo con texto (Guardar, Descargar…).
pub(super) fn btn_text_pri(
    id: impl Into<gpui::ElementId>,
    label: &str,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    let hover = skin.button_hover;
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .h(px(34.0))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .px(px(14.0))
        .rounded(px(8.0))
        .bg(gpui::linear_gradient(
            180.0,
            gpui::linear_color_stop(rgb(0xC5_2F3B), 0.0),
            gpui::linear_color_stop(rgb(0xB9_2A35), 1.0),
        ))
        .shadow(vec![orbit::kit_shadow(0xffff_ff30, 1.0, 0.0, 0.0, true)])
        .cursor_pointer()
        .hover(move |s| s.bg(orbit::ramp(hover, 180.0)))
        .focus_visible(|s| s.border_2().border_color(rgb(skin.text1)))
        .child(orbit::text(label.to_owned(), 13.0, 600, 0x00ff_ffff, cx).whitespace_nowrap())
}

/// Maqueta de la notificación de Windows (`.toast`): así llega el aviso.
pub(super) fn windows_toast(title: &str, body: &str, lead_min: u8, cx: &gpui::App) -> Div {
    let button = |label: &str, primary: bool| {
        div()
            .flex_1()
            .h(px(32.0))
            .flex()
            .items_center()
            .justify_center()
            .rounded(px(4.0))
            .bg(rgb(if primary { 0xC4_2B36 } else { 0x3A_3A3A }))
            .child(orbit::text(label.to_owned(), 12.5, 400, 0x00ff_ffff, cx).whitespace_nowrap())
    };
    div()
        .w_full()
        .max_w(px(364.0))
        .rounded(px(8.0))
        .overflow_hidden()
        .bg(rgb(0x2B_2B2B))
        .border_1()
        .border_color(tint(0x00ff_ffff, 0.08))
        .shadow(vec![orbit::kit_shadow(0x0000_0073, 18.0, 40.0, 0.0, false)])
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .px(px(12.0))
                .pt(px(10.0))
                .child(icon("i-vantare", 14.0, 0xE1_4A54))
                .child(orbit::text(
                    "Vantare · Calendario",
                    12.0,
                    400,
                    0xCF_CFCF,
                    cx,
                ))
                .child(div().flex_1())
                .child(orbit::text("ahora", 12.0, 400, 0xCF_CFCF, cx)),
        )
        .child(
            div()
                .flex()
                .gap(px(12.0))
                .px(px(12.0))
                .pt(px(10.0))
                .pb(px(12.0))
                .child(
                    div()
                        .size(px(44.0))
                        .flex_none()
                        .rounded(px(8.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .bg(rgb(0x3A_1A20))
                        .child(
                            orbit::mono_text(format!("{lead_min}′"), 13.0, 0xFF_8A91, cx)
                                .font_weight(gpui::FontWeight(700.0)),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(
                            orbit::text(title.to_owned(), 14.0, 600, 0x00ff_ffff, cx).mb(px(3.0)),
                        )
                        .child(orbit::text(body.to_owned(), 12.5, 400, 0xD6_D6D6, cx)),
                ),
        )
        .child(
            div()
                .flex()
                .gap(px(6.0))
                .px(px(12.0))
                .pb(px(12.0))
                .child(button("Lanzar perfil", true))
                .child(button("Ver ficha", false))
                .child(button("Posponer 5′", false)),
        )
}

/// Botón de icono de 32 px (28 px `small`).
pub(super) fn ib(
    id: impl Into<gpui::ElementId>,
    name: &'static str,
    tip: &'static str,
    small: bool,
    on: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    let hover = skin.hover;
    let size = if small { 28.0 } else { 32.0 };
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(tip)
        .tab_index(0)
        .size(px(size))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(8.0))
        .cursor_pointer()
        .when(on, |b| b.bg(orbit::alpha(skin.accent_tint)))
        .hover(move |s| s.bg(orbit::alpha(hover)))
        .tooltip(move |_, cx| cx.new(|_| orbit::Tooltip(tip.into())).into())
        .focus_visible(|s| s.border_1().border_color(orbit::alpha(skin.selection)))
        .child(if name == "star" {
            star(on, 16.0, cx)
        } else {
            icon(name, 16.0, if on { skin.accent_bright } else { skin.text3 })
        })
}

/// Control segmentado: `options` son (etiqueta, activo).
pub(super) fn seg(id: &'static str, options: &[(String, bool)], cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(2.0))
        .p(px(3.0))
        .rounded(px(9.0))
        .bg(rgb(skin.l2))
        .border_1()
        .border_color(orbit::alpha(skin.line1))
        .children(
            options
                .iter()
                .enumerate()
                .map(|(i, (label, on))| seg_button((id, i), label, *on, cx)),
        )
}

pub(super) fn seg_button(
    id: impl Into<gpui::ElementId>,
    label: &str,
    on: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    seg_button_with(id, label, on, None, cx)
}

/// Como `seg_button`, con un adorno (punto, estrella) antes del rótulo.
pub(super) fn seg_button_with(
    id: impl Into<gpui::ElementId>,
    label: &str,
    on: bool,
    lead: Option<Div>,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    let bg = if light(cx) { 0x00ff_ffff } else { skin.l1 };
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .aria_selected(on)
        .tab_index(0)
        .h(px(26.0))
        .px(px(11.0))
        .flex()
        .items_center()
        .gap(px(6.0))
        .rounded(px(7.0))
        .cursor_pointer()
        .when(on, |b| {
            b.bg(rgb(bg))
                .border_1()
                .border_color(orbit::alpha(skin.line2))
        })
        .children(lead)
        .child(
            t(
                label.to_owned(),
                12.5,
                500,
                if on { skin.text1 } else { skin.text3 },
                cx,
            )
            .whitespace_nowrap(),
        )
}

/// Texto verde de «bien» sobre su fondo tintado.
pub(super) fn ok_text(cx: &gpui::App) -> u32 {
    if light(cx) { 0x16_6534 } else { 0x7F_E0A3 }
}

/// Rayado tenue de lo que no existe o ya pasó (`--stripe` del contrato).
pub(super) fn stripe(cx: &gpui::App) -> gpui::Background {
    gpui::pattern_slash(
        if light(cx) {
            tint(0x003C_1920, 0.045)
        } else {
            tint(0x00ff_ffff, 0.035)
        },
        6.0,
        12.0,
    )
}

/// Hora elegible (`.pk`): anillo blanco si es la elegida, carmín si tiene aviso.
pub(super) fn pick_chip(
    id: impl Into<gpui::ElementId>,
    label: String,
    on: bool,
    alerted: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    div()
        .id(id)
        .h(px(30.0))
        .min_w(px(58.0))
        .px(px(8.0))
        .flex()
        .items_center()
        .justify_center()
        .gap(px(4.0))
        .rounded(px(7.0))
        .cursor_pointer()
        .bg(if on {
            rgb(skin.l3).into()
        } else if alerted {
            acc_bg(cx)
        } else {
            rgb(skin.l2).into()
        })
        .when(on, |chip| chip.border_2().border_color(rgb(skin.text1)))
        .when(!on, |chip| {
            chip.border_1().border_color(if alerted {
                acc_line(cx)
            } else {
                orbit::alpha(skin.line2)
            })
        })
        .when(alerted, |chip| {
            chip.child(icon("bell-fill", 10.0, acct(cx)))
        })
        .child(if on {
            bold_mono(label, 12.0, skin.text1, cx)
        } else {
            mono(label, 12.0, skin.text2, cx)
        })
}

/// Tanda de un evento (`.slot`): hora en mono; con aviso va en carmín, la siguiente con anillo.
pub(super) fn slot_chip(
    id: impl Into<gpui::ElementId>,
    label: &str,
    state: (bool, bool, bool),
    suffix: Option<&str>,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    let (past, next, alerted) = state;
    div()
        .id(id)
        .h(px(28.0))
        .px(px(8.0))
        .flex()
        .flex_none()
        .items_center()
        .gap(px(5.0))
        .rounded(px(7.0))
        .cursor_pointer()
        .when(past, |d| d.opacity(0.45))
        .when(alerted, |d| d.bg(orbit::ramp(skin.button, 180.0)))
        .when(!alerted, |d| {
            d.bg(if next { rgb(skin.l1) } else { rgb(skin.l2) })
                .border_1()
                .border_color(if next {
                    rgb(skin.text2).into()
                } else {
                    orbit::alpha(skin.line1)
                })
        })
        .when(alerted, |d| d.child(icon("bell-fill", 11.0, 0x00ff_ffff)))
        .child(bold_mono(
            label.to_owned(),
            12.0,
            if alerted { 0x00ff_ffff } else { skin.text1 },
            cx,
        ))
        .when_some(suffix, |d, text| {
            d.child(t(
                text.to_owned(),
                11.0,
                600,
                if alerted { 0x00ff_ffff } else { skin.text2 },
                cx,
            ))
        })
}

/// Héroe de Próximas (`.hero`): degradado a 110° con un lavado carmín arriba a la
/// izquierda y anillo interior; sin la trama diagonal del héroe de Inicio.
pub(super) fn hero_plain(cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .relative()
        .overflow_hidden()
        .rounded(px(12.0))
        .border_1()
        .border_color(orbit::alpha(skin.hero_ring))
        .bg(orbit::ramp(skin.hero, 110.0))
        .shadow(vec![orbit::kit_shadow(0x0000_0047, 14.0, 34.0, 0.0, false)])
        .child(
            div()
                .absolute()
                .inset_0()
                .bg(orbit::ramp_alpha(skin.hero_wash, 160.0)),
        )
}

/// Interruptor de 34×20 del contrato (`.sw`); solo pinta, el clic lo recoge el padre.
pub(super) fn switch(on: bool, cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .w(px(34.0))
        .h(px(20.0))
        .flex_none()
        .rounded_full()
        .p(px(2.0))
        .flex()
        .when(on, gpui::Styled::justify_end)
        .bg(if on {
            orbit::ramp(skin.button, 180.0)
        } else {
            rgb(skin.el).into()
        })
        .child(
            div()
                .size(px(16.0))
                .rounded_full()
                .bg(rgb(0x00ff_ffff))
                .shadow(vec![orbit::kit_shadow(0x0000_004d, 0.0, 1.0, 3.0, false)]),
        )
}

/// Contenedor del segmentado compacto de 22 px (`.bandbox .seg`).
pub(super) fn seg_mini_group(cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(2.0))
        .p(px(3.0))
        .rounded(px(9.0))
        .bg(rgb(skin.l2))
        .border_1()
        .border_color(orbit::alpha(skin.line1))
}

pub(super) fn seg_mini(
    id: impl Into<gpui::ElementId>,
    label: &str,
    on: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = orbit::skin(cx);
    let bg = if light(cx) { 0x00ff_ffff } else { skin.l1 };
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .aria_selected(on)
        .tab_index(0)
        .h(px(22.0))
        .px(px(9.0))
        .flex()
        .items_center()
        .rounded(px(7.0))
        .cursor_pointer()
        .when(on, |b| {
            b.bg(rgb(bg))
                .border_1()
                .border_color(orbit::alpha(skin.line2))
        })
        .child(
            t(
                label.to_owned(),
                12.0,
                500,
                if on { skin.text1 } else { skin.text3 },
                cx,
            )
            .whitespace_nowrap(),
        )
}

/// Cabecera de grupo con su rótulo secundario.
pub(super) fn group_row(label: &str, extra: &str, cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .h(px(26.0))
        .flex_none()
        .flex()
        .items_center()
        .gap(px(8.0))
        .px(px(16.0))
        .bg(rgb(skin.l2))
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(cap(label, skin.cap, cx))
        .when(!extra.is_empty(), |row| {
            row.child(t(extra.to_owned(), 11.5, 500, skin.cap, cx))
        })
}

/// Título de sección Rajdhani en mayúsculas, con dato a la derecha.
pub(super) fn section_title(label: &str, right: Option<String>, cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(8.0))
        .mb(px(8.0))
        .child(orbit::caps(label, 10.5, skin.text2, cx))
        .when_some(right, |row, right| {
            row.child(div().flex_1())
                .child(t(right, 12.0, 500, skin.text3, cx))
        })
}

/// Fila «etiqueta ........ valor» del carril y las fichas.
pub(super) fn kv(label: &str, value: impl Into<SharedString>, cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .flex()
        .justify_between()
        .gap(px(10.0))
        .py(px(4.0))
        .child(t(label.to_owned(), 12.5, 400, skin.text3, cx))
        .child(t(value, 12.5, 400, skin.text1, cx).text_right())
}

/// Aviso a ancho completo (sin conexión, respaldo).
pub(super) fn banner(
    tone: Tone,
    icon_name: &'static str,
    message: Div,
    action: Option<Stateful<Div>>,
    cx: &gpui::App,
) -> Div {
    let skin = orbit::skin(cx);
    let (fill, ring, glyph): (Hsla, Hsla, u32) = match tone {
        Tone::Err => (tint(skin.err, 0.12), orbit::alpha(skin.hero_ring), skin.err),
        _ => (tint(skin.warn, 0.12), tint(skin.warn, 0.25), skin.warn),
    };
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(12.0))
        .px(px(14.0))
        .py(px(10.0))
        .rounded(px(10.0))
        .bg(fill)
        .border_1()
        .border_color(ring)
        .child(icon(icon_name, 16.0, glyph))
        .child(div().flex_1().min_w_0().child(message))
        .when_some(action, gpui::ParentElement::child)
}

/// Tarjeta del contrato (`.card`): degradado neo, 10 px.
pub(super) fn card(cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .overflow_hidden()
        .rounded(px(skin.radius.lg))
        .border_1()
        .border_color(orbit::alpha(skin.line1))
        .bg(orbit::ramp(skin.neo, 180.0))
        .shadow(vec![orbit::kit_shadow(skin.neo_light, 1.0, 0.0, 0.0, true)])
}

/// Línea fina horizontal de separación.
pub(super) fn rule(cx: &gpui::App) -> Div {
    div()
        .w_full()
        .h(px(1.0))
        .flex_none()
        .bg(orbit::alpha(orbit::skin(cx).line1))
}

/// Mensaje centrado de estado de página completa.
pub(super) fn center_message(
    icon_name: &'static str,
    icon_color: u32,
    title: &str,
    body: &str,
    actions: Vec<Stateful<Div>>,
    cx: &gpui::App,
) -> Div {
    let skin = orbit::skin(cx);
    div()
        .flex_1()
        .min_h_0()
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .gap(px(12.0))
        .p(px(24.0))
        .child(
            div()
                .size(px(56.0))
                .rounded(px(16.0))
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(skin.l2))
                .border_1()
                .border_color(orbit::alpha(skin.line2))
                .child(icon(icon_name, 26.0, icon_color)),
        )
        .child(disp(title.to_owned(), 24.0, skin.text1, cx).text_center())
        .child(
            t(body.to_owned(), 13.0, 400, skin.text3, cx)
                .max_w(px(520.0))
                .text_center(),
        )
        .child(div().flex().gap(px(8.0)).children(actions))
}

/// Etiqueta «RC»: la serie viene del respaldo de `RaceControl`, no de LMU.
pub(super) fn rc_tag(cx: &gpui::App) -> Div {
    let skin = orbit::skin(cx);
    div()
        .flex_none()
        .ml(px(6.0))
        .px(px(5.0))
        .rounded(px(4.0))
        .border_1()
        .border_color(tint(skin.warn, 0.45))
        .bg(tint(skin.warn, 0.14))
        .child(orbit::caps("RC", 9.5, skin.warn, cx))
}

/// Atajo de teclado como tecla pequeña dentro de un botón.
pub(super) fn keycap(label: &str, cx: &gpui::App) -> Div {
    div()
        .flex_none()
        .px(px(5.0))
        .rounded(px(4.0))
        .bg(tint(0x00ff_ffff, 0.18))
        .child(orbit::mono_text(label.to_owned(), 10.0, 0x00ff_ffff, cx))
}

/// Dato del contrato (`.fact`): rótulo en mayúsculas y valor en una línea.
pub(super) fn fact(label: &str, value: impl Into<SharedString>, cx: &gpui::App) -> Div {
    let skin = skin(cx);
    div()
        .flex_1()
        .min_w_0()
        .px(px(10.0))
        .py(px(8.0))
        .rounded(px(8.0))
        .bg(rgb(skin.l2))
        .border_1()
        .border_color(orbit::alpha(skin.line1))
        .child(orbit::caps(label, 10.5, skin.cap, cx))
        .child(t(value, 13.0, 600, skin.text1, cx).mt(px(2.0)).truncate())
}

/// Capa que cubre toda la ventana (no solo el área del calendario), por encima de la shell.
pub fn window_layer(
    viewport: gpui::Size<gpui::Pixels>,
    layer: gpui::Stateful<Div>,
) -> impl IntoElement {
    gpui::deferred(
        gpui::anchored()
            .position(gpui::point(px(0.0), px(0.0)))
            .child(layer.w(viewport.width).h(viewport.height)),
    )
    .with_priority(orbit::MODAL_Z)
}
