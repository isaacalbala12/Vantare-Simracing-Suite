//! Shell GPUI independiente: flanco IPC y EOF opcional para desarrollo.
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
use vantare_domain::format::{Language, Units};
use vantare_ipc::Subscriber;
use vantare_ui::efficiency::{text, tokens};

use crate::{
    Section,
    calendar::Calendar,
    notifications::Notifications,
    studio::{Prepared as PreparedStudio, Studio},
    workshop::{Prepared, Workshop},
};

pub struct Options {
    pub controlled: bool,
    pub data_dir: PathBuf,
    pub scene: Option<PathBuf>,
    pub section: Section,
    pub pipe: Option<String>,
}

struct Hub {
    section: Section,
    focus: FocusHandle,
    workshop: Entity<Workshop>,
    studio: Entity<Studio>,
    calendar: Entity<Calendar>,
    notifications: Entity<Notifications>,
    status: Option<String>,
    subscriber: Subscriber,
    previous_source: Option<bool>,
}

impl Hub {
    fn save(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        // Studio es preview sin escritura hasta integrar la autoridad ui::layout.
        self.workshop.update(cx, |workshop, _| workshop.persist())
    }

    fn poll_source(&mut self, cx: &mut Context<Self>) {
        if let Some(snapshot) = self.subscriber.next(Duration::ZERO) {
            let close = crate::lifecycle::should_close(self.previous_source, &snapshot);
            self.previous_source = Some(crate::lifecycle::is_live(&snapshot));
            if close {
                cx.quit();
            }
        }
    }

    fn close(&mut self, cx: &mut Context<Self>) {
        if self.can_close(cx) {
            cx.quit();
        }
    }

    fn can_close(&mut self, cx: &mut Context<Self>) -> bool {
        match self.save(cx) {
            Ok(()) => true,
            Err(error) => {
                self.notifications.update(cx, |center, cx| {
                    center.report("hub.save", error.clone(), cx);
                });
                self.status = Some(error);
                cx.notify();
                false
            }
        }
    }

    fn preferences(&mut self, units: bool, cx: &mut Context<Self>) {
        let mut prefs = self.workshop.read(cx).preferences();
        if units {
            prefs.units = if prefs.units == Units::Metric {
                Units::Imperial
            } else {
                Units::Metric
            };
        } else {
            prefs.language = if prefs.language == Language::Es {
                Language::En
            } else {
                Language::Es
            };
        }
        if let Err(error) = self
            .workshop
            .update(cx, |workshop, cx| workshop.set_preferences(prefs, cx))
        {
            self.notifications.update(cx, |center, cx| {
                center.report("hub.preferences", error.clone(), cx);
            });
            self.status = Some(error);
        }
        cx.notify();
    }

    fn settings(&self, cx: &mut Context<Self>) -> gpui::Div {
        let prefs = self.workshop.read(cx).preferences();
        div().flex().flex_col().gap_2()
            .child(format!("Formato del Workshop: {:?} · {:?}", prefs.units, prefs.language))
            .child(button("settings-units", "Métrico / Imperial").on_click(cx.listener(|this, _, _, cx| this.preferences(true, cx))))
            .child(button("settings-language", "ES / EN").on_click(cx.listener(|this, _, _, cx| this.preferences(false, cx))))
            .child("Guardado local en selección del Workshop. Actualizaciones, hotkeys, privacidad, audio y rendimiento esperan sus servicios; no se altera el núcleo.")
    }

