//! Campo de una línea con entrada GPUI/IME, selección por teclado y UTF-16.
use gpui::{
    Bounds, Context, ElementInputHandler, EntityInputHandler, FocusHandle, IntoElement, Pixels,
    Point, Render, UTF16Selection, Window, canvas, div, prelude::*, rgb,
};
use std::ops::Range;
use vantare_ui::efficiency::tokens;

// ponytail: campo de 16 KiB y cursor por caracteres; ratón/grafemas requieren el editor común futuro.
pub struct Input {
    pub value: String,
    label: &'static str,
    focus: FocusHandle,
    selection: Range<usize>,
    marked: Option<Range<usize>>,
}
impl Input {
    pub fn new(value: String, label: &'static str, cx: &mut Context<Self>) -> Self {
        let end = value.len();
        Self {
            value,
            label,
            focus: cx.focus_handle(),
            selection: end..end,
            marked: None,
        }
    }
    fn byte_offset(&self, utf16: usize) -> usize {
        byte_offset(&self.value, utf16)
    }
    fn range_from_utf16(&self, range: Range<usize>) -> Range<usize> {
        self.byte_offset(range.start)..self.byte_offset(range.end.max(range.start))
    }
    fn to_utf16(&self, range: Range<usize>) -> Range<usize> {
        self.value[..range.start].encode_utf16().count()
            ..self.value[..range.end].encode_utf16().count()
    }
    fn replace(&mut self, range: Option<Range<usize>>, text: &str) {
        let range = range
            .map(|range| self.range_from_utf16(range))
            .or(self.marked.clone())
            .unwrap_or(self.selection.clone());
        let text = text.replace(['\r', '\n', '\0'], "");
        if self.value.len() - (range.end - range.start) + text.len() > 16384 {
            return;
        }
        self.value.replace_range(range.clone(), &text);
        let end = range.start + text.len();
        self.selection = end..end;
        self.marked = None;
    }
    fn key(&mut self, event: &gpui::KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        let key = &event.keystroke;
        let ctrl = key.modifiers.control || key.modifiers.platform;
        match key.key.as_str() {
            "a" if ctrl => self.selection = 0..self.value.len(),
            "v" if ctrl => {
                if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
                    self.replace(None, &text);
                }
            }
            "c" | "x" if ctrl => {
                cx.write_to_clipboard(gpui::ClipboardItem::new_string(
                    self.value[self.selection.clone()].into(),
                ));
                if key.key == "x" {
                    self.replace(None, "");
                }
            }
            "backspace" => {
                if self.selection.is_empty() {
                    self.selection.start = self.value[..self.selection.start]
                        .char_indices()
                        .last()
                        .map_or(0, |(index, _)| index);
                }
                self.replace(None, "");
            }
            "delete" => {
                if self.selection.is_empty() {
                    self.selection.end += self.value[self.selection.end..]
                        .chars()
                        .next()
                        .map_or(0, char::len_utf8);
                }
                self.replace(None, "");
            }
            "left" => {
                let index = self.value[..self.selection.start]
                    .char_indices()
                    .last()
                    .map_or(0, |(index, _)| index);
                self.selection = index..index;
            }
            "right" => {
                let index = self.selection.end
                    + self.value[self.selection.end..]
                        .chars()
                        .next()
                        .map_or(0, char::len_utf8);
                self.selection = index..index;
            }
            "home" => self.selection = 0..0,
            "end" => self.selection = self.value.len()..self.value.len(),
            _ => {
                return;
            } // Texto normal llega por EntityInputHandler, incluido IME.
        }
        self.marked = None;
        cx.stop_propagation();
        cx.notify();
    }
}

fn byte_offset(text: &str, utf16: usize) -> usize {
    let mut consumed = 0;
    for (byte, ch) in text.char_indices() {
        if consumed + ch.len_utf16() > utf16 {
            return byte;
        }
        consumed += ch.len_utf16();
    }
    text.len()
}

impl EntityInputHandler for Input {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        adjusted: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let range = self.range_from_utf16(range);
        *adjusted = Some(self.to_utf16(range.clone()));
        Some(self.value[range].into())
    }
    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: self.to_utf16(self.selection.clone()),
            reversed: false,
        })
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked.clone().map(|range| self.to_utf16(range))
    }
    fn unmark_text(&mut self, _: &mut Window, _: &mut Context<Self>) {
        self.marked = None;
    }
    fn replace_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.replace(range, text);
        cx.notify();
    }
    fn replace_and_mark_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let start = range
            .clone()
            .map(|range| self.range_from_utf16(range))
            .or(self.marked.clone())
            .unwrap_or(self.selection.clone())
            .start;
        self.replace(range, text);
        let end = self.selection.end;
        self.marked = Some(start.min(end)..end);
        if let Some(range) = selected {
            let inserted = &self.value[start.min(end)..end];
            self.selection = start.min(end) + byte_offset(inserted, range.start)
                ..start.min(end) + byte_offset(inserted, range.end.max(range.start));
        }
        cx.notify();
    }
    fn bounds_for_range(
        &mut self,
        _: Range<usize>,
        bounds: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        Some(bounds)
    }
    fn character_index_for_point(
        &mut self,
        _: Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        None
    }
}

impl Render for Input {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let focus = self.focus.clone();
        let entity = cx.entity();
        let focused = self.focus.is_focused(window);
        let display = if focused && self.selection.is_empty() {
            format!(
                "{}│{}",
                &self.value[..self.selection.end],
                &self.value[self.selection.end..]
            )
        } else if self.value.is_empty() {
            " ".into()
        } else {
            self.value.clone()
        };
        div()
            .id("launcher-input")
            .track_focus(&self.focus)
            .tab_index(0)
            .role(gpui::Role::TextInput)
            .aria_label(self.label)
            .relative()
            .px_2()
            .py_1()
            .min_w(gpui::px(140.0))
            .border_1()
            .border_color(rgb(if focused { tokens::INK } else { tokens::MUTED }))
            .overflow_hidden()
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, _, window, cx| {
                    this.focus.focus(window, cx);
                    cx.notify();
                }),
            )
            .on_key_down(cx.listener(Self::key))
            .child(
                div()
                    .when(focused && !self.selection.is_empty(), |div| {
                        div.bg(rgb(0x0034_3438))
                    })
                    .child(display),
            )
            .child(
                canvas(
                    |_, _, _| (),
                    move |bounds, (), window, cx| {
                        window.handle_input(
                            &focus,
                            ElementInputHandler::new(bounds, entity.clone()),
                            cx,
                        );
                    },
                )
                .absolute()
                .size_full(),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::byte_offset;
    #[test]
    fn utf16_offsets_never_split_accented_characters_or_surrogates() {
        let text = "aé🏁z";
        assert_eq!(byte_offset(text, 0), 0);
        assert_eq!(byte_offset(text, 1), 1);
        assert_eq!(byte_offset(text, 2), 3);
        assert_eq!(byte_offset(text, 3), 3);
        assert_eq!(byte_offset(text, 4), 7);
        assert_eq!(byte_offset(text, 50), text.len());
    }
}
