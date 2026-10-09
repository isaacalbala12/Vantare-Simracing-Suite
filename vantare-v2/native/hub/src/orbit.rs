//! Kit visual del Hub: tokens y piezas de Command Orbit v0.3
//! (`frontend/src/styles/orbit.tokens.css`, densidad equilibrada).
//! Solo presentación: cada sección compone estas piezas con su propio estado.

use gpui::{
    Div, FontWeight, Hsla, IntoElement, ParentElement, SharedString, Stateful, Styled, div,
    linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba,
};

mod controls;
mod dates;
pub use dates::activity_time;
pub mod design;
mod neo;
pub use neo::*;
pub mod adapt;
mod input;
mod layer;
pub mod skin;
pub use adapt::Adapt;
mod kit;
pub use kit::*;
mod specimen;
mod state;
pub mod theme;
pub mod typography;
pub use controls::*;
pub use input::Input;
pub use layer::{Dismissed, Layer, LayerKind};
pub use specimen::{Specimen, run_kit};
pub use state::{ChoiceState, NumberRange, OptionItem};

// Accesores: los colores pertenecen al global GPUI, nunca a un static mutable.
/// Tokens R9/R10 del tema activo.
pub fn skin(cx: &gpui::App) -> &skin::Skin {
    &cx.global::<theme::Theme>().skin
}
/// Color `0xRRGGBBAA` del tema como `Hsla`.
pub fn alpha(color: u32) -> Hsla {
    rgba(color).into()
}
/// Anillo de selección R9.1: inset 2 px, nunca sobresale ni se corta.
pub fn selection_ring(cx: &gpui::App) -> Vec<gpui::BoxShadow> {
    vec![gpui::BoxShadow {
        color: alpha(skin(cx).selection),
        offset: gpui::point(px(0.0), px(0.0)),
        blur_radius: px(0.0),
        spread_radius: px(2.0),
        inset: true,
    }]
}
pub fn coral(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().coral
}
pub fn ember(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().ember
}
pub fn red(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().red
}
pub fn cyan(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().cyan
}
pub fn bronze(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().bronze
}
pub fn silver(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().silver
}
pub fn ink_4(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().ink_4
}
pub fn white(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().white
}
pub fn line_chip(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().line_chip
}
pub fn line_pill(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().line_pill
}
pub fn primary_bg(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().primary_bg
}
pub fn menu_shadow_color(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().menu_shadow_color
}
pub fn palette_shadow_color(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().palette_shadow_color
}
pub fn canvas(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().canvas
}
pub fn surface_1(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().surface_1
}
pub fn surface_2(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().surface_2
}
pub fn surface_3(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().surface_3
}
pub fn column_bg(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().column_bg
}
pub fn ink(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().ink
}
pub fn ink_2(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().ink_2
}
pub fn ink_3(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().ink_3
}
pub fn ink_muted(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().ink_muted
}
pub fn carmine(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().carmine
}
pub fn carmine_dark(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().carmine_dark
}
pub fn green(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().green
}
pub fn line(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().line
}
pub fn line_strong(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().line_strong
}
pub fn line_row(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().line_row
}
pub fn rail_bg(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().rail_bg
}
pub fn palette_backdrop(cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().palette_backdrop
}