    fn diagnostics(&self, cx: &Context<Self>) -> gpui::Div {
        let scene = &self.workshop.read(cx).scene;
        let snapshot = scene.snapshot();
        div().flex().flex_col().gap_2()
            .child("Contexto local del Workshop; no es diagnóstico del juego ni reporte completo.")
            .child(format!("Fuente de la foto: {} · {:?} · época {} · revisión {} · {} coches",
                snapshot.origin.source.simulator, snapshot.origin.source.kind, snapshot.epoch, snapshot.sequence, snapshot.state.cars.len()))
            .child(format!("Fotos cargadas: {} · última carga sin error: {}", scene.len(), scene.error.is_none()))
            .child("Testing Center: exportación sanitizada, logs, reports y automatización esperan contrato del worker. Sin datos de cuenta, envío ni acciones externas.")
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
            .when(self.section == Section::Studio, |content| {
                content.child(self.studio.clone())
            })
            .when(self.section == Section::Calendar, |content| {
                content.child(self.calendar.clone())
            })
            .when(self.section == Section::Notifications, |content| {
                content.child(self.notifications.clone())
            })
            .when(self.section == Section::Settings, |content| {
                content.child(self.settings(cx))
            })
            .when(self.section == Section::Testing, |content| {
                content.child(self.diagnostics(cx))
            })
            .when(
                !matches!(
                    self.section,
                    Section::Workshop
                        | Section::Studio
                        | Section::Calendar
                        | Section::Notifications
                        | Section::Settings
                        | Section::Testing
                ),
                |content| content.child(self.section.pending()),
            );
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

fn start_source_poll(cx: &mut Context<Hub>) {
    cx.spawn(async move |this, cx| {
        loop {
            if this.update(cx, Hub::poll_source).is_err() {
                break;
            }
            cx.background_executor()
                .timer(Duration::from_millis(100))
                .await;
        }
    })
    .detach();
}

fn wire_sections(
    calendar: &Entity<Calendar>,
    notifications: &Entity<Notifications>,
    cx: &mut Context<Hub>,
) {
    cx.observe(calendar, |this, calendar, cx| {
        if let Some(error) = &calendar.read(cx).error {
            let error = error.clone();
            this.notifications
                .update(cx, |center, cx| center.report("hub.calendar", error, cx));
        }
    })
    .detach();
    cx.observe(notifications, |this, center, cx| {
        if let Some(destination) = center.update(cx, |center, _| center.destination.take()) {
            this.section = destination;
            cx.notify();
        }
    })
    .detach();
}

fn subscribe(pipe: Option<String>) -> Result<Subscriber, String> {
    // Mismo ACL privado del IPC que overlays; no consulta servicios ni credenciales.
    let pipe = match pipe {
        Some(name) => name,
        None => vantare_ipc::default_pipe_name().map_err(|error| format!("pipe Hub: {error}"))?,
    };
    Subscriber::connect(&pipe, |_| true).map_err(|error| format!("suscribir Hub: {error}"))
}

fn create_workshop(prepared: Prepared, cx: &mut App) -> Entity<Workshop> {
    cx.new(|cx| {
        let workshop = Workshop::new(prepared, cx);
        cx.spawn(async move |this, cx| {
            loop {
                let Ok(delay) = this.update(cx, |this, cx| this.tick(Instant::now(), cx)) else {
                    break;
                };
                cx.background_executor().timer(delay).await;
            }
        })
        .detach();
        workshop
    })
}

pub fn run(options: Options) -> Result<(), String> {
    let prepared = Prepared::load(&options.data_dir, options.scene)?;
    let prepared_studio = PreparedStudio::load()?;
    let calendar = Calendar::load(&options.data_dir)?;
    let subscriber = subscribe(options.pipe)?;
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
                start_source_poll(cx);
                let focus = cx.focus_handle();
                focus.focus(window, cx);
                let workshop = create_workshop(prepared, cx);
                let snapshot = workshop.read(cx).scene.snapshot().clone();
                let studio = cx.new(|cx| Studio::new(prepared_studio, snapshot, cx));
                let notifications = cx.new(|_| Notifications::default());
                let calendar = cx.new(|_| calendar);
                wire_sections(&calendar, &notifications, cx);
                cx.observe(&workshop, |this, workshop, cx| {
                    let snapshot = workshop.read(cx).scene.snapshot().clone();
                    this.studio
                        .update(cx, |studio, cx| studio.ingest(&snapshot, cx));
                })
                .detach();
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
                    studio,
                    calendar,
                    notifications,
                    status: None,
                    subscriber,
                    previous_source: None,
                }
            });
            let closing = hub.downgrade();
            window.on_window_should_close(cx, move |_, cx| {
                closing.update(cx, Hub::can_close).unwrap_or(true)
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
