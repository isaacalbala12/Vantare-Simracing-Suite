//! Texto común Eficiencia: Inter estática, cifras tabulares y `letter-spacing`.
//!
//! GPUI no tiene `letter-spacing`. Se emula partiendo la linea ya modelada en
//! caracteres con `ShapedLineCursor` (conserva el kerning de la linea entera) y
//! pintando cada trozo desplazado `i * tracking`. CSS suma el espaciado tras
//! cada caracter, incluido el ultimo, y asi se mide el ancho aqui.

use gpui::{
    App, Font, FontFeatures, FontStyle, FontWeight, Hsla, Pixels, Point, ShapedLine, SharedString,
    TextAlign, TextRun, Window, point, px,
};
use std::{
    borrow::Cow,
    cell::{Cell, RefCell},
    collections::HashMap,
    sync::Arc,
};

/// Instancias estaticas generadas por `assets/make-fonts.py`.
const FONTS: [&[u8]; 6] = [
    include_bytes!("../../assets/fonts/Inter-400.ttf"),
    include_bytes!("../../assets/fonts/Inter-500.ttf"),
    include_bytes!("../../assets/fonts/Inter-600.ttf"),
    include_bytes!("../../assets/fonts/Inter-650.ttf"),
    include_bytes!("../../assets/fonts/Inter-700.ttf"),
    include_bytes!("../../assets/fonts/Inter-800.ttf"),
];

pub fn register_fonts(cx: &App) -> Result<(), String> {
    cx.text_system()
        .add_fonts(FONTS.iter().map(|f| Cow::Borrowed(*f)).collect())
        .map_err(|e| format!("fuentes Inter: {e}"))
}

/// Ascenso/descenso de Inter (hhea 1984/494 sobre 2048) redondeados como hace
/// Chrome para `line-height: normal`.
pub fn css_ascent(size: f32) -> f32 {
    (size * 1984.0 / 2048.0).round()
}
pub fn css_descent(size: f32) -> f32 {
    (size * 494.0 / 2048.0).round()
}
pub fn css_normal_line(size: f32) -> f32 {
    css_ascent(size) + css_descent(size)
}

/// Linea de base de un texto de `size` px dentro de una caja de linea
/// `line_height` cuyo borde superior esta en `top`. `LayoutNG` suma al ascenso el
/// suelo del semi-interlineado (`FontHeight::AddLeading`).
pub fn baseline(top: f32, line_height: f32, size: f32) -> f32 {
    top + css_ascent(size) + ((line_height - css_normal_line(size)) / 2.0).floor()
}

#[derive(Clone, Copy, Debug)]
pub struct Ink {
    pub size: f32,
    pub weight: f32,
    /// `letter-spacing` en px.
    pub tracking: f32,
    pub color: Hsla,
}

/// Tipografía con tracking en em, como `letter-spacing` en el CSS del producto.
pub fn ink(size: f32, weight: f32, tracking_em: f32, color: Hsla) -> Ink {
    Ink {
        size,
        weight,
        tracking: tracking_em * size,
        color,
    }
}

/// (texto, tamano, peso, color) -> linea modelada.
type Key = (String, u32, u32, [u32; 4]);

thread_local! {
    /// Esquina del widget en la ventana: los widgets pintan en coordenadas propias
    /// (0, 0) y quien los aloja en una ventana compartida fija aquí su posición.
    static ORIGIN: Cell<(f32, f32)> = const { Cell::new((0.0, 0.0)) };
    static CACHE: RefCell<HashMap<Key, ShapedLine>> = RefCell::new(HashMap::new());
}

fn font(weight: f32) -> Font {
    Font {
        family: format!("Inter W{}", weight as u32).into(),
        features: FontFeatures(Arc::new(vec![("tnum".into(), 1), ("kern".into(), 1)])),
        fallbacks: None,
        weight: FontWeight(400.0),
        style: FontStyle::Normal,
    }
}

fn shape(window: &Window, text: &str, ink: &Ink) -> ShapedLine {
    let color = [
        ink.color.h.to_bits(),
        ink.color.s.to_bits(),
        ink.color.l.to_bits(),
        ink.color.a.to_bits(),
    ];
    let key = (
        text.to_string(),
        ink.size.to_bits(),
        ink.weight.to_bits(),
        color,
    );
    let cached = CACHE.with(|c| c.borrow().get(&key).cloned());
    // El color va en las runs del ShapedLine, asi que forma parte de la clave.
    cached.unwrap_or_else(|| {
        let run = TextRun {
            len: text.len(),
            font: font(ink.weight),
            color: ink.color,
            background_color: None,
            underline: None,
            strikethrough: None,
        };
        let line = window.text_system().shape_line(
            SharedString::from(text.to_string()),
            px(ink.size),
            &[run],
            None,
        );
        CACHE.with(|c| {
            let mut cache = c.borrow_mut();
            if cache.len() > 4096 {
                cache.clear();
            }
            cache.insert(key, line.clone());
        });
        line
    })
}

/// Ancho CSS del texto (incluye el espaciado tras el ultimo caracter).
pub fn width(window: &Window, text: &str, ink: &Ink) -> f32 {
    if text.is_empty() {
        return 0.0;
    }
    let line = shape(window, text, ink);
    f32::from(line.width()) + ink.tracking * text.chars().count() as f32
}

/// Recorta con `…` hasta que el texto quepa en `max` px (text-overflow).
pub fn fit(window: &Window, text: &str, ink: &Ink, max: f32) -> String {
    if width(window, text, ink) <= max + 0.01 {
        return text.to_string();
    }
    let chars: Vec<char> = text.chars().collect();
    for keep in (0..chars.len()).rev() {
        let candidate: String = chars[..keep].iter().collect::<String>() + "…";
        if width(window, &candidate, ink) <= max + 0.01 {
            return candidate;
        }
    }
    "…".to_string()
}

pub fn origin() -> (f32, f32) {
    ORIGIN.with(Cell::get)
}

/// Ejecuta `f` con el origen de pintado en `origin` (px de ventana).
pub fn with_origin<R>(origin: (f32, f32), f: impl FnOnce() -> R) -> R {
    let previous = ORIGIN.with(|o| o.replace(origin));
    let result = f();
    ORIGIN.with(|o| o.set(previous));
    result
}

/// Pinta el texto con la linea de base en `base_y` y su borde izquierdo en `x`.
pub fn draw(window: &mut Window, cx: &mut App, text: &str, x: f32, base_y: f32, ink: &Ink) {
    if text.is_empty() {
        return;
    }
    let (ox, oy) = origin();
    let (x, base_y) = (x + ox, base_y + oy);
    let line = shape(window, text, ink);
    let ascent = f32::from(line.ascent);
    let descent = f32::from(line.descent);
    let line_height = px(ascent + descent);
    let top = base_y - ascent;
    if ink.tracking == 0.0 {
        let _ = line.paint(
            point(px(x), px(top)),
            line_height,
            TextAlign::Left,
            None,
            window,
            cx,
        );
        return;
    }
    let mut cursor = line.cursor();
    for (index, (byte, ch)) in text.char_indices().enumerate() {
        let x0 = f32::from(cursor.x_offset());
        let piece = cursor.take_until(byte + ch.len_utf8());
        let origin: Point<Pixels> = point(px(x + x0 + ink.tracking * index as f32), px(top));
        let _ = piece.paint(origin, line_height, TextAlign::Left, None, window, cx);
    }
}