// Tokens del kit CSS, además de los tokens de shell ya portados.
#[cfg(test)]
pub const CORAL: u32 = 0x00ff_6a5f;
#[cfg(test)]
pub const EMBER: u32 = 0x00ff_9b57;
#[cfg(test)]
pub const RED: u32 = 0x00f0_4755;
#[cfg(test)]
pub const CYAN: u32 = 0x005c_cbd5;
#[cfg(test)]
pub const BRONZE: u32 = 0x00d2_9a6c;
#[cfg(test)]
pub const SILVER: u32 = 0x00c9_c9cf;
#[cfg(test)]
pub const INK_4: u32 = 0x0078_7379;
pub const ROW_H: f32 = 49.0;
pub const CHIP_H: f32 = 26.0;
pub const PILL_H: f32 = 30.0;
pub const RADIUS_CHIP: f32 = 8.0;
pub const BODY: f32 = 13.5;
pub const SECONDARY: f32 = 12.0;
pub const MICRO: f32 = 10.5;
pub const CHIP_TEXT: f32 = 10.0;
pub const PILL_TEXT: f32 = 11.5;
pub const CHIP_PAD: f32 = 9.0;
pub const PILL_GAP: f32 = 9.0;
pub const LINE_WIDTH: f32 = 1.0;
#[cfg(test)]
pub const WHITE: u32 = 0x00ff_ffff;
#[cfg(test)]
pub const LINE_CHIP: u32 = 0xffff_ff09;
#[cfg(test)]
pub const LINE_PILL: u32 = 0xffff_ff0f;
// Medidas de componentes que orbit-kit.css fija fuera de orbit.tokens.css.
pub const FIELD_W: f32 = 168.0;
pub const TEXTAREA_H: f32 = 83.0;
pub const FIELD_PAD: f32 = 13.0;
pub const FIELD_TEXT: f32 = 14.0;
pub const TAB_PAD: f32 = 14.0;
pub const TAB_INSET: f32 = 10.0;
pub const FADER_W: f32 = 150.0;
pub const FADER_H: f32 = 6.0;
pub const FADER_RADIUS: f32 = 3.0;
pub const FADER_THUMB: f32 = 16.0;
#[cfg(test)]
pub const PRIMARY_BG: u32 = 0x00f3_eeee;
pub const OPTION_H: f32 = 38.0;
pub const MENU_PAD: f32 = 6.0;
pub const CHECK_SIZE: f32 = 18.0;
pub const CHECK_RADIUS: f32 = 5.0;
pub const SEGMENT_H: f32 = 29.0;
pub const SEGMENT_PAD: f32 = 4.0;
pub const SEGMENT_GAP: f32 = 2.5;
pub const DOT: f32 = 6.0;
pub const PILL_DOT: f32 = 8.0;
pub const FOCUS_WIDTH: f32 = 2.0;
pub const DISABLED: f32 = 0.45;
pub const CARD_HEADER_H: f32 = 60.0;
pub const CARD_PAD_X: f32 = 20.0;
pub const CARD_TITLE: f32 = 15.0;
/// Fondo de panel heredado de Wails (`#101114` al 79 %).
pub const PANEL_BG: u32 = 0x1011_14c9;
pub const KEYCAP_H: f32 = 26.0;
pub const KEYCAP_MIN_W: f32 = 27.0;
pub const KEYCAP_RADIUS: f32 = 7.0;
pub const KEYCAP_TEXT: f32 = 11.5;
pub const MENU_Z: usize = 30;
pub const MODAL_Z: usize = 100;
#[cfg(test)]
pub const MENU_SHADOW_COLOR: u32 = 0x0000_0099;
#[cfg(test)]
pub const PALETTE_SHADOW_COLOR: u32 = 0x0000_00a8;

// Panels have opaque backgrounds and borders. External blur is deliberately
// absent: it produces transparent grain/cut halos in Windows composition.
pub(crate) fn layer_shadow(_modal: bool, _cx: &gpui::App) -> Vec<gpui::BoxShadow> {
    Vec::new()
}

#[cfg(test)]
pub const CANVAS: u32 = 0x0008_090b;
#[cfg(test)]
pub const SURFACE_1: u32 = 0x0012_1316;
#[cfg(test)]
pub const SURFACE_2: u32 = 0x0018_191e;
#[cfg(test)]
pub const SURFACE_3: u32 = 0x0020_2127;
#[cfg(test)]
pub const COLUMN_BG: u32 = 0x000f_1013;
#[cfg(test)]
pub const INK: u32 = 0x00f5_f3f2;
#[cfg(test)]
pub const INK_2: u32 = 0x00b7_b2b2;
#[cfg(test)]
pub const INK_3: u32 = 0x008a_858b;
#[cfg(test)]
pub const INK_MUTED: u32 = 0x0057_545a;
#[cfg(test)]
pub const CARMINE: u32 = 0x00d5_2f49;
#[cfg(test)]
pub const CARMINE_DARK: u32 = 0x009a_0606;
#[cfg(test)]
pub const GREEN: u32 = 0x0078_d68b;
/// `rgba(255,255,255,.075)` y `.13`, como `0xRRGGBBAA`.
#[cfg(test)]
pub const LINE: u32 = 0xffff_ff13;
#[cfg(test)]
pub const LINE_STRONG: u32 = 0xffff_ff21;
#[cfg(test)]
pub const LINE_ROW: u32 = 0xffff_ff0b;

