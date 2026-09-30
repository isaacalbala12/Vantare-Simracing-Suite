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
    analysis::Analysis,
    calendar::Calendar,
    engineer::Engineer,
    launcher::{Store as LauncherStore, view::Launcher},
    notifications::Notifications,
    orbit,
    strategy::Strategy,
    studio::{Prepared as PreparedStudio, Studio},
    workshop::{Prepared, Workshop},
};

#[path = "testing/mod.rs"]
pub mod testing;
use testing::{Testing, diagnostic::Module as TestingModule};

pub struct Options {
    pub controlled: bool,
    pub data_dir: PathBuf,
    pub scene: Option<PathBuf>,
    pub layout: PathBuf,
    pub engineer: PathBuf,
    pub section: Section,
    pub pipe: Option<String>,
    pub recordings: Option<PathBuf>,
    pub launcher_file: PathBuf,
}

struct Hub {
    section: Section,
    focus: FocusHandle,
    workshop: Entity<Workshop>,
    studio: Entity<Studio>,
    calendar: Entity<Calendar>,
    analysis: Entity<Analysis>,
    launcher: Entity<Launcher>,
    engineer: Entity<Engineer>,
    notifications: Entity<Notifications>,
    strategy: Entity<Strategy>,
    testing: Entity<Testing>,
    status: Option<String>,
    subscriber: Subscriber,
    previous_source: Option<bool>,
}

impl Hub {
    fn save(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        // Studio confirma cada edición; guarda también los borradores locales pendientes.
        self.strategy.update(cx, |strategy, _| strategy.persist())?;
        self.testing.update(cx, |testing, _| testing.persist())?;
        self.workshop.update(cx, |workshop, _| workshop.persist())
    }

    fn poll_source(&mut self, cx: &mut Context<Self>) {
        if let Some(snapshot) = self.subscriber.next(Duration::ZERO) {
            self.testing
                .update(cx, |testing, _| testing.observed.snapshot(&snapshot));
            let close = crate::lifecycle::should_close(self.previous_source, &snapshot);
            self.previous_source = Some(crate::lifecycle::is_live(&snapshot));
            if self.section == Section::Home {
                cx.notify();
            }
            if close {
                cx.quit();
            }
        }
        let activity = self.subscriber.activity();
        let errors = [
            (TestingModule::Hub, self.status.as_deref()),
            (
                TestingModule::Workshop,
                self.workshop.read(cx).scene.error.as_deref(),
            ),
            (
                TestingModule::Launcher,
                self.launcher.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Calendar,
                self.calendar.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Strategy,
                self.strategy.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Engineer,
                self.engineer.read(cx).error.as_deref(),
            ),
            (
                TestingModule::Notifications,
                self.notifications.read(cx).error.as_deref(),
            ),
        ]
        .map(|(module, error)| (module, error.map(testing::diagnostic::error_code)));
        self.testing.update(cx, |testing, _| {
            testing.observed.activity(activity, Instant::now());
            for (module, error) in errors {
                if let Some(error) = error {
                    testing.observed.section_error(module, error);
                }
            }
        });
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
        let mut prefs = self.studio.read(cx).preferences();
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
            .studio
            .update(cx, |studio, cx| studio.set_preferences(prefs, cx))
        {
            self.notifications.update(cx, |center, cx| {
                center.report("hub.preferences", error.clone(), cx);
            });
            self.status = Some(error);
        }
        cx.notify();
    }

    fn settings(&self, cx: &mut Context<Self>) -> gpui::Div {
        let prefs = self.studio.read(cx).preferences();
        div().flex().flex_col().gap_2()
            .child(format!("Formato de los widgets: {:?} · {:?}", prefs.units, prefs.language))
            .child(button("settings-units", "Métrico / Imperial").on_click(cx.listener(|this, _, _, cx| this.preferences(true, cx))))
            .child(button("settings-language", "ES / EN").on_click(cx.listener(|this, _, _, cx| this.preferences(false, cx))))
            .child("Guardado en el layout local; se aplica a Studio, Workshop y overlays al recargar el documento.")
            .child(div().opacity(0.5).child("Rendimiento · pendiente: sin contrato nativo de configuración"))
            .child(div().opacity(0.5).child("Actualizaciones · pendiente: sin contrato nativo del actualizador"))
            .child(div().opacity(0.5).child("Atajos · pendiente: sin contrato nativo de teclas globales"))
    }

