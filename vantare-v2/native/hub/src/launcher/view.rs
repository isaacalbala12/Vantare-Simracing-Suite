//! Presentación Orbit: estado persistido, borradores y progreso real.
use super::{
    App, CATALOG, Document, LmuTrigger, Profile, Step, Store,
    chain::{Action, Chain, Decision, Progress},
    discovery::{self, Discovery, Sources},
    input::Input,
    policy::{Close, Failure, Running},
    processes,
};
use crate::orbit::{self, button};
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
    executable: Option<PathBuf>,
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
    first_delay: Entity<orbit::NumberControl>,
    retries: Entity<orbit::NumberControl>,
    failure: Entity<orbit::Choice>,
    reuse: Entity<orbit::Choice>,
    cancel: Entity<orbit::Choice>,
    exit: Entity<orbit::Choice>,
    tabs: Entity<orbit::Choice>,
    app_ids: Vec<String>,
    steps: Vec<StepDraft>,
}

pub struct Launcher {
    store: Store,
    processes: processes::Shared,
    pending_decision: Option<Decision>,
    exit_answer: Option<Action>,
    exit_cancelled: bool,
    discovered: Discovery,
    scanning: bool,
    last_scan: Option<chrono::DateTime<chrono::Local>>,
    chain: Option<Chain>,
    progress: Vec<Progress>,
    app_draft: Option<AppDraft>,
    profile_draft: Option<ProfileDraft>,
    pending_app_removal: Option<String>,
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

impl Launcher {
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
        if create_profile {
            view.new_profile(None, window, cx);
        }
        view
    }

    fn build(store: Store, discovery: Option<Discovery>, cx: &mut Context<Self>) -> Self {
        let mut view = Self {
            store,
            processes: std::sync::Arc::new(std::sync::Mutex::new(processes::Processes::default())),
            pending_decision: None,
            exit_answer: None,
            exit_cancelled: false,
            discovered: discovery.unwrap_or_default(),
            scanning: false,
            last_scan: None,
            chain: None,
            progress: vec![],
            app_draft: None,
            profile_draft: None,
            pending_app_removal: None,
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
            if policy.exit == Close::CloseStarted
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
            orbit::INK,
        ));
        for (index, &action) in decision.actions.iter().enumerate() {
            form = form.child(editor::form_button(
                button(action.label(), action.label()),
                &self.form_actions[index],
                move |this, window, cx| this.answer_decision(action, window, cx),
                cx,
            ));
        }
        form
    }

    fn tick(&mut self, cx: &mut Context<Self>) {
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
        // Reusar la foto del discovery sin volver a recorrer discos en el hilo UI.
        let found = Discovery {
            apps: self.discovered.apps.clone(),
            steam_executable: self.discovered.steam_executable.clone(),
            warnings: vec![],
        };
        match Chain::start_with_processes(
            self.store.document.clone(),
            profile,
            found,
            self.processes.clone(),
        ) {
            Ok(chain) => {
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

    fn app_editor(&mut self, app: Option<App>, window: &mut Window, cx: &mut Context<Self>) {
        let (id, name, args, executable) = app
            .map_or((None, "Nueva aplicación".into(), vec![], None), |app| {
                (Some(app.id), app.name, app.args, app.executable)
            });
        self.app_draft = Some(AppDraft {
            id,
            name: input(name, "Nombre de aplicación", cx),
            args: input(args_json(&args), "Argumentos de aplicación en JSON", cx),
            executable,
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
                        draft.executable = paths.into_iter().next();
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
        let path = draft.executable.clone();
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
        let path = draft.executable.as_ref().map_or(
            if official {
                "automática".into()
            } else {
                "pendiente de elegir".into()
            },
            |path| path.display().to_string(),
        );
        orbit::card("Aplicación · borrador sin guardar").child(
            orbit::card_body()
                .when_some(self.error.clone(), |body, error| {
                    body.child(presentation::error_panel(error, cx))
                })
                .child(orbit::setting_row(
                    "Nombre",
                    "Nombre visible en el catálogo",
                    draft.name.clone(),
                ))
                .child(orbit::setting_row(
                    "Argumentos",
                    "Array JSON de strings; sin shell",
                    draft.args.clone(),
                ))
                .child(orbit::setting_row(
                    "Ejecutable",
                    &path,
                    div()
                        .flex()
                        .flex_wrap()
                        .gap_2()
                        .child(editor::form_button(
                            button("pick-app-path", "Elegir ejecutable"),
                            &self.form_actions[0],
                            |this, _, cx| this.pick_executable(cx),
                            cx,
                        ))
                        .when(official, |row| {
                            row.child(button("auto-app-path", "Usar descubrimiento").on_click(
                                cx.listener(|this, _, _, cx| {
                                    if let Some(draft) = &mut this.app_draft {
                                        draft.executable = None;
                                    }
                                    cx.notify();
                                }),
                            ))
                        }),
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
                button("save-app", "Guardar aplicación"),
                &self.form_actions[2],
                Self::commit_form,
                cx,
            ))
            .child(editor::form_button(
                button("discard-app", "Descartar borrador"),
                &self.form_actions[1],
                Self::close_form,
                cx,
            ))
            .when_some(
                draft.id.clone().filter(|id| id.starts_with("custom:")),
                |row, id| {
                    row.child(
                        button("delete-app", "Eliminar aplicación").on_click(cx.listener(
                            move |this, _, window, cx| {
                                if this.edit(|doc| doc.remove_app(&id), cx) {
                                    this.close_form(window, cx);
                                    this.scan(cx);
                                }
                            },
                        )),
                    )
                },
            )
    }
}