pub const COLUMN_W: f32 = 296.0;
pub const TOPBAR_H: f32 = 70.0;
pub const STRATEGY_TOPBAR_H: f32 = 60.0;
pub const GUTTER: f32 = 32.0;
pub const TOPBAR_GUTTER: f32 = 26.0;
pub const RADIUS: f32 = 18.0;
pub const RADIUS_CONTROL: f32 = 12.0;
pub const CONTROL_H: f32 = 39.0;

// Piezas adicionales de shell; las piezas de sección anteriores no cambian.
#[cfg(test)]
pub const RAIL_BG: u32 = 0x000b_0c0e;
pub const RAIL_W: f32 = 81.0;
pub const COLUMN_COMPACT_W: f32 = 216.0;
pub const COLUMN_BREAKPOINT: f32 = 1152.0;
pub const RAIL_BUTTON: f32 = 52.0;
pub const PALETTE_W: f32 = 640.0;
// Panel de campana (`orbit-shell.css`), con la misma infraestructura de capa.
pub const POPOVER_W: f32 = 360.0;
pub const POPOVER_RADIUS: f32 = 14.0;
pub const POPOVER_MAX_H: f32 = 520.0;
#[cfg(test)]
pub const PALETTE_BACKDROP: u32 = 0x0404_069e;
pub const FEATURED_RADIUS: f32 = 25.0;

pub fn stage(cx: &gpui::App) -> theme::StageBackground {
    let theme = cx.global::<theme::Theme>();
    if cx.try_global::<design::Tokens>().is_none()
        && theme.palette == theme::Palette::Vantare
        && theme.scheme == theme::Scheme::Dark
    {
        // El lienzo nativo anterior usaba superficies Orbit; conserva paridad.
        theme::StageBackground {
            accent: theme.carmine,
            top: theme.surface_2,
            base: theme.canvas,
        }
    } else {
        theme.stage
    }
}

pub fn legacy_rgb(color: u32, cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().legacy_color(color)
}
pub fn legacy_rgba(color: u32, cx: &gpui::App) -> u32 {
    cx.global::<theme::Theme>().legacy_alpha(color)
}

pub fn is_mono(cx: &gpui::App) -> bool {
    cx.global::<theme::Theme>().palette == theme::Palette::Mono
}
pub fn selection_border(cx: &gpui::App) -> Hsla {
    tint(carmine(cx), 0.4)
}

/// Fila seleccionada de paleta (`orbit-shell.css`, selección carmín).
pub fn palette_item(index: usize, active: bool, cx: &gpui::App) -> Stateful<Div> {
    div()
        .id(("command", index))
        .role(gpui::Role::ListBoxOption)
        .tab_stop(false)
        .aria_selected(active)
        .mx(px(0.0))
        .px(px(12.0))
        .py(px(9.0))
        .flex()
        .items_center()
        .gap(px(13.0))
        .rounded(px(RADIUS_CONTROL))
        .cursor_pointer()
        .when(active, |row| {
            row.bg(linear_gradient(
                90.0,
                linear_color_stop(tint(carmine(cx), 0.14), 0.0),
                linear_color_stop(tint(carmine(cx), 0.025), 1.0),
            ))
        })
        .when(active && is_mono(cx), |row| {
            row.bg(rgb(surface_3(cx)))
                .border_1()
                .border_color(selection_border(cx))
        })
}

pub fn icon(name: &'static str, size: f32, color: u32) -> gpui::Svg {
    gpui::svg()
        .path(format!("icons/{name}.svg"))
        .size(px(size))
        .text_color(rgb(color))
}

