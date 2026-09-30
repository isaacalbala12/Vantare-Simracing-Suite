//! Kit visual del Hub: tokens y piezas de Command Orbit v0.3
//! (`frontend/src/styles/orbit.tokens.css`, densidad equilibrada).
//! Solo presentación: cada sección compone estas piezas con su propio estado.

use gpui::{
    Div, FontWeight, Hsla, IntoElement, ParentElement, SharedString, Stateful, Styled, div,
    linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba,
};

pub const CANVAS: u32 = 0x0008_090b;
pub const SURFACE_1: u32 = 0x0012_1316;
pub const SURFACE_2: u32 = 0x0018_191e;
pub const SURFACE_3: u32 = 0x0020_2127;
pub const COLUMN_BG: u32 = 0x000f_1013;
pub const INK: u32 = 0x00f5_f3f2;
pub const INK_2: u32 = 0x00b7_b2b2;
pub const INK_3: u32 = 0x008a_858b;
pub const INK_MUTED: u32 = 0x0057_545a;
pub const CARMINE: u32 = 0x00d5_2f49;
pub const GREEN: u32 = 0x0078_d68b;
/// `rgba(255,255,255,.075)` y `.13`, como `0xRRGGBBAA`.
pub const LINE: u32 = 0xffff_ff13;
pub const LINE_STRONG: u32 = 0xffff_ff21;
pub const LINE_ROW: u32 = 0xffff_ff0b;

pub const COLUMN_W: f32 = 296.0;
pub const TOPBAR_H: f32 = 70.0;
pub const GUTTER: f32 = 32.0;
pub const RADIUS: f32 = 18.0;
pub const RADIUS_CONTROL: f32 = 12.0;
pub const CONTROL_H: f32 = 39.0;

fn weight(w: u16) -> SharedString {
    format!("Inter W{w}").into()
}

fn tint(color: u32, alpha: f32) -> Hsla {
    let mut c: Hsla = rgb(color).into();
    c.a = alpha;
    c
}

/// Texto con tamaño, peso y color de la escala Orbit.
pub fn text(content: impl Into<SharedString>, size: f32, w: u16, color: u32) -> Div {
    div()
        .text_size(px(size))
        .font_family(weight(w))
        .font_weight(FontWeight(f32::from(w)))
        .text_color(rgb(color))
        .child(content.into())
}

/// Rótulo en mayúsculas espaciadas (`--orbit-fs-eyebrow`).
pub fn eyebrow(content: impl Into<SharedString>) -> Div {
    let upper: SharedString = content.into().to_uppercase().into();
    text(upper, 11.0, 700, INK_3)
}

/// Columna de contexto: título con versión y lista de secciones.
pub fn column(title: &str, version: &str) -> Div {
    div()
        .w(px(COLUMN_W))
        .h_full()
        .flex_none()
        .flex()
        .flex_col()
        .bg(rgb(COLUMN_BG))
        .border_r_1()
        .border_color(rgba(LINE))
        .child(
            div()
                .h(px(TOPBAR_H))
                .px(px(24.0))
                .flex()
                .items_center()
                .justify_between()
                .border_b_1()
                .border_color(rgba(LINE))
                .child(text(title.to_owned(), 15.0, 700, INK))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.0))
                        .child(div().size(px(6.0)).rounded_full().bg(rgb(GREEN)))
                        .child(text(version.to_owned(), 11.0, 500, INK_3)),
                ),
        )
}

/// Entrada de navegación con subtítulo; la activa lleva la selección carmín.
pub fn nav_item(id: &'static str, label: &str, subtitle: &str, active: bool) -> Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .mx(px(12.0))
        .px(px(12.0))
        .py(px(8.0))
        .rounded(px(RADIUS_CONTROL))
        .cursor_pointer()
        .when(active, |item| {
            item.bg(linear_gradient(
                90.0,
                linear_color_stop(tint(CARMINE, 0.11), 0.0),
                linear_color_stop(tint(CARMINE, 0.02), 1.0),
            ))
        })
        .when(!active, |item| item.hover(|s| s.bg(rgba(0xffff_ff08))))
        .focus_visible(|s| s.border_1().border_color(rgba(LINE_STRONG)))
        .child(text(
            label.to_owned(),
            13.5,
            600,
            if active { INK } else { INK_2 },
        ))
        .when(!subtitle.is_empty(), |item| {
            item.child(text(subtitle.to_owned(), 11.5, 400, INK_3))
        })
}

