//! Editor común del kit; Launcher conserva su API mediante reexportación.
use super::*;
use gpui::{
    Bounds, Context, ElementInputHandler, EntityInputHandler, FocusHandle, IntoElement, Pixels,
    Point, Render, ShapedLine, UTF16Selection, Window, canvas, fill, point, rgb, size,
};
use std::ops::{Deref, Range};

const MAX_BYTES: usize = 16 * 1024;

#[derive(Debug)]
pub struct TextState {
    pub value: String,
    pub enabled: bool,
    multiline: bool,
    selection: Range<usize>,
    anchor: usize,
    marked: Option<Range<usize>>,
}
impl TextState {
    fn new(value: String, multiline: bool) -> Self {
        let value = clean(value, multiline);
        let end = value.len();
        Self {
            value,
            enabled: true,
            multiline,
            selection: end..end,
            anchor: end,
            marked: None,
        }
    }
    fn cursor(&self) -> usize {
        if self.anchor == self.selection.end {
            self.selection.start
        } else {
            self.selection.end
        }
    }
    fn range_from_utf16(&self, range: Range<usize>) -> Range<usize> {
        byte_offset(&self.value, range.start)..byte_offset(&self.value, range.end.max(range.start))
    }
    fn to_utf16(&self, range: Range<usize>) -> Range<usize> {
        self.value[..range.start].encode_utf16().count()
            ..self.value[..range.end].encode_utf16().count()
    }
    fn replace(&mut self, range: Option<Range<usize>>, text: &str) -> Option<Range<usize>> {
        if !self.enabled {
            return None;
        }
        let range = range
            .map(|r| self.range_from_utf16(r))
            .or(self.marked.clone())
            .unwrap_or(self.selection.clone());
        let text = clean(text.to_owned(), self.multiline);
        if self.value.len() - range.len() + text.len() > MAX_BYTES {
            return None;
        }
        self.value.replace_range(range.clone(), &text);
        let inserted = range.start..range.start + text.len();
        self.move_to(inserted.end, false);
        self.marked = None;
        Some(inserted)
    }
    fn mark(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
    ) -> bool {
        let Some(inserted) = self.replace(range, text) else {
            return false;
        };
        self.marked = (!inserted.is_empty()).then_some(inserted.clone());
        if let Some(selected) = selected {
            let text = &self.value[inserted.clone()];
            let start = inserted.start + byte_offset(text, selected.start);
            let end = inserted.start + byte_offset(text, selected.end.max(selected.start));
            self.anchor = start;
            self.selection = start..end;
        }
        true
    }
    fn move_to(&mut self, cursor: usize, extend: bool) {
        if !extend {
            self.anchor = cursor;
        }
        self.selection = self.anchor.min(cursor)..self.anchor.max(cursor);
    }
    fn navigate(&mut self, key: &str, shift: bool, ctrl: bool) -> bool {
        let cursor = self.cursor();
        let next = match key {
            "left" if !shift && !self.selection.is_empty() => self.selection.start,
            "right" if !shift && !self.selection.is_empty() => self.selection.end,
            "left" => previous(&self.value, cursor),
            "right" => next(&self.value, cursor),
            "home" => {
                if ctrl {
                    0
                } else {
                    self.value[..cursor].rfind('\n').map_or(0, |i| i + 1)
                }
            }
            "end" => {
                if ctrl {
                    self.value.len()
                } else {
                    self.value[cursor..]
                        .find('\n')
                        .map_or(self.value.len(), |i| cursor + i)
                }
            }
            "up" | "down" if self.multiline => vertical(&self.value, cursor, key == "down"),
            _ => return false,
        };
        self.move_to(next, shift);
        self.marked = None;
        true
    }
    fn delete(&mut self, backward: bool) {
        if self.selection.is_empty() {
            let cursor = self.cursor();
            self.selection = if backward {
                previous(&self.value, cursor)..cursor
            } else {
                cursor..next(&self.value, cursor)
            };
        }
        self.replace(None, "");
    }
}
fn clean(mut text: String, multiline: bool) -> String {
    text = text.replace("\r\n", "\n").replace('\r', "\n");
    text.retain(|ch| ch != '\0' && (multiline || ch != '\n'));
    text
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
fn previous(text: &str, cursor: usize) -> usize {
    text[..cursor].char_indices().last().map_or(0, |(i, _)| i)
}
fn next(text: &str, cursor: usize) -> usize {
    cursor + text[cursor..].chars().next().map_or(0, char::len_utf8)
}
fn vertical(text: &str, cursor: usize, down: bool) -> usize {
    let start = text[..cursor].rfind('\n').map_or(0, |i| i + 1);
    let column = text[start..cursor].chars().count();
    let target = if down {
        let Some(end) = text[cursor..].find('\n') else {
            return text.len();
        };
        cursor + end + 1
    } else {
        if start == 0 {
            return 0;
        }
        text[..start - 1].rfind('\n').map_or(0, |i| i + 1)
    };
    let line = text[target..].split('\n').next().unwrap_or("");
    target
        + line
            .char_indices()
            .nth(column)
            .map_or(line.len(), |(i, _)| i)
}

pub struct Input {
    state: TextState,
    label: &'static str,
    focus: FocusHandle,
    lines: Vec<(usize, ShapedLine, Point<Pixels>)>,
    line_height: Pixels,
    dragging: bool,
}
impl Deref for Input {
    type Target = TextState;
    fn deref(&self) -> &Self::Target {
        &self.state
    }
}
impl Input {
    pub fn new(value: String, label: &'static str, cx: &mut Context<Self>) -> Self {
        Self::create(value, label, false, cx)
    }
    pub fn multiline(value: String, label: &'static str, cx: &mut Context<Self>) -> Self {
        Self::create(value, label, true, cx)
    }
    fn create(value: String, label: &'static str, multiline: bool, cx: &mut Context<Self>) -> Self {
        Self {
            state: TextState::new(value, multiline),
            label,
            focus: cx.focus_handle(),
            lines: vec![],
            line_height: gpui::px(FIELD_TEXT * 1.5),
            dragging: false,
        }
    }
    pub fn focus_handle(&self) -> FocusHandle {
        self.focus.clone()
    }
    pub fn set_value(&mut self, value: String, cx: &mut Context<Self>) {
        let enabled = self.state.enabled;
        self.state = TextState::new(value, self.state.multiline);
        self.state.enabled = enabled;
        cx.notify();
    }
    pub fn set_enabled(&mut self, enabled: bool, cx: &mut Context<Self>) {
        self.state.enabled = enabled;
        cx.notify();
    }
    fn key(&mut self, event: &gpui::KeyDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        if !self.enabled {
            return;
        }
        // El IME conserva la propiedad de las flechas/Enter durante composición.
        if self.marked.is_some() && !event.keystroke.modifiers.control {
            return;
        }
        let key = &event.keystroke;
        let ctrl = key.modifiers.control || key.modifiers.platform;
        match key.key.as_str() {
            "a" if ctrl => {
                self.state.anchor = 0;
                self.state.selection = 0..self.value.len();
            }
            "v" if ctrl => {
                if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
                    self.state.replace(None, &text);
                }
            }
            "c" | "x" if ctrl => {
                if !self.selection.is_empty() {
                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(
                        self.value[self.selection.clone()].into(),
                    ));
                    if key.key == "x" {
                        self.state.replace(None, "");
                    }
                }
            }
            "backspace" => self.state.delete(true),
            "delete" => self.state.delete(false),
            "enter" if self.multiline => {
                self.state.replace(None, "\n");
            }
            _ => {
                if !self.state.navigate(&key.key, key.modifiers.shift, ctrl) {
                    return;
                }
            }
        }
        cx.stop_propagation();
        cx.notify();
    }
    fn index_at(&self, position: Point<Pixels>) -> usize {
        let line = self
            .lines
            .iter()
            .rev()
            .find(|(_, _, origin)| position.y >= origin.y)
            .or(self.lines.first());
        let mut index = line
            .map_or(0, |(start, line, origin)| {
                start + line.closest_index_for_x(position.x - origin.x)
            })
            .min(self.value.len());
        // Un evento IME/ratón puede llegar tras editar, antes del siguiente pintado.
        while !self.value.is_char_boundary(index) {
            index -= 1;
        }
        index
    }
    fn cursor_bounds(&self, cursor: usize) -> Option<Bounds<Pixels>> {
        let (start, line, origin) = self
            .lines
            .iter()
            .rev()
            .find(|(start, _, _)| cursor >= *start)?;
        Some(Bounds::new(
            point(
                origin.x + line.x_for_index((cursor - start).min(line.text.len())),
                origin.y,
            ),
            size(gpui::px(FOCUS_WIDTH), self.line_height),
        ))
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
        self.enabled.then(|| UTF16Selection {
            range: self.to_utf16(self.selection.clone()),
            reversed: self.anchor == self.selection.end && !self.selection.is_empty(),
        })
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked.clone().map(|r| self.to_utf16(r))
    }
    fn unmark_text(&mut self, _: &mut Window, cx: &mut Context<Self>) {
        self.state.marked = None;
        cx.notify();
    }
    fn replace_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.state.replace(range, text);
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
        if self.state.mark(range, text, selected) {
            cx.notify();
        }
    }
    fn bounds_for_range(
        &mut self,
        range: Range<usize>,
        _: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        self.cursor_bounds(self.range_from_utf16(range).start)
    }
    fn character_index_for_point(
        &mut self,
        point: Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        Some(self.value[..self.index_at(point)].encode_utf16().count())
    }
}
impl Input {
    fn shape(
        &self,
        bounds: Bounds<Pixels>,
        window: &mut Window,
        cx: &gpui::App,
    ) -> Vec<(usize, ShapedLine, Point<Pixels>)> {
        let style = window.text_style();
        let mut offset = 0;
        let mut lines = Vec::new();
        let cursor_line = self.value[..self.cursor()]
            .bytes()
            .filter(|&b| b == b'\n')
            .count();
        #[allow(clippy::cast_precision_loss)] // 16 KiB: el índice cabe exactamente en f32.
        let scroll_y = (gpui::px(cursor_line as f32 * FIELD_TEXT * 1.5) + self.line_height
            - bounds.size.height)
            .max(gpui::px(0.0));
        let mut y = if self.multiline {
            bounds.top() - scroll_y
        } else {
            bounds.top() + (bounds.size.height - self.line_height) / 2.0
        };
        for text in self.value.split('\n') {
            let run = gpui::TextRun {
                len: text.len(),
                font: style.font(),
                color: rgb(ink_2(cx)).into(),
                background_color: None,
                underline: None,
                strikethrough: None,
            };
            let line = window.text_system().shape_line(
                text.to_owned().into(),
                gpui::px(FIELD_TEXT),
                &[run],
                None,
            );
            let cursor_x = if self.cursor() >= offset && self.cursor() <= offset + text.len() {
                line.x_for_index(self.cursor() - offset)
            } else {
                gpui::px(0.0)
            };
            let scroll_x =
                (cursor_x + gpui::px(FOCUS_WIDTH) - bounds.size.width).max(gpui::px(0.0));
            lines.push((offset, line, point(bounds.left() - scroll_x, y)));
            offset += text.len() + 1;
            y += self.line_height;
        }
        lines
    }
}
fn text_bounds(
    line: &ShapedLine,
    origin: Point<Pixels>,
    range: Range<usize>,
    start: usize,
    height: Pixels,
) -> Bounds<Pixels> {
    Bounds::from_corners(
        point(
            origin.x + line.x_for_index(range.start.saturating_sub(start).min(line.text.len())),
            origin.y,
        ),
        point(
            origin.x + line.x_for_index(range.end.saturating_sub(start).min(line.text.len())),
            origin.y + height,
        ),
    )
}
fn paint_input(
    entity: &gpui::Entity<Input>,
    bounds: Bounds<Pixels>,
    lines: Vec<(usize, ShapedLine, Point<Pixels>)>,
    window: &mut Window,
    cx: &mut gpui::App,
) {
    let (selected, marked, cursor, focus, enabled, height) = {
        let input = entity.read(cx);
        (
            input.selection.clone(),
            input.marked.clone(),
            input.cursor(),
            input.focus.clone(),
            input.enabled,
            input.line_height,
        )
    };
    let focused = focus.is_focused(window);
    for (start, line, origin) in &lines {
        let end = start + line.text.len();
        if focused && selected.start <= end && selected.end > *start {
            window.paint_quad(fill(
                text_bounds(line, *origin, selected.clone(), *start, height),
                tint(carmine(cx), 0.24),
            ));
        }
        if let Err(error) = line.paint(*origin, height, gpui::TextAlign::Left, None, window, cx) {
            eprintln!("texto Orbit: {error}");
        }
        if focused && cursor >= *start && cursor <= end && selected.is_empty() {
            window.paint_quad(fill(
                Bounds::new(
                    point(origin.x + line.x_for_index(cursor - start), origin.y),
                    size(gpui::px(FOCUS_WIDTH), height),
                ),
                rgb(coral(cx)),
            ));
        }
        if let Some(marked) = &marked
            && marked.start <= end
            && marked.end > *start
        {
            let mut underline = text_bounds(line, *origin, marked.clone(), *start, height);
            underline.origin.y += height - gpui::px(LINE_WIDTH);
            underline.size.height = gpui::px(LINE_WIDTH);
            window.paint_quad(fill(underline, rgb(coral(cx))));
        }
    }
    if enabled {
        window.handle_input(&focus, ElementInputHandler::new(bounds, entity.clone()), cx);
    }
    entity.update(cx, |input, _| input.lines = lines);
}
impl Render for Input {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let entity = cx.entity();
        let paint_entity = entity.clone();
        let multiline = self.multiline;
        // ponytail: 16 KiB, movimiento por escalares Unicode y líneas explícitas.
        // Un editor de documentos con wrap/grafemas requiere ampliar este mismo control.
        field("orbit-input", cx)
            .track_focus(&self.focus.clone().tab_stop(self.enabled))
            .tab_index(0)
            .tab_stop(self.enabled)
            .role(gpui::Role::TextInput)
            .aria_label(self.label)
            .aria_value(self.value.clone())
            .cursor(gpui::CursorStyle::IBeam)
            .when(multiline, |s| s.h(gpui::px(TEXTAREA_H)))
            .when(!self.enabled, |s| s.opacity(DISABLED))
            .overflow_hidden()
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                    if !this.enabled {
                        return;
                    }
                    this.focus.focus(window, cx);
                    let index = this.index_at(event.position);
                    this.state.move_to(index, event.modifiers.shift);
                    this.dragging = true;
                    cx.notify();
                }),
            )
            .on_mouse_move(cx.listener(|this, event: &gpui::MouseMoveEvent, _, cx| {
                if this.dragging && this.enabled {
                    let index = this.index_at(event.position);
                    this.state.move_to(index, true);
                    cx.notify();
                }
            }))
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.dragging = false),
            )
            .on_mouse_up_out(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.dragging = false),
            )
            .on_key_down(cx.listener(Self::key))
            .child(
                canvas(
                    move |bounds, window, cx| entity.read(cx).shape(bounds, window, cx),
                    move |bounds, lines, window, cx| {
                        paint_input(&paint_entity, bounds, lines, window, cx);
                    },
                )
                .w_full()
                .h_full(),
            )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn utf16_selection_and_replacement_preserve_surrogates() {
        let mut state = TextState::new("aé🏁z".into(), false);
        assert_eq!(state.range_from_utf16(2..3), 3..3);
        assert_eq!(state.to_utf16(3..7), 2..4);
        state.replace(Some(2..4), "車");
        assert_eq!(state.value, "aé車z");
        state.navigate("left", true, false);
        assert_eq!(state.value[state.selection.clone()].to_string(), "車");
        state.delete(true);
        assert_eq!(state.value, "aéz");
    }
    #[test]
    fn multiline_normalizes_newlines_and_navigation_extends_both_directions() {
        let mut state = TextState::new("ab\r\n車de\nfg".into(), true);
        state.move_to(1, false);
        state.navigate("down", true, false);
        assert_eq!(&state.value[state.selection.clone()], "b\n車");
        state.navigate("up", true, false);
        assert!(state.selection.is_empty());
        state.replace(None, "\n");
        assert_eq!(state.value, "a\nb\n車de\nfg");
        let mut single = TextState::new("a\r\nb\0".into(), false);
        assert_eq!(single.value, "ab");
        single.enabled = false;
        assert!(single.replace(None, "c").is_none());
    }
    #[test]
    fn ime_replaces_its_marked_range_and_commits_without_duplication() {
        let mut state = TextState::new("a".into(), false);
        assert!(state.mark(None, "🏁車", Some(2..3)));
        assert_eq!(&state.value[state.selection.clone()], "車");
        assert!(state.mark(None, "東京", Some(1..2)));
        assert_eq!(state.value, "a東京");
        assert_eq!(&state.value[state.selection.clone()], "京");
        state.replace(None, "東京");
        assert_eq!(state.value, "a東京");
        assert!(state.marked.is_none());
        assert_eq!(state.selection, state.value.len()..state.value.len());
    }
    #[test]
    fn oversize_composition_is_rejected_without_changing_selection() {
        let mut state = TextState::new("a".into(), true);
        assert!(state.replace(None, &"b".repeat(MAX_BYTES)).is_none());
        assert_eq!(state.value, "a");
        assert_eq!(state.selection, 1..1);
    }
}
