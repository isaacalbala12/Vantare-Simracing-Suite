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
const FONTS: [&[u8]; 7] = [
    include_bytes!("../../assets/fonts/Inter-400.ttf"),
    include_bytes!("../../assets/fonts/Inter-500.ttf"),
    include_bytes!("../../assets/fonts/Inter-600.ttf"),
    include_bytes!("../../assets/fonts/Inter-650.ttf"),
    include_bytes!("../../assets/fonts/Inter-700.ttf"),
    include_bytes!("../../assets/fonts/Inter-750.ttf"),
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
pub struct TextInk<'a> {
    pub family: Option<&'a str>,
    pub size: f32,
    pub weight: f32,
    /// `letter-spacing` en px.
    pub tracking: f32,
    pub color: Hsla,
}

/// Los consumidores existentes conservan el tipo estático y Copy.
pub type Ink = TextInk<'static>;

/// Tipografía con tracking en em, como `letter-spacing` en el CSS del producto.
pub fn ink(size: f32, weight: f32, tracking_em: f32, color: Hsla) -> Ink {
    Ink {
        family: None,
        size,
        weight,
        tracking: tracking_em * size,
        color,
    }
}

/// Claves numéricas por tipografía/color. Texto y familia se consultan prestados.
type Key = (u32, u32, [u32; 4]);
type Lines = HashMap<Key, HashMap<String, ShapedLine>>;
#[derive(Default)]
struct ShapeCache {
    fallback: Lines,
    families: HashMap<String, Lines>,
    count: usize,
}
impl ShapeCache {
    fn get(&self, family: Option<&str>, key: &Key, text: &str) -> Option<&ShapedLine> {
        let lines = match family {
            None => &self.fallback,
            Some(family) => self.families.get(family)?,
        };
        lines.get(key)?.get(text)
    }
    fn insert(&mut self, family: Option<&str>, key: Key, text: &str, line: ShapedLine) {
        if self.count > 4096 {
            *self = Self::default();
        }
        let lines = match family {
            None => &mut self.fallback,
            Some(family) => self.families.entry(family.to_owned()).or_default(),
        };
        if lines
            .entry(key)
            .or_default()
            .insert(text.to_owned(), line)
            .is_none()
        {
            self.count += 1;
        }
    }
}

thread_local! {
    /// Esquina del widget en la ventana: los widgets pintan en coordenadas propias
    /// (0, 0) y quien los aloja en una ventana compartida fija aquí su posición.
    static ORIGIN: Cell<(f32, f32)> = const { Cell::new((0.0, 0.0)) };
    static CACHE: RefCell<ShapeCache> = RefCell::new(ShapeCache::default());
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

fn shape(window: &Window, text: &str, ink: &TextInk<'_>) -> ShapedLine {
    let color = [
        ink.color.h.to_bits(),
        ink.color.s.to_bits(),
        ink.color.l.to_bits(),
        ink.color.a.to_bits(),
    ];
    let key = (ink.size.to_bits(), ink.weight.to_bits(), color);
    let cached = CACHE.with(|c| c.borrow().get(ink.family, &key, text).cloned());
    // El color va en las runs del ShapedLine, asi que forma parte de la clave.
    cached.unwrap_or_else(|| {
        let run = TextRun {
            len: text.len(),
            font: {
                let mut font = font(ink.weight);
                if let Some(family) = &ink.family {
                    font.family = (*family).to_owned().into();
                    font.weight = FontWeight(ink.weight);
                }
                font
            },
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
            c.borrow_mut().insert(ink.family, key, text, line.clone());
        });
        line
    })
}

/// Ancho CSS del texto (incluye el espaciado tras el ultimo caracter).
pub fn width(window: &Window, text: &str, ink: &TextInk<'_>) -> f32 {
    if text.is_empty() {
        return 0.0;
    }
    let line = shape(window, text, ink);
    f32::from(line.width()) + ink.tracking * text.chars().count() as f32
}

/// Recorta con `…` hasta que el texto quepa en `max` px (text-overflow).
pub fn fit(window: &Window, text: &str, ink: &TextInk<'_>, max: f32) -> String {
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

/// Texto del kit en ventanas comunes o dentro de un widget escalado.
pub trait TextWindow {
    fn for_text(&mut self) -> (&mut Window, f32);
    fn for_text_axes(&mut self) -> (&mut Window, (f32, f32)) {
        let (window, scale) = self.for_text();
        (window, (scale, scale))
    }
}

impl TextWindow for Window {
    fn for_text(&mut self) -> (&mut Window, f32) {
        (self, 1.0)
    }
}

impl TextWindow for super::preview::PaintWindow<'_> {
    fn for_text(&mut self) -> (&mut Window, f32) {
        let scale = self.preview_scale();
        (self, scale)
    }
    fn for_text_axes(&mut self) -> (&mut Window, (f32, f32)) {
        let scale = self.preview_axes();
        (self, scale)
    }
}

/// Pinta el texto con la linea de base en `base_y` y su borde izquierdo en `x`.
pub fn draw(
    window: &mut impl TextWindow,
    cx: &mut App,
    text: &str,
    x: f32,
    base_y: f32,
    ink: &TextInk<'_>,
) {
    if text.is_empty() {
        return;
    }
    let (ox, oy) = origin();
    let (window, (scale_x, scale)) = window.for_text_axes();
    let scaled_ink = TextInk {
        size: ink.size * scale,
        tracking: ink.tracking * scale,
        ..*ink
    };
    let ink = if scale == 1.0 { ink } else { &scaled_ink };
    let (x, base_y) = (x * scale_x + ox, base_y * scale + oy);
    let line = shape(window, text, ink);
    let ascent = f32::from(line.ascent);
    let descent = f32::from(line.descent);
    let line_height = px(ascent + descent);
    let top = base_y - ascent;
    if ink.tracking == 0.0 && scale_x == scale {
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
        let origin: Point<Pixels> = point(
            px(x + (x0 + ink.tracking * index as f32) * scale_x / scale),
            px(top),
        );
        let _ = piece.paint(origin, line_height, TextAlign::Left, None, window, cx);
    }
}