/// Botón de rail con selección, candado, tooltip y semántica de teclado GPUI.
pub fn rail_button(
    id: &'static str,
    name: &'static str,
    label: &str,
    active: bool,
    locked: Option<&str>,
    cx: &gpui::App,
) -> Stateful<Div> {
    let tip = locked.map_or_else(|| label.to_owned(), |reason| format!("{label} · {reason}"));
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(tip.clone())
        .aria_selected(active)
        .tab_index(0)
        .size(px(RAIL_BUTTON))
        .flex_none()
        .relative()
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(14.0))
        .cursor_pointer()
        .hover(|s| s.bg(rgba(line_row(cx))))
        .focus_visible(|s| s.border_1().border_color(rgb(carmine(cx))))
        .when(active, |s| {
            s.bg(linear_gradient(
                135.0,
                linear_color_stop(tint(carmine(cx), 0.24), 0.0),
                linear_color_stop(tint(carmine(cx), 0.07), 1.0),
            ))
            .border_1()
            .border_color(tint(carmine(cx), 0.22))
        })
        .child(icon(
            name,
            if id == "notifications" { 16.0 } else { 23.0 },
            if locked.is_some() {
                ink_muted(cx)
            } else if active {
                ink(cx)
            } else {
                ink_4(cx)
            },
        ))
        .when(locked.is_some(), |s| {
            s.child(div().absolute().right(px(5.0)).bottom(px(5.0)).child(icon(
                "i-lock",
                15.0,
                ink_muted(cx),
            )))
        })
        .when(active && is_mono(cx), |row| {
            row.bg(rgb(surface_3(cx)))
                .border_1()
                .border_color(selection_border(cx))
        })
        .tooltip(move |_, cx| cx.new(|_| Tooltip(tip.clone())).into())
}

pub(crate) struct Tooltip(pub(crate) String);
impl gpui::Render for Tooltip {
    fn render(&mut self, _: &mut gpui::Window, cx: &mut gpui::Context<Self>) -> impl IntoElement {
        let skin = skin(cx);
        div()
            .px(px(8.0))
            .py(px(4.0))
            .rounded(px(skin.radius.sm))
            .bg(rgb(skin.el))
            .shadow(vec![kit::kit_shadow(skin.line2, 0.0, 0.0, 1.0, false)])
            .child(text(self.0.clone(), 12.0, 500, skin.text1, cx))
    }
}

/// Medida en píxeles lógicos, como la media query del kit Wails.
pub fn column_width(viewport: f32) -> f32 {
    if viewport <= COLUMN_BREAKPOINT {
        COLUMN_COMPACT_W
    } else {
        COLUMN_W
    }
}

/// Respaldo de avatar de Wails para una cuenta sin nombre/foto: punto medio.
pub fn avatar(initial: &str, cx: &gpui::App) -> Div {
    // La fila Cuenta posee la acción y el foco; el avatar solo pinta las iniciales.
    div()
        .size(px(CONTROL_H))
        .rounded(px(RADIUS_CONTROL))
        .flex()
        .items_center()
        .justify_center()
        .bg(rgb(surface_3(cx)))
        .shadow(vec![gpui::BoxShadow {
            color: rgba(0x0000_0059).into(),
            offset: gpui::point(px(0.0), px(9.0)),
            blur_radius: px(23.0),
            spread_radius: px(0.0),
            inset: false,
        }])
        .child(text(initial.to_owned(), 12.0, 850, white(cx), cx))
}

pub fn sans_family(w: u16, cx: &gpui::App) -> SharedString {
    match cx.global::<theme::Theme>().interface_font {
        theme::InterfaceFont::Inter => {
            if let Some(tokens) = cx.try_global::<design::Tokens>()
                && tokens.fonts.body != "Inter W400"
            {
                return tokens.fonts.body.clone().into();
            }
            format!("Inter W{w}").into()
        }
        theme::InterfaceFont::Segoe => "Segoe UI".into(),
        theme::InterfaceFont::Arial => "Arial".into(),
    }
}

/// Peso para texto que selecciona una cara Inter Wxxx estática.
pub fn face_weight(requested: u16, cx: &gpui::App) -> FontWeight {
    FontWeight(f32::from(
        cx.global::<theme::Theme>()
            .interface_font
            .face_weight(requested),
    ))
}

pub fn sans_override(original: &'static str, cx: &gpui::App) -> SharedString {
    if cx.global::<theme::Theme>().interface_font == theme::InterfaceFont::Inter {
        original.into()
    } else {
        sans_family(400, cx)
    }
}

pub fn tint(color: u32, alpha: f32) -> Hsla {
    let mut c: Hsla = rgb(color).into();
    c.a = alpha;
    c
}

/// Texto con tamaño, peso y color de la escala Orbit.
pub fn text(
    content: impl Into<SharedString>,
    size: f32,
    w: u16,
    color: u32,
    cx: &gpui::App,
) -> Div {
    div()
        .text_size(px(size))
        .font_family(sans_family(w, cx))
        .font_weight(FontWeight(f32::from(w)))
        .text_color(rgb(color))
        .child(content.into())
}

