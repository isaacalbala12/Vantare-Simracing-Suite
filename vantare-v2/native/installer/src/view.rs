//! Presentation and owned worker lifecycle; it never writes installation state itself.
use crate::{
    args::Args,
    engine::{Request, Session},
    model::{Info, Mode, Progress, Screen},
    work::{self, Event, Work},
};
use gpui::{
    App, Bounds, Context, Entity, FocusHandle, IntoElement, Render, Window, WindowBounds,
    WindowOptions, div, prelude::*, px, size,
};
use std::{
    cell::Cell,
    path::{Path, PathBuf},
    rc::Rc,
    time::Duration,
};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Install,
    Proceed,
    Retry,
    Options,
    Details,
    Desktop,
    Autostart,
    Change,
    Update,
    Repair,
    Remove,
    Back,
    Cancel,
    Open,
    Close,
    Minimize,
}
impl Action {
    pub const ALL: [Self; 16] = [
        Self::Options,
        Self::Change,
        Self::Desktop,
        Self::Autostart,
        Self::Update,
        Self::Repair,
        Self::Details,
        Self::Remove,
        Self::Back,
        Self::Cancel,
        Self::Close,
        Self::Install,
        Self::Proceed,
        Self::Retry,
        Self::Open,
        Self::Minimize,
    ];
    pub fn id(self) -> &'static str {
        match self {
            Self::Install => "install",
            Self::Proceed => "proceed",
            Self::Retry => "retry",
            Self::Options => "options",
            Self::Details => "details",
            Self::Desktop => "desktop",
            Self::Autostart => "autostart",
            Self::Change => "change",
            Self::Update => "update",
            Self::Repair => "repair",
            Self::Remove => "remove",
            Self::Back => "back",
            Self::Cancel => "cancel",
            Self::Open => "open",
            Self::Close => "close",
            Self::Minimize => "minimize",
        }
    }
}

#[allow(clippy::struct_excessive_bools)] // Independent UI expansion, launch, capture and cancellation flags.
pub struct Installer {
    pub info: Info,
    pub args: Args,
    pub screen: Screen,
    pub mode: Mode,
    pub options: bool,
    pub details: bool,
    pub opening: bool,
    pub percent: u8,
    pub step: String,
    pub error: u8,
    pub diagnostic: String,
    pub last_log: Option<PathBuf>,
    pub can_cancel: bool,
    pub capture: bool,
    pub transition: u32,
    work: Option<Work>,
    close_requested: bool,
    exit: Rc<Cell<u8>>,
    pub focus: FocusHandle,
    pub focuses: Vec<(Action, FocusHandle)>,
    pub logo: std::sync::Arc<gpui::Image>,
    pub copied_bytes: u64,
}

