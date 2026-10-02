//! Tipografía de lienzos del Hub. Inter delega en el pintado de paridad existente;
//! las fuentes elegidas usan el shaping de GPUI. Los widgets no importan este módulo.
use super::theme::{InterfaceFont, Theme};
use gpui::{App, FontWeight, ShapedLine, TextRun, Window, point, px};
use vantare_ui::efficiency::text as original;
pub use vantare_ui::efficiency::text::{Ink, baseline, ink, with_origin};

fn shape(window: &Window, text: &str, ink: &Ink, cx: &App) -> ShapedLine {
    let family = match cx.global::<Theme>().interface_font {
        InterfaceFont::Inter => "Inter W400",
        InterfaceFont::Segoe => "Segoe UI",
        InterfaceFont::Arial => "Arial",
    };
    let run = TextRun {
        len: text.len(),
        font: gpui::Font {
            weight: FontWeight(ink.weight),
            ..gpui::font(family)
        },
        color: ink.color,
        background_color: None,
        underline: None,
        strikethrough: None,
    };
    window
        .text_system()
        .shape_line(text.to_owned().into(), px(ink.size), &[run], None)
}

#[allow(clippy::cast_precision_loss)] // Número de caracteres de rótulos de interfaz acotados.
pub fn width(window: &Window, text: &str, ink: &Ink, cx: &App) -> f32 {
    if cx.global::<Theme>().interface_font == InterfaceFont::Inter {
        return original::width(window, text, ink);
    }
    if text.is_empty() {
        return 0.0;
    }
    f32::from(shape(window, text, ink, cx).width()) + ink.tracking * text.chars().count() as f32
}
pub fn fit(window: &Window, text: &str, ink: &Ink, max: f32, cx: &App) -> String {
    if cx.global::<Theme>().interface_font == InterfaceFont::Inter {
        return original::fit(window, text, ink, max);
    }
    if width(window, text, ink, cx) <= max + 0.01 {
        return text.to_owned();
    }
    let chars: Vec<char> = text.chars().collect();
    for keep in (0..chars.len()).rev() {
        let candidate = chars[..keep].iter().collect::<String>() + "…";
        if width(window, &candidate, ink, cx) <= max + 0.01 {
            return candidate;
        }
    }
    "…".into()
}
#[allow(clippy::cast_precision_loss)] // Índices de textos acotados.
pub fn draw(window: &mut Window, cx: &mut App, text: &str, x: f32, base_y: f32, ink: &Ink) {
    if cx.global::<Theme>().interface_font == InterfaceFont::Inter {
        original::draw(window, cx, text, x, base_y, ink);
        return;
    }
    if text.is_empty() {
        return;
    }
    let (ox, oy) = original::origin();
    let line = shape(window, text, ink, cx);
    let ascent = f32::from(line.ascent);
    let height = px(ascent + f32::from(line.descent));
    if ink.tracking == 0.0 {
        if let Err(error) = line.paint(
            point(px(x + ox), px(base_y + oy - ascent)),
            height,
            gpui::TextAlign::Left,
            None,
            window,
            cx,
        ) {
            eprintln!("pintar texto del Hub: {error}");
        }
        return;
    }
    let mut cursor = line.cursor();
    for (index, (byte, ch)) in text.char_indices().enumerate() {
        let advance = f32::from(cursor.x_offset());
        let piece = cursor.take_until(byte + ch.len_utf8());
        if let Err(error) = piece.paint(
            point(
                px(x + ox + advance + ink.tracking * index as f32),
                px(base_y + oy - ascent),
            ),
            height,
            gpui::TextAlign::Left,
            None,
            window,
            cx,
        ) {
            eprintln!("pintar texto del Hub: {error}");
        }
    }
}
