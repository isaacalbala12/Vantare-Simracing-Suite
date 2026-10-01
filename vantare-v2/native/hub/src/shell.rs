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
};
use vantare_ipc::Subscriber;
use vantare_ui::efficiency::text;

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

use crate::testing::{self, Testing, diagnostic::Module as TestingModule};
mod assets;
mod chrome;
mod input;
pub mod navigation;
#[path = "settings/mod.rs"]
mod settings;

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
    pub demo: Option<crate::demo::DemoData>,
    pub capture: Option<crate::demo::CaptureState>,
    pub capture_output: Option<PathBuf>,
}

struct Hub {
    section: Section,
    shell: chrome::State,
    demo: Option<crate::demo::DemoData>,
    capture: Option<crate::demo::CaptureState>,
    focus: FocusHandle,
    workshop: Entity<Workshop>,
    studio: Entity<Studio>,
    calendar: Entity<Calendar>,
    analysis: Entity<Analysis>,
    launcher: Entity<Launcher>,
    engineer: Entity<Engineer>,
    notifications: Entity<Notifications>,
    strategy: Entity<Strategy>,
    remote: Entity<crate::services::view::Remote>,
    testing: Entity<Testing>,
    settings: settings::State,
    status: Option<String>,
    subscriber: Subscriber,
    previous_source: Option<bool>,
    close_requested: bool,
}

impl Hub {
    fn save(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        // Studio confirma cada edición; guarda también los borradores locales pendientes.
        self.strategy.update(cx, |strategy, _| strategy.persist())?;
        self.testing.update(cx, |testing, _| testing.persist())?;
        self.workshop.update(cx, |workshop, _| workshop.persist())
    }

    fn poll_source(&mut self, cx: &mut Context<Self>) {
        if self
            .launcher
            .update(cx, |launcher, _| launcher.take_exit_cancelled())
        {
            self.close_requested = false;
        }
        if self.close_requested && self.can_close(cx) {
            cx.quit();
            return;
        }
        if let Some(snapshot) = self.subscriber.next(Duration::ZERO) {
            self.testing
                .update(cx, |testing, _| testing.observed.snapshot(&snapshot));
            let close = crate::lifecycle::should_close(self.previous_source, &snapshot);
            let observed = Some(crate::lifecycle::is_live(&snapshot));
            let changed = self.previous_source != observed;
            self.previous_source = observed;
            if self.section == Section::Home || changed {
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
        self.close_requested = true;
        if !self.launcher.update(cx, Launcher::can_close) {
            return false;
        }
        match self.save(cx) {
            Ok(()) => true,
            Err(error) => {
                self.notifications.update(cx, |center, cx| {
                    center.report("hub.save", error.clone(), cx);
                });
                self.status = Some(error);
                self.close_requested = false;
                cx.notify();
                false
            }
        }
    }

    /// Contenido de la sección activa; las que aún no existen dicen qué falta.
    fn section_view(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        if let Some(reason) = self.shell.access.lock(self.section) {
            return orbit::callout(format!(
                "{} · {reason}. Abre Cuenta para consultar el acceso.",
                self.section.label()
            ))
            .into_any_element();
        }
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
                self.demo.as_ref(),
                |control, section| {
                    control.on_click(cx.listener(move |this, _, _, cx| {
                        if section == Section::Launcher {
                            if let Some(id) = this.launcher.read(cx).default_profile_id() {
                                this.launch_profile(&id, cx);
                            } else {
                                this.navigate(section, cx);
                            }
                        } else {
                            this.navigate(section, cx);
                        }
                    }))
                },
            )
            .into_any_element(),
            Section::Account => self
                .remote
                .update(cx, |remote, cx| remote.account(cx))
                .into_any_element(),
            Section::Licenses => self
                .remote
                .update(cx, |remote, cx| remote.licenses(cx))
                .into_any_element(),
            Section::Roadmap => self
                .remote
                .update(cx, super::services::view::Remote::roadmap)
                .into_any_element(),
        }
    }

    fn render_content(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        div()
            .flex_1()
            .flex()
            .flex_col()
            .when(self.section != Section::Strategy, |content| {
                // Estos consumidores aun restan el espacio de la antigua cabecera.
                // Conservamos su geometria hasta que sus propietarios retiren ese margen.
                let inset = if matches!(
                    self.section,
                    Section::Calendar | Section::Studio | Section::Roadmap
                ) {
                    135.0
                } else {
                    0.0
                };
                content
                    .gap(gpui::px(24.0))
                    .p(gpui::px(orbit::GUTTER))
                    .pt(gpui::px(orbit::GUTTER + inset))
            })
            .when(self.section == Section::Settings, |content| {
                content.child(self.settings_header())
            })
            .when_some(self.status.clone(), |content, status| {
                content.child(orbit::callout(status))
            })
            .when_some(self.shell.navigation_notice.clone(), |content, notice| {
                content.child(orbit::callout(notice))
            })
            .child(self.section_view(cx))
            .into_any_element()
    }