impl Installer {
    pub(crate) fn new(
        info: Info,
        args: Args,
        capture: bool,
        exit: Rc<Cell<u8>>,
        cx: &mut Context<Self>,
    ) -> Self {
        let screen = if args.uninstall {
            Screen::Uninstall
        } else if info.installed_version.is_some() {
            Screen::Installed
        } else {
            Screen::Welcome
        };
        let mode = if args.uninstall {
            Mode::Remove
        } else if info.allows(Mode::Update) {
            Mode::Update
        } else if info.allows(Mode::Repair) {
            Mode::Repair
        } else {
            Mode::Install
        };
        Self {
            info,
            args,
            screen,
            mode,
            options: false,
            details: false,
            opening: false,
            percent: 0,
            step: "prepare".into(),
            error: 0,
            diagnostic: String::new(),
            last_log: None,
            can_cancel: false,
            capture,
            transition: 0,
            work: None,
            close_requested: false,
            exit,
            focus: cx.focus_handle(),
            focuses: Action::ALL
                .into_iter()
                .map(|a| (a, cx.focus_handle()))
                .collect(),
            logo: std::sync::Arc::new(gpui::Image::from_bytes(
                gpui::ImageFormat::Svg,
                include_bytes!("../assets/logo.svg").to_vec(),
            )),
            copied_bytes: 0,
        }
    }
    pub fn action(&mut self, action: Action, window: &mut Window, cx: &mut Context<Self>) {
        if self.capture {
            return;
        }
        match action {
            Action::Minimize => window.minimize_window(),
            Action::Close => {
                if self.try_close(cx) {
                    cx.quit();
                }
            }
            Action::Options => self.options = !self.options,
            Action::Details => self.details = !self.details,
            Action::Desktop => self.info.desktop = !self.info.desktop,
            Action::Autostart => self.info.autostart = !self.info.autostart,
            Action::Update => {
                if self.info.allows(Mode::Update) {
                    self.mode = Mode::Update;
                }
            }
            Action::Repair => {
                if self.info.allows(Mode::Repair) {
                    self.mode = Mode::Repair;
                }
            }
            Action::Install => self.start(Mode::Install, cx),
            Action::Proceed => {
                if self.info.allows(self.mode) {
                    self.start(self.mode, cx);
                }
            }
            Action::Retry => {
                if self.error == 1 || self.error == 2 {
                    self.start(self.mode, cx);
                }
            }
            Action::Remove => {
                if self.screen == Screen::Uninstall {
                    self.start(Mode::Remove, cx);
                } else {
                    self.mode = Mode::Remove;
                    self.show(Screen::Uninstall);
                }
            }
            Action::Back => {
                if self.args.uninstall {
                    if self.try_close(cx) {
                        cx.quit();
                    }
                    return;
                }
                self.mode = if self.info.allows(Mode::Update) {
                    Mode::Update
                } else {
                    Mode::Repair
                };
                self.show(Screen::Installed);
            }
            Action::Cancel => {
                if self.can_cancel
                    && let Some(work) = &self.work
                {
                    work.stop_before_transaction();
                }
            }
            Action::Change => self.choose_directory(cx),
            Action::Open => self.open(cx),
        }
        cx.notify();
    }
    fn show(&mut self, screen: Screen) {
        self.screen = screen;
        self.transition = self.transition.wrapping_add(1);
        self.options = false;
        self.details = false;
    }
    fn start(&mut self, mode: Mode, cx: &mut Context<Self>) {
        if self.work.is_some() {
            return;
        }
        self.begin(mode);
        let mut request = Request::new(
            &self.args,
            if mode == Mode::Remove {
                "Uninstall"
            } else {
                "Install"
            },
        );
        request.root = Some(self.info.root.clone());
        request.mode = mode;
        request.desktop = self.info.desktop;
        request.autostart = self.info.autostart;
        self.last_log = Some(request.log_file.clone());
        self.work = Some(Work::start(request));
        cx.notify();
    }
    pub(crate) fn begin(&mut self, mode: Mode) {
        self.mode = mode;
        self.show(Screen::Installing);
        self.percent = 0;
        self.copied_bytes = 0;
        self.step = "prepare".into();
        self.can_cancel = mode != Mode::Remove;
    }
    fn poll(&mut self, cx: &mut Context<Self>) {
        if self.work.is_none() {
            return;
        }
        let mut result = None;
        let mut events = Vec::new();
        if let Some(work) = &self.work {
            for event in work.events.try_iter() {
                match event {
                    Event::Progress(p) => events.push(p),
                    Event::Finished(outcome) => result = Some(outcome),
                }
            }
        }
        for event in events {
            self.progress(event);
        }
        if let Some(result) = result {
            self.work.take();
            self.finished(result, cx);
        }
        cx.notify();
    }
    pub(crate) fn progress(&mut self, p: Progress) {
        if p.total > 0 {
            self.copied_bytes = p.done;
        }
        self.percent = p.percent;
        self.step = p.step;
        self.can_cancel = p.can_cancel;
    }
    pub(crate) fn finished(&mut self, result: Result<u8, String>, cx: &mut Context<Self>) {
        self.can_cancel = false;
        match result {
            Ok(0) => {
                self.percent = 100;
                self.info.installed_version = if self.mode == Mode::Remove {
                    None
                } else {
                    Some(self.info.version.clone())
                };
                self.show(if self.mode == Mode::Remove {
                    Screen::Uninstalled
                } else {
                    Screen::Done
                });
                if self.mode != Mode::Remove && !self.capture {
                    let mut args = self.args.clone();
                    args.root = Some(self.info.root.clone());
                    if let Ok(session) = Session::new()
                        && let Ok(info) = session.probe(&Request::new(&args, "Probe"))
                    {
                        self.info = info;
                    }
                }
            }
            Ok(5) => {
                self.show(if self.info.installed_version.is_some() {
                    Screen::Installed
                } else {
                    Screen::Welcome
                });
                if self.close_requested {
                    self.exit.set(5);
                    cx.quit();
                }
            }
            Ok(code) => {
                self.error = code;
                self.diagnostic = String::new();
                self.show(Screen::Error);
            }
            Err(error) => {
                self.error = 1;
                self.diagnostic = error;
                self.show(Screen::Error);
            }
        }
        cx.notify();
    }
    fn try_close(&mut self, cx: &mut Context<Self>) -> bool {
        if self.capture {
            self.exit.set(0);
            return true;
        }
        if let Some(work) = &self.work {
            if self.can_cancel {
                work.stop_before_transaction();
                self.close_requested = true;
            }
            return false;
        }
        if self.screen == Screen::Uninstalled
            && let Err(error) = work::cleanup(self.info.root.clone())
        {
            self.error = 1;
            self.diagnostic = error;
            self.show(Screen::Error);
            cx.notify();
            return false;
        }
        self.exit.set(match self.screen {
            Screen::Done | Screen::Uninstalled => 0,
            Screen::Error => self.error,
            _ => 5,
        });
        true
    }
    fn choose_directory(&self, cx: &mut Context<Self>) {
        if self.info.installed_version.is_some() {
            return;
        }
        let choice = cx.prompt_for_paths(gpui::PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Elige una carpeta vacía para Vantare".into()),
        });
        cx.spawn(async move |this, cx| {
            if let Ok(Ok(Some(paths))) = choice.await
                && let Some(path) = paths.into_iter().next()
            {
                let _ = this.update(cx, |this, cx| {
                    this.info.root.clone_from(&path);
                    this.args.root = Some(path);
                    this.info.data_path = this.info.root.join("generations");
                    cx.notify();
                });
            }
        })
        .detach();
    }
    fn open(&mut self, cx: &mut Context<Self>) {
        if self.opening {
            return;
        }
        self.opening = true;
        let root = self.info.root.clone();
        let task = cx
            .background_executor()
            .spawn(async move { work::open(root) });
        cx.spawn(async move |this, cx| {
            let outcome = task.await;
            let _ = this.update(cx, |this, cx| {
                this.opening = false;
                if let Err(error) = outcome {
                    this.error = 1;
                    this.diagnostic = error;
                    this.show(Screen::Error);
                }
                cx.notify();
            });
        })
        .detach();
    }
    pub fn active_step(&self) -> usize {
        match self.step.as_str() {
            "extract" => 1,
            "verify" => 2,
            "copy" => 3,
            "shortcuts" => 4,
            "register" => 5,
            "done" => 6,
            _ => 0,
        }
    }
    pub fn keyboard(
        &mut self,
        event: &gpui::KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if event.keystroke.key == "escape" {
            self.action(Action::Close, window, cx);
        }
        if event.keystroke.key == "tab" {
            let active = self
                .focuses
                .iter()
                .filter(|(a, _)| self.visible(*a))
                .collect::<Vec<_>>();
            if !active.is_empty() {
                let current = active.iter().position(|(_, f)| f.is_focused(window));
                let next = current.map_or(0, |i| {
                    if event.keystroke.modifiers.shift {
                        (i + active.len() - 1) % active.len()
                    } else {
                        (i + 1) % active.len()
                    }
                });
                active[next].1.focus(window, cx);
                cx.stop_propagation();
            }
        }
    }
    fn visible(&self, a: Action) -> bool {
        match a {
            Action::Options | Action::Install => self.screen == Screen::Welcome,
            Action::Change => {
                self.screen == Screen::Welcome
                    && self.options
                    && self.info.installed_version.is_none()
            }
            Action::Desktop | Action::Autostart => self.screen == Screen::Welcome && self.options,
            Action::Update => self.screen == Screen::Installed && self.info.allows(Mode::Update),
            Action::Repair => self.screen == Screen::Installed && self.info.allows(Mode::Repair),
            Action::Details => self.screen == Screen::Error,
            Action::Remove => matches!(self.screen, Screen::Installed | Screen::Uninstall),
            Action::Back => self.screen == Screen::Uninstall,
            Action::Cancel => self.screen == Screen::Installing && self.can_cancel,
            Action::Close => matches!(
                self.screen,
                Screen::Done | Screen::Error | Screen::Uninstalled
            ),
            Action::Proceed => self.screen == Screen::Installed && self.info.allows(self.mode),
            Action::Retry => self.screen == Screen::Error && (self.error == 1 || self.error == 2),
            Action::Open => {
                self.screen == Screen::Done || self.screen == Screen::Error && self.error == 4
            }
            Action::Minimize => false,
        }
    }
}

