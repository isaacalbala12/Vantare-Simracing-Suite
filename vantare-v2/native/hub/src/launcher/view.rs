//! Presentación Orbit: estado persistido, borradores y progreso real.
use super::{
    App, CATALOG, Document, LmuTrigger, Profile, Step, Store,
    chain::{Action, Chain, Decision, Progress},
    discovery::{self, Discovery, Sources},
    policy::{Close, Failure, Running},
    processes,
};
use crate::orbit::{self, Input, button};
use gpui::{
    Context, Entity, IntoElement, PathPromptOptions, Render, WeakEntity, Window, div, prelude::*,
};
use std::{
    collections::HashMap,
    path::PathBuf,
    time::{Duration, Instant},
};

struct AppDraft {
    id: Option<String>,
    name: Entity<Input>,
    args: Entity<Input>,
    executable: Entity<Input>,
}
struct StepDraft {
    app: Entity<orbit::Choice>,
    delay: Entity<orbit::NumberControl>,
    args: Entity<Input>,
}
struct ProfileDraft {
    profile: Profile,
    name: Entity<Input>,
    description: Entity<Input>,
    notes: Entity<Input>,
    hotkey: Entity<Input>,
    autostart: Entity<orbit::Checkbox>,
    first_delay: Entity<orbit::NumberControl>,
    retries: Entity<orbit::NumberControl>,
    failure: Entity<orbit::Choice>,
    reuse: Entity<orbit::Choice>,
    cancel: Entity<orbit::Choice>,
    exit: Entity<orbit::Choice>,
    retry_policy: Entity<orbit::Choice>,
    tabs: Entity<orbit::Choice>,
    app_ids: Vec<String>,
    steps: Vec<StepDraft>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Capture {
    None,
    Resting,
    Running,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LauncherPage {
    Showcase,
    Manage,
    History,
    Editor,
}

pub struct Launcher {
    adapt: orbit::Adapt,
    page: LauncherPage,
    capture: Capture,
    showcase_controls: Option<showcase::Controls>,
    profile_scroll: gpui::ScrollHandle,
    selected_profile: Option<String>,
    store: Store,
    processes: processes::Shared,
    pending_decision: Option<Decision>,
    resident_decision: Option<u64>,
    resident_answered: Option<u64>,
    resident_error: Option<String>,
    exit_answer: Option<Action>,
    exit_cancelled: bool,
    discovered: Discovery,
    scanning: bool,
    last_scan: Option<chrono::DateTime<chrono::Local>>,
    chain: Option<Chain>,
    progress: Vec<Progress>,
    last_profile: Option<Profile>,
    app_draft: Option<AppDraft>,
    profile_draft: Option<ProfileDraft>,
    pending_app_removal: Option<String>,
    pending_profile_removal: Option<String>,
    form_layer: Option<Entity<editor::LauncherDrawer>>,
    demo_descriptions: HashMap<String, String>,
    form_actions: [gpui::FocusHandle; 3],
    query: Entity<Input>,
    trigger: LmuTrigger,
    trigger_polling: bool,
    next_trigger: Instant,
    pub error: Option<String>,
    status: String,
}

fn input(value: String, label: &'static str, cx: &mut Context<Launcher>) -> Entity<Input> {
    cx.new(|cx| Input::new(value, label, cx))
}
fn args_json(args: &[String]) -> String {
    // La serialización de strings a JSON no puede fallar; mostrar el error si cambia ese contrato.
    serde_json::to_string(args).unwrap_or_else(|error| format!("error JSON: {error}"))
}
fn parse_args(value: &str) -> Result<Vec<String>, String> {
    serde_json::from_str(value)
        .map_err(|error| format!("argumentos: usa un array JSON de strings: {error}"))
}
#[path = "editor.rs"]
mod editor;
#[path = "presentation.rs"]
mod presentation;
#[path = "showcase.rs"]
mod showcase;

impl Launcher {
    pub(crate) fn set_adapt(&mut self, adapt: orbit::Adapt, cx: &mut Context<Self>) {
        if self.adapt != adapt {
            self.adapt = adapt;
            cx.notify();
        }
    }

    pub fn form_layer(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyView> {
        if self.pending_decision.is_some() && self.form_layer.is_none() {
            self.open_form(window, cx);
        }
        self.form_layer.clone().map(Into::into)
    }

    pub fn new(store: Store, cx: &mut Context<Self>) -> Self {
        Self::build(store, None, cx)
    }

    pub fn new_demo(
        store: Store,
        demo: &crate::demo::DemoData,
        create_profile: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut view = Self::build(store, Some(Discovery::demo(demo)), cx);
        view.demo_descriptions = demo
            .launcher
            .profiles
            .iter()
            .map(|profile| (profile.id.clone(), profile.description.clone()))
            .collect();
        for sample in &demo.launcher.profiles {
            if let Some(profile) = view
                .store
                .document
                .profiles
                .iter_mut()
                .find(|profile| profile.id == sample.id)
            {
                profile.launch_count = sample.launch_count;
                profile
                    .last_launched_at
                    .clone_from(&sample.last_launched_at);
                profile.avg_chain_duration_ms = sample.avg_chain_duration_ms;
                if let Some(ready) = sample.last_ready_steps {
                    view.last_profile = Some(profile.clone());
                    view.progress = (0..ready)
                        .map(|step| Progress {
                            step: Some(step),
                            status: super::chain::Status::Ready,
                            pid: None,
                            message: "Perfil de ejemplo".into(),
                            success: true,
                            decision: None,
                        })
                        .collect();
                }
            }
        }
        if create_profile {
            view.new_profile(None, window, cx);
            if let Some(layer) = &view.form_layer {
                layer.update(cx, |drawer, cx| drawer.capture_focus(window, cx));
            }
        }
        view
    }

    fn build(store: Store, discovery: Option<Discovery>, cx: &mut Context<Self>) -> Self {
        let mut view = Self {
            adapt: orbit::Adapt::default(),
            page: LauncherPage::Showcase,
            capture: Capture::None,
            showcase_controls: None,
            profile_scroll: gpui::ScrollHandle::new(),
            selected_profile: None,
            store,
            processes: std::sync::Arc::new(std::sync::Mutex::new(processes::Processes::default())),
            pending_decision: None,
            resident_decision: None,
            resident_answered: None,
            resident_error: None,
            exit_answer: None,
            exit_cancelled: false,
            discovered: discovery.unwrap_or_default(),
            scanning: false,
            last_scan: None,
            chain: None,
            progress: vec![],
            last_profile: None,
            app_draft: None,
            profile_draft: None,
            pending_app_removal: None,
            pending_profile_removal: None,
            form_layer: None,
            demo_descriptions: HashMap::new(),
            form_actions: [cx.focus_handle(), cx.focus_handle(), cx.focus_handle()],
            query: input(String::new(), "Buscar aplicaciones y perfiles", cx),
            trigger: LmuTrigger::default(),
            trigger_polling: false,
            next_trigger: Instant::now(),
            error: None,
            status: "Sin escaneo".into(),
        };
        cx.observe(&view.query, |_, _, cx| cx.notify()).detach();
        if view.discovered.apps.is_empty() {
            view.scan(cx);
        }
        cx.spawn(async move |this, cx| {
            loop {
                if this.update(cx, Self::tick).is_err() {
                    break;
                }
                cx.background_executor()
                    .timer(Duration::from_millis(100))
                    .await;
            }
        })
        .detach();
        view
    }

    fn report(&mut self, result: Result<(), String>, cx: &mut Context<Self>) {
        self.error = result.err();
        cx.notify();
    }

    pub(super) fn reload(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        match Store::load(self.store.path.clone()) {
            Ok(store) => {
                self.close_form(window, cx);
                self.store = store;
                self.trigger = LmuTrigger::default();
                self.error = None;
                self.scan(cx);
            }
            Err(error) => self.report(Err(error), cx),
        }
    }

    fn edit(
        &mut self,
        edit: impl FnOnce(&mut Document) -> Result<(), String>,
        cx: &mut Context<Self>,
    ) -> bool {
        let mut document = self.store.document.clone();
        let result = edit(&mut document).and_then(|()| self.store.replace(document));
        let success = result.is_ok();
        if success {
            self.status = "Guardado local confirmado".into();
        }
        self.report(result, cx);
        success
    }

    fn scan(&mut self, cx: &mut Context<Self>) {
        if self.scanning {
            return;
        }
        self.scanning = true;
        let apps = self.store.document.apps.clone();
        let observed_apps = apps.clone();
        cx.spawn(async move |this, cx| {
            let found = cx
                .background_executor()
                .spawn(async move { Discovery::scan(&apps, Sources::system()) })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.scanning = false;
                if this.store.document.apps != observed_apps {
                    this.scan(cx);
                    return;
                }
                this.discovered = found;
                this.last_scan = Some(chrono::Local::now());
                this.status = "Escaneo local terminado".into();
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn shutdown(&mut self) -> Result<(), String> {
        if let Some(chain) = &mut self.chain {
            chain.shutdown()?;
        }
        self.close_on_exit()
    }

    fn close_on_exit(&mut self) -> Result<(), String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|e| format!("procesos Launcher: {e}"))?;
        for profile in &self.store.document.profiles {
            let policy = profile.effective_policy();
            if policy.exit == Close::Started
                || policy.exit == Close::Ask && self.exit_answer == Some(Action::CloseStarted)
            {
                processes.close_profile(&profile.id)?;
            }
        }
        Ok(())
    }

    pub fn take_exit_cancelled(&mut self) -> bool {
        std::mem::take(&mut self.exit_cancelled)
    }

    pub fn can_close(&mut self, cx: &mut Context<Self>) -> bool {
        if let Some(chain) = &self.chain {
            chain.prepare_shutdown();
            return false;
        }
        let result = (|| {
            let mut processes = self
                .processes
                .lock()
                .map_err(|e| format!("procesos Launcher: {e}"))?;
            for profile in &self.store.document.profiles {
                if profile.effective_policy().exit == Close::Ask
                    && processes.has_profile(&profile.id)?
                    && self.exit_answer.is_none()
                {
                    self.pending_decision = Some(Decision {
                        id: 0,
                        message: "¿Cerrar las aplicaciones iniciadas por Vantare antes de salir?"
                            .into(),
                        actions: vec![Action::Leave, Action::CloseStarted, Action::Cancel],
                    });
                    return Ok(false);
                }
            }
            Ok::<_, String>(true)
        })();
        match result {
            Ok(ready) => {
                cx.notify();
                ready
            }
            Err(error) => {
                self.report(Err(error), cx);
                self.exit_cancelled = true;
                false
            }
        }
    }

    pub(super) fn answer_decision(
        &mut self,
        action: Action,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(decision) = self.pending_decision.take() else {
            return;
        };
        if !decision.actions.contains(&action) {
            self.pending_decision = Some(decision);
            return;
        }
        if decision.id == 0 {
            if action == Action::Cancel {
                self.exit_cancelled = true;
            } else {
                self.exit_answer = Some(action);
            }
        } else if self.resident_decision == Some(decision.id) {
            let request = vantare_ipc::launcher::Request::Answer {
                decision: decision.id,
                action: action.label().into(),
            };
            let result = serde_json::to_vec(&request)
                .map_err(|error| error.to_string())
                .and_then(|bytes| {
                    super::files::save(
                        &vantare_ipc::launcher::request_path(&self.store.path),
                        &bytes,
                        None,
                    )
                });
            self.resident_decision = None;
            if result.is_ok() {
                self.resident_answered = Some(decision.id);
            }
            self.report(result, cx);
        } else if let Some(chain) = &self.chain {
            let result = chain.answer(decision.id, action);
            self.report(result, cx);
        }
        self.close_form(window, cx);
    }

    pub(super) fn decision_form(&self, cx: &Context<Self>) -> gpui::Div {
        let Some(decision) = &self.pending_decision else {
            return div();
        };
        let mut form = div().flex().flex_col().gap_3().child(orbit::text(
            decision.message.clone(),
            orbit::BODY,
            500,
            orbit::ink(cx),
            cx,
        ));
        for (index, &action) in decision.actions.iter().enumerate() {
            form = form.child(editor::form_button(
                button(action.label(), action.label(), cx),
                &self.form_actions[index],
                move |this, window, cx| this.answer_decision(action, window, cx),
                cx,
            ));
        }
        form
    }

    fn poll_resident(&mut self, cx: &mut Context<Self>) {
        if let Some(status) = vantare_ipc::launcher::read_status(&self.store.path) {
            let error = status.error.or_else(|| {
                status
                    .profiles
                    .iter()
                    .find_map(|profile| profile.error.clone())
            });
            if error != self.resident_error || self.error.is_none() && error.is_some() {
                if self.error.is_none() || self.error == self.resident_error {
                    self.error.clone_from(&error);
                }
                self.resident_error = error;
                cx.notify();
            }
            if self.chain.is_none() && !status.progress.is_empty() && self.status != status.progress
            {
                self.status = status.progress;
                cx.notify();
            }
            if self.pending_decision.is_none()
                && self.chain.is_none()
                && let Some(decision) = status.decision
                && self.resident_answered != Some(decision.id)
            {
                let actions = [
                    Action::Trust,
                    Action::Reuse,
                    Action::Restart,
                    Action::Cancel,
                    Action::Stop,
                    Action::Continue,
                    Action::Leave,
                    Action::CloseStarted,
                ]
                .into_iter()
                .filter(|action| decision.actions.iter().any(|label| label == action.label()))
                .take(self.form_actions.len())
                .collect();
                self.pending_decision = Some(Decision {
                    id: decision.id,
                    message: decision.message,
                    actions,
                });
                self.resident_decision = Some(decision.id);
                cx.notify();
            }
        }
    }

    fn tick(&mut self, cx: &mut Context<Self>) {
        self.poll_resident(cx);
        if let Some(chain) = &self.chain {
            let events: Vec<_> = chain.progress.try_iter().collect();
            if !events.is_empty() {
                for event in &events {
                    if let Some(decision) = &event.decision {
                        self.pending_decision = Some(decision.clone());
                    }
                }
                self.progress.extend(events);
                if self.progress.len() > 512 {
                    self.progress.drain(..self.progress.len() - 512);
                }
                cx.notify();
            }
            if chain.finished()
                && let Some(mut chain) = self.chain.take()
            {
                if self
                    .pending_decision
                    .as_ref()
                    .is_some_and(|decision| decision.id != 0)
                {
                    self.pending_decision = None;
                    self.form_layer = None;
                }
                let result = chain.shutdown();
                self.progress.extend(chain.progress.try_iter());
                if let Some(event) = self.progress.last() {
                    self.status = event.message.clone();
                }
                self.report(result, cx);
            }
        }
        if Instant::now() < self.next_trigger
            || self.store.document.lmu_trigger_profile.is_none()
            || self.trigger_polling
            || self.scanning
        {
            return;
        }
        self.next_trigger = Instant::now() + Duration::from_secs(1);
        let Some(path) = self
            .discovered
            .app("lmu")
            .and_then(|app| app.executable.clone())
        else {
            return;
        };
        let profile_id = self.store.document.lmu_trigger_profile.clone();
        let observed_path = path.clone();
        self.trigger_polling = true;
        cx.spawn(async move |this, cx| {
            let open = cx
                .background_executor()
                .spawn(async move { discovery::running(&path) })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.trigger_polling = false;
                if this.store.document.lmu_trigger_profile != profile_id
                    || this
                        .discovered
                        .app("lmu")
                        .and_then(|app| app.executable.as_ref())
                        != Some(&observed_path)
                {
                    return;
                }
                match open {
                    Ok(pid) => {
                        if this.trigger.observe(true, pid.is_some())
                            && let Some(profile) = this
                                .store
                                .document
                                .profiles
                                .iter()
                                .find(|profile| Some(&profile.id) == profile_id.as_ref())
                                .cloned()
                        {
                            this.start(profile, cx);
                        }
                    }
                    Err(error) => this.report(Err(error), cx),
                }
            });
        })
        .detach();
    }

    pub fn launch_progress(&self) -> Option<(usize, usize)> {
        if self.chain.is_none() && self.capture != Capture::Running {
            return None;
        }
        let profile = self.last_profile.as_ref()?;
        self.profile_progress(&profile.id)
    }
    pub fn profile_progress(&self, id: &str) -> Option<(usize, usize)> {
        let profile = self
            .last_profile
            .as_ref()
            .filter(|profile| profile.id == id)?;
        let ready = (0..profile.steps.len())
            .filter(|index| {
                self.progress
                    .iter()
                    .rev()
                    .find(|event| event.step == Some(*index))
                    .is_some_and(|event| event.status == super::chain::Status::Ready)
            })
            .count();
        Some((ready, profile.steps.len()))
    }
    /// Cadena legible del perfil («LMU → OBS → Spotify») para la barra lateral.
    pub fn profile_route(&self, profile: &Profile) -> String {
        profile
            .steps
            .iter()
            .map(|step| {
                self.store
                    .document
                    .apps
                    .iter()
                    .find(|app| app.id == step.app_id)
                    .map_or(step.app_id.as_str(), |app| app.name.as_str())
            })
            .collect::<Vec<_>>()
            .join(" → ")
    }
    pub(crate) fn global_hotkey_status(&self, id: &str) -> String {
        vantare_ipc::launcher::read_status(&self.store.path)
            .and_then(|status| {
                status
                    .profiles
                    .into_iter()
                    .find(|profile| profile.profile == id)
            })
            .map_or_else(
                || "Registro no confirmado · abre Vantare desde el instalador".into(),
                |registration| {
                    registration.error.unwrap_or_else(|| {
                        if registration.registered {
                            "Registrado en Windows".into()
                        } else {
                            "Sin registro activo".into()
                        }
                    })
                },
            )
    }
    pub(crate) fn global_hotkey_error(&self) -> Option<&str> {
        self.resident_error.as_deref()
    }
    pub fn saved_profiles(&self) -> &[Profile] {
        &self.store.document.profiles
    }

    pub fn launch_id(&mut self, id: &str, cx: &mut Context<Self>) {
        match self
            .store
            .document
            .profiles
            .iter()
            .find(|profile| profile.id == id)
            .cloned()
        {
            Some(profile) => self.start(profile, cx),
            None => self.report(
                Err("perfil inexistente; vuelve a cargar Launcher".into()),
                cx,
            ),
        }
    }

    pub fn default_profile_id(&self) -> Option<String> {
        self.store
            .document
            .profiles
            .iter()
            .min_by(|a, b| {
                b.favorite
                    .cmp(&a.favorite)
                    .then_with(|| a.name.cmp(&b.name))
            })
            .map(|profile| profile.id.clone())
    }

    fn start(&mut self, profile: Profile, cx: &mut Context<Self>) {
        if self.chain.is_some() {
            self.report(
                Err("ya hay una cadena activa; cancélala o espera".into()),
                cx,
            );
            return;
        }
        if self.scanning {
            self.report(Err("espera a terminar el descubrimiento".into()), cx);
            return;
        }
        if !presentation::launchable(&profile, &self.discovered, false) {
            self.report(
                Err("el perfil necesita pasos con aplicaciones disponibles".into()),
                cx,
            );
            return;
        }
        // Reusar la foto del discovery sin volver a recorrer discos en el hilo UI.
        let found = Discovery {
            apps: self.discovered.apps.clone(),
            steam_executable: self.discovered.steam_executable.clone(),
            warnings: vec![],
        };
        let selected = (0..profile.steps.len()).collect();
        self.start_selection(profile, found, selected, cx);
    }

    fn start_selection(
        &mut self,
        profile: Profile,
        found: Discovery,
        selected: Vec<usize>,
        cx: &mut Context<Self>,
    ) {
        if self.capture != Capture::None {
            return;
        }
        match Chain::start_selected(
            self.store.document.clone(),
            profile.clone(),
            found,
            self.processes.clone(),
            selected,
        ) {
            Ok(chain) => {
                self.page = LauncherPage::Showcase;
                self.selected_profile = Some(profile.id.clone());
                self.last_profile = Some(profile);
                self.chain = Some(chain);
                self.progress.clear();
                self.exit_answer = None;
                self.error = None;
                self.status = "Cadena en marcha".into();
                cx.notify();
            }
            Err(error) => self.report(Err(error), cx),
        }
    }

    fn retry(&mut self, scope: super::chain::RetryScope, cx: &mut Context<Self>) {
        if self.chain.is_some() || self.scanning {
            return;
        }
        let Some(profile) = self.last_profile.clone() else {
            return;
        };
        let selected = super::chain::retry_steps(&profile, &self.progress, scope);
        let found = Discovery {
            apps: self.discovered.apps.clone(),
            steam_executable: self.discovered.steam_executable.clone(),
            warnings: vec![],
        };
        self.start_selection(profile, found, selected, cx);
    }

    fn app_editor(&mut self, app: Option<App>, window: &mut Window, cx: &mut Context<Self>) {
        let (id, name, args, executable) = app
            .map_or((None, "Nueva aplicación".into(), vec![], None), |app| {
                (Some(app.id), app.name, app.args, app.executable)
            });
        self.app_draft = Some(AppDraft {
            id,
            name: input(name, "Nombre de aplicación", cx),
            args: input(args_json(&args), "Argumentos de aplicación en JSON", cx),
            executable: input(
                executable.map_or(String::new(), |path| path.display().to_string()),
                "Ruta de ejecutable",
                cx,
            ),
        });
        self.profile_draft = None;
        self.open_form(window, cx);
    }

    fn pick_executable(&mut self, cx: &mut Context<Self>) {
        let Some(draft) = &self.app_draft else {
            return;
        };
        let identity = draft.name.clone();
        let picker = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Selecciona el ejecutable de la aplicación".into()),
        });
        cx.spawn(async move |this, cx| {
            let selected = match picker.await {
                Ok(Ok(paths)) => Ok(paths),
                Ok(Err(error)) => Err(error.to_string()),
                Err(error) => Err(error.to_string()),
            };
            let _ = this.update(cx, |this, cx| match selected {
                Ok(Some(paths)) => {
                    if let Some(draft) = &mut this.app_draft
                        && draft.name == identity
                    {
                        if let Some(path) = paths.into_iter().next() {
                            draft.executable.update(cx, |field, cx| {
                                field.set_value(path.display().to_string(), cx);
                            });
                        }
                        cx.notify();
                    }
                }
                Ok(None) => {}
                Err(error) => this.report(Err(error), cx),
            });
        })
        .detach();
    }

