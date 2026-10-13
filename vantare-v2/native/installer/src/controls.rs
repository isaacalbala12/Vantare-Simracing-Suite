//! Buttons and toggles share the approved hover, pressed, focus and disabled states.
use crate::{
    style,
    view::{Action, Installer},
};
use gpui::{AnyElement, Context, IntoElement, prelude::*, px, rgb, rgba};

#[derive(Clone, Copy)]
pub enum Kind {
    Primary,
    Ghost,
    Danger,
    Link,
    Window,
}
#[allow(clippy::too_many_arguments)] // Coordinates and style reproduce a fixed approved window.
pub fn button(
    view: &Installer,
    action: Action,
    label: &str,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    kind: Kind,
    enabled: bool,
    icon: Option<style::Icon>,
    cx: &mut Context<Installer>,
) -> AnyElement {
    let focus = &view
        .focuses
        .iter()
        .find(|(a, _)| *a == action)
        .expect("fixed action list")
        .1;
    let mut item = style::at(x, y, w, h)
        .id(action.id())
        .flex()
        .items_center()
        .justify_center()
        .gap(px(8.))
        .font_family("Installer Inter W600")
        .text_size(px(if h >= 40. {
            14.
        } else if action == Action::Change {
            12.
        } else {
            12.5
        }))
        .line_height(px(if h >= 40. { 17. } else { 15. }))
        .text_color(rgb(style::TEXT))
        .rounded(px(if matches!(kind, Kind::Link | Kind::Window) {
            4.
        } else {
            8.
        }));
    item = match kind {
        Kind::Primary => item
            .bg(style::red_gradient())
            .border_1()
            .border_color(rgba(0xffff_ff1a))
            .hover(|s| s.border_color(rgba(0xff3b_3b73)))
            .active(|s| s.opacity(0.86)),
        Kind::Ghost => item
            .border_1()
            .border_color(rgba(0xffff_ff24))
            .hover(|s| s.bg(rgba(0xffff_ff0d)).border_color(rgba(0xffff_ff38)))
            .active(|s| s.bg(rgba(0xffff_ff17))),
        Kind::Danger => item
            .bg(rgb(0xc1_121f))
            .border_1()
            .border_color(rgba(0xffff_ff1a))
            .hover(|s| s.bg(rgb(0xd8_141f)))
            .active(|s| s.bg(rgb(0x9b_2226))),
        Kind::Link => item
            .text_color(rgba(style::MUTED))
            .hover(|s| s.text_color(rgb(style::TEXT))),
        Kind::Window => item.text_color(rgba(style::FAINT)).hover(move |s| {
            s.bg(if action == Action::Close {
                rgb(0xc4_2b1c)
            } else {
                rgba(0xffff_ff0f)
            })
            .text_color(rgb(style::TEXT))
        }),
    };
    if enabled {
        item = item
            .cursor_pointer()
            .track_focus(focus)
            .focusable()
            .focus_visible(|s| s.border_2().border_color(rgb(style::RED)))
            .on_click(cx.listener(move |view, _, window, cx| view.action(action, window, cx)))
            .on_key_down(
                cx.listener(move |view, event: &gpui::KeyDownEvent, window, cx| {
                    if event.keystroke.key == "enter" || event.keystroke.key == "space" {
                        view.action(action, window, cx);
                        cx.stop_propagation();
                    }
                }),
            );
    } else {
        item = item.opacity(0.38);
    }
    if !label.is_empty() {
        item = item.child(label.to_owned());
    }
    if let Some(icon) = icon {
        item = item.child(
            gpui::canvas(
                |_, _, _| (),
                move |bounds, (), window, cx| {
                    style::paint_icon(icon, bounds, window.text_style().color, window, cx);
                },
            )
            .w(px(if matches!(kind, Kind::Window) {
                10.
            } else {
                14.
            }))
            .h(px(if matches!(kind, Kind::Window) {
                10.
            } else {
                14.
            })),
        );
    }
    item.into_any_element()
}
pub fn toggle(
    view: &Installer,
    action: Action,
    on: bool,
    y: f32,
    cx: &mut Context<Installer>,
) -> AnyElement {
    let focus = &view
        .focuses
        .iter()
        .find(|(a, _)| *a == action)
        .expect("fixed toggle")
        .1;
    style::at(629., y, 34., 20.)
        .id(action.id())
        .rounded_full()
        .bg(rgb(if on { 0xc1_121f } else { 0x2a_2a2c }))
        .cursor_pointer()
        .track_focus(focus)
        .focusable()
        .hover(move |s| s.bg(rgb(if on { 0xd8_141f } else { 0x35_3538 })))
        .focus_visible(|s| s.border_2().border_color(rgb(style::RED)))
        .on_click(cx.listener(move |view, _, window, cx| view.action(action, window, cx)))
        .on_key_down(
            cx.listener(move |view, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "space" {
                    view.action(action, window, cx);
                    cx.stop_propagation();
                }
            }),
        )
        .child(style::swatch(
            if on { 17. } else { 3. },
            3.,
            14.,
            14.,
            7.,
            rgb(if on { 0xff_ffff } else { 0x8a_8a8a }).into(),
        ))
        .into_any_element()
}
