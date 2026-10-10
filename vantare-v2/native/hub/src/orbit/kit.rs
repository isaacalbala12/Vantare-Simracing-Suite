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
/// Selector pendiente: muestra el valor real sin ofrecer opciones inexistentes.
pub fn pending_select(
    id: &'static str,
    label: &str,
    value: &str,
    width: f32,
    reason: &str,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = skin(cx);
    div()
        .id(id)
        .role(gpui::Role::Group)
        .aria_label(format!("{label}: {value}"))
        .aria_value(value.to_owned())
        .aria_description(reason.to_owned())
        .tab_stop(false)
        .cursor_default()
        .w(px(width))
        .h(px(36.0))
        .flex_none()
        .px(px(12.0))
        .flex()
        .items_center()
        .gap(px(8.0))
        .rounded(px(skin.radius.md))
        .border_1()
        .border_color(super::alpha(skin.line1))
        .bg(rgb(skin.l2))
        .child(
            super::text(value.to_owned(), 13.0, 500, skin.text2, cx)
                .flex_1()
                .min_w_0()
                .whitespace_nowrap()
                .overflow_hidden()
                .text_ellipsis(),
        )
        .child(icon("i-chevron", 12.0, skin.text3).with_transformation(
            gpui::Transformation::rotate(gpui::radians(std::f32::consts::FRAC_PI_2)),
        ))
}
/// Sección del inspector acoplado R10.2: separador, sin tarjeta adicional.
pub fn inspector_section(title: &str, icon_name: &'static str, cx: &gpui::App) -> Div {
    div()
        .flex_none()
        .min_w_0()
        .flex()
        .flex_col()
        .p(px(16.0))
        .gap(px(10.0))
        .border_b_1()
        .border_color(super::alpha(skin(cx).line1))
        .child(section_header(title, icon_name, None, cx))
}
/// Celda de rejilla/cruceta R10.10; el consumidor conecta la acción documental.
pub fn position_cell(
    id: impl Into<gpui::ElementId>,
    label: &str,
    width: f32,
    height: f32,
    selected: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    super::button(id, label, cx)
        .w(px(width))
        .h(px(height))
        .min_w_0()
        .p(px(0.0))
        .flex_none()
        .justify_center()
        .rounded(px(skin(cx).radius.sm))
        .aria_selected(selected)
        .when(selected, |button| button.bg(rgb(skin(cx).accent)))
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
    icon_button_face(id, icon_name, label, size, cx)
        .role(gpui::Role::Button)
        .tab_index(0)
        .cursor_pointer()
        .hover(move |s| s.bg(super::alpha(hover)))
        .focus_visible(|s| s.shadow(focus_ring(cx)))
        .tooltip(move |_, cx| cx.new(|_| super::Tooltip(tip.clone())).into())
}

/// Icono de una acción inexistente: conserva su cara, sin prometer interacción.
pub fn pending_icon_button(
    id: impl Into<gpui::ElementId>,
    icon_name: &'static str,
    label: &str,
    size: f32,
    reason: &str,
    cx: &gpui::App,
) -> Stateful<Div> {
    super::pending_face(icon_button_face(id, icon_name, label, size, cx), reason)
}

fn icon_button_face(
    id: impl Into<gpui::ElementId>,
    icon_name: &'static str,
    label: &str,
    size: f32,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = skin(cx);
    div()
        .id(id)
        .aria_label(label.to_owned())
        .size(px(size))
        .flex_none()
        .relative()
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(skin.radius.sm))
        .child(icon(icon_name, (size * 0.62).round(), skin.text3))
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