    fn save_app(&mut self, cx: &mut Context<Self>) {
        let Some(draft) = &self.app_draft else {
            return;
        };
        let name = draft.name.read(cx).value.trim().to_string();
        let args = match parse_args(&draft.args.read(cx).value) {
            Ok(args) => args,
            Err(error) => {
                self.report(Err(error), cx);
                return;
            }
        };
        let id = draft.id.clone();
        let path = match draft.executable.read(cx).value.trim() {
            "" => None,
            value => Some(PathBuf::from(value)),
        };
        if self.edit(
            move |document| {
                if let Some(id) = id {
                    let app = document
                        .apps
                        .iter_mut()
                        .find(|app| app.id == id)
                        .ok_or("app inexistente")?;
                    if let Some(path) = &path
                        && !super::is_executable(path)
                    {
                        return Err("el ejecutable no existe".into());
                    }
                    app.name = name;
                    app.executable = path;
                    app.args = args;
                } else {
                    let id = document.add_app(name, path.ok_or("elige un ejecutable")?)?;
                    let app = document
                        .apps
                        .iter_mut()
                        .find(|app| app.id == id)
                        .ok_or("app inexistente")?;
                    app.args = args;
                }
                Ok(())
            },
            cx,
        ) {
            self.app_draft = None;
            self.scan(cx);
        }
    }

