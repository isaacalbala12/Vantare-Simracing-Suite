//! Vantare Rune primitives shared by its widgets; no source, persistence or window creation.
use super::Style;
use rune::{Align, Color, El, Family, LiveText, TextStyle, text};
pub const WHITE: Color = Color {
    r: 1.0,
    g: 1.0,
    b: 1.0,
    a: 1.0,
};
#[derive(Clone, Copy)]
pub enum Face {
    Body,
    Display,
    Mono,
}
pub fn font(
    s: &Style,
    face: Face,
    size: f32,
    height: f32,
    tracking: f32,
    weight: f32,
) -> TextStyle {
    let family = match face {
        Face::Body => "Inter",
        Face::Display => s.fonts.display_family,
        Face::Mono => s.fonts.mono_family,
    };
    TextStyle {
        family: Family::Named(family),
        features: "'tnum' 1",
        line_height: height,
        tracking,
        ..TextStyle::new(size, weight)
    }
}
#[allow(clippy::too_many_arguments)] // A single text primitive mirrors the canonical painter.
pub fn label(
    s: &Style,
    value: &LiveText,
    key: impl Into<String>,
    width: f32,
    height: f32,
    face: Face,
    size: f32,
    weight: f32,
    ink: Color,
    align: Align,
) -> El {
    text(value.get().to_string())
        .key(key)
        .live_text(value)
        .font(font(s, face, size, height, 0.0, weight))
        .color(ink)
        .size(width, height)
        .align(align)
        .truncate_fade_width(0.0)
}
pub fn fixed(s: &Style, value: &str, height: f32, size: f32, ink: Color) -> El {
    text(value)
        .font(font(
            s,
            Face::Body,
            size,
            height,
            0.0,
            s.fonts.regular_weight,
        ))
        .color(ink)
        .h(height)
}
pub fn pill(s: &Style, value: &LiveText, key: impl Into<String>, fill: Color, ink: Color) -> El {
    text(value.get().to_string())
        .key(key)
        .live_text(value)
        .font(font(
            s,
            Face::Body,
            s.fonts.pill,
            s.geometry.pill_height,
            s.fonts.pill_tracking,
            s.fonts.pill_weight,
        ))
        .color(ink)
        .h(s.geometry.pill_height)
        .pl(s.geometry.pill_padding)
        .pr(s.geometry.pill_padding)
        .fill(fill)
        .radius(s.geometry.chip_radius)
}
