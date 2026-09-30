//! Búsqueda de una línea, con selección/portapapeles e IME GPUI.
//! Launcher no exporta su editor; se mantiene esta pieza dentro de la shell.
use crate::orbit;
use gpui::{
    Bounds, Context, ElementInputHandler, EntityInputHandler, FocusHandle, IntoElement, Pixels,
    Point, Render, UTF16Selection, Window, canvas, div, prelude::*, px, rgb, rgba,
};
use std::ops::Range;

pub(super) struct Input {
    pub value: String,
    label: &'static str,
    pub focus: FocusHandle,
    selected: Range<usize>,
    reversed: bool,
    marked: Option<Range<usize>>,
}

fn move_selection(
    text: &str,
    selected: &mut Range<usize>,
    reversed: &mut bool,
    key: &str,
    shift: bool,
) {
    let caret = if *reversed {
        selected.start
    } else {
        selected.end
    };
    let anchor = if *reversed {
        selected.end
    } else {
        selected.start
    };
    let caret = match key {
        "home" => 0,
        "end" => text.len(),
        "left" if !shift && selected.start != selected.end => selected.start,
        "right" if !shift && selected.start != selected.end => selected.end,
        "left" => text[..caret]
            .char_indices()
            .last()
            .map_or(0, |(byte, _)| byte),
        _ => caret + text[caret..].chars().next().map_or(0, char::len_utf8),
    };
    *selected = if shift {
        anchor.min(caret)..anchor.max(caret)
    } else {
        caret..caret
    };
    *reversed = shift && caret < anchor;
}

fn byte_at(text: &str, utf16: usize) -> usize {
    let mut remaining = utf16;
    for (byte, ch) in text.char_indices() {
        if remaining < ch.len_utf16() {
            return byte;
        }
        remaining -= ch.len_utf16();
    }
    text.len()
}

impl Input {
    pub fn new(value: String, label: &'static str, cx: &mut Context<Self>) -> Self {
        let end = value.len();
        Self {
            value,
            label,
            focus: cx.focus_handle(),
            selected: end..end,
            reversed: false,
            marked: None,
        }
    }

    /// Reinicia la búsqueda sin reemplazar la entidad ni invalidar su foco.
    pub fn clear(&mut self, cx: &mut Context<Self>) {
        self.value.clear();
        self.selected = 0..0;
        self.reversed = false;
        self.marked = None;
        cx.notify();
    }

    fn bytes(&self, range: Range<usize>) -> Range<usize> {
        byte_at(&self.value, range.start)..byte_at(&self.value, range.end.max(range.start))
    }
    fn utf16(&self, range: Range<usize>) -> Range<usize> {
        self.value[..range.start].encode_utf16().count()
            ..self.value[..range.end].encode_utf16().count()
    }
    fn insert(&mut self, range: Option<Range<usize>>, text: &str) -> Range<usize> {
        let range = range
            .map(|range| self.bytes(range))
            .or(self.marked.clone())
            .unwrap_or(self.selected.clone());
        let text = text.replace(['\r', '\n', '\0'], "");
        if self.value.len() - range.len() + text.len() > 16384 {
            return self.selected.clone();
        }
        self.value.replace_range(range.clone(), &text);
        let end = range.start + text.len();
        self.selected = end..end;
        self.reversed = false;
        self.marked = None;
        range.start..end
    }