/// Wordmark oficial C2: trazos embebidos, teñidos por el tema.
pub fn wordmark(cx: &gpui::App) -> Div {
    div().flex_none().child(
        gpui::svg()
            .path("brand/wordmark.svg")
            .w(px(14.0 * 5235.3 / 687.2))
            .h(px(14.0))
            .text_color(rgb(skin(cx).text1)),
    )
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

/// Superficie del hero R9.1, compartida por Inicio y escaparates.
pub fn hero_surface(cx: &gpui::App) -> Div {
    let skin = skin(cx);
    super::neo_card(cx)
        .relative()
        .overflow_hidden()
        .bg(ramp(skin.hero, 118.0))
        .border_color(super::alpha(skin.hero_ring))
        .shadow(vec![kit_shadow(skin.hero_light, 1.0, 0.0, 0.0, true)])
        .child(
            div()
                .absolute()
                .inset_0()
                .bg(ramp_alpha(skin.hero_wash, 160.0)),
        )
        .child(
            div().absolute().inset_0().child(
                gpui::canvas(
                    |_, _, _| (),
                    |bounds, (), window, _| {
                        let width = f32::from(bounds.size.width);
                        let height = f32::from(bounds.size.height);
                        let mut path = gpui::PathBuilder::stroke(px(1.0));
                        let mut x = -height;
                        while x < width {
                            path.move_to(
                                bounds.origin
                                    + gpui::point(px(x.max(0.0)), px(height - (-x).max(0.0))),
                            );
                            path.line_to(
                                bounds.origin
                                    + gpui::point(
                                        px((x + height).min(width)),
                                        px((x + height - width).max(0.0)),
                                    ),
                            );
                            x += 12.0;
                        }
                        if let Ok(path) = path.build() {
                            window.paint_path(path, gpui::rgba(0xffff_ff12));
                        }
                    },
                )
                .size_full(),
            ),
        )
}
/// Cadena de aplicaciones en baldosas (§4). Colores de marca independientes del tema.
pub fn app_tile(id: &str, name: &str, cx: &gpui::App) -> Div {
    let (label, colors) = match id {
        "lmu" => ("LMU", [0x002f_6ad8, 0x0012_2e6a]),
        "crewchief" => ("CC", [0x00e9_852a, 0x008f_450b]),
        "simhub" => ("SH", [0x008a_4ce0, 0x0040_207a]),
        "obs" => ("OBS", [0x005a_5d64, 0x0026_272b]),
        "spotify" => ("SP", [0x0022_c35d, 0x000e_6b30]),
        "discord" => ("DC", [0x0068_73f5, 0x002e_3699]),
        "custom:vantare" => ("V", [0x00e3_434e, 0x008e_1823]),
        _ => (name, [0x003a_3a40, 0x0025_2529]),
    };
    div()
        .flex_1()
        .min_w_0()
        .h(px(28.0))
        .rounded(px(4.0))
        .flex()
        .items_center()
        .justify_center()
        .overflow_hidden()
        .bg(super::gradient(colors, 135.0))
        .child(
            super::text(label.to_owned(), 10.0, 600, 0x00ff_ffff, cx)
                .whitespace_nowrap()
                .text_ellipsis()
                .overflow_hidden(),
        )
}
/// Baldosa de marca compartida por perfiles, cadenas y el catálogo. Sin acceso al motor.
pub fn app_badge(id: &str, name: &str, size: f32, cx: &gpui::App) -> Div {
    let (glyph, colors) = match id {
        "lmu" => ("v-helmet", [0x002f_6ad8, 0x0012_2e6a]),
        "crewchief" => ("headset", [0x00e9_852a, 0x008f_450b]),
        "simhub" => ("v-sliders", [0x008a_4ce0, 0x0040_207a]),
        "obs" => ("v-camera", [0x005a_5d64, 0x0026_272b]),
        "spotify" => ("v-music", [0x0022_c35d, 0x000e_6b30]),
        "discord" => ("v-chat", [0x0068_73f5, 0x002e_3699]),
        "custom:vantare" => ("mark", [0x00e3_434e, 0x008e_1823]),
        _ => ("", [0x003a_3a40, 0x0025_2529]),
    };
    let content = if glyph.is_empty() {
        super::text(
            name.chars().next().unwrap_or('?').to_string(),
            size * 0.4,
            600,
            0x00ff_ffff,
            cx,
        )
    } else {
        div().child(super::icon(glyph, size * 0.48, 0x00ff_ffff))
    };
    div()
        .size(px(size))
        .flex_none()
        .rounded(px(size * 0.25))
        .flex()
        .items_center()
        .justify_center()
        .bg(super::gradient(colors, 135.0))
        .child(content)
}

/// Esqueleto estático: no crea contenido ni simula porcentajes de carga.
pub fn skeleton(width: f32, height: f32, cx: &gpui::App) -> Div {
    div()
        .w(gpui::relative(width))
        .h(px(height))
        .flex_none()
        .rounded(px(skin(cx).radius.sm))
        .bg(rgb(skin(cx).l3))
}
fn circuit_key(name: Option<&str>) -> Option<&'static str> {
    let Some(name) = name else {
        return Some("lemans_h");
    };
    let name = name.to_lowercase();
    [
        ("le mans", "lemans_h"),
        ("sarthe", "lemans_h"),
        ("lemans", "lemans_h"),
        ("spa", "spa_h"),
        ("monza", "monza_h"),
        ("bahrain", "bahrain"),
        ("bahréin", "bahrain"),
        ("imola", "imola"),
        ("portim", "portimao"),
        ("interlagos", "interlagos"),
        ("cota", "cota"),
        ("americas", "cota"),
        ("losail", "losail"),
        ("lusail", "losail"),
        ("paul ricard", "paulricard"),
        ("barcelona", "barcelona"),
        ("catalunya", "barcelona"),
    ]
    .into_iter()
    .find_map(|(alias, key)| {
        let matches = if matches!(alias, "spa" | "cota") {
            name.split(|c: char| !c.is_alphanumeric())
                .any(|part| part == alias)
        } else {
            name.contains(alias)
        };
        matches.then_some(key)
    })
}
/// Trazado real del recurso R9.3. Le Mans horizontal es decoración de reposo;
/// jamás dibuja posición de coche/meta sin un contrato de posición de sesión.
pub fn circuit(name: Option<&str>, cx: &gpui::App) -> Div {
    circuit_ink(name, false, cx)
}
/// Circuito decorativo de portada, sin sesión ni marcadores.
pub fn cover_circuit(cx: &gpui::App) -> Div {
    circuit_ink(None, true, cx)
}
#[derive(Debug)]
struct Circuit {
    viewbox: [f32; 4],
    points: Vec<[f32; 2]>,
}
fn parse_circuit(track: &[String; 2]) -> Result<Circuit, String> {
    let numbers = |text: &str| -> Result<Vec<f32>, String> {
        text.split_whitespace()
            .map(|n| n.parse::<f32>().map_err(|error| error.to_string()))
            .collect()
    };
    let viewbox: [f32; 4] = numbers(&track[0])?
        .try_into()
        .map_err(|_| "viewbox requiere cuatro coordenadas")?;
    if !viewbox.iter().all(|v| v.is_finite()) || viewbox[2] <= 0.0 || viewbox[3] <= 0.0 {
        return Err("viewbox no finito o vacío".into());
    }
    let path = track[1]
        .strip_prefix('M')
        .and_then(|path| path.strip_suffix('Z'))
        .ok_or("trazado no cerrado")?;
    let values = numbers(path)?;
    if values.len() < 6 || !values.len().is_multiple_of(2) || !values.iter().all(|v| v.is_finite())
    {
        return Err("coordenadas incompletas o no finitas".into());
    }
    Ok(Circuit {
        viewbox,
        points: values
            .chunks_exact(2)
            .map(|pair| [pair[0], pair[1]])
            .collect(),
    })
}
fn circuit_tracks() -> &'static std::collections::BTreeMap<String, Circuit> {
    static TRACKS: std::sync::OnceLock<std::collections::BTreeMap<String, Circuit>> =
        std::sync::OnceLock::new();
    TRACKS.get_or_init(|| {
        let raw: std::collections::BTreeMap<String, [String; 2]> =
            serde_json::from_str(include_str!("../../assets/tracks/tracks.json"))
                .expect("recurso validado por tests");
        raw.into_iter()
            .map(|(key, track)| {
                (
                    key,
                    parse_circuit(&track).expect("circuito validado por tests"),
                )
            })
            .collect()
    })
}
fn circuit_ink(name: Option<&str>, neutral: bool, cx: &gpui::App) -> Div {
    let Some(track) = circuit_key(name).and_then(|key| circuit_tracks().get(key)) else {
        return div();
    };
    let viewbox = track.viewbox;
    let points = &track.points;
    let strokes = [
        (10.0, skin(cx).accent << 8 | 0x1a),
        (
            2.5,
            if neutral {
                skin(cx).text1 << 8 | 0x66
            } else {
                skin(cx).accent_bright << 8 | 0x40
            },
        ),
    ];
    gpui::div().child(
        gpui::canvas(
            |_, _, _| (),
            move |bounds, (), window, _| {
                let scale = (f32::from(bounds.size.width) / viewbox[2])
                    .min(f32::from(bounds.size.height) / viewbox[3]);
                let origin = gpui::point(
                    bounds.origin.x + (bounds.size.width - px(viewbox[2] * scale)) / 2.0,
                    bounds.origin.y + (bounds.size.height - px(viewbox[3] * scale)) / 2.0,
                );
                for (stroke, color) in strokes {
                    let mut path = gpui::PathBuilder::stroke(px(stroke));
                    for (index, point) in points.iter().enumerate() {
                        let point = origin
                            + gpui::point(
                                px((point[0] - viewbox[0]) * scale),
                                px((point[1] - viewbox[1]) * scale),
                            );
                        if index == 0 {
                            path.move_to(point);
                        } else {
                            path.line_to(point);
                        }
                    }
                    path.close();
                    if let Ok(path) = path.build() {
                        window.paint_path(path, gpui::rgba(color));
                    }
                }
            },
        )
        .size_full(),
    )
}