    /// Columna contextual de la sección activa; Strategy la oculta si su vista no la usa.
    fn section_column(
        &mut self,
        window: &mut Window,
        strategy_context_visible: bool,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        if self.section == Section::Studio {
            self.studio.read(cx).context_column().into_any_element()
        } else if matches!(
            self.section,
            Section::Settings | Section::Account | Section::Licenses
        ) {
            self.settings_column(window, cx).into_any_element()
        } else if self.section == Section::Launcher {
            self.launcher
                .update(cx, |launcher, cx| launcher.context_column(window, cx))
                .into_any_element()
        } else if strategy_context_visible {
            self.strategy_context_column(cx).into_any_element()
        } else if self.section == Section::Strategy {
            div().into_any_element()
        } else {
            self.context_column(window, cx).into_any_element()
        }
    }
}

impl Render for Hub {
    #[allow(clippy::too_many_lines)] // Compone el marco común y la visibilidad del editor Strategy en una sola raíz.
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.remote.read(cx).requires_access() {
            return self
                .remote
                .update(cx, |remote, cx| remote.access_screen(&self.focus, cx))
                .into_any_element();
        }
        self.refresh_query(cx);
        let rail = self.rail(cx);
        // La sección aporta aquí sus controles con `.into_any_element()`;
        // None conserva la barra común hasta conectar su API (ver shell/README.md).
        let topbar = self.topbar(window, None, cx);
        if self
            .capture
            .as_ref()
            .is_some_and(|capture| capture.notifications_open)
            && self.notifications.read(cx).bell_bounds.is_some()
            && !self.notifications.read(cx).popover_open(cx)
        {
            self.notifications
                .update(cx, |center, cx| center.toggle_popover(window, cx));
        }
        let strategy_context_visible =
            self.section == Section::Strategy && self.strategy.read(cx).context_sidebar_visible();
        let column = self.section_column(window, strategy_context_visible, cx);
        let content = self.render_content(cx);
        let main = div()
            .relative()
            .flex_1()
            .flex()
            .flex_col()
            .min_w_0()
            .min_h_0()
            .child(topbar)
            .child(
                div()
                    .id("hub-content")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .when(self.section == Section::Settings, |content| {
                        content.track_scroll(&self.settings.scroll)
                    })
                    .child(content),
            );
        let background = if self.section == Section::Strategy {
            self.strategy
                .read(cx)
                .garage_background(f32::from(window.viewport_size().width))
        } else {
            None
        };
        div()
            .id("hub")
            .track_focus(&self.focus)
            .tab_group()
            .tab_stop(false)
            .capture_key_down(cx.listener(Self::shell_key))
            .size_full()
            .relative()
            .flex()
            .bg(gpui::rgb(orbit::CANVAS))
            .text_color(gpui::rgb(orbit::INK))
            .font_family("Inter W400")
            .when_some(background, gpui::ParentElement::child)
            .child(rail)
            .when(
                self.shell.column_open
                    && (self.section != Section::Strategy || strategy_context_visible),
                |root| root.child(column),
            )
            .child(main)
            .when(self.section == Section::Launcher, |root| {
                root.when_some(
                    self.launcher
                        .update(cx, |launcher, cx| launcher.form_layer(window, cx)),
                    gpui::ParentElement::child,
                )
            })
            .when(self.shell.palette_open, |root| {
                root.child(self.palette(window, cx))
            })
            .when_some(self.notifications.read(cx).popover(), |root, layer| {
                root.child(div().absolute().inset_0().size_full().child(layer))
            })
            .into_any_element()
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
        // La columna de contexto del Launcher vive en el shell: repinta con él.
        cx.notify();
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
            this.navigate(destination, cx);
        }
    })
    .detach();
}