    fn app_form(&self, cx: &mut Context<Self>) -> gpui::Div {
        let Some(draft) = &self.app_draft else {
            return div();
        };
        let official = draft
            .id
            .as_deref()
            .is_some_and(|id| CATALOG.iter().any(|app| app.id == id));
        orbit::card("Aplicación · borrador sin guardar", cx).child(
            orbit::card_body()
                .when_some(self.error.clone(), |body, error| {
                    body.child(presentation::error_panel(error, cx))
                })
                .child(orbit::setting_row(
                    "Nombre",
                    "Nombre visible en el catálogo",
                    draft.name.clone(),
                    cx,
                ))
                .child(orbit::setting_row(
                    "Argumentos",
                    "Array JSON de strings; sin shell",
                    draft.args.clone(),
                    cx,
                ))
                .child(orbit::setting_row(
                    "Ejecutable",
                    "Ruta local; vacia usa descubrimiento para apps oficiales",
                    div()
                        .flex()
                        .flex_wrap()
                        .gap_2()
                        .child(draft.executable.clone())
                        .child(editor::form_button(
                            button("pick-app-path", "Elegir ejecutable", cx),
                            &self.form_actions[0],
                            |this, _, cx| this.pick_executable(cx),
                            cx,
                        ))
                        .when(official, |row| {
                            row.child(button("auto-app-path", "Usar descubrimiento", cx).on_click(
                                cx.listener(|this, _, _, cx| {
                                    if let Some(draft) = &mut this.app_draft {
                                        draft.executable.update(cx, |field, cx| {
                                            field.set_value(String::new(), cx);
                                        });
                                    }
                                    cx.notify();
                                }),
                            ))
                        }),
                    cx,
                ))
                .child(self.app_actions(cx)),
        )
    }
    fn app_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        let Some(draft) = &self.app_draft else {
            return div();
        };
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .py_2()
            .child(editor::form_button(
                button("save-app", "Guardar aplicación", cx),
                &self.form_actions[2],
                Self::commit_form,
                cx,
            ))
            .child(editor::form_button(
                button("discard-app", "Descartar borrador", cx),
                &self.form_actions[1],
                Self::close_form,
                cx,
            ))
            .when_some(
                draft.id.clone().filter(|id| id.starts_with("custom:")),
                |row, id| {
                    row.child(button("delete-app", "Eliminar aplicación", cx).on_click(
                        cx.listener(move |this, _, window, cx| {
                            if this.edit(|doc| doc.remove_app(&id), cx) {
                                this.close_form(window, cx);
                                this.scan(cx);
                            }
                        }),
                    ))
                },
            )
    }
}
