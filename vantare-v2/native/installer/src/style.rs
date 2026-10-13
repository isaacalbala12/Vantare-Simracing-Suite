//! Measurements and typefaces from approved installer-r3.html, window #E.
use gpui::{
    AnyElement, App, Background, Bounds, Div, Hsla, IntoElement, PathBuilder, Pixels, Window,
    canvas, div, linear_color_stop, linear_gradient, point, prelude::*, px, rgb, rgba,
};
pub const TEXT: u32 = 0xf5_f5f5;
pub const MUTED: u32 = 0xf5f5_f5a3;
pub const FAINT: u32 = 0xf5f5_f566;
pub const RED: u32 = 0xff_3b3b;
pub fn at(x: f32, y: f32, w: f32, h: f32) -> Div {
    div().absolute().left(px(x)).top(px(y)).w(px(w)).h(px(h))
}
#[allow(clippy::too_many_arguments)] // A fixed rectangle, font and ink are the drawing contract.
pub fn text(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    value: impl Into<gpui::SharedString>,
    font: &'static str,
    sz: f32,
    color: Hsla,
) -> Div {
    at(x, y, w, h)
        .font_family(font)
        .text_size(px(sz))
        .line_height(px(sz * 1.55))
        .text_color(color)
        .overflow_hidden()
        .child(value.into())
}
pub fn body(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    value: impl Into<gpui::SharedString>,
    sz: f32,
    color: u32,
) -> Div {
    text(
        x,
        y,
        w,
        h,
        value,
        "Installer Inter W400",
        sz,
        rgba(color).into(),
    )
    .line_height(px(sz * 1.2))
}
pub fn mono(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    value: impl Into<gpui::SharedString>,
    sz: f32,
    color: u32,
) -> Div {
    text(x, y, w, h, value, "Space Mono", sz, rgba(color).into())
}
pub fn display(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    value: impl Into<gpui::SharedString>,
    sz: f32,
    color: u32,
) -> Div {
    text(x, y, w, h, value, "Rajdhani", sz, rgba(color).into())
        .line_height(px(sz * 1.1))
        .font_weight(gpui::FontWeight::BOLD)
}
pub fn red_gradient() -> Background {
    linear_gradient(
        135.,
        linear_color_stop(rgb(0xff_3b3b), 0.),
        linear_color_stop(rgb(0x9a_0606), 1.),
    )
}
pub fn focus_ring(background: u32) -> Vec<gpui::BoxShadow> {
    vec![
        gpui::BoxShadow::new(px(0.), px(0.), rgb(background).into()).spread_radius(px(2.)),
        gpui::BoxShadow::new(px(0.), px(0.), rgb(RED).into()).spread_radius(px(4.)),
    ]
}
pub fn fonts(cx: &App) -> Result<(), String> {
    cx.text_system()
        .add_fonts(vec![
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Inter-400.ttf")),
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Inter-500.ttf")),
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Inter-600.ttf")),
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Inter-700.ttf")),
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/Rajdhani.ttf")),
            std::borrow::Cow::Borrowed(include_bytes!("../assets/fonts/SpaceMono.ttf")),
        ])
        .map_err(|e| format!("Fuentes del instalador: {e}"))
}