pub fn palette_card(
    index: usize,
    palette: super::theme::Palette,
    active: bool,
    adapt: super::Adapt,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    use super::skin::Skin;
    let orb = |skin: Skin| {
        div()
            .size(px(if adapt.show_notes() { 26.0 } else { 24.0 }))
            .flex_none()
            .rounded_full()
            .border_1()
            .border_color(super::tint(0x00ff_ffff, 0.14))
            .bg(linear_gradient(
                135.0,
                linear_color_stop(rgb(skin.accent), 0.0),
                linear_color_stop(rgb(skin.base), 1.0),
            ))
    };
    super::neo_card(cx)
        .id(("settings-palette-card", index))
        .role(gpui::Role::Button)
        .aria_label(palette.label())
        .aria_selected(active)
        .tab_stop(false)
        .flex_row()
        .items_center()
        .justify_between()
        .gap(px(6.0))
        .px(px(14.0))
        .py(px(if adapt.show_optional() { 15.0 } else { 12.0 }))
        .child(super::text(palette.label(), 13.0, 500, super::ink(cx), cx))
        .child(
            div()
                .flex()
                .gap(px(6.0))
                .child(orb(Skin::resolve(palette, super::theme::Scheme::Light)))
                .child(orb(Skin::resolve(palette, super::theme::Scheme::Dark))),
        )
        .when(active, |card| card.shadow(super::selection_ring(cx)))
        .aria_description("Tema persistido en los ajustes locales de apariencia")
}