    fn nav(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut nav = orbit::column("Vantare", env!("CARGO_PKG_VERSION")).child(
            div()
                .px(gpui::px(24.0))
                .pt(gpui::px(20.0))
                .pb(gpui::px(8.0))
                .child(orbit::eyebrow("Secciones")),
        );
        for &section in Section::ALL {
            nav = nav.child(
                orbit::nav_item(
                    section.label(),
                    section.label(),
                    section.subtitle(),
                    self.section == section,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.section = section;
                    cx.notify();
                })),
            );
        }
        nav
    }

    /// Contenido de la sección activa; las que aún no existen dicen qué falta.
    fn section_view(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        match self.section {
            Section::Workshop => self.workshop.clone().into_any_element(),
            Section::Studio => self.studio.clone().into_any_element(),
            Section::Engineer => self.engineer.clone().into_any_element(),
            Section::Calendar => self.calendar.clone().into_any_element(),
            Section::Analysis => self.analysis.clone().into_any_element(),
            Section::Launcher => self.launcher.clone().into_any_element(),
            Section::Strategy => self.strategy.clone().into_any_element(),
            Section::Notifications => self.notifications.clone().into_any_element(),
            Section::Settings => self.settings(cx).into_any_element(),
            Section::Testing => self.testing.clone().into_any_element(),
            Section::Home => crate::calendar::home::render(
                self.calendar.read(cx),
                Some(&self.subscriber),
                self.previous_source,
                orbit::button("home-studio", "Abrir Studio").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.section = Section::Studio;
                        cx.notify();
                    },
                )),
                orbit::button("home-workshop", "Abrir Workshop").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.section = Section::Workshop;
                        cx.notify();
                    },
                )),
            )
            .into_any_element(),
            Section::Roadmap | Section::Account | Section::Licenses => {
                orbit::callout(self.section.pending()).into_any_element()
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
        let nav = self.nav(cx);
        let content = div()
            .flex_1()
            .flex()
            .flex_col()
            .gap(gpui::px(24.0))
            .p(gpui::px(orbit::GUTTER))
            .child(orbit::page_header(
                "Hub nativo",
                self.section.label(),
                self.section.subtitle(),
            ))
            .when_some(self.status.clone(), |content, status| {
                content.child(orbit::callout(status))
            })
            .child(self.section_view(cx));
        let main = div()
            .flex_1()
            .flex()
            .flex_col()
            .min_w_0()
            .child(orbit::topbar(
                "Vantare",
                self.section.label(),
                orbit::button("close-hub", "Guardar y cerrar")
                    .on_click(cx.listener(|this, _, _, cx| this.close(cx))),
            ))
            .child(
                div()
                    .id("hub-content")
                    .flex_1()
                    .overflow_y_scroll()
                    .child(content),
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
            .bg(gpui::rgb(orbit::CANVAS))
            .text_color(gpui::rgb(orbit::INK))
            .font_family("Inter W400")
            .child(nav)
            .child(main)
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
    launcher: &Entity<Launcher>,
    cx: &mut Context<Hub>,
) {
    cx.observe(launcher, |this, launcher, cx| {
        if let Some(error) = &launcher.read(cx).error {
            let error = error.clone();
            this.notifications
                .update(cx, |center, cx| center.report("hub.launcher", error, cx));
        }
    })
    .detach();
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

fn prepare_analysis(options: &Options) -> Result<Analysis, String> {
    let recordings = options
        .recordings
        .clone()
        .unwrap_or_else(|| options.data_dir.join("recordings"));
    let storage_exe = std::env::current_exe()
        .map_err(|error| format!("ruta del Hub: {error}"))?
        .with_file_name("vantare-storage.exe");
    Ok(Analysis::new(recordings, storage_exe))
}

/// Sale al cerrar la última ventana o, en desarrollo, al cerrarse stdin.
fn quit_when_done(cx: &mut App, controlled: bool, stop: Arc<AtomicBool>) {
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
}

fn create_engineer(engineer: Engineer, cx: &mut App) -> Entity<Engineer> {
    cx.new(|cx| {
        cx.spawn(async move |this, cx| {
            loop {
                if this
                    .update(cx, |this: &mut Engineer, cx| {
                        if this.poll() {
                            cx.notify();
                        }
                    })
                    .is_err()
                {
                    break;
                }
                cx.background_executor()
                    .timer(Duration::from_millis(250))
                    .await;
            }
        })
        .detach();
        engineer
    })
}

/// Entradas ya cargadas y validadas antes de abrir la ventana.
struct Loaded {
    prepared: Prepared,
    studio: PreparedStudio,
    calendar: Calendar,
    analysis: Analysis,
    launcher: LauncherStore,
    engineer: Engineer,
    strategy_dir: PathBuf,
    testing_dir: PathBuf,
    subscriber: Subscriber,
}

impl Hub {
    fn build(
        loaded: Loaded,
        section: Section,
        failure_on_quit: std::rc::Rc<std::cell::RefCell<Option<String>>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let Loaded {
            prepared,
            studio: prepared_studio,
            calendar,
            analysis: mut prepared_analysis,
            launcher: launcher_store,
            engineer,
            strategy_dir,
            testing_dir,
            subscriber,
        } = loaded;
        start_source_poll(cx);
        let focus = cx.focus_handle();
        focus.focus(window, cx);
        let workshop = create_workshop(prepared, cx);
        let snapshot = workshop.read(cx).scene.snapshot().clone();
        let studio = cx.new(|cx| Studio::new(prepared_studio, snapshot, cx));
        let prefs = studio.read(cx).preferences();
        workshop.update(cx, |workshop, cx| workshop.set_preferences(prefs, cx));
        cx.observe(&studio, |this, studio, cx| {
            let prefs = studio.read(cx).preferences();
            this.workshop
                .update(cx, |workshop, cx| workshop.set_preferences(prefs, cx));
        })
        .detach();
        let notifications = cx.new(|_| Notifications::default());
        let calendar = cx.new(|_| calendar);
        let analysis = cx.new(|cx| {
            prepared_analysis.refresh(cx);
            prepared_analysis
        });
        let launcher = cx.new(|cx| Launcher::new(launcher_store, cx));
        wire_sections(&calendar, &notifications, &launcher, cx);
        let engineer = create_engineer(engineer, cx);
        let strategy = cx.new(|cx| Strategy::new(strategy_dir, cx));
        let testing = cx.new(|cx| Testing::new(testing_dir, cx));
        wire_strategy(&strategy, cx);
        cx.observe(&workshop, |this, workshop, cx| {
            let snapshot = workshop.read(cx).scene.snapshot().clone();
            this.studio
                .update(cx, |studio, cx| studio.ingest(&snapshot, cx));
        })
        .detach();
        cx.on_app_quit(move |this, cx| {
            this.analysis.update(cx, |analysis, _| analysis.cancel());
            if let Err(error) = this.launcher.update(cx, |launcher, _| launcher.shutdown()) {
                eprintln!("cerrar Launcher: {error}");
                *failure_on_quit.borrow_mut() = Some(error);
            }
            if let Err(error) = this.save(cx) {
                eprintln!("guardar antes de salir: {error}");
                *failure_on_quit.borrow_mut() = Some(error);
            }
            async {}
        })
        .detach();
        Hub {
            section,
            focus,
            workshop,
            studio,
            calendar,
            analysis,
            launcher,
            engineer,
            strategy,
            testing,
            notifications,
            status: None,
            subscriber,
            previous_source: None,
        }
    }
}

fn wire_strategy(strategy: &Entity<Strategy>, cx: &mut Context<Hub>) {
    cx.observe(strategy, |this, strategy, cx| {
        if let Some(error) = &strategy.read(cx).error {
            let error = error.clone();
            this.notifications
                .update(cx, |center, cx| center.report("hub.strategy", error, cx));
        }
    })
    .detach();
}

pub fn run(options: Options) -> Result<(), String> {
    let loaded = Loaded {
        analysis: prepare_analysis(&options)?,
        prepared: Prepared::load(&options.data_dir, options.scene)?,
        studio: PreparedStudio::load(options.layout)?,
        calendar: Calendar::load(&options.data_dir)?,
        launcher: LauncherStore::load(options.launcher_file)?,
        engineer: Engineer::load(options.engineer),
        strategy_dir: options.data_dir.clone(),
        testing_dir: options.data_dir.clone(),
        subscriber: subscribe(options.pipe)?,
    };
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
                Hub::build(loaded, initial_section, failure_on_quit, window, cx)
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
        quit_when_done(cx, options.controlled, stop);
        cx.activate(true);
    });
    match result.borrow_mut().take() {
        Some(error) => Err(error),
        None => Ok(()),
    }
}