pub fn tracked_text(
    content: impl Into<SharedString>,
    size: f32,
    w: u16,
    color: u32,
    tracking: f32,
    cx: &gpui::App,
) -> Div {
    let content: SharedString = content.into();
    div().flex().gap(px(tracking)).children(
        content
            .chars()
            .map(|character| text(character.to_string(), size, w, color, cx).flex_none()),
    )
}

pub fn primary_label(cx: &gpui::App) -> u32 {
    let theme = cx.global::<theme::Theme>();
    if cx.try_global::<design::Tokens>().is_none()
        && theme.palette == theme::Palette::Vantare
        && theme.scheme == theme::Scheme::Dark
    {
        theme.ink
    } else {
        theme.primary_ink
    }
}
pub fn mono_override<'a>(original: &'static str, cx: &'a gpui::App) -> &'a str {
    if cx.global::<theme::Theme>().mono_font == theme::MonoFont::Cascadia {
        original
    } else {
        mono_family(cx)
    }
}

pub fn mono_family(cx: &gpui::App) -> &str {
    if cx.global::<theme::Theme>().mono_font == theme::MonoFont::Cascadia
        && let Some(tokens) = cx.try_global::<design::Tokens>()
    {
        return &tokens.fonts.mono;
    }
    match cx.global::<theme::Theme>().mono_font {
        theme::MonoFont::Cascadia => "Cascadia Code",
        theme::MonoFont::Consolas => "Consolas",
        theme::MonoFont::Courier => "Courier New",
    }
}

pub fn mono_text(content: impl Into<SharedString>, size: f32, color: u32, cx: &gpui::App) -> Div {
    div()
        .text_size(px(size))
        .font_family(mono_family(cx))
        .font_weight(FontWeight(400.0))
        .text_color(rgb(color))
        .child(content.into())
}

/// Rótulo de interfaz: conserva el caso elegido por el autor.
pub fn eyebrow(content: impl Into<SharedString>, cx: &gpui::App) -> Div {
    text(content, 12.0, 600, ink_3(cx), cx)
}

/// Columna de contexto: título con versión y lista de secciones.
pub fn column(title: &str, version: &str, cx: &gpui::App) -> Div {
    column_with_collapse(
        title,
        version,
        div()
            .size(px(26.0))
            .flex()
            .items_center()
            .justify_center()
            .child(text("‹", 20.0, 400, ink_3(cx), cx)),
        cx,
    )
}

pub fn column_with_collapse(
    title: &str,
    version: &str,
    collapse: impl IntoElement,
    cx: &gpui::App,
) -> Div {
    div()
        .w(px(COLUMN_W))
        .h_full()
        .flex_none()
        .flex()
        .flex_col()
        .pt(px(18.0))
        .px(px(14.0))
        .pb(px(16.0))
        .bg(rgb(column_bg(cx)))
        .border_r_1()
        .border_color(rgba(line(cx)))
        .child(
            div()
                .h(px(49.0))
                .flex_none()
                .px(px(9.0))
                .pb(px(16.0))
                .flex()
                .items_center()
                .gap(px(12.0))
                .border_b_1()
                .border_color(rgba(line_row(cx)))
                .child(
                    text(title.to_owned(), 14.0, 700, ink(cx), cx)
                        .flex_1()
                        .min_w_0(),
                )
                .child(mono_text(version.to_owned(), 11.0, ink_4(cx), cx))
                .child(collapse),
        )
}

/// Barra superior: ruta `EYEBROW / Título` a la izquierda y acción a la derecha.
pub fn topbar(trail: &str, title: &str, action: impl IntoElement, cx: &gpui::App) -> Div {
    topbar_with_actions(trail, title, None, action, false, cx)
}