/// Grupo numerado R9.2: título horizontal fuera de la superficie.
pub fn settings_group(number: usize, title: &str, body: impl IntoElement, cx: &gpui::App) -> Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .min_h_0()
        .gap(px(8.0))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(10.0))
                .child(meta(
                    &format!("{number:02}"),
                    11.0,
                    skin(cx).accent_bright,
                    cx,
                ))
                .child(caps(title, 15.0, skin(cx).text2, cx))
                .child(div().flex_1().h(px(1.0)).bg(super::alpha(skin(cx).line2))),
        )
        .child(body)
}

/// Tarjeta de esquema R10.1; Sistema combina ambas miniaturas.
pub fn scheme_card(
    index: usize,
    scheme: super::theme::Scheme,
    active: bool,
    adapt: super::Adapt,
    cx: &gpui::App,
) -> Stateful<Div> {
    let label = match scheme {
        super::theme::Scheme::System => "Sistema",
        super::theme::Scheme::Light => "Claro",
        super::theme::Scheme::Dark => "Oscuro",
    };
    let preview = |light: bool| {
        let theme = super::skin::Skin::resolve(
            skin_palette(cx),
            if light {
                super::theme::Scheme::Light
            } else {
                super::theme::Scheme::Dark
            },
        );
        div()
            .flex_1()
            .h(px(if adapt.height >= 1000.0 {
                88.0
            } else if adapt.show_optional() {
                64.0
            } else {
                44.0
            }))
            .flex()
            .bg(rgb(theme.base))
            .child(div().w(gpui::relative(0.22)).h_full().bg(rgb(theme.l1)))
            .child(
                div()
                    .flex_1()
                    .p(px(8.0))
                    .flex()
                    .flex_col()
                    .gap(px(6.0))
                    .child(div().h(px(5.0)).w_full().rounded(px(2.0)).bg(rgb(theme.l3)))
                    .child(
                        div()
                            .flex_1()
                            .w_full()
                            .rounded(px(4.0))
                            .bg(super::ramp(theme.neo, 180.0)),
                    )
                    .child(
                        div()
                            .h(px(8.0))
                            .w(px(28.0))
                            .rounded(px(3.0))
                            .bg(rgb(theme.accent)),
                    ),
            )
    };
    super::button(("settings-scheme", index), "", cx)
        .aria_label(label)
        .flex_1()
        .min_w_0()
        .h(px(if adapt.height >= 1000.0 {
            148.0
        } else if adapt.show_optional() {
            124.0
        } else {
            92.0
        }))
        .flex_col()
        .p(px(10.0))
        .gap(px(10.0))
        .aria_selected(active)
        .child(
            div()
                .flex()
                .w_full()
                .overflow_hidden()
                .rounded(px(skin(cx).radius.sm))
                .child(preview(scheme != super::theme::Scheme::Dark))
                .when(scheme == super::theme::Scheme::System, |row| {
                    row.child(preview(false))
                }),
        )
        .child(super::text(label, 14.0, 500, super::ink(cx), cx))
        .when(active, |card| card.shadow(super::selection_ring(cx)))
}

