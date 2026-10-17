//! Observa órdenes de los fragmentos productivos de texto; cero Window/HWND.
use crate::vantare::{
    paint::{Kit, Label},
    style::Style,
};
use gpui::Hsla;
use vantare_domain::format::Language;

#[derive(Debug)]
pub(crate) struct PaintedText {
    pub value: String,
    pub color: Hsla,
    pub x: f32,
    pub right: Option<f32>,
    pub top: f32,
}

pub(crate) fn observe(paint: impl FnOnce(&mut dyn for<'a> FnMut(Label<'a>))) -> Vec<PaintedText> {
    let mut out = Vec::new();
    paint(&mut |label: Label<'_>| {
        if !label.value.is_empty() {
            out.push(PaintedText {
                value: label.value.to_owned(),
                color: label.ink.color,
                x: label.x,
                right: label.right,
                top: label.top,
            });
        }
    });
    out
}

pub(crate) fn with_kit<R>(width: f32, language: Language, test: impl FnOnce(&Kit<'_>) -> R) -> R {
    let style = Style::compiled();
    test(&Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language,
        width,
    })
}