impl Render for Installer {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .relative()
            .w(px(720.))
            .h(px(460.))
            .bg(gpui::rgb(0x0005_0505))
            .track_focus(&self.focus)
            .on_key_down(cx.listener(Self::keyboard))
            .child(crate::screens::frame(self, window, cx))
    }
}

fn initial_info(args: &Args, capture: bool) -> Result<(Info, Option<String>), String> {
    let mut probe_error = None;
    let info = if capture {
        #[cfg(feature = "parity-capture")]
        {
            let file = args
                .snapshot
                .as_ref()
                .ok_or("La captura necesita --snapshot=<metadatos QA>")?;
            if !file.starts_with(Path::new("C:/tmp/ola2/1591-qa")) {
                return Err("Snapshot fuera de la raíz QA".into());
            }
            crate::engine::reject_links(file)?;
            serde_json::from_slice::<Info>(&std::fs::read(file).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?
        }
        #[cfg(not(feature = "parity-capture"))]
        {
            return Err("Captura no disponible".into());
        }
    } else {
        match Session::new().and_then(|session| session.probe(&Request::new(args, "Probe"))) {
            Ok(info) => info,
            Err(error) => {
                probe_error = Some(error);
                let root = args.root.clone().unwrap_or_else(|| {
                    std::env::var_os("LOCALAPPDATA")
                        .map(PathBuf::from)
                        .unwrap_or_default()
                        .join("Programs/Vantare")
                });
                Info {
                    data_path: root.join("generations"),
                    root,
                    version: crate::VERSION.into(),
                    installed_version: None,
                    desktop: !args.silent,
                    autostart: false,
                    size: crate::payload::ARCHIVE.len() as u64,
                    reduced_motion: false,
                }
            }
        }
    };
    Ok((info, probe_error))
}

pub fn run(args: Args) -> Result<u8, String> {
    if crate::QA && Path::new("C:/tmp/fase2/pantalla-ocupada").exists() {
        return Err("La pantalla está ocupada; no se abre la ventana QA".into());
    }
    #[cfg(feature = "parity-capture")]
    let capture = args.capture.is_some();
    #[cfg(not(feature = "parity-capture"))]
    let capture = false;
    let (info, probe_error) = initial_info(&args, capture)?;
    let exit = Rc::new(Cell::new(1));
    let result = exit.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if crate::style::fonts(cx).is_err() {
            cx.quit();
            return;
        }
        cx.set_reduce_motion(info.reduced_motion || capture);
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                None,
                size(px(720.), px(460.)),
                cx,
            ))),
            window_min_size: Some(size(px(720.), px(460.))),
            titlebar: None,
            kind: gpui::WindowKind::PopUp,
            is_resizable: false,
            is_movable: true,
            is_minimizable: true,
            window_background: gpui::WindowBackgroundAppearance::Transparent,
            ..WindowOptions::default()
        };
        if let Err(error) = cx.open_window(options, |window, cx| {
            let view = cx.new(|cx: &mut Context<Installer>| {
                let mut view = Installer::new(info, args.clone(), capture, result.clone(), cx);
                if let Some(error) = probe_error {
                    view.error = 1;
                    view.diagnostic = error;
                    view.show(Screen::Error);
                }
                #[cfg(feature = "parity-capture")]
                if capture {
                    view.capture_state(args.screen.as_deref().unwrap_or("welcome"));
                }
                view
            });
            window.on_window_should_close(cx, {
                let closing = view.downgrade();
                move |_, cx| {
                    closing
                        .update(cx, Installer::try_close)
                        .unwrap_or(true)
                }
            });
            view.update(cx, |view, cx| view.focus.focus(window, cx));
            poll(&view, cx);
            #[cfg(feature = "parity-capture")]
            if let Some(path) = &args.capture {
                let native_fonts=cx.text_system().all_font_names().into_iter().filter(|name|name.contains("Installer")||name.contains("Rajdhani")||name.contains("Space Mono")).collect::<Vec<_>>();
                let widths=serde_json::json!({"fonts":native_fonts,"rajdhani_width":crate::style::text_width("Vantare,","Rajdhani",27.,window),"inter_width":crate::style::text_width("Overlays, launcher y perfiles en una sola app. Tarda alrededor","Installer Inter W400",13.5,window)});
                let _=std::fs::write(path.with_extension("fonts.json"),widths.to_string());
                let ready = path.with_extension("ready");
                cx.spawn(async move |cx| {
                    cx.background_executor()
                        .timer(Duration::from_millis(500))
                        .await;
                    let _ = std::fs::write(ready, "GPUI frame ready");
                })
                .detach();
            }
            view
        }) {
            eprintln!("Abrir Setup: {error}");
            cx.quit();
        }
        cx.activate(true);
    });
    Ok(exit.get())
}
fn poll(view: &Entity<Installer>, cx: &mut App) {
    let weak = view.downgrade();
    cx.spawn(async move |cx| {
        loop {
            cx.background_executor()
                .timer(Duration::from_millis(50))
                .await;
            if weak.update(cx, Installer::poll).is_err() {
                break;
            }
        }
    })
    .detach();
}