fn skin_palette(cx: &gpui::App) -> super::theme::Palette {
    cx.global::<super::theme::Theme>().palette
}

pub const APPEARANCE_TRACK_WIDTH: f32 = 176.0;
pub const APPEARANCE_THUMB_SIZE: f32 = 14.0;
pub const APPEARANCE_VALUE_OFFSET: f32 = 57.0;

pub fn appearance_slider(
    value: f32,
    min: f32,
    max: f32,
    label: &'static str,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    let fraction = ((value - min) / (max - min)).clamp(0.0, 1.0);
    let fill =
        APPEARANCE_THUMB_SIZE / 2.0 + (APPEARANCE_TRACK_WIDTH - APPEARANCE_THUMB_SIZE) * fraction;
    div()
        .id(if label == "Contraste" {
            "settings-contrast-slider"
        } else {
            "settings-glass-slider"
        })
        .role(gpui::Role::Slider)
        .aria_label(label)
        .w(px(APPEARANCE_TRACK_WIDTH + APPEARANCE_VALUE_OFFSET))
        .flex()
        .flex_none()
        .items_center()
        .gap(px(12.0))
        .child(
            div()
                .w(px(45.0))
                .flex_none()
                .text_right()
                .whitespace_nowrap()
                .child(super::text(
                    format!("{value:.0}%"),
                    16.0,
                    400,
                    super::ink_2(cx),
                    cx,
                )),
        )
        .child(
            div()
                .relative()
                .w(px(APPEARANCE_TRACK_WIDTH))
                .flex_none()
                .h(px(20.0))
                .child(
                    div()
                        .absolute()
                        .left_0()
                        .top(px(7.0))
                        .w(px(APPEARANCE_TRACK_WIDTH))
                        .h(px(6.0))
                        .rounded(px(3.0))
                        .bg(rgb(super::primary_bg(cx))),
                )
                .child(
                    div()
                        .absolute()
                        .left_0()
                        .top(px(7.0))
                        .w(px(fill))
                        .h(px(6.0))
                        .rounded(px(3.0))
                        .bg(rgb(super::skin(cx).accent)),
                )
                .child(
                    div()
                        .absolute()
                        .left(px(fill - APPEARANCE_THUMB_SIZE / 2.0))
                        .top(px(2.0))
                        .size(px(APPEARANCE_THUMB_SIZE))
                        .rounded_full()
                        .bg(rgb(super::skin(cx).accent)),
                ),
        )
}

