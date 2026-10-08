//! Primitivas de los cimientos; sin estado de negocio ni persistencia.
use super::{button, controls, design, icon, ink_3, line, surface_2, surface_3, tint};
use gpui::{
    Div, SharedString, Stateful, div, linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba,
};
pub fn gradient(colors: [u32; 2], angle: f32) -> gpui::Background {
    linear_gradient(
        angle,
        linear_color_stop(rgb(colors[0]), 0.0),
        linear_color_stop(rgb(colors[1]), 1.0),
    )
}
pub fn neo_card(cx: &gpui::App) -> Div {
    let tokens = cx.global::<design::Tokens>();
    div()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(tokens.geometry.gap))
        .p(px(20.0))
        .rounded(px(tokens.geometry.radius))
        .border_1()
        .border_color(rgba(tokens.colors.line))
        .bg(gradient(
            [tokens.colors.neo_top, tokens.colors.neo_bottom],
            180.0,
        ))
        .shadow(vec![
            gpui::BoxShadow {
                color: tint(tokens.colors.text, tokens.shadow.light_alpha),
                offset: gpui::point(px(0.0), px(1.0)),
                blur_radius: px(0.0),
                spread_radius: px(0.0),
                inset: true,
            },
            gpui::BoxShadow {
                color: tint(0, tokens.shadow.alpha),
                offset: gpui::point(px(0.0), px(tokens.shadow.y)),
                blur_radius: px(tokens.shadow.blur),
                spread_radius: px(0.0),
                inset: false,
            },
        ])
}
/// Tarjeta neo con acento suave, sin convertir el fondo en una acción primaria.
pub fn neo_accent_card(cx: &gpui::App) -> Div {
    let colors = &cx.global::<design::Tokens>().colors;
    neo_card(cx).bg(linear_gradient(
        120.0,
        linear_color_stop(tint(colors.wine, 0.28), 0.0),
        linear_color_stop(rgb(colors.neo_bottom), 1.0),
    ))
}
/// Cabecera de página R10.5: título Rajdhani en una línea que ocupa el espacio libre y
/// descripción en una línea recortada con «…». Las acciones se añaden con `.child`.
pub fn neo_page_header(title: &str, description: &str, cx: &gpui::App) -> Div {
    let adapt = *cx.global::<super::Adapt>();
    let skin = super::skin(cx);
    let (size, line) = match adapt.density {
        super::adapt::Density::A => (32.0, 36.0),
        super::adapt::Density::M => (28.0, 32.0),
        super::adapt::Density::B | super::adapt::Density::Xs => (24.0, 28.0),
    };
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(12.0))
        .min_w_0()
        .child(
            div()
                .flex_1()
                .min_w(px(200.0))
                .flex()
                .flex_col()
                .gap(px(2.0))
                .child(
                    div()
                        .text_size(px(size))
                        .line_height(px(line))
                        .font_family(cx.global::<design::Tokens>().fonts.display.clone())
                        .font_weight(gpui::FontWeight(600.0))
                        .text_color(rgb(skin.text1))
                        .whitespace_nowrap()
                        .overflow_hidden()
                        .text_ellipsis()
                        .child(title.to_owned()),
                )
                .when(adapt.show_optional() && !description.is_empty(), |block| {
                    block.child(
                        div()
                            .text_size(px(14.0))
                            .line_height(px(20.0))
                            .text_color(rgb(skin.text3))
                            .whitespace_nowrap()
                            .overflow_hidden()
                            .text_ellipsis()
                            .child(description.to_owned()),
                    )
                }),
        )
}
/// Carril de layout C alineado con la primera tarjeta bajo la cabecera beta.
pub fn neo_context_column(id: &'static str, cx: &gpui::App) -> Stateful<Div> {
    let tokens = cx.global::<design::Tokens>();
    div()
        .id(id)
        .h_full()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(tokens.geometry.gap))
        .p(px(16.0))
        .overflow_y_scroll()
}
/// Variante compacta de la cabecera compartida de Orbit.
pub fn neo_header(title: impl Into<SharedString>, icon_name: &'static str, cx: &gpui::App) -> Div {
    super::card_header(title, cx)
        .min_h(px(24.0))
        .p(px(0.0))
        .border_b_0()
        .min_w_0()
        .relative()
        .pl(px(28.0))
        .justify_start()
        .child(
            icon(icon_name, 16.0, ink_3(cx))
                .absolute()
                .left_0()
                .top(px(3.0)),
        )
}
pub fn keycap(label: impl Into<SharedString>, cx: &gpui::App) -> Div {
    super::keycaps([label], cx)
}
pub fn progress(fraction: f32, cx: &gpui::App) -> Div {
    let fraction = if fraction.is_finite() {
        fraction.clamp(0.0, 1.0)
    } else {
        0.0
    };
    div()
        .w_full()
        .h(px(6.0))
        .flex_none()
        .rounded_full()
        .bg(rgb(surface_3(cx)))
        .overflow_hidden()
        .child(
            div()
                .w(gpui::relative(fraction))
                .h_full()
                .rounded_full()
                .bg(gradient(
                    cx.global::<design::Tokens>().gradients.progress,
                    90.0,
                )),
        )
}
/// Resumen estático sobre la misma fila del kit; no crea otra autoridad visual.
pub fn summary_row(
    title: impl Into<SharedString>,
    subtitle: impl Into<SharedString>,
    icon_name: &'static str,
    cx: &gpui::App,
) -> Stateful<Div> {
    let title = title.into();
    let subtitle = subtitle.into();
    controls::list_row(title.clone(), &title, &subtitle, false, true, cx)
        .role(gpui::Role::GenericContainer)
        .tab_stop(false)
        .cursor_default()
        .hover(|style| style.bg(gpui::transparent_black()))
        .relative()
        .pl(px(42.0))
        .min_h(px(54.0))
        .flex_none()
        .border_b_1()
        .border_color(rgba(line(cx)))
        .child(
            icon(icon_name, 18.0, ink_3(cx))
                .absolute()
                .left(px(12.0))
                .top(px(18.0)),
        )
}
/// Fila de acción sobre el mismo botón base, sin caja en reposo.
pub fn action_row(id: impl Into<gpui::ElementId>, label: &str, cx: &gpui::App) -> Stateful<Div> {
    super::button_base(id, label, cx)
        .bg(gpui::transparent_black())
        .border_0()
        .justify_start()
        .gap(px(12.0))
        .px(px(12.0))
        .hover(|style| style.bg(rgb(surface_2(cx))))
        .focus_visible(|style| style.border_1().border_color(rgb(super::carmine(cx))))
}
/// Marca de reproducción compartida por barra, hero y buscador.
pub fn play_circle(size: f32, cx: &gpui::App) -> Div {
    div()
        .size(px(size))
        .flex_none()
        .rounded_full()
        .border_1()
        .border_color(tint(super::ink(cx), 0.22))
        .bg(gradient(
            cx.global::<design::Tokens>().gradients.button,
            180.0,
        ))
        .flex()
        .items_center()
        .justify_center()
        .child(icon("play", size * 0.4, super::ink(cx)))
}
pub fn play_button(
    id: &'static str,
    label: &str,
    height: f32,
    key: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let circle = if height >= 52.0 { 32.0 } else { 26.0 };
    super::carmine_button(id, label, cx)
        .relative()
        .h(px(height))
        .rounded_full()
        .pl(px(circle + 24.0))
        .gap(px(8.0))
        .child(
            play_circle(circle, cx)
                .absolute()
                .left(px(12.0))
                .top(px((height - circle) / 2.0)),
        )
        .when(key, |button| button.child(keycap("Ctrl L", cx)))
}
/// Acción fantasma sobre el mismo botón y sus estados de foco/hover.
pub fn ghost_button(id: impl Into<gpui::ElementId>, label: &str, cx: &gpui::App) -> Stateful<Div> {
    button(id, label, cx)
        .bg(gpui::transparent_black())
        .border_0()
        .hover(|style| style.bg(rgb(surface_2(cx))))
}