/// Acciones opcionales de la sección junto al título y los controles comunes.
/// La sección conserva su estado, eventos y persistencia; Orbit solo compone.
pub fn topbar_with_actions(
    _trail: &str,
    title: &str,
    section_actions: Option<gpui::AnyElement>,
    common_actions: impl IntoElement,
    compact: bool,
    cx: &gpui::App,
) -> Div {
    let wrap_actions = compact && section_actions.is_some();
    div()
        .h(px(cx
            .try_global::<design::Tokens>()
            .map_or(TOPBAR_H, |tokens| tokens.geometry.topbar)))
        .when(wrap_actions, |bar| {
            bar.flex_wrap().h_auto().min_h(px(TOPBAR_H)).py(px(12.0))
        })
        .flex_none()
        .px(px(TOPBAR_GUTTER))
        .pt(px(1.0))
        .flex()
        .items_center()
        .gap(px(14.0))
        .border_b_1()
        .border_color(rgba(line(cx)))
        .child(
            div()
                .flex()
                .when(compact, gpui::Styled::flex_none)
                .items_baseline()
                .gap(px(10.0))
                .child(
                    text(title.to_owned(), 16.0, 650, ink(cx), cx)
                        .font_weight(face_weight(650, cx))
                        .line_height(px(24.0)),
                ),
        )
        .when_some(section_actions, |bar, actions| {
            bar.child(
                div()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .when(wrap_actions, gpui::Styled::w_full)
                    .child(actions),
            )
        })
        .child(div().ml_auto().flex_none().child(common_actions))
}

/// Cabecera de página: rótulo, título grande y descripción.
pub fn page_header(kicker: &str, title: &str, description: &str, cx: &gpui::App) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(8.0))
        .child(eyebrow(kicker.to_owned(), cx))
        .child(text(title.to_owned(), 34.0, 800, ink(cx), cx))
        .when(!description.is_empty(), |header| {
            header.child(text(description.to_owned(), 13.5, 400, ink_2(cx), cx))
        })
}

/// Tarjeta con título y cuerpo.
pub fn card(title: &str, cx: &gpui::App) -> Div {
    div()
        .flex()
        .flex_col()
        .bg(rgb(surface_1(cx)))
        .border_1()
        .border_color(rgba(line(cx)))
        .rounded(px(RADIUS))
        .when(!title.is_empty(), |card| {
            card.child(card_header(title.to_owned(), cx))
        })
}

/// Panel con borde (Ajustes, Cuenta, catálogo): misma superficie en todo el Hub.
pub fn panel(cx: &gpui::App) -> Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .overflow_hidden()
        .rounded(px(RADIUS))
        .border_1()
        .border_color(rgba(line(cx)))
        .bg(rgba(legacy_rgba(PANEL_BG, cx)))
}

/// Cabecera de tarjeta R9.2: rótulo Rajdhani en MAYÚSCULAS; lo que se añada
/// con `.child` queda a la derecha.
pub fn card_header(title: impl Into<SharedString>, cx: &gpui::App) -> Div {
    let title: SharedString = title.into();
    div()
        .flex_none()
        .min_h(px(CARD_HEADER_H))
        .px(px(CARD_PAD_X))
        .py(px(13.0))
        .flex()
        .items_center()
        .justify_between()
        .gap(px(12.0))
        .border_b_1()
        .border_color(alpha(skin(cx).line1))
        .child(caps(&title, 15.0, skin(cx).text1, cx))
}

/// Cuerpo con relleno para colocar filas dentro de una [`card`].
pub fn card_body() -> Div {
    div().flex().flex_col().px(px(20.0)).py(px(12.0))
}

/// Fila de ajuste: etiqueta y ayuda a la izquierda, control a la derecha.
pub fn setting_row(label: &str, help: &str, control: impl IntoElement, cx: &gpui::App) -> Div {
    div()
        .min_h(px(49.0))
        .py(px(8.0))
        .flex()
        .items_center()
        .justify_between()
        .gap(px(16.0))
        .border_b_1()
        .border_color(rgba(line_row(cx)))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.0))
                .child(text(label.to_owned(), 13.5, 700, ink(cx), cx))
                .when(!help.is_empty(), |c| {
                    c.child(text(help.to_owned(), 12.0, 400, ink_3(cx), cx))
                }),
        )
        .child(control)
}

/// Interruptor §4 (36×22): pista l3 hundida; activo con el degradado del botón principal.
pub fn toggle(
    id: &'static str,
    label: &str,
    on: bool,
    enabled: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = skin(cx);
    div()
        .id(id)
        .role(gpui::Role::Switch)
        .aria_label(label.to_owned())
        .tab_index(0)
        .w(px(36.0))
        .h(px(22.0))
        .flex_none()
        .rounded_full()
        .p(px(3.0))
        .flex()
        .when(on, |t| t.justify_end().bg(rgb(skin.accent)))
        .when(!on, |t| {
            t.bg(rgb(skin.l3))
                .shadow(vec![kit::kit_shadow(0x0000_0066, 1.0, 2.0, 0.0, true)])
        })
        .when(enabled, Styled::cursor_pointer)
        .when(!enabled, |t| inactive(t).opacity(0.4))
        .focus_visible(|s| s.border_1().border_color(alpha(skin.selection)))
        .child(div().size(px(16.0)).rounded_full().bg(rgb(if on {
            0x00ff_ffff
        } else {
            skin.text3
        })))
}