#[derive(Clone, Copy)]
pub enum Icon {
    Check,
    Arrow,
    Chevron,
    Minimize,
    Close,
    Bang,
}
pub fn icon(kind: Icon, x: f32, y: f32, side: f32, color: Hsla) -> AnyElement {
    canvas(
        |_, _, _| (),
        move |bounds, (), window, cx| paint_icon(kind, bounds, color, window, cx),
    )
    .absolute()
    .left(px(x))
    .top(px(y))
    .w(px(side))
    .h(px(side))
    .into_any_element()
}
pub fn paint_icon(
    kind: Icon,
    bounds: Bounds<Pixels>,
    color: Hsla,
    window: &mut Window,
    _cx: &mut App,
) {
    let (scale, points, close): (f32, &[(f32, f32)], bool) = match kind {
        Icon::Check => (16., &[(3., 8.5), (6., 11.5), (13., 4.5)], false),
        Icon::Arrow => (
            16.,
            &[(3., 8.), (13., 8.), (9., 4.), (13., 8.), (9., 12.)],
            false,
        ),
        Icon::Chevron => (10., &[(2., 3.5), (5., 6.5), (8., 3.5)], false),
        Icon::Minimize => (10., &[(1., 5.), (9., 5.)], false),
        Icon::Close => (10., &[(1., 1.), (9., 9.)], false),
        Icon::Bang => (16., &[(8., 2.5), (8., 10.)], false),
    };
    let factor = f32::from(bounds.size.width) / scale;
    let mut path = if close {
        PathBuilder::fill()
    } else {
        PathBuilder::stroke(px(match kind {
            Icon::Chevron | Icon::Minimize | Icon::Close => 1.2,
            Icon::Check | Icon::Bang => {
                if f32::from(bounds.size.width) > 14. {
                    2.2 * factor
                } else {
                    2. * factor
                }
            }
            Icon::Arrow => 1.8 * factor,
        }))
    };
    for (index, (x, y)) in points.iter().enumerate() {
        let p = bounds.origin + point(px(*x * factor), px(*y * factor));
        if index == 0 {
            path.move_to(p);
        } else {
            path.line_to(p);
        }
    }
    if close {
        path.close();
    }
    if let Ok(path) = path.build() {
        window.paint_path(
            path,
            if close {
                linear_gradient(
                    135.,
                    linear_color_stop(rgb(0xff_4d4d), 0.),
                    linear_color_stop(rgb(0x9a_0606), 1.),
                )
            } else {
                color.into()
            },
        );
    }
    if matches!(kind, Icon::Close | Icon::Bang) {
        let mut extra = PathBuilder::stroke(px(1.2));
        let (start, end) = if matches!(kind, Icon::Close) {
            ((9., 1.), (1., 9.))
        } else {
            ((8., 12.6), (8., 13.4))
        };
        extra.move_to(bounds.origin + point(px(start.0 * factor), px(start.1 * factor)));
        extra.line_to(bounds.origin + point(px(end.0 * factor), px(end.1 * factor)));
        if let Ok(path) = extra.build() {
            window.paint_path(path, color);
        }
    }
}
pub fn wordmark() -> AnyElement {
    canvas(
        |_, _, _| (),
        |bounds, (), window, cx| {
            let mut x = bounds.origin.x;
            for character in "VANTARE".chars() {
                let value = character.to_string();
                let run = gpui::TextRun {
                    len: value.len(),
                    font: gpui::Font {
                        weight: gpui::FontWeight::BOLD,
                        ..gpui::font("Rajdhani")
                    },
                    color: rgb(TEXT).into(),
                    background_color: None,
                    underline: None,
                    strikethrough: None,
                };
                let line = window
                    .text_system()
                    .shape_line(value.into(), px(16.), &[run], None);
                let height = line.ascent + line.descent;
                let _ = line.paint(
                    point(x, bounds.origin.y),
                    height,
                    gpui::TextAlign::Left,
                    None,
                    window,
                    cx,
                );
                x += line.width + px(3.2);
            }
        },
    )
    .absolute()
    .left(px(54.))
    .top(px(24.))
    .w(px(160.))
    .h(px(21.))
    .into_any_element()
}
pub fn badge_label() -> AnyElement {
    canvas(
        |_, _, _| (),
        |bounds, (), window, cx| {
            let mut x = bounds.origin.x;
            for character in "RECOMENDADO".chars() {
                let value = character.to_string();
                let run = gpui::TextRun {
                    len: value.len(),
                    font: gpui::font("Installer Inter W700"),
                    color: rgba(0xffb3_b8ff).into(),
                    background_color: None,
                    underline: None,
                    strikethrough: None,
                };
                let line = window
                    .text_system()
                    .shape_line(value.into(), px(10.), &[run], None);
                let _ = line.paint(
                    point(x, bounds.origin.y),
                    px(12.),
                    gpui::TextAlign::Left,
                    None,
                    window,
                    cx,
                );
                x += line.width + px(1.);
            }
        },
    )
    .absolute()
    .left(px(7.))
    .top(px(2.))
    .w(px(91.))
    .h(px(12.))
    .into_any_element()
}
pub fn swatch(x: f32, y: f32, w: f32, h: f32, radius: f32, color: Hsla) -> Div {
    at(x, y, w, h).rounded(px(radius)).bg(color)
}
pub fn text_width(value: &str, font: &str, sz: f32, window: &Window) -> f32 {
    let run = gpui::TextRun {
        len: value.len(),
        font: gpui::font(font),
        color: rgb(TEXT).into(),
        background_color: None,
        underline: None,
        strikethrough: None,
    };
    f32::from(
        window
            .text_system()
            .shape_line(value.to_owned().into(), px(sz), &[run], None)
            .width,
    )
}