#[cfg(feature = "parity-capture")]
impl Installer {
    pub(crate) fn capture_toggle(&mut self, action: Action) {
        match action {
            Action::Options => self.options = !self.options,
            Action::Desktop => self.info.desktop = !self.info.desktop,
            Action::Autostart => self.info.autostart = !self.info.autostart,
            _ => {}
        }
    }
    pub(crate) fn capture_state(&mut self, state: &str) {
        self.mode = Mode::Install;
        self.screen = match state {
            "welcome" => Screen::Welcome,
            "options" => {
                self.options = true;
                Screen::Welcome
            }
            "installing" => {
                self.percent = 40;
                self.can_cancel = true;
                self.copied_bytes = self.info.size;
                self.step = "verify".into();
                Screen::Installing
            }
            "done" => Screen::Done,
            "error" => {
                self.error = 2;
                Screen::Error
            }
            "installed" => {
                self.mode = if self.info.allows(Mode::Update) {
                    Mode::Update
                } else {
                    Mode::Repair
                };
                Screen::Installed
            }
            "uninstall" => {
                self.mode = Mode::Remove;
                Screen::Uninstall
            }
            "uninstalled" => {
                self.mode = Mode::Remove;
                Screen::Uninstalled
            }
            _ => Screen::Error,
        };
    }
}