/// Cara compartida, sin rol ni foco: también presenta acciones aún inexistentes.
fn button_face(id: impl Into<gpui::ElementId>, label: &str, cx: &gpui::App) -> Stateful<Div> {
    let skin = skin(cx);
    div()
        .id(id)
        .aria_label(label.to_owned())
        .h(px(36.0))
        .px(px(16.0))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .gap(px(8.0))
        .rounded(px(skin.radius.md))
        .bg(gpui::transparent_black())
        .border_1()
        .border_color(alpha(skin.line3))
}

/// Base de botón R9.2/§4: añade interacción a la cara compartida.
fn button_base(id: impl Into<gpui::ElementId>, label: &str, cx: &gpui::App) -> Stateful<Div> {
    button_face(id, label, cx)
        .role(gpui::Role::Button)
        .tab_index(0)
        .cursor_pointer()
}

/// Acción pendiente permanente: contenido descriptivo, sin Click ni Focus.
pub fn pending_button(
    id: impl Into<gpui::ElementId>,
    label: &str,
    reason: &str,
    cx: &gpui::App,
) -> Stateful<Div> {
    pending_face(button_face(id, label, cx), reason).child(text(
        label.to_owned(),
        14.0,
        500,
        skin(cx).text1,
        cx,
    ))
}

fn pending_face(face: Stateful<Div>, reason: &str) -> Stateful<Div> {
    face.role(gpui::Role::Group)
        .aria_description(reason.to_owned())
        .cursor_default()
        .opacity(DISABLED)
}

/// Botón secundario: transparente con contorno; hover con velo.
pub fn button(id: impl Into<gpui::ElementId>, label: &str, cx: &gpui::App) -> Stateful<Div> {
    let skin = skin(cx);
    let hover = skin.hover;
    button_base(id, label, cx)
        .hover(move |s| s.bg(alpha(hover)))
        .focus_visible(|s| s.border_color(alpha(skin.selection)))
        .child(text(label.to_owned(), 14.0, 500, skin.text1, cx))
}