/// Barra superior: ruta `EYEBROW / Título` a la izquierda y acción a la derecha.
pub fn topbar(trail: &str, title: &str, action: impl IntoElement) -> Div {
    div()
        .h(px(TOPBAR_H))
        .flex_none()
        .px(px(GUTTER))
        .flex()
        .items_center()
        .justify_between()
        .border_b_1()
        .border_color(rgba(LINE))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(10.0))
                .child(eyebrow(trail.to_owned()))
                .child(text("/", 12.0, 400, INK_MUTED))
                .child(text(title.to_owned(), 16.0, 700, INK)),
        )
        .child(action)
}

/// Cabecera de página: rótulo, título grande y descripción.
pub fn page_header(kicker: &str, title: &str, description: &str) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(8.0))
        .child(eyebrow(kicker.to_owned()))
        .child(text(title.to_owned(), 34.0, 800, INK))
        .when(!description.is_empty(), |header| {
            header.child(text(description.to_owned(), 13.5, 400, INK_2))
        })
}

/// Tarjeta con título y cuerpo.
pub fn card(title: &str) -> Div {
    div()
        .flex()
        .flex_col()
        .bg(rgb(SURFACE_1))
        .border_1()
        .border_color(rgba(LINE))
        .rounded(px(RADIUS))
        .when(!title.is_empty(), |card| {
            card.child(
                div()
                    .px(px(20.0))
                    .py(px(18.0))
                    .border_b_1()
                    .border_color(rgba(LINE))
                    .child(text(title.to_owned(), 15.0, 700, INK)),
            )
        })
}

/// Cuerpo con relleno para colocar filas dentro de una [`card`].
pub fn card_body() -> Div {
    div().flex().flex_col().px(px(20.0)).py(px(12.0))
}

/// Fila de ajuste: etiqueta y ayuda a la izquierda, control a la derecha.
pub fn setting_row(label: &str, help: &str, control: impl IntoElement) -> Div {
    div()
        .min_h(px(49.0))
        .py(px(8.0))
        .flex()
        .items_center()
        .justify_between()
        .gap(px(16.0))
        .border_b_1()
        .border_color(rgba(LINE_ROW))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.0))
                .child(text(label.to_owned(), 13.5, 700, INK))
                .when(!help.is_empty(), |c| {
                    c.child(text(help.to_owned(), 12.0, 400, INK_3))
                }),
        )
        .child(control)
}

/// Interruptor Orbit (38 × 22) en carmín cuando está activo.
pub fn toggle(id: &'static str, label: &str, on: bool, enabled: bool) -> Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Switch)
        .aria_label(label.to_owned())
        .tab_index(0)
        .w(px(44.0))
        .h(px(24.0))
        .flex_none()
        .rounded_full()
        .p(px(3.0))
        .flex()
        .when(on, |t| t.justify_end().bg(rgb(CARMINE)))
        .when(!on, |t| t.bg(rgb(SURFACE_3)))
        .when(enabled, Styled::cursor_pointer)
        .when(!enabled, |t| t.opacity(0.4))
        .focus_visible(|s| s.border_1().border_color(rgba(LINE_STRONG)))
        .child(
            div()
                .size(px(18.0))
                .rounded_full()
                .bg(rgb(if on { INK } else { INK_MUTED })),
        )
}

/// Botón secundario (borde fino, fondo de superficie).
pub fn button(id: &'static str, label: &str) -> Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .h(px(CONTROL_H))
        .px(px(16.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(RADIUS_CONTROL))
        .bg(rgb(SURFACE_2))
        .border_1()
        .border_color(rgba(LINE_STRONG))
        .cursor_pointer()
        .hover(|s| s.bg(rgb(SURFACE_3)))
        .focus_visible(|s| s.border_color(rgb(CARMINE)))
        .child(text(label.to_owned(), 13.0, 600, INK))
}

/// Botón principal (claro sobre oscuro, `--orbit-primary-*`).
pub fn primary_button(id: &'static str, label: &str) -> Stateful<Div> {
    button(id, label)
        .bg(rgb(0x00f3_eeee))
        .border_color(rgb(0x00f3_eeee))
        .hover(|s| s.bg(rgb(INK)))
        .text_color(rgb(0x001c_1719))
}

/// Valor seleccionable con el aspecto de un `select` Orbit.
pub fn select(id: &'static str, value: &str) -> Stateful<Div> {
    button(id, value).min_w(px(168.0)).justify_between()
}

/// Nota contextual (fondo vino tenue).
pub fn callout(content: impl Into<SharedString>) -> Div {
    div()
        .px(px(18.0))
        .py(px(14.0))
        .rounded(px(RADIUS_CONTROL))
        .bg(tint(CARMINE, 0.06))
        .border_1()
        .border_color(tint(CARMINE, 0.18))
        .child(text(content, 12.5, 400, INK_2))
}
