//! Kit visual del Hub: tokens y piezas de Command Orbit v0.3
//! (`frontend/src/styles/orbit.tokens.css`, densidad equilibrada).
//! Solo presentación: cada sección compone estas piezas con su propio estado.

use gpui::{
    Div, FontWeight, Hsla, IntoElement, ParentElement, SharedString, Stateful, Styled, div,
    linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba,
};

mod controls;
mod input;
mod layer;
mod specimen;
pub mod theme;
mod state;
pub use controls::*;
pub use input::Input;
pub use layer::{Dismissed, Layer, LayerKind};
pub use specimen::{Specimen, run_kit};
pub use state::{ChoiceState, NumberRange, OptionItem};

// Tokens del kit CSS, además de los tokens de shell ya portados.
pub const CORAL: u32 = 0x00ff_6a5f;
pub const EMBER: u32 = 0x00ff_9b57;
pub const RED: u32 = 0x00f0_4755;
pub const CYAN: u32 = 0x005c_cbd5;
pub const BRONZE: u32 = 0x00d2_9a6c;
pub const SILVER: u32 = 0x00c9_c9cf;
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
pub const WHITE: u32 = 0x00ff_ffff;
pub const LINE_CHIP: u32 = 0xffff_ff09;
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
pub const MENU_Z: usize = 30;
pub const MODAL_Z: usize = 100;
pub const MENU_SHADOW_Y: f32 = 24.0;
pub const MENU_SHADOW_BLUR: f32 = 70.0;
pub const PALETTE_SHADOW_Y: f32 = 44.0;
pub const PALETTE_SHADOW_BLUR: f32 = 143.0;
pub const MENU_SHADOW_COLOR: u32 = 0x0000_0099;
pub const PALETTE_SHADOW_COLOR: u32 = 0x0000_00a8;

fn layer_shadow(modal: bool) -> Vec<gpui::BoxShadow> {
    vec![gpui::BoxShadow {
        color: rgba(if modal {
            PALETTE_SHADOW_COLOR
        } else {
            MENU_SHADOW_COLOR
        })
        .into(),
        offset: gpui::point(
            px(0.0),
            px(if modal {
                PALETTE_SHADOW_Y
            } else {
                MENU_SHADOW_Y
            }),
        ),
        blur_radius: px(if modal {
            PALETTE_SHADOW_BLUR
        } else {
            MENU_SHADOW_BLUR
        }),
        spread_radius: px(0.0),
        inset: false,
    }]
}

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
pub const CARMINE_DARK: u32 = 0x009a_0606;
pub const GREEN: u32 = 0x0078_d68b;
/// `rgba(255,255,255,.075)` y `.13`, como `0xRRGGBBAA`.
pub const LINE: u32 = 0xffff_ff13;
pub const LINE_STRONG: u32 = 0xffff_ff21;
pub const LINE_ROW: u32 = 0xffff_ff0b;

pub const COLUMN_W: f32 = 296.0;
pub const TOPBAR_H: f32 = 70.0;
pub const GUTTER: f32 = 32.0;
pub const TOPBAR_GUTTER: f32 = 26.0;
pub const RADIUS: f32 = 18.0;
pub const RADIUS_CONTROL: f32 = 12.0;
pub const CONTROL_H: f32 = 39.0;

// Piezas adicionales de shell; las piezas de sección anteriores no cambian.
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
pub const PALETTE_BACKDROP: u32 = 0x0404_069e;
pub const FEATURED_RADIUS: f32 = 25.0;

/// Fila seleccionada de paleta (`orbit-shell.css`, selección carmín).
pub fn palette_item(index: usize, active: bool) -> Stateful<Div> {
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
                linear_color_stop(tint(CARMINE, 0.14), 0.0),
                linear_color_stop(tint(CARMINE, 0.025), 1.0),
            ))
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
        .hover(|s| s.bg(rgba(LINE_ROW)))
        .focus_visible(|s| s.border_1().border_color(rgb(CARMINE)))
        .when(active, |s| {
            s.bg(linear_gradient(
                135.0,
                linear_color_stop(tint(CARMINE, 0.24), 0.0),
                linear_color_stop(tint(CARMINE, 0.07), 1.0),
            ))
            .border_1()
            .border_color(tint(CARMINE, 0.22))
        })
        .child(icon(
            name,
            if id == "notifications" { 16.0 } else { 23.0 },
            if locked.is_some() {
                INK_MUTED
            } else if active {
                INK
            } else {
                INK_4
            },
        ))
        .when(locked.is_some(), |s| {
            s.child(
                div()
                    .absolute()
                    .right(px(5.0))
                    .bottom(px(5.0))
                    .child(icon("i-lock", 15.0, INK_MUTED)),
            )
        })
        .tooltip(move |_, cx| cx.new(|_| Tooltip(tip.clone())).into())
}

