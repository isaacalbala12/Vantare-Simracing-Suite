//! Primitivas de los cimientos; sin estado de negocio ni persistencia.
use super::{button, controls, design, icon, ink_3, line, surface_2, tint};
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
    let skin = super::skin(cx);
    div()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(tokens.geometry.gap))
        .p(px(20.0))
        .rounded(px(skin.radius.lg))
        .border_1()
        .border_color(super::alpha(skin.line1))
        .bg(super::ramp(skin.neo, 180.0))
        .shadow(vec![
            super::kit_shadow(skin.neo_light, 1.0, 0.0, 0.0, true),
            gpui::BoxShadow {
                color: tint(0, skin.neo_shadow.0),
                offset: gpui::point(px(0.0), px(skin.neo_shadow.2)),
                blur_radius: px(skin.neo_shadow.1),
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
pub fn neo_page_header(title: &str, description: &str, adapt: super::Adapt, cx: &gpui::App) -> Div {
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
/// Cabecera compacta de tarjeta neo: icono + rótulo R9.2.
pub fn neo_header(title: impl Into<SharedString>, icon_name: &'static str, cx: &gpui::App) -> Div {
    let title: SharedString = title.into();
    super::section_header(&title, icon_name, None, cx)
}
pub fn keycap(label: impl Into<SharedString>, cx: &gpui::App) -> Div {
    super::keycaps([label], cx)
}
/// Barra de progreso §4: pista l3 de 6 px y relleno con brillo.
pub fn progress(fraction: f32, cx: &gpui::App) -> Div {
    let fraction = if fraction.is_finite() {
        fraction.clamp(0.0, 1.0)
    } else {
        0.0
    };
    let skin = super::skin(cx);
    div()
        .w_full()
        .h(px(6.0))
        .flex_none()
        .rounded(px(3.0))
        .bg(rgb(skin.l3))
        .child(
            div()
                .w(gpui::relative(fraction))
                .h_full()
                .rounded(px(3.0))
                .bg(super::ramp(skin.progress, 90.0))
                .shadow(vec![super::kit_shadow(
                    skin.progress_glow,
                    0.0,
                    8.0,
                    0.0,
                    false,
                )]),
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
    // Es contenido, no un botón desactivado: sin foco ni acciones heredadas.
    controls::list_row_content(&title, &subtitle, cx)
        .id(title.clone())
        .role(gpui::Role::Group)
        .aria_label(title)
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
/// Marca de reproducción compartida por hero y buscador.
pub fn play_circle(size: f32, cx: &gpui::App) -> Div {
    div()
        .size(px(size))
        .flex_none()
        .rounded(px(super::skin(cx).radius.md))
        .bg(super::ramp(super::skin(cx).button, 180.0))
        .flex()
        .items_center()
        .justify_center()
        .child(icon("play", size * 0.4, 0x00ff_ffff))
}
/// Botón principal R10.8 de 36/44/52: ▶ suelto, texto Inter y atajo tras una línea de 1 px.
pub fn play_button(
    id: &'static str,
    label: &str,
    height: f32,
    key: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    play_content(super::carmine_button(id, "", cx), label, height, key, cx)
}

/// Cara de reproducción pendiente, sobre el mismo contenido del botón activo.
pub fn pending_play_button(
    id: &'static str,
    label: &str,
    height: f32,
    reason: &str,
    cx: &gpui::App,
) -> Stateful<Div> {
    super::pending_face(
        play_content(super::carmine_face(id, "", cx), label, height, false, cx),
        reason,
    )
}

fn play_content(
    face: Stateful<Div>,
    label: &str,
    height: f32,
    key: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let (size, glyph, pad) = if height >= 50.0 {
        (16.0, 14.0, 20.0)
    } else if height >= 40.0 {
        (15.0, 12.0, 16.0)
    } else {
        (14.0, 12.0, 12.0)
    };
    face.h(px(height))
        .min_w_0()
        .flex_shrink(1.0)
        .px(px(pad))
        .gap(px(if height >= 50.0 { 12.0 } else { 10.0 }))
        .aria_label(label.to_owned())
        .child(icon("play", glyph, 0x00ff_ffff).flex_none())
        .child(
            super::text(label.to_owned(), size, 600, 0x00ff_ffff, cx)
                .min_w_0()
                .whitespace_nowrap()
                .text_ellipsis()
                .overflow_hidden(),
        )
        .when(key, |button| {
            button.child(
                div()
                    .flex_none()
                    .ml(px(4.0))
                    .pl(px(12.0))
                    .h(px(20.0))
                    .flex()
                    .items_center()
                    .border_l_1()
                    .border_color(super::tint(0x00ff_ffff, 0.28))
                    .child(super::mono_text("Ctrl L", 12.0, 0x00c8_c8c8, cx)),
            )
        })
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

/// Título de grupo R9.2: número Space Mono del acento + rótulo + línea que se desvanece.
pub fn group_title(number: usize, title: &str, cx: &gpui::App) -> Div {
    let skin = super::skin(cx);
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(10.0))
        .child(super::mono_text(
            format!("{number:02}"),
            11.0,
            skin.accent_bright,
            cx,
        ))
        .child(caps(title, 13.0, skin.text2, cx))
        .child(div().flex_1().h(px(1.0)).bg(linear_gradient(
            90.0,
            linear_color_stop(super::alpha(skin.line2), 0.0),
            linear_color_stop(super::alpha(skin.line2 & 0xffff_ff00), 1.0),
        )))
}
/// Fila de lista (`srow`): icono en caja l3→l2, título, subtítulo y valor a la derecha.
pub fn list_item(
    icon_name: &'static str,
    title: impl Into<SharedString>,
    subtitle: impl Into<SharedString>,
    adapt: super::Adapt,
    cx: &gpui::App,
) -> Div {
    let skin = super::skin(cx);
    let height = adapt.row_height();
    div()
        .h(px(height))
        .flex_none()
        .flex()
        .items_center()
        .gap(px(12.0))
        .min_w_0()
        .child(
            div()
                .size(px(32.0))
                .flex_none()
                .rounded(px(skin.radius.sm))
                .bg(super::ramp(
                    super::skin::Ramp {
                        from: skin.l3,
                        to: skin.l2,
                        end: 1.0,
                    },
                    180.0,
                ))
                .shadow(vec![super::kit_shadow(skin.neo_light, 1.0, 0.0, 0.0, true)])
                .flex()
                .items_center()
                .justify_center()
                .child(icon(icon_name, 18.0, skin.accent_bright)),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .child(
                    div()
                        .text_size(px(14.0))
                        .line_height(px(18.0))
                        .font_weight(gpui::FontWeight(500.0))
                        .text_color(rgb(skin.text1))
                        .whitespace_nowrap()
                        .overflow_hidden()
                        .text_ellipsis()
                        .child(title.into()),
                )
                .child(
                    div()
                        .text_size(px(12.0))
                        .text_color(rgb(skin.text3))
                        .whitespace_nowrap()
                        .overflow_hidden()
                        .text_ellipsis()
                        .child(subtitle.into()),
                ),
        )
}
