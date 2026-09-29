//! Shell GPUI independiente. El propietario puede cerrarla por EOF en stdin.
use std::io::Read;
use std::path::PathBuf;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};

use gpui::{
    App, Context, Entity, FocusHandle, IntoElement, Render, Window, WindowOptions, div, prelude::*,
    rgb,
};
use vantare_ui::efficiency::{text, tokens};

use crate::{
    Section,
    workshop::{Prepared, Workshop},
};

pub struct Options {
    pub controlled: bool,
    pub data_dir: PathBuf,
    pub scene: Option<PathBuf>,
    pub section: Section,
}

struct Hub {
    section: Section,
    focus: FocusHandle,
    workshop: Entity<Workshop>,
    status: Option<String>,
}

impl Hub {
    fn save(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        self.workshop.update(cx, |workshop, _| workshop.persist())
    }

    fn close(&mut self, cx: &mut Context<Self>) {
        match self.save(cx) {
            Ok(()) => cx.quit(),
            Err(error) => {
                self.status = Some(error);
                cx.notify();
            }
        }
    }
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
        let content = div()
            .flex_1()
            .flex()
            .flex_col()
            .gap_4()
            .child(self.section.label())
            .when_some(self.status.clone(), gpui::ParentElement::child)
            .child(
                button("close-hub", "Guardar y cerrar Hub")
                    .on_click(cx.listener(|this, _, _, cx| this.close(cx))),
            )
            .when(self.section == Section::Workshop, |content| {
                content.child(self.workshop.clone())
            })
            .when(self.section != Section::Workshop, |content| {
                content.child(self.section.pending())
            });
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
            .child(content)
    }
}

fn watch_stdin(controlled: bool) -> Result<Arc<AtomicBool>, String> {
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
    Ok(stop)
}

pub fn run(options: Options) -> Result<(), String> {
    let prepared = Prepared::load(&options.data_dir, options.scene)?;
    let stop = watch_stdin(options.controlled)?;
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if let Err(error) = text::register_fonts(cx) {
            *failure.borrow_mut() = Some(error);
            cx.quit();
            return;
        }
        let window_options = WindowOptions {
            titlebar: Some(gpui::TitlebarOptions {
                title: Some("Vantare Hub — nativo".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let failure_on_quit = failure.clone();
        let initial_section = options.section;
        if let Err(error) = cx.open_window(window_options, |window, cx| {
            let hub = cx.new(|cx: &mut Context<Hub>| {
                let focus = cx.focus_handle();
                focus.focus(window, cx);
                let workshop = cx.new(|cx| {
                    let workshop = Workshop::new(prepared, cx);
                    cx.spawn(async move |this, cx| {
                        loop {
                            let Ok(delay) =
                                this.update(cx, |this, cx| this.tick(Instant::now(), cx))
                            else {
                                break;
                            };
                            cx.background_executor().timer(delay).await;
                        }
                    })
                    .detach();
                    workshop
                });
                cx.on_app_quit(move |this, cx| {
                    if let Err(error) = this.save(cx) {
                        eprintln!("guardar antes de salir: {error}");
                        *failure_on_quit.borrow_mut() = Some(error);
                    }
                    async {}
                })
                .detach();
                Hub {
                    section: initial_section,
                    focus,
                    workshop,
                    status: None,
                }
            });
            let closing = hub.downgrade();
            window.on_window_should_close(cx, move |_, cx| {
                closing
                    .update(cx, |this, cx| {
                        if let Err(error) = this.save(cx) {
                            this.status = Some(error);
                            cx.notify();
                            false
                        } else {
                            true
                        }
                    })
                    .unwrap_or(true)
            });
            hub
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
        if options.controlled {
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
