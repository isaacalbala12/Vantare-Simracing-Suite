//! Kit R9/R10 de la shell y de las páginas: barra, pestañas, secciones, botones,
//! pills, toggles y estados. Solo presentación; sin barras verticales de acento.
use super::{caps, icon, meta, skin, skin::Ramp};
use gpui::{
    Div, IntoElement, ParentElement, SharedString, Stateful, Styled, div, linear_color_stop,
    linear_gradient, prelude::*, px, rgb,
};

pub fn kit_shadow(color: u32, y: f32, blur: f32, spread: f32, inset: bool) -> gpui::BoxShadow {
    gpui::BoxShadow {
        color: super::alpha(color),
        offset: gpui::point(px(0.0), px(y)),
        blur_radius: px(blur),
        spread_radius: px(spread),
        inset,
    }
}
/// Degradado de dos paradas de un token, con su posición final.
pub fn ramp(ramp: Ramp, angle: f32) -> gpui::Background {
    linear_gradient(
        angle,
        linear_color_stop(rgb(ramp.from), 0.0),
        linear_color_stop(rgb(ramp.to), ramp.end),
    )
}
/// Igual que [`ramp`] para tokens con alfa (`0xRRGGBBAA`).
pub fn ramp_alpha(ramp: Ramp, angle: f32) -> gpui::Background {
    linear_gradient(
        angle,
        linear_color_stop(super::alpha(ramp.from), 0.0),
        linear_color_stop(super::alpha(ramp.to), ramp.end),
    )
}
/// Anillo de foco por dentro (como la selección), visible solo con teclado.
fn focus_ring(cx: &gpui::App) -> Vec<gpui::BoxShadow> {
    vec![kit_shadow(skin(cx).selection, 0.0, 0.0, 2.0, true)]
}
/// Relleno y relieve del ítem activo (barra, segmentado): nunca una barra vertical.
pub fn nav_active<E: Styled>(element: E, cx: &gpui::App) -> E {
    let skin = skin(cx);
    element.bg(ramp(skin.nav_active, 180.0)).shadow(vec![
        kit_shadow(skin.nav_light, 1.0, 0.0, 0.0, true),
        kit_shadow(skin.nav_ring, 0.0, 0.0, 1.0, false),
        kit_shadow(0x0000_0066, 4.0, 12.0, 0.0, false),
    ])
}

/// Ítem de la barra izquierda: 40 de alto abierto, 48×44 contraído (§2, R10.8).
pub fn nav_item(
    id: impl Into<gpui::ElementId>,
    icon_name: &'static str,
    label: &str,
    active: bool,
    locked: bool,
    expanded: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = skin(cx);
    let hover = skin.hover;
    let label = label.to_owned();
    let item = div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.clone())
        .aria_selected(active)
        .tab_index(0)
        .relative()
        .flex_none()
        .flex()
        .items_center()
        .cursor_pointer()
        .text_size(px(14.0))
        .line_height(px(20.0))
        .text_color(rgb(if locked {
            skin.cap
        } else if active {
            skin.text1
        } else {
            skin.text2
        }))
        .focus_visible(|s| s.shadow(focus_ring(cx)))
        .child(
            div()
                .relative()
                .flex_none()
                .w(px(22.0))
                .flex()
                .justify_center()
                .child(icon(
                    icon_name,
                    21.0,
                    if active {
                        skin.accent_bright
                    } else {
                        skin.text3
                    },
                ))
                .when(locked && !expanded, |ic| {
                    ic.child(
                        div()
                            .absolute()
                            .right(px(-6.0))
                            .bottom(px(-5.0))
                            .p(px(1.0))
                            .rounded(px(4.0))
                            .bg(rgb(skin.sidebar.to))
                            .child(icon("v-lock", 12.0, skin.text3)),
                    )
                }),
        );
    let item = if expanded {
        item.h(px(40.0))
            .w_full()
            .px(px(10.0))
            .gap(px(10.0))
            .rounded(px(skin.radius.sm))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .overflow_hidden()
                    .text_ellipsis()
                    .whitespace_nowrap()
                    .child(label),
            )
    } else {
        item.w(px(48.0))
            .h(px(44.0))
            .justify_center()
            .rounded(px(skin.radius.md))
            .tooltip(move |_, cx| cx.new(|_| super::Tooltip(label.clone())).into())
    };
    if active {
        nav_active(item, cx)
    } else if locked {
        item
    } else {
        item.hover(move |s| s.bg(super::alpha(hover)))
    }
}

/// Pill blanda «Próximamente» con candado de la barra (no es un estado).
pub fn soon(cx: &gpui::App) -> Div {
    let skin = skin(cx);
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(4.0))
        .px(px(7.0))
        .h(px(18.0))
        .rounded_full()
        .bg(rgb(skin.l2))
        .text_size(px(11.0))
        .text_color(rgb(skin.text3))
        .child(icon("lock", 11.0, skin.text3))
        .child("Próximamente")
}