struct Tooltip(String);
impl gpui::Render for Tooltip {
    fn render(&mut self, _: &mut gpui::Window, _: &mut gpui::Context<Self>) -> impl IntoElement {
        div()
            .px_3()
            .py_2()
            .rounded(px(RADIUS_CONTROL))
            .bg(rgb(SURFACE_3))
            .border_1()
            .border_color(rgba(LINE_STRONG))
            .child(text(self.0.clone(), 12.0, 500, INK))
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
pub fn avatar(active: bool, initial: &str) -> Stateful<Div> {
    div()
        .id("account")
        .role(gpui::Role::Button)
        .aria_label("Cuenta · sin sesión")
        .aria_selected(active)
        .tab_index(0)
        .size(px(CONTROL_H))
        .rounded(px(RADIUS_CONTROL))
        .flex()
        .items_center()
        .justify_center()
        .bg(rgb(SURFACE_3))
        .cursor_pointer()
        .hover(|s| s.bg(rgb(SURFACE_2)))
        .focus_visible(|s| s.border_1().border_color(rgb(CARMINE)))
        .shadow(vec![gpui::BoxShadow {
            color: rgba(0x0000_0059).into(),
            offset: gpui::point(px(0.0), px(9.0)),
            blur_radius: px(23.0),
            spread_radius: px(0.0),
            inset: false,
        }])
        .child(text(initial.to_owned(), 12.0, 850, WHITE))
        .tooltip(|_, cx| cx.new(|_| Tooltip("Cuenta · sin sesión".into())).into())
}

fn weight(w: u16) -> SharedString {
    format!("Inter W{w}").into()
}

pub fn tint(color: u32, alpha: f32) -> Hsla {
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

pub fn tracked_text(
    content: impl Into<SharedString>,
    size: f32,
    w: u16,
    color: u32,
    tracking: f32,
) -> Div {
    let content: SharedString = content.into();
    div().flex().gap(px(tracking)).children(
        content
            .chars()
            .map(|character| text(character.to_string(), size, w, color).flex_none()),
    )
}

pub fn mono_text(content: impl Into<SharedString>, size: f32, color: u32) -> Div {
    div()
        .text_size(px(size))
        .font_family("Cascadia Code")
        .font_weight(FontWeight(400.0))
        .text_color(rgb(color))
        .child(content.into())
}

/// Rótulo en mayúsculas espaciadas (`--orbit-fs-eyebrow`).
pub fn eyebrow(content: impl Into<SharedString>) -> Div {
    let upper: SharedString = content.into().to_uppercase().into();
    tracked_text(upper, 11.0, 800, INK_3, 0.99)
}

/// Columna de contexto: título con versión y lista de secciones.
pub fn column(title: &str, version: &str) -> Div {
    column_with_collapse(
        title,
        version,
        div()
            .size(px(26.0))
            .flex()
            .items_center()
            .justify_center()
            .child(text("‹", 20.0, 400, INK_3)),
    )
}

pub fn column_with_collapse(title: &str, version: &str, collapse: impl IntoElement) -> Div {
    div()
        .w(px(COLUMN_W))
        .h_full()
        .flex_none()
        .flex()
        .flex_col()
        .pt(px(18.0))
        .px(px(14.0))
        .pb(px(16.0))
        .bg(rgb(COLUMN_BG))
        .border_r_1()
        .border_color(rgba(LINE))
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
                .border_color(rgba(LINE_ROW))
                .child(text(title.to_owned(), 14.0, 700, INK).flex_1().min_w_0())
                .child(mono_text(version.to_owned(), 11.0, INK_4))
                .child(collapse),
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
        .px(px(TOPBAR_GUTTER))
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
                .child(tracked_text(trail.to_uppercase(), 10.5, 800, INK_4, 1.155))
                .child(text("/", 12.0, 400, INK_MUTED))
                .child(text(title.to_owned(), 16.0, 650, INK)),
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
fn button_base(id: &'static str, label: &str) -> Stateful<Div> {
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
}

pub fn button(id: &'static str, label: &str) -> Stateful<Div> {
    button_base(id, label)
        .hover(|s| s.bg(rgb(SURFACE_3)))
        .focus_visible(|s| s.border_color(rgb(CARMINE)))
        .child(text(label.to_owned(), 13.0, 600, INK))
}

/// Botón principal (claro sobre oscuro, `--orbit-primary-*`).
pub fn primary_button(id: &'static str, label: &str) -> Stateful<Div> {
    button_base(id, label)
        .bg(rgb(0x00f3_eeee))
        .border_color(rgb(0x00f3_eeee))
        .hover(|s| s.bg(rgb(INK)))
        .focus_visible(|s| s.border_color(rgb(CARMINE)))
        .child(text(label.to_owned(), 13.0, 600, INK))
        .text_color(rgb(0x001c_1719))
}

/// Acción principal de acceso; conserva foco y semántica del botón Orbit.
pub fn carmine_button(id: &'static str, label: &str) -> Stateful<Div> {
    button_base(id, label)
        .bg(linear_gradient(
            135.0,
            linear_color_stop(rgb(CARMINE), 0.0),
            linear_color_stop(rgb(CARMINE_DARK), 1.0),
        ))
        .border_color(rgb(CARMINE))
        .hover(|style| style.bg(rgb(CARMINE)))
        .focus_visible(|style| style.border_2().border_color(rgb(INK)))
        .child(text(label.to_owned(), 13.0, 600, INK))
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