/// Botón compacto de fila (Ajustes, Cuenta): discreto en reposo, responde a hover y foco.
pub fn small_button(id: &'static str, label: &str, cx: &gpui::App) -> Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .flex_none()
        .h(px(34.0))
        .px(px(12.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded_full()
        .border_1()
        .border_color(rgba(line(cx)))
        .bg(gpui::transparent_black())
        .cursor_pointer()
        .hover(|s| s.bg(rgb(surface_2(cx))).border_color(rgba(line_strong(cx))))
        .focus_visible(|s| s.border_color(rgb(carmine(cx))))
        .child(
            text(label.to_owned(), 12.0, 600, ink_2(cx), cx)
                .font_weight(face_weight(600, cx))
                .line_height(px(18.0)),
        )
}

/// Inactividad temporal: conserva el rol del control y expone disabled efectivo.
/// GPUI no ofrece `aria_disabled`; su callback público modifica el mismo nodo
/// AccessKit tras prepaint, también si el consumidor añade listeners después.
fn inactive(control: Stateful<Div>) -> Stateful<Div> {
    control
        .tab_stop(false)
        .cursor_default()
        .a11y_synthetic_children(|tree| {
            let node = tree.parent_node();
            node.set_disabled();
            node.clear_actions();
        })
}

/// Control temporalmente inactivo: atenuado, sin acciones accesibles.
/// El consumidor protege su handler; los pendientes permanentes usan pending_*.
pub fn disabled(control: Stateful<Div>, reason: &str) -> Stateful<Div> {
    inactive(control)
        .opacity(DISABLED)
        .aria_description(reason.to_owned())
}

/// Combinación de teclas («Ctrl + K»): el único estilo de tecla del Hub (`kbd`).
pub fn keycaps<S: Into<SharedString>>(keys: impl IntoIterator<Item = S>, cx: &gpui::App) -> Div {
    let skin = skin(cx);
    let mut row = div().flex().flex_none().items_center().gap(px(4.0));
    for (index, key) in keys.into_iter().enumerate() {
        if index > 0 {
            row = row.child(text("+", 11.0, 500, skin.cap, cx));
        }
        row = row.child(
            div()
                .h(px(18.0))
                .px(px(5.0))
                .flex()
                .items_center()
                .justify_center()
                .rounded(px(3.0))
                .bg(tint(0x00ff_ffff, 0.03))
                .border_1()
                .border_color(alpha(skin.line2))
                .child(mono_text(key, 11.0, skin.text3, cx)),
        );
    }
    row
}

/// Botón neutro (`btn.pri`): pareja semántica legible en ambos esquemas.
pub fn primary_button(id: &'static str, label: &str, cx: &gpui::App) -> Stateful<Div> {
    let skin = skin(cx);
    let (background, foreground) = skin.primary_button_colors();
    let hover_border = skin.selection;
    button_base(id, label, cx)
        .self_start()
        .bg(rgb(background))
        .border_color(rgb(background))
        .hover(move |s| s.bg(rgb(background)).border_color(alpha(hover_border)))
        .focus_visible(|s| s.border_color(alpha(skin.selection)))
        .child(text(label.to_owned(), 14.0, 500, foreground, cx))
}

/// Botón principal R10.8: relleno del acento, brillo superior de 1 px, sin halo.
pub fn carmine_button(id: &'static str, label: &str, cx: &gpui::App) -> Stateful<Div> {
    let skin = skin(cx);
    let hover = skin.button_hover;
    let pressed = skin.button_pressed;
    carmine_face(id, label, cx)
        .role(gpui::Role::Button)
        .tab_index(0)
        .cursor_pointer()
        .hover(move |s| s.bg(kit::ramp(hover, 180.0)))
        .active(move |s| s.bg(rgb(pressed)))
        .focus_visible(|s| s.border_2().border_color(rgb(skin.text1)))
}

fn carmine_face(id: &'static str, label: &str, cx: &gpui::App) -> Stateful<Div> {
    button_face(id, label, cx)
        .self_start()
        .rounded(px(10.0))
        .border_0()
        .bg(kit::ramp(skin(cx).button, 180.0))
        .shadow(vec![
            kit::kit_shadow(0xffff_ff38, 1.0, 0.0, 0.0, true),
            kit::kit_shadow(0x0000_0059, 1.0, 2.0, 0.0, false),
        ])
        .when(!label.is_empty(), |button| {
            button.child(text(label.to_owned(), 15.0, 600, 0x00ff_ffff, cx))
        })
}

/// Valor seleccionable con el aspecto de un `select` Orbit.
pub fn select(id: &'static str, value: &str, cx: &gpui::App) -> Stateful<Div> {
    button(id, value, cx).min_w(px(168.0)).justify_between()
}

/// Nota contextual (fondo vino tenue).
pub fn callout(content: impl Into<SharedString>, cx: &gpui::App) -> Div {
    div()
        .px(px(18.0))
        .py(px(14.0))
        .rounded(px(RADIUS_CONTROL))
        .bg(tint(carmine(cx), 0.06))
        .border_1()
        .border_color(tint(carmine(cx), 0.18))
        .when(is_mono(cx), |c| {
            c.border_dashed().border_color(rgb(ember(cx)))
        })
        .child(text(
            if is_mono(cx) {
                let content: SharedString = content.into();
                format!("⚠ {content}").into()
            } else {
                content.into()
            },
            12.5,
            400,
            ink_2(cx),
            cx,
        ))
}

/// Contenido retenido por el catálogo; comparte aspecto y motivo entre Inicio y Studio.
pub(crate) fn catalog_placeholder(reason: &'static str, cx: &gpui::App) -> Div {
    div()
        .size_full()
        .bg(rgb(skin(cx).l2))
        .border_1()
        .border_color(alpha(skin(cx).line1))
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .gap(px(6.0))
        .child(icon("v-lock", 18.0, skin(cx).text3))
        .child(text(reason, 12.0, 500, skin(cx).text2, cx))
}

#[cfg(test)]
mod shell_tests {
    #[test]
    fn context_width_uses_the_wails_breakpoint_in_logical_pixels() {
        for (viewport, width) in [
            (1600.0, 296.0),
            (1153.0, 296.0),
            (1152.0, 216.0),
            (900.0, 216.0),
        ] {
            assert!((super::column_width(viewport) - width).abs() < f32::EPSILON);
        }
    }
}
