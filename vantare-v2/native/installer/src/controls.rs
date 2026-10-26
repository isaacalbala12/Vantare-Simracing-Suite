//! Buttons and toggles share the approved hover, pressed, focus and disabled states.
use crate::{
    style,
    view::{Action, Installer},
};
use gpui::{
    AnimationExt, AnyElement, Context, IntoElement, SpringAnimation, prelude::*, px, rgb, rgba,
};

#[derive(Clone, Copy, PartialEq, Eq)]
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
    item = appearance(item, kind);
    // Like the Hub, let Win32 handle the non-client minimize button. Closing
    // stays a client action because an installation may still own a transaction.
    if kind == Kind::Window && action == Action::Minimize {
        item = item
            .occlude()
            .window_control_area(gpui::WindowControlArea::Min)
            .role(gpui::Role::Button)
            .aria_label("Minimizar");
    }
    let hovered = enabled && view.hovered == Some((action, kind));
    if enabled {
        item = item
            .on_hover(cx.listener(move |view, hovered: &bool, _, cx| {
                view.hover((action, kind), *hovered);
                cx.notify();
            }))
            .cursor_pointer()
            .track_focus(focus)
            .focusable()
            .focus_visible(move |s| {
                s.shadow(style::focus_ring(if action == Action::Change {
                    0x14_1415
                } else if matches!(kind, Kind::Window) {
                    0x0c_0c0d
                } else {
                    0x0f_0f10
                }))
            })
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
    item.with_spring(
        ("hover", action as usize * 8 + kind as usize),
        SpringAnimation::new(style::HOVER).to(hovered),
        move |item, phase| hover(item, kind, action, phase.0),
    )
    .into_any_element()
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
    // Toggles share no action with buttons; Ghost only completes the key.
    let hovered = view.hovered == Some((action, Kind::Ghost));
    let (off, on_ink) = if hovered {
        (0x3535_38ff, 0xd814_1fff)
    } else {
        (0x2a2a_2cff, 0xc112_1fff)
    };
    style::at(629., y, 34., 20.)
        .id(action.id())
        .rounded_full()
        .cursor_pointer()
        .track_focus(focus)
        .focusable()
        .on_hover(cx.listener(move |view, hovered: &bool, _, cx| {
            view.hover((action, Kind::Ghost), *hovered);
            cx.notify();
        }))
        .focus_visible(|s| s.shadow(style::focus_ring(0x14_1415)))
        .on_click(cx.listener(move |view, _, window, cx| view.action(action, window, cx)))
        .on_key_down(
            cx.listener(move |view, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "space" {
                    view.action(action, window, cx);
                    cx.stop_propagation();
                }
            }),
        )
        .child(
            style::swatch(3., 3., 14., 14., 7., rgb(0x8a_8a8a).into()).with_spring(
                ("knob", action as usize),
                SpringAnimation::new(style::KNOB).to(on),
                |knob, phase| {
                    knob.left(px(3. + 14. * phase.0)).bg(style::mix(
                        0x8a8a_8aff,
                        0xffff_ffff,
                        phase.0,
                    ))
                },
            ),
        )
        .with_spring(
            ("track", action as usize),
            SpringAnimation::new(style::KNOB).to(on),
            move |track, phase| track.bg(style::mix(off, on_ink, phase.0)),
        )
        .into_any_element()
}

fn appearance(item: gpui::Stateful<gpui::Div>, kind: Kind) -> gpui::Stateful<gpui::Div> {
    match kind {
        Kind::Primary => item
            .text_color(rgb(0xff_ffff))
            .bg(style::red_gradient())
            .border_1()
            .border_color(rgba(0xffff_ff1a))
            .active(|s| {
                s.bg(gpui::linear_gradient(
                    135.,
                    gpui::linear_color_stop(rgb(0xdb_3232), 0.),
                    gpui::linear_color_stop(rgb(0x84_0505), 1.),
                ))
                .text_color(rgb(0xdb_dbdb))
                .shadow(Vec::new())
            }),
        Kind::Ghost => item.border_1().active(|s| s.bg(rgba(0xffff_ff17))),
        Kind::Danger => item
            .text_color(rgb(0xff_ffff))
            .border_1()
            .border_color(rgba(0xffff_ff1a))
            .active(|s| s.bg(rgb(0x9b_2226))),
        Kind::Link | Kind::Window => item,
    }
}

/// Hover look blended by `h` (0 rest, 1 hovered); pressed stays instant on top.
fn hover(
    item: gpui::Stateful<gpui::Div>,
    kind: Kind,
    action: Action,
    h: f32,
) -> gpui::Stateful<gpui::Div> {
    match kind {
        Kind::Primary => item.shadow(vec![
            gpui::BoxShadow::new(
                px(0.),
                px(0.),
                style::mix(0xff3b_3b00, 0xff3b_3b73, h).into(),
            )
            .spread_radius(px(1.)),
            gpui::BoxShadow::new(
                px(0.),
                px(6.),
                style::mix(0xc112_1f00, 0xc112_1f66, h).into(),
            )
            .blur_radius(px(22.)),
        ]),
        Kind::Ghost => item
            .bg(style::mix(0xffff_ff00, 0xffff_ff0d, h))
            .border_color(style::mix(0xffff_ff24, 0xffff_ff38, h)),
        Kind::Danger => item.bg(style::mix(0xc112_1fff, 0xd814_1fff, h)),
        Kind::Link => item.text_color(style::mix(
            style::MUTED,
            if action == Action::Remove {
                0xff3b_3bff
            } else {
                0xf5f5_f5ff
            },
            h,
        )),
        Kind::Window => item
            .bg(if action == Action::Close {
                style::mix(0xc42b_1c00, 0xc42b_1cff, h)
            } else {
                style::mix(0xffff_ff00, 0xffff_ff0f, h)
            })
            .text_color(style::mix(style::FAINT, 0xf5f5_f5ff, h)),
    }
}