/// Borde de scroll común. El padding permite leer completa la última fila al llegar abajo.
pub fn scroll_fade(content: Stateful<Div>, background: u32) -> Div {
    div()
        .relative()
        .flex_1()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(content.flex_1().min_h_0().pb(px(24.0)))
        .child(
            div()
                .absolute()
                .bottom_0()
                .left_0()
                .right_0()
                .h(px(24.0))
                .bg(linear_gradient(
                    180.0,
                    linear_color_stop(tint(background, 0.0), 0.0),
                    linear_color_stop(rgb(background), 1.0),
                )),
        )
}

/// Texto con familia propia y tracking por carácter (GPUI no expone `letter-spacing`).
fn tracked_family(
    content: &str,
    family: SharedString,
    size: f32,
    weight: f32,
    color: u32,
    tracking: f32,
) -> Div {
    div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(tracking))
        .text_size(px(size))
        .line_height(px(size.ceil()))
        .font_family(family)
        .font_weight(gpui::FontWeight(weight))
        .text_color(rgb(color))
        .children(
            content
                .chars()
                .map(|c| div().flex_none().child(c.to_string())),
        )
}
/// Rótulo R9.2: cabeceras de tarjeta, secciones de barra y grupos. Rajdhani 600 MAYÚSCULAS.
pub fn caps(content: &str, size: f32, color: u32, cx: &gpui::App) -> Div {
    tracked_family(
        &content.to_uppercase(),
        cx.global::<design::Tokens>().fonts.display.clone().into(),
        size,
        600.0,
        color,
        if size >= 15.0 { 1.6 } else { 1.8 },
    )
}
/// Eyebrow y metadato R9.2: Space Mono MAYÚSCULAS (respeta la monoespaciada elegida).
pub fn meta(content: &str, size: f32, color: u32, cx: &gpui::App) -> Div {
    tracked_family(
        &content.to_uppercase(),
        super::mono_family(cx).to_owned().into(),
        size,
        400.0,
        color,
        0.4,
    )
}
/// Display R9.2 sin mayúsculas (saludo, nombres de perfil, cifras).
pub fn display(content: impl Into<SharedString>, size: f32, color: u32, cx: &gpui::App) -> Div {
    div()
        .text_size(px(size))
        .line_height(px((size * 1.1).ceil()))
        .font_family(cx.global::<design::Tokens>().fonts.display.clone())
        .font_weight(gpui::FontWeight(600.0))
        .text_color(rgb(color))
        .child(content.into())
}
/// Cifras tabulares (`tnum`) para todo el Hub.
pub fn tabular_numbers() -> gpui::FontFeatures {
    gpui::FontFeatures(std::sync::Arc::new(vec![("tnum".into(), 1)]))
}
