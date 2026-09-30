//! Vista funcional Eficiencia: estado persistido, borradores y progreso real.
use super::{
    App, CATALOG, Document, LmuTrigger, Profile, Step, Store,
    chain::{Chain, Progress},
    discovery::{self, Discovery, Sources},
    input::Input,
};
use crate::shell::button;
use gpui::{Context, Entity, IntoElement, PathPromptOptions, Render, Window, div, prelude::*};
use std::{
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
    app_id: String,
    delay: Entity<Input>,
    args: Entity<Input>,
}
struct ProfileDraft {
    profile: Profile,
    name: Entity<Input>,
    first_delay: Entity<Input>,
    steps: Vec<StepDraft>,
}

pub struct Launcher {
    store: Store,
    discovered: Discovery,
    scanning: bool,
    chain: Option<Chain>,
    progress: Vec<Progress>,
    app_draft: Option<AppDraft>,
    profile_draft: Option<ProfileDraft>,
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
fn seconds(value: &str) -> Result<u32, String> {
    value
        .trim()
        .parse()
        .map_err(|error| format!("delay: indica segundos enteros: {error}"))
}

impl Launcher {
    pub fn new(store: Store, cx: &mut Context<Self>) -> Self {
        let mut view = Self {
            store,
            discovered: Discovery::default(),
            scanning: false,
            chain: None,
            progress: vec![],
            app_draft: None,
            profile_draft: None,
            trigger: LmuTrigger::default(),
            trigger_polling: false,
            next_trigger: Instant::now(),
            error: None,
            status: "Sin escaneo".into(),
        };
        view.scan(cx);
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
                this.status = "Escaneo local terminado".into();
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn reload(&mut self, cx: &mut Context<Self>) {
        match Store::load(self.store.path.clone()) {
            Ok(store) => {
                self.store = store;
                self.app_draft = None;
                self.profile_draft = None;
                self.trigger = LmuTrigger::default();
                self.error = None;
                self.scan(cx);
            }
            Err(error) => self.report(Err(error), cx),
        }
    }

    pub fn shutdown(&mut self) -> Result<(), String> {
        self.chain.as_mut().map_or(Ok(()), Chain::shutdown)
    }

    fn tick(&mut self, cx: &mut Context<Self>) {
        if let Some(chain) = &self.chain {
            let events: Vec<_> = chain.progress.try_iter().collect();
            if !events.is_empty() {
                self.progress.extend(events);
                if self.progress.len() > 512 {
                    self.progress.drain(..self.progress.len() - 512);
                }
                cx.notify();
            }
            if chain.finished()
                && let Some(mut chain) = self.chain.take()
            {
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
        match Chain::start(self.store.document.clone(), profile, found) {
            Ok(chain) => {
                self.chain = Some(chain);
                self.progress.clear();
                self.error = None;
                self.status = "Cadena en marcha".into();
                cx.notify();
            }
            Err(error) => self.report(Err(error), cx),
        }
    }

    fn launch_app(&mut self, id: &str, cx: &mut Context<Self>) {
        let mut profile = Profile::new("single-app".into(), "Lanzamiento individual".into());
        profile.steps.push(Step {
            app_id: id.into(),
            delay_seconds: 0,
            args_override: None,
        });
        self.start(profile, cx);
    }

    fn app_editor(&mut self, app: Option<App>, cx: &mut Context<Self>) {
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
        cx.notify();
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

    fn profile_editor(&mut self, profile: Profile, cx: &mut Context<Self>) {
        let steps = profile
            .steps
            .iter()
            .map(|step| StepDraft {
                app_id: step.app_id.clone(),
                delay: input(
                    step.delay_seconds.to_string(),
                    "Delay de paso en segundos",
                    cx,
                ),
                args: input(
                    step.args_override
                        .as_deref()
                        .map_or(String::new(), args_json),
                    "Argumentos del paso en JSON",
                    cx,
                ),
            })
            .collect();
        self.profile_draft = Some(ProfileDraft {
            name: input(profile.name.clone(), "Nombre de perfil", cx),
            first_delay: input(
                profile.first_step_delay.to_string(),
                "Delay inicial en segundos",
                cx,
            ),
            profile,
            steps,
        });
        cx.notify();
    }

    fn new_profile(&mut self, source: Option<Profile>, cx: &mut Context<Self>) {
        let Some(id) = (1..=129).map(|n| format!("profile:{n}")).find(|id| {
            !self
                .store
                .document
                .profiles
                .iter()
                .any(|profile| &profile.id == id)
        }) else {
            self.report(Err("límite de perfiles alcanzado".into()), cx);
            return;
        };
        let mut profile = source.unwrap_or_else(|| Profile::new(id.clone(), "Nuevo perfil".into()));
        profile.id = id;
        self.profile_editor(profile, cx);
    }

    fn save_profile(&mut self, cx: &mut Context<Self>) {
        let Some(draft) = &self.profile_draft else {
            return;
        };
        let result = (|| {
            let mut profile = draft.profile.clone();
            profile.name = draft.name.read(cx).value.trim().to_string();
            profile.first_step_delay = seconds(&draft.first_delay.read(cx).value)?;
            profile.steps = draft
                .steps
                .iter()
                .map(|step| {
                    let args = &step.args.read(cx).value;
                    Ok(Step {
                        app_id: step.app_id.clone(),
                        delay_seconds: seconds(&step.delay.read(cx).value)?,
                        args_override: if args.trim().is_empty() {
                            None
                        } else {
                            Some(parse_args(args)?)
                        },
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok::<_, String>(profile)
        })();
        let profile = match result {
            Ok(profile) => profile,
            Err(error) => {
                self.report(Err(error), cx);
                return;
            }
        };
        if self.edit(
            move |document| {
                if let Some(current) = document
                    .profiles
                    .iter_mut()
                    .find(|current| current.id == profile.id)
                {
                    *current = profile;
                } else {
                    document.profiles.push(profile);
                }
                Ok(())
            },
            cx,
        ) {
            self.profile_draft = None;
        }
    }

    fn append_step(&mut self, app_id: String, cx: &mut Context<Self>) {
        let step = StepDraft {
            app_id,
            delay: input("0".into(), "Delay de paso en segundos", cx),
            args: input(String::new(), "Argumentos del paso en JSON", cx),
        };
        if let Some(draft) = &mut self.profile_draft
            && draft.steps.len() < 128
        {
            draft.steps.push(step);
            cx.notify();
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
        div()
            .flex()
            .flex_col()
            .gap_2()
            .child("Aplicación · borrador sin guardar")
            .child("Nombre")
            .child(draft.name.clone())
            .child("Argumentos (array JSON; sin shell)")
            .child(draft.args.clone())
            .child(format!(
                "Ruta: {}",
                draft.executable.as_ref().map_or(
                    if official {
                        "automática".into()
                    } else {
                        "pendiente de elegir".into()
                    },
                    |path| path.display().to_string()
                )
            ))
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        button("pick-app-path", "Elegir ejecutable")
                            .on_click(cx.listener(|this, _, _, cx| this.pick_executable(cx))),
                    )
                    .when(official, |row| {
                        row.child(button("auto-app-path", "Usar descubrimiento").on_click(
                            cx.listener(|this, _, _, cx| {
                                if let Some(draft) = &mut this.app_draft {
                                    draft.executable = None;
                                }
                                cx.notify();
                            }),
                        ))
                    })
                    .child(
                        button("save-app", "Guardar aplicación")
                            .on_click(cx.listener(|this, _, _, cx| this.save_app(cx))),
                    )
                    .child(
                        button("discard-app", "Descartar borrador").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.app_draft = None;
                                cx.notify();
                            },
                        )),
                    ),
            )
    }

    fn profile_form(&self, cx: &mut Context<Self>) -> gpui::Div {
        let Some(draft) = &self.profile_draft else {
            return div();
        };
        let mut form = div()
            .flex()
            .flex_col()
            .gap_2()
            .child("Perfil · borrador sin guardar")
            .child("Nombre")
            .child(draft.name.clone())
            .child("Espera antes del primer paso (segundos)")
            .child(draft.first_delay.clone())
            .child(format!(
                "Fallo: {} · reutilizar ya abiertas: {} · reintentos por paso: {}",
                if draft.profile.continue_on_error {
                    "continuar"
                } else {
                    "parar"
                },
                draft.profile.reuse_running,
                draft.profile.max_retries
            ))
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        button("failure-policy", "Parar / continuar").on_click(cx.listener(
                            |this, _, _, cx| {
                                if let Some(draft) = &mut this.profile_draft {
                                    draft.profile.continue_on_error =
                                        !draft.profile.continue_on_error;
                                }
                                cx.notify();
                            },
                        )),
                    )
                    .child(
                        button("reuse-policy", "Reutilizar / nueva instancia").on_click(
                            cx.listener(|this, _, _, cx| {
                                if let Some(draft) = &mut this.profile_draft {
                                    draft.profile.reuse_running = !draft.profile.reuse_running;
                                }
                                cx.notify();
                            }),
                        ),
                    )
                    .child(button("retry-policy", "Reintentos 0 / 1 / 2 / 3").on_click(
                        cx.listener(|this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft {
                                draft.profile.max_retries = (draft.profile.max_retries + 1) % 4;
                            }
                            cx.notify();
                        }),
                    )),
            );
        for (index, step) in draft.steps.iter().enumerate() {
            form = form.child(self.step_form(index, step, cx));
        }
        form.child("Añade pasos con el botón del catálogo. Guardar confirma el borrador.")
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        button("save-profile", "Guardar perfil")
                            .on_click(cx.listener(|this, _, _, cx| this.save_profile(cx))),
                    )
                    .child(
                        button("discard-profile", "Descartar borrador").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.profile_draft = None;
                                cx.notify();
                            },
                        )),
                    ),
            )
    }

    fn step_form(
        &self,
        index: usize,
        step: &StepDraft,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let name = self
            .store
            .document
            .apps
            .iter()
            .find(|app| app.id == step.app_id)
            .map_or(step.app_id.clone(), |app| app.name.clone());
        div()
            .id(("edit-step", index))
            .flex()
            .flex_col()
            .gap_1()
            .child(format!(
                "Paso {}: {name} · delay antes del paso (primero usa el de arriba)",
                index + 1
            ))
            .child(step.delay.clone())
            .child("Argumentos propios JSON (vacío = los de la app)")
            .child(step.args.clone())
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(button("step-up", "Subir").on_click(cx.listener(
                        move |this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft
                                && index > 0
                                && index < draft.steps.len()
                            {
                                draft.steps.swap(index, index - 1);
                            }
                            cx.notify();
                        },
                    )))
                    .child(button("step-down", "Bajar").on_click(cx.listener(
                        move |this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft
                                && index + 1 < draft.steps.len()
                            {
                                draft.steps.swap(index, index + 1);
                            }
                            cx.notify();
                        },
                    )))
                    .child(button("remove-step", "Quitar paso").on_click(cx.listener(
                        move |this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft
                                && index < draft.steps.len()
                            {
                                draft.steps.remove(index);
                            }
                            cx.notify();
                        },
                    ))),
            )
    }

    fn delete_profile(&mut self, id: &str, cx: &mut Context<Self>) {
        self.edit(
            |doc| {
                doc.profiles.retain(|profile| profile.id != id);
                if doc.lmu_trigger_profile.as_deref() == Some(id) {
                    doc.lmu_trigger_profile = None;
                }
                Ok(())
            },
            cx,
        );
    }

    fn catalog(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut rows = div().flex().flex_col().gap_2().child("Aplicaciones");
        let mut apps = self.store.document.apps.clone();
        apps.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| a.name.cmp(&b.name))
        });
        for (index, app) in apps.into_iter().enumerate() {
            let id = app.id.clone();
            let favorite_id = id.clone();
            let launch_id = id.clone();
            let step_id = id.clone();
            let remove_id = id.clone();
            let official = CATALOG.iter().find(|entry| entry.id == id);
            let detected = self.discovered.app(&id);
            let availability = detected.map(|entry| &entry.availability);
            let state = if self.scanning {
                "escaneando"
            } else if availability.is_some_and(|value| value.launchable) {
                "ruta de ejecutable disponible"
            } else if availability.is_some_and(|value| value.installed) {
                "instalada, sin ejecutable"
            } else if availability.is_some_and(|value| value.found) {
                "encontrada, no instalada"
            } else {
                "catálogo, sin detección"
            };
            rows = rows.child(
                div()
                    .id(("launcher-app", index))
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(format!(
                        "{}{} · {} · {state}",
                        if app.favorite { "★ " } else { "" },
                        app.name,
                        official.map_or("Manual", |app| app.category)
                    ))
                    .when_some(
                        detected.and_then(|entry| entry.executable.as_ref()),
                        |row, path| row.child(path.display().to_string()),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap_2()
                            .child(button("app-favorite", "Favorita").on_click(cx.listener(
                                move |this, _, _, cx| {
                                    this.edit(
                                        |doc| {
                                            let app = doc
                                                .apps
                                                .iter_mut()
                                                .find(|app| app.id == favorite_id)
                                                .ok_or("app inexistente")?;
                                            app.favorite = !app.favorite;
                                            Ok(())
                                        },
                                        cx,
                                    );
                                },
                            )))
                            .child(
                                button("edit-app", "Editar app / ruta").on_click(cx.listener(
                                    move |this, _, _, cx| this.app_editor(Some(app.clone()), cx),
                                )),
                            )
                            .when(
                                !self.scanning
                                    && availability.is_some_and(|value| value.launchable),
                                |row| {
                                    row.child(button("launch-app", "Abrir").on_click(cx.listener(
                                        move |this, _, _, cx| this.launch_app(&launch_id, cx),
                                    )))
                                },
                            )
                            .when(self.profile_draft.is_some(), |row| {
                                row.child(button("append-step", "Añadir al perfil").on_click(
                                    cx.listener(move |this, _, _, cx| {
                                        this.append_step(step_id.clone(), cx);
                                    }),
                                ))
                            })
                            .when(official.is_none(), |row| {
                                row.child(button("delete-app", "Eliminar app").on_click(
                                    cx.listener(move |this, _, _, cx| {
                                        if this.edit(|doc| doc.remove_app(&remove_id), cx) {
                                            this.scan(cx);
                                        }
                                    }),
                                ))
                            }),
                    ),
            );
        }
        rows
    }

    fn profiles(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut rows = div().flex().flex_col().gap_2().child("Perfiles");
        let mut profiles = self.store.document.profiles.clone();
        profiles.sort_by_key(|profile| !profile.favorite);
        for (index, profile) in profiles.into_iter().enumerate() {
            let edit = profile.clone();
            let duplicate = profile.clone();
            let launch = profile.clone();
            let id = profile.id.clone();
            let favorite_id = id.clone();
            let delete_id = id.clone();
            let triggered = self.store.document.lmu_trigger_profile.as_deref() == Some(&id);
            rows = rows.child(
                div()
                    .id(("launcher-profile", index))
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(format!(
                        "{}{} · {} pasos{}",
                        if profile.favorite { "★ " } else { "" },
                        profile.name,
                        profile.steps.len(),
                        if triggered {
                            " · trigger al abrir LMU"
                        } else {
                            ""
                        }
                    ))
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap_2()
                            .child(
                                button("edit-profile", "Editar perfil").on_click(cx.listener(
                                    move |this, _, _, cx| this.profile_editor(edit.clone(), cx),
                                )),
                            )
                            .child(
                                button("duplicate-profile", "Duplicar").on_click(cx.listener(
                                    move |this, _, _, cx| {
                                        this.new_profile(Some(duplicate.clone()), cx);
                                    },
                                )),
                            )
                            .child(button("launch-profile", "Iniciar cadena").on_click(
                                cx.listener(move |this, _, _, cx| this.start(launch.clone(), cx)),
                            ))
                            .child(button("favorite-profile", "Favorito").on_click(cx.listener(
                                move |this, _, _, cx| {
                                    this.edit(
                                        |doc| {
                                            let profile = doc
                                                .profiles
                                                .iter_mut()
                                                .find(|p| p.id == favorite_id)
                                                .ok_or("perfil inexistente")?;
                                            profile.favorite = !profile.favorite;
                                            Ok(())
                                        },
                                        cx,
                                    );
                                },
                            )))
                            .child(
                                button("trigger-profile", "Activar / desactivar trigger LMU")
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        if this.edit(
                                            |doc| {
                                                doc.lmu_trigger_profile =
                                                    if doc.lmu_trigger_profile.as_deref()
                                                        == Some(&id)
                                                    {
                                                        None
                                                    } else {
                                                        Some(id.clone())
                                                    };
                                                Ok(())
                                            },
                                            cx,
                                        ) {
                                            this.trigger = LmuTrigger::default();
                                        }
                                    })),
                            )
                            .child(button("delete-profile", "Eliminar perfil").on_click(
                                cx.listener(move |this, _, _, cx| {
                                    this.delete_profile(&delete_id, cx);
                                }),
                            )),
                    ),
            );
        }
        rows
    }
}

