//! Shell GPUI independiente. El propietario puede cerrarla por EOF en stdin.
use std::io::Read;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;

use gpui::{
    App, Context, FocusHandle, IntoElement, Render, Window, WindowOptions, div, prelude::*, rgb,
};
use vantare_ui::efficiency::{text, tokens};

use crate::Section;

struct Hub {
    section: Section,
    focus: FocusHandle,
}

pub(crate) fn button(id: &'static str, label: &'static str) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_index(0)
        .px_2()
        .py_1()
        .bg(rgb(tokens::PANEL))
        .border_1()
        .border_color(rgb(tokens::MUTED))
        .focus_visible(|style| style.bg(rgb(0x0034_3438)))
        .cursor_pointer()
        .child(label)
}

impl Render for Hub {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut nav = div().flex().flex_col().gap_1().w(gpui::px(195.0));
        for &section in Section::ALL {
            nav = nav.child(
                button(section.label(), section.label())
                    .when(self.section == section, |item| item.bg(rgb(0x0034_3438)))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.section = section;
                        cx.notify();
                    })),
            );
        }
        div()
            .id("hub")
            .track_focus(&self.focus)
            .tab_group()
            .tab_stop(false)
            .on_key_down(|event, window, cx| {
                if event.keystroke.key == "tab" {
                    if event.keystroke.modifiers.shift {
                        window.focus_prev(cx);
                    } else {
                        window.focus_next(cx);
                    }
                    cx.stop_propagation();
                }
            })
            .size_full()
            .flex()
            .gap_4()
            .p_4()
            .bg(rgb(tokens::PANEL))
            .text_color(rgb(tokens::INK))
            .font_family("Inter W400")
            .child(nav)
            .child(
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .gap_4()
                    .child(self.section.label())
                    .child(self.section.pending())
                    .child(button("close-hub", "Cerrar Hub").on_click(|_, _, cx| cx.quit())),
            )
    }
}

pub fn run(controlled: bool) -> Result<(), String> {
    let stop = Arc::new(AtomicBool::new(false));
    if controlled {
        let stop = stop.clone();
        std::thread::Builder::new()
            .name("hub-stdin".into())
            .spawn(move || {
                let mut buffer = [0; 256];
                loop {
                    match std::io::stdin().read(&mut buffer) {
                        Ok(0) | Err(_) => {
                            stop.store(true, Ordering::Release);
                            break;
                        }
                        Ok(_) => {}
                    }
                }
            })
            .map_err(|e| format!("supervisar stdin: {e}"))?;
    }
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if let Err(error) = text::register_fonts(cx) {
            *failure.borrow_mut() = Some(error);
            cx.quit();
            return;
        }
        let options = WindowOptions {
            titlebar: Some(gpui::TitlebarOptions {
                title: Some("Vantare Hub — nativo".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        if let Err(error) = cx.open_window(options, |window, cx| {
            cx.new(|cx: &mut Context<Hub>| {
                let focus = cx.focus_handle();
                focus.focus(window, cx);
                Hub {
                    section: Section::Home,
                    focus,
                }
            })
        }) {
            *failure.borrow_mut() = Some(format!("abrir Hub: {error}"));
            cx.quit();
            return;
        }
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        if controlled {
            cx.spawn(async move |cx| {
                while !stop.load(Ordering::Acquire) {
                    cx.background_executor()
                        .timer(Duration::from_millis(100))
                        .await;
                }
                cx.update(|cx| cx.quit());
            })
            .detach();
        }
        cx.activate(true);
    });
    match result.borrow_mut().take() {
        Some(error) => Err(error),
        None => Ok(()),
    }
}