/// Botón icono (§4, 28²): text.3; hover con velo.
pub fn icon_button(
    id: impl Into<gpui::ElementId>,
    icon_name: &'static str,
    label: &str,
    size: f32,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = skin(cx);
    let hover = skin.hover;
    let tip = label.to_owned();
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .size(px(size))
        .flex_none()
        .relative()
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(skin.radius.sm))
        .cursor_pointer()
        .hover(move |s| s.bg(super::alpha(hover)))
        .focus_visible(|s| s.shadow(focus_ring(cx)))
        .child(icon(icon_name, (size * 0.62).round(), skin.text3))
        .tooltip(move |_, cx| cx.new(|_| super::Tooltip(tip.clone())).into())
}

/// Pestaña de la barra superior (R10.10): subrayado horizontal 2 px de marca.
pub fn topbar_tab(
    id: impl Into<gpui::ElementId>,
    label: &str,
    active: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = skin(cx);
    let hover = skin.text2;
    div()
        .id(id)
        .role(gpui::Role::Tab)
        .aria_label(label.to_owned())
        .aria_selected(active)
        .tab_index(0)
        .h_full()
        .flex_none()
        .relative()
        .flex()
        .items_center()
        .cursor_pointer()
        .text_size(px(13.0))
        .text_color(rgb(if active { skin.text1 } else { skin.text3 }))
        .when(!active, |tab| tab.hover(move |s| s.text_color(rgb(hover))))
        .focus_visible(|s| s.shadow(focus_ring(cx)))
        .child(label.to_owned())
        .when(active, |tab| {
            tab.child(
                div()
                    .absolute()
                    .left_0()
                    .right_0()
                    .bottom(px(-1.0))
                    .h(px(2.0))
                    .rounded(px(2.0))
                    .bg(ramp(skin.brand, 90.0)),
            )
        })
}

/// Logotipo «VANTARE» (Rajdhani 23, tracking 2): no cambia con el tema.
pub fn wordmark(cx: &gpui::App) -> Div {
    let font: SharedString = cx
        .global::<super::design::Tokens>()
        .fonts
        .display
        .clone()
        .into();
    div()
        .flex()
        .flex_none()
        .gap(px(2.0))
        .text_size(px(23.0))
        .line_height(px(23.0))
        .font_family(font)
        .font_weight(gpui::FontWeight(600.0))
        .text_color(rgb(skin(cx).text1))
        .children("VANTARE".chars().map(|c| div().child(c.to_string())))
}

/// Punto «vivo» (7 px): degradado 135° y halo.
pub fn live_dot(cx: &gpui::App) -> Div {
    let skin = skin(cx);
    div()
        .size(px(7.0))
        .flex_none()
        .rounded_full()
        .bg(ramp(skin.live, 135.0))
        .shadow(vec![
            kit_shadow(skin.live_halo, 0.0, 0.0, 3.0, false),
            kit_shadow(skin.progress_glow, 0.0, 8.0, 0.0, false),
        ])
}

/// Sección de la barra derecha acoplada (R10.2): cabecera + cuerpo y separador de 1 px.
pub struct RailSection {
    pub title: SharedString,
    pub icon: &'static str,
    pub action: Option<gpui::AnyElement>,
    pub body: gpui::AnyElement,
    /// La última sección crece hasta abajo y desplaza su lista dentro.
    pub grow: bool,
    /// Contenido heredado que ya trae su propia cabecera.
    pub headless: bool,
}
impl RailSection {
    pub fn new(title: impl Into<SharedString>, icon: &'static str, body: impl IntoElement) -> Self {
        Self {
            title: title.into(),
            icon,
            action: None,
            body: body.into_any_element(),
            grow: false,
            headless: false,
        }
    }
    #[must_use]
    pub fn grow(mut self) -> Self {
        self.grow = true;
        self
    }
    #[must_use]
    pub fn action(mut self, action: impl IntoElement) -> Self {
        self.action = Some(action.into_any_element());
        self
    }
    #[must_use]
    pub fn headless(mut self) -> Self {
        self.headless = true;
        self
    }
}

/// Cabecera de tarjeta/sección R9.2: icono, rótulo Rajdhani y enlace Space Mono.
pub fn section_header(
    title: &str,
    icon_name: &'static str,
    action: Option<gpui::AnyElement>,
    cx: &gpui::App,
) -> Div {
    let skin = skin(cx);
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(10.0))
        .min_w_0()
        .child(icon(icon_name, 16.0, skin.text3))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .child(caps(title, 15.0, skin.text1, cx)),
        )
        .children(action)
}

/// Enlace de cabecera («VER TODO»): Space Mono 11 MAYÚSCULAS.
pub fn header_link(id: impl Into<gpui::ElementId>, label: &str, cx: &gpui::App) -> Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Link)
        .aria_label(label.to_owned())
        .tab_index(0)
        .flex_none()
        .cursor_pointer()
        .child(meta(label, 11.0, skin(cx).text3, cx))
}