impl Render for Launcher {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut progress = div().flex().flex_col().gap_1();
        for event in &self.progress {
            progress = progress.child(format!(
                "{} · {:?}{} · {}{}",
                event
                    .step
                    .map_or("Resultado".into(), |step| format!("Paso {}", step + 1)),
                event.status,
                event
                    .pid
                    .map_or(String::new(), |pid| format!(" · PID {pid}")),
                event.message,
                if event.step.is_none() {
                    format!(" · éxito: {}", event.success)
                } else {
                    String::new()
                }
            ));
        }
        let mut warnings = div().flex().flex_col();
        for warning in &self.discovered.warnings {
            warnings = warnings.child(warning.clone());
        }
        div().id("launcher").flex().flex_col().flex_1().min_h_0().gap_3().overflow_y_scroll()
            .child(self.status.clone()).child(format!("Datos: {}", self.store.path.display()))
            .child("Cancelar o cerrar Hub deja abiertas las aplicaciones iniciadas.")
            .child("Atajos, inicio con Windows y cierre/reinicio de aplicaciones no disponibles en este corte.")
            .when_some(self.error.clone(), gpui::ParentElement::child)
            .child(div().flex().gap_2()
                .child(button("launcher-rescan", "Volver a escanear").on_click(cx.listener(|this, _, _, cx| this.scan(cx))))
                .child(button("launcher-reload", "Recargar archivo y descartar borradores").on_click(cx.listener(|this, _, _, cx| this.reload(cx))))
                .child(button("launcher-add-app", "Añadir aplicación").on_click(cx.listener(|this, _, _, cx| this.app_editor(None, cx))))
                .child(button("launcher-add-profile", "Crear perfil").on_click(cx.listener(|this, _, _, cx| this.new_profile(None, cx))))
                .when(self.chain.is_some(), |row| row.child(button("launcher-cancel", "Cancelar cadena").on_click(cx.listener(|this, _, _, cx| { if let Some(chain) = &this.chain { chain.cancel(); } cx.notify(); })))))
            .child(progress).child(warnings).child(self.app_form(cx)).child(self.profile_form(cx)).child(self.profiles(cx)).child(self.catalog(cx))
    }
}