fn wire_studio_workshop(workshop: &Entity<Workshop>, cx: &mut Context<Hub>) {
    cx.observe(workshop, |this, workshop, cx| {
        let snapshot = workshop.read(cx).scene.snapshot().clone();
        this.studio
            .update(cx, |studio, cx| studio.ingest(&snapshot, cx));
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
        .with_file_name(format!("vantare-storage{}", std::env::consts::EXE_SUFFIX));
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
    notifications: crate::notifications::Center,
    analysis: Analysis,
    launcher: LauncherStore,
    engineer: Engineer,
    strategy_dir: PathBuf,
    testing_dir: PathBuf,
    subscriber: Subscriber,
    service_pipe: String,
    demo: Option<crate::demo::DemoData>,
    capture: Option<crate::demo::CaptureState>,
}

impl Hub {
    fn build(
        loaded: Loaded,
        section: Section,
        access: navigation::Access,
        failure_on_quit: std::rc::Rc<std::cell::RefCell<Option<String>>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let Loaded {
            prepared,
            studio: prepared_studio,
            calendar,
            notifications: notification_center,
            analysis: mut prepared_analysis,
            launcher: launcher_store,
            engineer,
            strategy_dir,
            testing_dir,
            subscriber,
            service_pipe,
            demo,
            capture,
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
        let notifications = cx.new(|_| Notifications::from_center(notification_center));
        let calendar = cx.new(|_| calendar);
        let analysis = cx.new(|cx| {
            prepared_analysis.refresh(cx);
            prepared_analysis
        });
        let launcher = create_launcher(launcher_store, demo.as_ref(), capture.as_ref(), window, cx);
        wire_sections(&calendar, &notifications, &launcher, cx);
        let engineer = create_engineer(engineer, cx);
        let remote = cx.new(|cx| crate::services::view::Remote::new(service_pipe, cx));
        cx.observe(&remote, |_, _, cx| cx.notify()).detach();
        let strategy = cx.new(|cx| match &demo {
            Some(_) => Strategy::new_demo(
                strategy_dir,
                capture.as_ref().and_then(|capture| capture.strategy_page),
                cx,
            ),
            None => Strategy::new(strategy_dir, cx),
        });
        let mut settings = settings::State::new(prefs, testing_dir.clone(), window, cx);
        if let Some(page) = capture.as_ref().and_then(|capture| capture.settings_page) {
            settings.select_demo_page(page);
        }
        let testing = cx.new(|cx| Testing::new(testing_dir, remote.clone(), window, cx));
        wire_strategy(&strategy, cx);
        wire_studio_workshop(&workshop, cx);
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
            shell: chrome::State::new(access, capture.as_ref(), cx),
            demo,
            capture,
            focus,
            workshop,
            studio,
            calendar,
            analysis,
            launcher,
            engineer,
            strategy,
            remote,
            testing,
            settings,
            notifications,
            status: None,
            subscriber,
            previous_source: None,
            close_requested: false,
        }
    }
}

fn create_launcher(
    store: LauncherStore,
    demo: Option<&crate::demo::DemoData>,
    capture: Option<&crate::demo::CaptureState>,
    window: &mut Window,
    cx: &mut Context<Hub>,
) -> Entity<Launcher> {
    cx.new(|cx| match demo {
        Some(demo) => Launcher::new_demo(
            store,
            demo,
            capture
                .as_ref()
                .is_some_and(|capture| capture.launcher_new_profile),
            window,
            cx,
        ),
        None => Launcher::new(store, cx),
    })
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
    run_with_access(options, navigation::Access::default())
}

/// La integración de cuenta entrega derechos ya resueltos. Esta shell no
/// autentica el plan; sin integración deja el acceso monetizado sin verificar.
pub fn run_with_access(mut options: Options, access: navigation::Access) -> Result<(), String> {
    if let (Some(demo), Some(capture)) = (&mut options.demo, &options.capture) {
        demo.apply_capture(capture);
    }
    let notifications = match options.demo.as_ref() {
        Some(demo) => crate::notifications::Center::demo(demo, demo.fixed_now()?)?,
        None => crate::notifications::Center::default(),
    };
    let launcher = match options.demo.as_ref() {
        Some(demo) => LauncherStore::demo(options.launcher_file.clone(), demo)?,
        None => {
            if options.launcher_file == crate::launcher::default_path()? {
                LauncherStore::load_production(options.launcher_file.clone())?
            } else {
                LauncherStore::load(options.launcher_file.clone())?
            }
        }
    };
    let loaded = Loaded {
        analysis: prepare_analysis(&options)?,
        prepared: Prepared::load(&options.data_dir, options.scene)?,
        studio: PreparedStudio::load(options.layout)?,
        calendar: match options.demo.as_ref() {
            Some(demo) => Calendar::load_demo(&options.data_dir, demo)?,
            None => Calendar::load(&options.data_dir)?,
        },
        notifications,
        launcher,
        engineer: Engineer::load(options.engineer),
        strategy_dir: options.data_dir.clone(),
        testing_dir: options.data_dir.clone(),
        service_pipe: options
            .pipe
            .clone()
            .map_or_else(vantare_ipc::default_pipe_name, Ok)
            .map_err(|_| "IPC no disponible")?,
        subscriber: subscribe(options.pipe)?,
        demo: options.demo.clone(),
        capture: options.capture.clone(),
    };
    let stop = watch_stdin(options.controlled)?;
    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application()
        .with_assets(assets::Icons)
        .run(move |cx: &mut App| {
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
                    Hub::build(loaded, initial_section, access, failure_on_quit, window, cx)
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