#[cfg(test)]
mod resource_tests {
    #[test]
    #[ignore = "Medición local explícita; sin umbral temporal en gates"]
    fn measure_circuit_parse_lookup_and_document_clone() {
        use std::{hint::black_box, time::Instant};
        let raw: std::collections::BTreeMap<String, [String; 2]> =
            serde_json::from_str(include_str!("../../assets/tracks/tracks.json")).unwrap();
        let runs = 10_000;
        let started = Instant::now();
        for _ in 0..runs {
            black_box(super::parse_circuit(black_box(&raw["lemans_h"])).unwrap());
        }
        println!(
            "parse_us_per_call={:.3}",
            started.elapsed().as_secs_f64() * 1e6 / f64::from(runs)
        );
        let tracks = super::circuit_tracks();
        let started = Instant::now();
        for _ in 0..runs {
            black_box(&black_box(tracks)["lemans_h"]);
        }
        println!(
            "lookup_us_per_call={:.3}",
            started.elapsed().as_secs_f64() * 1e6 / f64::from(runs)
        );
        for count in [4, 18] {
            let layout = vantare_ui::layout::Layout {
                instances: (0..count)
                    .map(|index| {
                        let kind = vantare_ui::Kind::ALL[index % vantare_ui::Kind::ALL.len()];
                        vantare_ui::layout::Instance {
                            geometry: vantare_ui::geometry::Geometry::default(),
                            id: kind.name().to_owned(),
                            x: 0.0,
                            y: 0.0,
                            visible: true,
                            show_in: vantare_ui::session::ShowIn::default(),
                            opacity: 1.0,
                            settings: vantare_ui::Settings::default_for(kind),
                        }
                    })
                    .collect(),
                ..Default::default()
            };
            let started = Instant::now();
            for _ in 0..runs {
                black_box(black_box(&layout).clone());
            }
            println!(
                "layout_clone_{count}_us_per_call={:.3}",
                started.elapsed().as_secs_f64() * 1e6 / f64::from(runs)
            );
        }
    }

    #[test]
    fn parsed_resources_are_shared_and_malformed_paths_are_rejected() {
        let first = &super::circuit_tracks()["lemans_h"];
        let second = &super::circuit_tracks()["lemans_h"];
        assert!(std::ptr::eq(first.points.as_ptr(), second.points.as_ptr()));
        for (key, track) in super::circuit_tracks() {
            assert!(track.points.len() >= 3, "{key}");
        }
        for raw in [
            ["0 0 NaN 10", "M0 0 1 1 2 2Z"],
            ["0 0 10 10", "M0 0 1Z"],
            ["0 0 10 10", "M0 0 1 1 2 2"],
        ] {
            assert!(super::parse_circuit(&raw.map(str::to_owned)).is_err());
        }
    }

    #[test]
    fn session_track_uses_real_outline_and_unknown_never_becomes_le_mans() {
        assert_eq!(super::circuit_key(None), Some("lemans_h"));
        assert_eq!(super::circuit_key(Some("Spa-Francorchamps")), Some("spa_h"));
        assert_eq!(
            super::circuit_key(Some("Autodromo Nazionale Monza")),
            Some("monza_h")
        );
        assert_eq!(super::circuit_key(Some("Circuito desconocido")), None);
        assert_eq!(
            super::circuit_key(Some("Barcelona (Spain)")),
            Some("barcelona")
        );
        assert_eq!(super::circuit_key(Some("Spain")), None);
    }
    #[test]
    fn all_real_circuits_have_valid_closed_coordinates() {
        let tracks: std::collections::BTreeMap<String, [String; 2]> =
            serde_json::from_str(include_str!("../../assets/tracks/tracks.json")).expect("JSON");
        assert!(tracks.len() >= 11 && tracks.contains_key("lemans_h"));
        for track in tracks.values() {
            let box_values: Vec<f32> = track[0]
                .split_whitespace()
                .map(|s| s.parse().expect("viewbox"))
                .collect();
            assert_eq!(box_values.len(), 4);
            assert!(box_values[2] > 0.0 && box_values[3] > 0.0);
            assert!(track[1].starts_with('M') && track[1].ends_with('Z'));
            let values: Vec<f32> = track[1]
                .trim_start_matches('M')
                .trim_end_matches('Z')
                .split_whitespace()
                .map(|s| s.parse().expect("coordenada"))
                .collect();
            assert!(values.len() > 4 && values.len().is_multiple_of(2));
            assert!(values.iter().all(|v| v.is_finite()));
        }
    }
}