    fn key(&mut self, event: &gpui::KeyDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        let key = &event.keystroke;
        let ctrl = key.modifiers.control || key.modifiers.platform;
        let before = self.value[..self.selected.start]
            .char_indices()
            .last()
            .map_or(0, |(byte, _)| byte);
        let after = self.selected.end
            + self.value[self.selected.end..]
                .chars()
                .next()
                .map_or(0, char::len_utf8);
        match key.key.as_str() {
            "a" if ctrl => {
                self.selected = 0..self.value.len();
                self.reversed = false;
            }
            "c" | "x" if ctrl => {
                cx.write_to_clipboard(gpui::ClipboardItem::new_string(
                    self.value[self.selected.clone()].into(),
                ));
                if key.key == "x" {
                    self.insert(None, "");
                }
            }
            "v" if ctrl => {
                if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
                    self.insert(None, &text);
                }
            }
            "backspace" | "delete" => {
                if self.selected.is_empty() {
                    self.selected = if key.key == "backspace" {
                        before..self.selected.end
                    } else {
                        self.selected.start..after
                    };
                }
                self.insert(None, "");
            }
            "left" | "right" | "home" | "end" => {
                move_selection(
                    &self.value,
                    &mut self.selected,
                    &mut self.reversed,
                    &key.key,
                    key.modifiers.shift,
                );
            }
            _ => return,
        }
        self.marked = None;
        cx.stop_propagation();
        cx.notify();
    }
}

impl EntityInputHandler for Input {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        adjusted: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let range = self.bytes(range);
        *adjusted = Some(self.utf16(range.clone()));
        Some(self.value[range].into())
    }
    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: self.utf16(self.selected.clone()),
            reversed: self.reversed,
        })
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked.clone().map(|range| self.utf16(range))
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
        self.insert(range, text);
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
        let inserted = self.insert(range, text);
        if let Some(range) = selected {
            let text = &self.value[inserted.clone()];
            self.selected = inserted.start + byte_at(text, range.start)
                ..inserted.start + byte_at(text, range.end.max(range.start));
        }
        self.marked = Some(inserted);
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
        let focused = self.focus.is_focused(window);
        let display = if self.value.is_empty() && !focused {
            self.label.to_owned()
        } else if focused && self.selected.is_empty() {
            format!(
                "{}│{}",
                &self.value[..self.selected.end],
                &self.value[self.selected.end..]
            )
        } else {
            self.value.clone()
        };
        let focus = self.focus.clone();
        let entity = cx.entity();
        div()
            .id(self.label)
            .role(gpui::Role::TextInput)
            .aria_label(self.label)
            .aria_value(self.value.clone())
            .aria_placeholder(self.label)
            .track_focus(&self.focus)
            .tab_index(0)
            .w_full()
            .min_w_0()
            .h(px(orbit::CONTROL_H))
            .px(px(12.0))
            .flex()
            .items_center()
            .relative()
            .rounded(px(orbit::RADIUS_CONTROL))
            .bg(rgb(orbit::SURFACE_2))
            .border_1()
            .border_color(rgba(orbit::LINE_STRONG))
            .cursor(gpui::CursorStyle::IBeam)
            .overflow_hidden()
            .when(focused, |s| s.border_color(rgb(orbit::CARMINE)))
            .when(focused && !self.selected.is_empty(), |s| {
                s.bg(rgb(orbit::SURFACE_3))
            })
            .child(orbit::text(
                display,
                13.0,
                400,
                if self.value.is_empty() {
                    orbit::INK_3
                } else {
                    orbit::INK
                },
            ))
            .on_key_down(cx.listener(Self::key))
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
    #[test]
    fn shift_selection_can_expand_reverse_shrink_and_collapse_unicode() {
        let mut selected = 7..7;
        let mut reversed = false;
        for (key, shift, expected) in [
            ("left", true, 3..7),
            ("left", true, 1..7),
            ("right", true, 3..7),
            ("right", false, 7..7),
            ("home", true, 0..7),
            ("end", false, 8..8),
        ] {
            super::move_selection("aé🏁z", &mut selected, &mut reversed, key, shift);
            assert_eq!(selected, expected);
        }
    }

    #[test]
    fn utf16_ranges_are_utf8_boundaries_including_surrogates() {
        let text = "aé🏁z";
        for units in 0..8 {
            assert!(text.is_char_boundary(super::byte_at(text, units)));
        }
        assert_eq!(super::byte_at(text, 2), 3);
        assert_eq!(super::byte_at(text, 3), 3);
        assert_eq!(super::byte_at(text, 4), 7);
        assert_eq!(super::byte_at(text, 99), text.len());
    }
}
