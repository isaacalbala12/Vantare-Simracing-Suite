//! Escaparate y línea de tiempo sobre los perfiles y eventos del motor existente.
use super::*;
use crate::orbit::Tone;
use gpui::{Div, Stateful, px, rgb, rgba};

pub(super) struct Controls {
    profile_id: String,
    delays: Vec<u32>,
    choices: Vec<Entity<orbit::Choice>>,
}

fn option_specs(delays: &[u32]) -> [(&'static str, Vec<String>); 5] {
    [
        (
            "Si una app ya está abierta",
            vec!["Usarlo".to_owned(), "Reiniciar".into(), "Preguntar".into()],
        ),
        (
            "Esperar antes del primer paso",
            delays.iter().map(|value| format!("{value} s")).collect(),
        ),
        (
            "Reintentos si no abre",
            (0..=3).map(|value| value.to_string()).collect(),
        ),
        (
            "Si falla",
            vec![
                "Seguir sin ella".to_owned(),
                "Parar".into(),
                "Preguntar".into(),
            ],
        ),
        (
            "Al iniciar Windows",
            vec!["Desactivado".to_owned(), "Activado".into()],
        ),
    ]
}

fn option_indices(profile: &Profile, delays: &[u32]) -> [usize; 5] {
    let policy = profile.effective_policy();
    [
        match policy.already_running {
            Running::Reuse => 0,
            Running::Restart => 1,
            Running::Ask => 2,
        },
        delays
            .iter()
            .position(|delay| *delay == policy.first_step_delay)
            .unwrap_or_default(),
        usize::from(policy.max_retries),
        match policy.failure {
            Failure::Continue => 0,
            Failure::Stop => 1,
            Failure::Ask => 2,
        },
        usize::from(profile.launch_on_windows_startup),
    ]
}

fn set_option(
    profile: &mut Profile,
    delays: &[u32],
    option: usize,
    selected: usize,
) -> Result<(), String> {
    let mut policy = profile.effective_policy();
    let invalid = || "opción del Launcher fuera de rango".to_owned();
    match option {
        0 => {
            policy.already_running = *[Running::Reuse, Running::Restart, Running::Ask]
                .get(selected)
                .ok_or_else(invalid)?;
        }
        1 => policy.first_step_delay = *delays.get(selected).ok_or_else(invalid)?,
        2 => {
            policy.max_retries = u8::try_from(selected)
                .ok()
                .filter(|value| *value <= 3)
                .ok_or_else(invalid)?;
            policy.retry = super::super::policy::Retry::Failed;
        }
        3 => {
            policy.failure = *[Failure::Continue, Failure::Stop, Failure::Ask]
                .get(selected)
                .ok_or_else(invalid)?;
        }
        4 => {
            profile.launch_on_windows_startup = match selected {
                0 => false,
                1 => true,
                _ => return Err(invalid()),
            }
        }
        _ => return Err(invalid()),
    }
    profile.first_step_delay = policy.first_step_delay;
    profile.max_retries = policy.max_retries;
    profile.reuse_running = policy.already_running == Running::Reuse;
    profile.continue_on_error = policy.failure == Failure::Continue;
    profile.policy = Some(policy);
    Ok(())
}

fn latest(events: &[Progress], step: usize) -> Option<&Progress> {
    events.iter().rev().find(|event| event.step == Some(step))
}

fn step_label(event: Option<&Progress>) -> (&'static str, Tone) {
    use super::super::chain::Status;
    match event.map(|event| &event.status) {
        Some(Status::Ready) => ("Listo", Tone::Success),
        Some(Status::Launching) => ("Abriendo…", Tone::Warning),
        Some(Status::Waiting) => ("Esperando…", Tone::Warning),
        Some(Status::Failed) => ("Falló", Tone::Danger),
        Some(Status::Cancelled) => ("Cancelado", Tone::Neutral),
        _ => ("En espera", Tone::Neutral),
    }
}

fn step_state(events: &[Progress], step: usize) -> (&'static str, Tone) {
    let event = latest(events, step);
    if event.is_some_and(|event| event.status == super::super::chain::Status::Launching)
        && events
            .iter()
            .filter(|event| {
                event.step == Some(step) && event.status == super::super::chain::Status::Launching
            })
            .count()
            > 1
    {
        ("Reintentando…", Tone::Warning)
    } else {
        step_label(event)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CardState {
    Resting,
    Running,
    Retry,
    Ready,
    Cancelled,
    Failed,
}
fn card_state(events: &[Progress], running: bool) -> CardState {
    use super::super::chain::Status;
    if let Some(end) = events
        .iter()
        .rev()
        .find(|event| matches!(event.status, Status::Done | Status::Cancelled))
    {
        return if end.status == Status::Cancelled {
            CardState::Cancelled
        } else if end.success {
            CardState::Ready
        } else {
            CardState::Failed
        };
    }
    if !running {
        return CardState::Resting;
    }
    if events
        .iter()
        .filter_map(|event| event.step)
        .any(|step| step_state(events, step).0 == "Reintentando…")
    {
        CardState::Retry
    } else {
        CardState::Running
    }
}

fn run_result(events: &[Progress]) -> Option<(&'static str, Tone)> {
    use super::super::chain::Status;
    let result = events
        .iter()
        .rev()
        .find(|event| matches!(event.status, Status::Done | Status::Cancelled))?;
    if result.status == Status::Cancelled {
        Some(("Cancelado", Tone::Neutral))
    } else if !result.success {
        Some(("Falló", Tone::Danger))
    } else if events.iter().any(|event| {
        event.step.is_some_and(|step| {
            events
                .iter()
                .filter(|candidate| {
                    candidate.step == Some(step) && candidate.status == Status::Launching
                })
                .count()
                > 1
        })
    }) {
        Some(("Completado con reintentos", Tone::Warning))
    } else if events.iter().any(|event| event.status == Status::Waiting) {
        Some(("Requirió confirmación", Tone::Neutral))
    } else {
        Some(("Completado", Tone::Success))
    }
}

fn toggle_quick(profile: &mut Profile, option: usize) {
    let mut policy = profile.effective_policy();
    match option {
        0 => {
            policy.max_retries = if policy.max_retries == 0 { 2 } else { 0 };
            policy.retry = super::super::policy::Retry::Failed;
            profile.max_retries = policy.max_retries;
        }
        1 => {
            policy.exit = if policy.exit == Close::Started {
                Close::Leave
            } else {
                Close::Started
            }
        }
        2 => profile.launch_on_windows_startup = !profile.launch_on_windows_startup,
        _ => return,
    }
    profile.policy = Some(policy);
}

fn launch_block_reason(
    profile: &Profile,
    apps: &[App],
    discovery: &Discovery,
    scanning: bool,
) -> Option<String> {
    if scanning {
        return Some("Espera a que termine la detección de aplicaciones.".into());
    }
    if profile.steps.is_empty() {
        return Some("Añade al menos una aplicación a este perfil.".into());
    }
    let missing: Vec<_> = profile
        .steps
        .iter()
        .filter(|step| {
            !discovery
                .apps
                .iter()
                .any(|app| app.id == step.app_id && app.availability.launchable)
        })
        .map(|step| {
            apps.iter()
                .find(|app| app.id == step.app_id)
                .map(|app| app.name.as_str())
                .or_else(|| {
                    CATALOG
                        .iter()
                        .find(|app| app.id == step.app_id)
                        .map(|app| app.name)
                })
                .unwrap_or("Aplicación sin configurar")
        })
        .collect();
    (!missing.is_empty()).then(|| {
        format!(
            "No se puede lanzar: revisa las rutas de {} en Aplicaciones.",
            missing.join(", ")
        )
    })
}

pub(super) fn app_icon(app: &App, size: f32, cx: &gpui::App) -> Div {
    orbit::app_badge(&app.id, &app.name, size, cx)
}

fn carousel_offset(
    offset: gpui::Pixels,
    delta: gpui::Pixels,
    maximum: gpui::Pixels,
) -> gpui::Pixels {
    (offset + delta).clamp(-maximum, px(0.0))
}

fn hero_height(adapt: orbit::Adapt) -> f32 {
    match adapt.density {
        orbit::adapt::Density::A => 400.0,
        orbit::adapt::Density::M => 360.0,
        orbit::adapt::Density::B | orbit::adapt::Density::Xs => 318.0,
    }
}
fn poster_height(adapt: orbit::Adapt, profiles: usize) -> f32 {
    let (top, _, bottom) = adapt.padding();
    let available =
        adapt.height - 52.0 - top - bottom - 60.0 - hero_height(adapt) - adapt.gap() * 2.0 - 30.0;
    let rows = if adapt.show_optional() {
        profiles.saturating_add(1).div_ceil(2).clamp(1, 2)
    } else {
        1
    };
    ((available - 12.0) / if rows == 1 { 1.0 } else { 2.0 }).max(140.0)
}

impl Launcher {
    fn sync_showcase_controls(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(profile) = self
            .showcase_profile()
            .and_then(|profile| {
                self.store
                    .document
                    .profiles
                    .iter()
                    .find(|saved| saved.id == profile.id)
            })
            .cloned()
        else {
            self.showcase_controls = None;
            return;
        };
        let mut delays = vec![0, 5, 10, 20, 30, 60];
        let delay = profile.effective_policy().first_step_delay;
        if !delays.contains(&delay) {
            delays.push(delay);
        }
        let indices = option_indices(&profile, &delays);
        if self
            .showcase_controls
            .as_ref()
            .is_none_or(|controls| controls.profile_id != profile.id || controls.delays != delays)
        {
            let specs = option_specs(&delays);
            let choices = specs
                .into_iter()
                .enumerate()
                .map(|(index, (label, options))| {
                    let choice = cx.new(|cx| {
                        let mut choice = orbit::Choice::new(
                            label,
                            orbit::ChoiceKind::Dropdown,
                            options.into_iter().map(orbit::OptionItem::new).collect(),
                            Some(indices[index]),
                            window,
                            cx,
                        );
                        choice.compact(120.0);
                        choice
                    });
                    let profile_id = profile.id.clone();
                    let delays = delays.clone();
                    cx.subscribe(
                        &choice,
                        move |this, _, change: &orbit::ChoiceChanged, cx| {
                            this.edit(
                                |document| {
                                    let mut profile = document
                                        .profiles
                                        .iter()
                                        .find(|profile| profile.id == profile_id)
                                        .cloned()
                                        .ok_or("perfil inexistente")?;
                                    set_option(&mut profile, &delays, index, change.0)?;
                                    document.save_profile(profile)
                                },
                                cx,
                            );
                        },
                    )
                    .detach();
                    choice
                })
                .collect();
            self.showcase_controls = Some(Controls {
                profile_id: profile.id,
                delays,
                choices,
            });
        } else if let Some(controls) = &self.showcase_controls {
            for (choice, selected) in controls.choices.iter().zip(indices) {
                if choice.read(cx).state.selected != Some(selected) {
                    choice.update(cx, |choice, cx| {
                        choice.state.selected = Some(selected);
                        cx.notify();
                    });
                }
            }
        }
    }
    pub(crate) fn topbar_tabs(&self, cx: &mut Context<Self>) -> Div {
        let mut tabs = div().h_full().flex().items_center().gap(px(20.0));
        for (id, label, page) in [
            ("launcher-tab-profiles", "Perfiles", LauncherPage::Showcase),
            ("launcher-tab-apps", "Aplicaciones", LauncherPage::Manage),
            ("launcher-tab-history", "Historial", LauncherPage::History),
        ] {
            tabs = tabs.child(
                orbit::topbar_tab(id, label, self.page == page, cx).on_click(cx.listener(
                    move |this, _, window, cx| {
                        this.close_form(window, cx);
                        this.page = page;
                        cx.notify();
                    },
                )),
            );
        }
        if self.page == LauncherPage::Editor {
            tabs = tabs.child(orbit::topbar_tab("launcher-tab-editor", "Perfil", true, cx));
        }
        tabs
    }
    pub(crate) fn prepare_capture(&mut self, running: bool) {
        self.capture = Capture::Resting;
        for app in &mut self.discovered.apps {
            app.availability.launchable = app.availability.found && app.availability.installed;
        }
        if running {
            self.capture_launch();
        }
    }
    pub(crate) fn prepare_capture_view(
        &mut self,
        name: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.prepare_capture(false);
        match name {
            "launcher-aplicaciones" => self.page = LauncherPage::Manage,
            "launcher-historial" => self.page = LauncherPage::History,
            "launcher-editor" => {
                if let Some(profile) = self.showcase_profile().cloned() {
                    self.profile_editor(profile, window, cx);
                }
            }
            "launcher-listo" | "launcher-cancelado" => {
                self.last_profile = self.showcase_profile().cloned();
                self.progress = vec![Progress {
                    step: None,
                    status: if name == "launcher-listo" {
                        super::super::chain::Status::Done
                    } else {
                        super::super::chain::Status::Cancelled
                    },
                    pid: None,
                    message: String::new(),
                    success: name == "launcher-listo",
                    decision: None,
                }];
            }
            _ => self.prepare_capture(name == "launcher-lanzando"),
        }
    }
    /// Escena fija de QA: no ejecuta procesos ni modifica configuración productiva.
    pub(crate) fn capture_launch(&mut self) {
        self.last_profile = self.showcase_profile().cloned();
        self.capture = Capture::Running;
        self.progress = [
            super::super::chain::Status::Ready,
            super::super::chain::Status::Ready,
            super::super::chain::Status::Launching,
        ]
        .into_iter()
        .enumerate()
        .map(|(index, status)| Progress {
            step: Some(index),
            status,
            pid: None,
            message: "Lanzamiento de ejemplo".into(),
            success: index < 2,
            decision: None,
        })
        .collect();
        self.progress.push(Progress {
            step: Some(2),
            status: super::super::chain::Status::Launching,
            pid: None,
            message: "Segundo intento de ejemplo".into(),
            success: false,
            decision: None,
        });
    }
    fn showcase_profile(&self) -> Option<&Profile> {
        if self.launch_progress().is_some() {
            return self.last_profile.as_ref();
        }
        if let Some(profile) = self
            .store
            .document
            .profiles
            .iter()
            .find(|profile| Some(&profile.id) == self.selected_profile.as_ref())
        {
            return Some(profile);
        }
        self.store.document.profiles.iter().min_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| a.name.cmp(&b.name))
        })
    }

    fn step_event(&self, profile: &Profile, step: usize) -> Option<&Progress> {
        self.last_profile
            .as_ref()
            .filter(|last| last.id == profile.id)?;
        latest(&self.progress, step)
    }

    fn step_state(&self, profile: &Profile, step: usize) -> (&'static str, Tone) {
        if self
            .last_profile
            .as_ref()
            .is_some_and(|last| last.id == profile.id)
        {
            step_state(&self.progress, step)
        } else {
            step_label(None)
        }
    }

    #[allow(clippy::too_many_lines)] // Composición declarativa de tarjeta; la lógica del motor permanece separada.
    fn showcase_steps(
        &self,
        profile: &Profile,
        running: bool,
        compact: bool,
        cx: &gpui::App,
    ) -> Stateful<Div> {
        let mut row = div().flex().items_stretch().gap(px(if running {
            0.0
        } else if compact {
            8.0
        } else {
            12.0
        }));
        for (index, step) in profile.steps.iter().enumerate() {
            let app = self
                .store
                .document
                .apps
                .iter()
                .find(|app| app.id == step.app_id);
            let event = self.step_event(profile, index);
            let (label, tone) = self.step_state(profile, index);
            let icon_size = if compact {
                48.0
            } else if running {
                80.0
            } else {
                48.0
            };
            if !running && index > 0 {
                row = row.child(
                    orbit::text("›", 20.0, 400, orbit::ink_3(cx), cx)
                        .flex_none()
                        .self_center(),
                );
            }
            let mut card = div()
                .relative()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(if compact { 8.0 } else { 12.0 }))
                .p(px(if running {
                    0.0
                } else if compact {
                    10.0
                } else {
                    12.0
                }))
                .rounded(px(18.0))
                .when(!running, |card| {
                    card.justify_between()
                        .border_1()
                        .border_color(rgba(orbit::line(cx)))
                        .bg(orbit::tint(0, 0.18))
                })
                .when(running, |card| card.items_center().text_center())
                .when(running && label == "En espera", |card| card.opacity(0.45));
            if let Some(app) = app {
                card = card.child(app_icon(
                    app,
                    if compact {
                        48.0
                    } else if running {
                        80.0
                    } else {
                        48.0
                    },
                    cx,
                ));
            }
            if running
                && event.is_some_and(|event| {
                    matches!(
                        event.status,
                        super::super::chain::Status::Ready | super::super::chain::Status::Failed
                    ) || label == "Reintentando…"
                })
            {
                card = card.child(
                    orbit::text(
                        if label == "Listo" { "✓" } else { "!" },
                        13.0,
                        600,
                        orbit::ink(cx),
                        cx,
                    )
                    .absolute()
                    .top(px(icon_size - 18.0))
                    .left(gpui::relative(0.5))
                    .ml(px(icon_size / 2.0 - 18.0))
                    .size(px(24.0))
                    .rounded_full()
                    .bg(rgb(tone.color(cx)))
                    .flex()
                    .items_center()
                    .justify_center(),
                );
            }
            card = card
                .child(
                    orbit::text(
                        app.map_or(step.app_id.as_str(), |app| app.name.as_str()),
                        if compact { 13.0 } else { 16.0 },
                        600,
                        orbit::ink(cx),
                        cx,
                    )
                    .truncate()
                    .w_full(),
                )
                .when(running && self.adapt.show_notes(), |card| {
                    card.child(
                        orbit::text("Aplicación del perfil", 12.0, 400, orbit::ink_2(cx), cx)
                            .truncate(),
                    )
                })
                .when(running, |card| {
                    card.child(
                        orbit::pill(
                            if running || event.is_some() {
                                label
                            } else {
                                "Sin estado previo"
                            },
                            tone,
                            cx,
                        )
                        .self_center(),
                    )
                })
                .when(!running, |card| {
                    card.child(orbit::text(
                        if event.is_some() {
                            format!("{label} la última vez")
                        } else {
                            "Sin estado previo".to_owned()
                        },
                        if compact { 10.0 } else { 12.0 },
                        400,
                        if event
                            .is_some_and(|event| event.status == super::super::chain::Status::Ready)
                        {
                            orbit::green(cx)
                        } else {
                            orbit::ink_3(cx)
                        },
                        cx,
                    ))
                });
            if running {
                card = card.when_some(
                    event.filter(|event| {
                        matches!(
                            event.status,
                            super::super::chain::Status::Failed
                                | super::super::chain::Status::Waiting
                                | super::super::chain::Status::Cancelled
                        )
                    }),
                    |card, event| {
                        card.child(orbit::text(
                            event.message.clone(),
                            if compact { 10.0 } else { 12.0 },
                            400,
                            orbit::ink_3(cx),
                            cx,
                        ))
                    },
                );
            }
            if running && index + 1 < profile.steps.len() {
                let next_event = self.step_event(profile, index + 1);
                let (next_label, _) = self.step_state(profile, index + 1);
                card = card.child(
                    div()
                        .absolute()
                        .left(gpui::relative(0.5))
                        .right(gpui::relative(-0.5))
                        .mx(px(icon_size / 2.0))
                        .top(px(icon_size / 2.0 - 2.0))
                        .h(px(4.0))
                        .rounded_full()
                        .bg(
                            if next_event.is_some_and(|event| {
                                event.status == super::super::chain::Status::Ready
                            }) {
                                orbit::gradient(
                                    cx.global::<orbit::design::Tokens>().gradients.progress,
                                    90.0,
                                )
                            } else if next_label == "Reintentando…" {
                                orbit::gradient([0x00f4_ad28, 0x00e9_852a], 90.0)
                            } else {
                                rgb(orbit::surface_3(cx)).into()
                            },
                        ),
                );
            }
            row = row.child(card);
        }
        div()
            .id("launcher-steps")
            .flex_none()
            .min_h_0()
            .overflow_x_scroll()
            .child(
                row.when(!running, |row| {
                    row.min_h(px(if compact { 108.0 } else { 126.0 }))
                })
                .min_w(px(u16::try_from(profile.steps.len())
                    .map_or(0.0, f32::from)
                    * if compact { 125.0 } else { 160.0 })),
            )
    }

    #[allow(clippy::too_many_lines)] // Composición del escaparate; conserva un único controlador de lanzamiento.
    fn showcase_hero(
        &self,
        profile: &Profile,
        compact: bool,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let running = self.launch_progress().is_some();
        let state = if self
            .last_profile
            .as_ref()
            .is_some_and(|last| last.id == profile.id)
        {
            card_state(&self.progress, running)
        } else {
            CardState::Resting
        };
        let edit = profile.clone();
        let launch = profile.id.clone();
        let rehearsal = profile.clone();
        let ready = self
            .profile_progress(&profile.id)
            .map_or(0, |(ready, _)| ready);
        let enabled = presentation::launchable(profile, &self.discovered, self.scanning || running);
        let description = if profile.description.is_empty() {
            self.demo_descriptions
                .get(&profile.id)
                .cloned()
                .unwrap_or_else(|| "Tus aplicaciones se abren en este orden.".into())
        } else {
            profile.description.clone()
        };
        let actions = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(10.0))
            .when(running, |row| {
                row.child(
                    button("showcase-cancel", "Cancelar", cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            if let Some(chain) = &this.chain {
                                chain.cancel();
                            }
                            cx.notify();
                        },
                    )),
                )
            })
            .child(
                orbit::play_button(
                    "showcase-launch",
                    if running { "Lanzando…" } else { "Lanzar" },
                    self.adapt.hero_button(),
                    self.default_profile_id().as_deref() == Some(profile.id.as_str()),
                    cx,
                )
                .when(!enabled, |button| {
                    orbit::disabled(
                        button,
                        if running {
                            "Lanzamiento en curso"
                        } else {
                            "Revisa las aplicaciones del perfil"
                        },
                    )
                })
                .on_click(cx.listener(move |this, _, _, cx| this.launch_id(&launch, cx))),
            )
            .when(!running, |row| {
                row.child(
                    button("showcase-edit", "Editar perfil", cx).on_click(cx.listener(
                        move |this, _, window, cx| this.profile_editor(edit.clone(), window, cx),
                    )),
                )
            })
            .when(!running, |row| {
                row.child(
                    button("showcase-rehearsal", "Probar sin el juego", cx)
                        .when(running || self.scanning, |button| {
                            orbit::disabled(button, "Espera a que termine la cadena o el escaneo")
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if this.chain.is_some()
                                || this.scanning
                                || this.capture == Capture::Running
                            {
                                return;
                            }
                            let selected = rehearsal
                                .steps
                                .iter()
                                .enumerate()
                                .filter(|(_, step)| step.app_id != "lmu")
                                .map(|(index, _)| index)
                                .collect();
                            this.start_selection(
                                rehearsal.clone(),
                                Discovery {
                                    apps: this.discovered.apps.clone(),
                                    steam_executable: this.discovered.steam_executable.clone(),
                                    warnings: vec![],
                                },
                                selected,
                                cx,
                            );
                        })),
                )
            });
        let adapt = self.adapt;
        let mut card = orbit::hero_surface(cx)
            .id("showcase-hero")
            .relative()
            .overflow_hidden()
            .flex_none()
            .h(px(hero_height(adapt)))
            .gap(px(if compact { 10.0 } else { 14.0 }))
            .p(px(if compact { 20.0 } else { 28.0 }))
            .child(
                orbit::circuit(None, cx)
                    .absolute()
                    .right(px(24.0))
                    .top(px(18.0))
                    .w(gpui::relative(0.46))
                    .h(px(160.0))
                    .opacity(0.5),
            )
            .child(orbit::meta(
                if state == CardState::Ready {
                    "✓ Todo listo"
                } else if state == CardState::Cancelled {
                    "Lanzamiento cancelado"
                } else if state == CardState::Failed {
                    "El lanzamiento no se completó"
                } else if running {
                    "● Lanzando…"
                } else if profile.favorite {
                    "★ Tu perfil favorito · Ctrl L"
                } else {
                    "Tu perfil seleccionado"
                },
                12.0,
                orbit::ink_2(cx),
                cx,
            ));
        let title = orbit::text(
            profile.name.clone(),
            if compact {
                if running { 32.0 } else { 40.0 }
            } else if running {
                40.0
            } else {
                60.0
            },
            600,
            orbit::ink(cx),
            cx,
        )
        .truncate()
        .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
        .line_height(px(if compact {
            42.0
        } else if running {
            48.0
        } else {
            64.0
        }));
        card =
            if running {
                card.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(12.0))
                        .child(title.flex_1().min_w_0())
                        .child(actions),
                )
                .when(adapt.show_notes(), |card| {
                    card.child(orbit::text(description, 14.0, 400, orbit::ink_2(cx), cx).truncate())
                })
            } else {
                card.child(
                    div().flex().flex_col().gap(px(8.0)).child(title).child(
                        orbit::text(description, 14.0, 400, orbit::ink_2(cx), cx).truncate(),
                    ),
                )
                .child(actions)
            };
        if running {
            let fraction = if profile.steps.is_empty() {
                0.0
            } else {
                u16::try_from(ready).map_or(0.0, f32::from)
                    / u16::try_from(profile.steps.len()).map_or(1.0, f32::from)
            };
            card = card.child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(orbit::meta(
                        &format!("{ready} de {} listas", profile.steps.len()),
                        12.0,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(orbit::progress(fraction, cx).flex_1()),
            );
        }
        card.child(
            self.showcase_steps(profile, running, compact, cx)
                .mt(px(0.0)),
        )
    }

    fn toggle_saved_preference(&mut self, id: &str, index: usize, cx: &mut Context<Self>) {
        self.edit(
            |document| {
                let mut profile = document
                    .profiles
                    .iter()
                    .find(|profile| profile.id == id)
                    .cloned()
                    .ok_or("perfil inexistente")?;
                toggle_quick(&mut profile, index);
                document.save_profile(profile)
            },
            cx,
        );
    }

    fn showcase_quick(&self, profile: &Profile, cx: &mut Context<Self>) -> Div {
        let profile = self
            .store
            .document
            .profiles
            .iter()
            .find(|saved| saved.id == profile.id)
            .unwrap_or(profile);
        let policy = profile.effective_policy();
        let options = [(
            1,
            "Cerrar mis apps al salir de Vantare",
            policy.exit == Close::Started,
        )];
        div()
            .flex()
            .flex_wrap()
            .gap(px(8.0))
            .border_t_1()
            .border_color(rgba(orbit::line(cx)))
            .pt(px(12.0))
            .children(options.into_iter().map(|(index, label, checked)| {
                let id = profile.id.clone();
                let keyboard_id = id.clone();
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        orbit::toggle(
                            ["showcase-retry", "showcase-exit", "showcase-startup"][index],
                            label,
                            checked,
                            true,
                            cx,
                        )
                        .aria_toggled(if checked {
                            gpui::Toggled::True
                        } else {
                            gpui::Toggled::False
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.toggle_saved_preference(&id, index, cx);
                        }))
                        .on_key_down(cx.listener(
                            move |this, event: &gpui::KeyDownEvent, _, cx| {
                                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                    this.toggle_saved_preference(&keyboard_id, index, cx);
                                    cx.stop_propagation();
                                }
                            },
                        )),
                    )
                    .child(orbit::text(label, 12.0, 400, orbit::ink_2(cx), cx))
            }))
    }

    #[allow(clippy::too_many_lines)] // Composición declarativa de tarjeta; la lógica del motor permanece separada.
    fn showcase_profiles(&self, compact: bool, cx: &mut Context<Self>) -> Stateful<Div> {
        let width = if compact { 200.0 } else { 284.0 };
        let adapt = self.adapt;
        let grid = adapt.show_optional();
        let height = poster_height(adapt, self.store.document.profiles.len());
        let viewport_height = if grid && self.store.document.profiles.len() > 1 {
            height * 2.0 + 12.0
        } else {
            height
        };
        let content_width = self
            .store
            .document
            .profiles
            .iter()
            .fold(150.0, |total, _| total + width + 14.0);
        let mut row = div()
            .w(px(content_width))
            .flex_none()
            .h(px(height))
            .flex()
            .gap(px(12.0))
            .when(grid, |row| row.w_full().h_auto().grid().grid_cols(2));
        for (index, profile) in self.store.document.profiles.iter().enumerate() {
            let selected = profile.id.clone();
            let profile_for_click = profile.clone();
            let keyboard_profile = profile.clone();
            let gradients = &cx.global::<orbit::design::Tokens>().gradients;
            let cover = if profile.favorite {
                [gradients.button[1], gradients.hero[1]]
            } else if index % 2 == 1 {
                [gradients.app_tools[1], gradients.hero[1]]
            } else {
                [gradients.app_music[1], gradients.hero[1]]
            };
            row = row.child(
                orbit::neo_card(cx)
                    .id(("showcase-profile", index))
                    .role(gpui::Role::Button)
                    .aria_label(format!("Editar {}", profile.name))
                    .tab_index(0)
                    .tab_stop(self.launch_progress().is_none())
                    .when(
                        self.launch_progress().is_some()
                            && self
                                .last_profile
                                .as_ref()
                                .is_none_or(|active| active.id != profile.id),
                        |card| card.opacity(0.45),
                    )
                    .flex_none()
                    .w(px(width))
                    .when(grid, |card| card.w_full().h(px(height)))
                    .overflow_hidden()
                    .gap(px(8.0))
                    .p(px(8.0))
                    .when(
                        self.showcase_profile()
                            .is_some_and(|selected| selected.id == profile.id),
                        |card| card.border_color(rgb(orbit::carmine(cx))),
                    )
                    .child(
                        div()
                            .relative()
                            .overflow_hidden()
                            .h(px(if compact { 76.0 } else { 120.0 }))
                            .flex_none()
                            .flex_1()
                            .min_h_0()
                            .flex()
                            .items_end()
                            .rounded(px(12.0))
                            .p(px(14.0))
                            .bg(orbit::gradient(cover, 120.0))
                            .child(
                                orbit::cover_circuit(cx)
                                    .w_full()
                                    .h_full()
                                    .absolute()
                                    .right_0()
                                    .top(px(0.0))
                                    .opacity(0.8),
                            )
                            .when(
                                self.launch_progress().is_some()
                                    && self
                                        .last_profile
                                        .as_ref()
                                        .is_some_and(|active| active.id == profile.id),
                                |cover| {
                                    cover.child(
                                        orbit::pill("Abriendo", Tone::Accent, cx)
                                            .absolute()
                                            .top(px(8.0))
                                            .right(px(8.0)),
                                    )
                                },
                            )
                            .when(profile.favorite, |cover| {
                                cover.child(
                                    orbit::chip("★ Favorito", Tone::Accent, cx)
                                        .h(px(22.0))
                                        .absolute()
                                        .top(px(8.0))
                                        .left(px(8.0)),
                                )
                            })
                            .child(self.profile_app_chips(profile, cx)),
                    )
                    .child(
                        orbit::text(profile.name.clone(), 20.0, 600, orbit::ink(cx), cx)
                            .truncate()
                            .font_family(
                                cx.global::<orbit::design::Tokens>().fonts.display.clone(),
                            ),
                    )
                    .child(orbit::text(
                        format!(
                            "{} apps{}",
                            profile.steps.len(),
                            if profile.favorite {
                                " · Favorito · Ctrl L"
                            } else {
                                ""
                            }
                        ),
                        12.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, window, cx| {
                        if this.launch_progress().is_some() {
                            return;
                        }
                        this.selected_profile = Some(selected.clone());
                        this.profile_editor(profile_for_click.clone(), window, cx);
                    }))
                    .on_key_down(cx.listener(
                        move |this, event: &gpui::KeyDownEvent, window, cx| {
                            if this.launch_progress().is_none()
                                && matches!(event.keystroke.key.as_str(), "enter" | "space")
                            {
                                this.selected_profile = Some(keyboard_profile.id.clone());
                                this.profile_editor(keyboard_profile.clone(), window, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
            );
        }
        row = row.child(
            button("showcase-new", "+ Nuevo perfil", cx)
                .h_auto()
                .rounded(px(18.0))
                .w(px(150.0))
                .when(grid, |card| card.w_full().h(px(height)))
                .flex_none()
                .on_click(cx.listener(|this, _, window, cx| this.new_profile(None, window, cx))),
        );
        let scroll = self.profile_scroll.clone();
        let mut header = div()
            .flex()
            .items_center()
            .gap(px(6.0))
            .h(px(24.0))
            .child(orbit::text("Tus perfiles", 12.0, 500, orbit::ink_2(cx), cx).flex_1());
        if scroll.max_offset().x > px(0.0) {
            for (id, label, direction) in [
                ("profiles-previous", "‹", 1.0),
                ("profiles-next", "›", -1.0),
            ] {
                header = header.child(
                    button(id, label, cx)
                        .w(px(28.0))
                        .h(px(24.0))
                        .p_0()
                        .aria_label(if direction > 0.0 {
                            "Perfiles anteriores"
                        } else {
                            "Perfiles siguientes"
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            let scroll = &this.profile_scroll;
                            let next = scroll.offset().x + scroll.bounds().size.width * direction;
                            scroll.set_offset(gpui::point(
                                carousel_offset(next, px(0.0), scroll.max_offset().x),
                                px(0.0),
                            ));
                            cx.notify();
                        })),
                );
            }
        }
        div()
            .id("showcase-profiles")
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(6.0))
            .child(header)
            .child(
                div()
                    .id("showcase-profile-carousel")
                    .w_full()
                    .h(px(viewport_height))
                    .flex_none()
                    .overflow_x_scroll()
                    .when(grid, gpui::StatefulInteractiveElement::overflow_y_scroll)
                    .track_scroll(&scroll)
                    .on_scroll_wheel(cx.listener(|this, event: &gpui::ScrollWheelEvent, _, cx| {
                        if this.adapt.show_optional() {
                            return;
                        }
                        let delta = event.delta.pixel_delta(px(24.0));
                        let offset = this.profile_scroll.offset();
                        let maximum = this.profile_scroll.max_offset().x;
                        this.profile_scroll.set_offset(gpui::point(
                            carousel_offset(offset.x, delta.x + delta.y, maximum),
                            px(0.0),
                        ));
                        cx.stop_propagation();
                        cx.notify();
                    }))
                    .child(row),
            )
    }

    #[allow(clippy::too_many_lines)] // Composición declarativa de tarjeta; la lógica del motor permanece separada.
    fn showcase_apps(
        &self,
        profile: Option<&Profile>,
        compact: bool,
        cx: &mut Context<Self>,
    ) -> Div {
        let running = self.launch_progress().is_some();
        let mut grid = div().flex().flex_wrap().gap(px(8.0));
        for (index, app) in self
            .store
            .document
            .apps
            .iter()
            .take(if self.adapt.density == orbit::adapt::Density::Xs {
                2
            } else {
                5
            })
            .enumerate()
        {
            let edit = app.clone();
            let step = profile.and_then(|profile| {
                profile
                    .steps
                    .iter()
                    .position(|step| step.app_id == app.id)
                    .map(|index| (profile, index))
            });
            let (label, tone) = if running {
                step.map_or(("No se usa", Tone::Neutral), |(profile, index)| {
                    if self
                        .step_event(profile, index)
                        .is_some_and(|event| event.status == super::super::chain::Status::Ready)
                    {
                        ("Listo", Tone::Success)
                    } else {
                        self.step_state(profile, index)
                    }
                })
            } else if self.scanning {
                ("Detectando…", Tone::Warning)
            } else {
                let detected = self.discovered.apps.iter().find(|found| found.id == app.id);
                if detected.is_some_and(|found| found.availability.launchable) {
                    ("Lista", Tone::Success)
                } else {
                    ("No disponible", Tone::Neutral)
                }
            };
            grid = grid.child(
                orbit::action_row(("showcase-app", index), &app.name, cx)
                    .when(running && step.is_none(), |card| card.opacity(0.45))
                    .w(gpui::relative(0.31))
                    .min_w_0()
                    .h(px(if compact { 88.0 } else { 104.0 }))
                    .px(px(4.0))
                    .flex_col()
                    .justify_center()
                    .gap(px(8.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .rounded(px(16.0))
                    .child(app_icon(app, if compact { 32.0 } else { 36.0 }, cx))
                    .child(
                        orbit::text(
                            app.name.clone(),
                            if compact { 11.0 } else { 12.0 },
                            600,
                            orbit::ink(cx),
                            cx,
                        )
                        .truncate()
                        .w_full(),
                    )
                    .child(
                        orbit::text(
                            label,
                            if compact { 11.0 } else { 12.0 },
                            400,
                            tone.color(cx),
                            cx,
                        )
                        .text_center()
                        .w_full(),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.app_editor(Some(edit.clone()), window, cx);
                    })),
            );
        }
        grid = grid.child(
            button("showcase-add-app", "+ Añadir app", cx)
                .rounded(px(18.0))
                .w(gpui::relative(0.31))
                .h(px(if compact { 88.0 } else { 104.0 }))
                .on_click(cx.listener(|this, _, window, cx| this.app_editor(None, window, cx))),
        );
        div().child(grid).children(
            self.discovered
                .warnings
                .iter()
                .map(|warning| orbit::callout(warning.clone(), cx)),
        )
    }

    fn showcase_options(&self, profile: &Profile, cx: &mut Context<Self>) -> Stateful<Div> {
        let adapt = self.adapt;
        let visible = adapt.rail_rows().unwrap_or(5);
        let card = div()
            .id("showcase-options")
            .flex_none()
            .h(px(if visible == 5 {
                180.0
            } else if visible == 3 {
                108.0
            } else {
                72.0
            }))
            .flex()
            .flex_col()
            .min_h_0();
        let mut rows = div()
            .id("showcase-options-scroll")
            .flex()
            .flex_col()
            .min_h_0()
            .overflow_y_scroll()
            .gap(px(6.0));
        let labels = [
            "Si una app ya está abierta",
            "Esperar antes del primer paso",
            "Reintentos si no abre",
            "Si falla",
            "Al iniciar Windows",
        ];
        if let Some(controls) = self
            .showcase_controls
            .as_ref()
            .filter(|controls| controls.profile_id == profile.id)
        {
            for (label, choice) in labels.into_iter().zip(&controls.choices) {
                rows = rows.child(
                    div()
                        .w_full()
                        .h(px(30.0))
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .child(
                            orbit::text(label, 12.0, 400, orbit::ink_2(cx), cx)
                                .flex_1()
                                .min_w_0(),
                        )
                        .child(choice.clone()),
                );
            }
        }
        card.child(orbit::scroll_fade(
            rows,
            cx.global::<orbit::design::Tokens>().colors.neo_bottom,
        ))
    }

    fn history_row(
        profile: &Profile,
        result: Option<(&str, Tone)>,
        compact: bool,
        cx: &gpui::App,
    ) -> Div {
        div()
            .flex_none()
            .flex()
            .items_center()
            .gap(px(8.0))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .when(compact, |row| {
                        row.child(
                            orbit::text(
                                format!(
                                    "{} · {}",
                                    profile.name,
                                    orbit::activity_time(
                                        profile.last_launched_at.as_deref().unwrap_or_default(),
                                        chrono::Local::now().fixed_offset()
                                    )
                                ),
                                12.0,
                                400,
                                orbit::ink_2(cx),
                                cx,
                            )
                            .text_ellipsis()
                            .py(px(6.0)),
                        )
                    })
                    .when(!compact, |row| {
                        row.child(orbit::summary_row(
                            profile.name.clone(),
                            orbit::activity_time(
                                profile.last_launched_at.as_deref().unwrap_or_default(),
                                chrono::Local::now().fixed_offset(),
                            ),
                            "v-launch",
                            cx,
                        ))
                    })
                    .flex_1()
                    .min_w_0(),
            )
            .when_some(result, |row, (label, tone)| {
                row.child(orbit::pill(label, tone, cx))
            })
    }
    /// Orden del historial: primero el lanzamiento más reciente como instante
    /// real; lo ilegible queda al final, como en el resumen de Inicio.
    fn history_instant(profile: &Profile) -> Option<i64> {
        profile.last_launched_at.as_deref().and_then(|value| {
            chrono::DateTime::parse_from_rfc3339(value)
                .ok()
                .map(|when| when.timestamp_millis())
        })
    }
    fn sort_history(profiles: &mut Vec<&Profile>) {
        profiles.sort_by_key(|profile| {
            std::cmp::Reverse(Self::history_instant(profile).unwrap_or(i64::MIN))
        });
    }
    pub(super) fn showcase_history(&self, compact: bool, cx: &mut Context<Self>) -> Div {
        let mut card = div()
            .flex()
            .flex_col()
            .flex_1()
            .min_h_0()
            .gap(px(12.0))
            .min_h(px(80.0));
        let mut rows = div().flex().flex_col().gap(px(8.0));
        let mut profiles: Vec<_> = self
            .store
            .document
            .profiles
            .iter()
            .filter(|profile| profile.last_launched_at.is_some())
            .collect();
        Self::sort_history(&mut profiles);
        if profiles.is_empty() {
            rows = rows.child(orbit::text(
                "Todavía no has lanzado un perfil.",
                13.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        let limit = if self.page == LauncherPage::History {
            usize::MAX
        } else {
            self.adapt.rail_rows().unwrap_or(usize::MAX)
        };
        for profile in profiles.into_iter().take(limit) {
            let result = self
                .last_profile
                .as_ref()
                .filter(|last| last.id == profile.id)
                .and_then(|_| run_result(&self.progress));
            rows = rows.child(Self::history_row(profile, result, compact, cx));
        }
        if !self.progress.is_empty() && self.chain.is_none() && self.capture == Capture::None {
            rows = rows.child(self.progress_panel(cx));
        }
        card = card.child(orbit::scroll_fade(
            div()
                .id("showcase-history")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(rows),
            cx.global::<orbit::design::Tokens>().colors.neo_bottom,
        ));
        card
    }

    fn editor_rail(&self, cx: &mut Context<Self>) -> Vec<orbit::RailSection> {
        let Some(draft) = &self.profile_draft else {
            return Vec::new();
        };
        let preview = orbit::neo_card(cx)
            .id("profile-preview-list")
            .h(px(if self.adapt.show_notes() {
                350.0
            } else {
                230.0
            }))
            .overflow_y_scroll()
            .p(px(12.0))
            .child(orbit::circuit(None, cx).h(px(80.0)))
            .child(orbit::display(
                draft.name.read(cx).value.clone(),
                24.0,
                orbit::ink(cx),
                cx,
            ))
            .child(orbit::text(
                draft.description.read(cx).value.clone(),
                13.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
            .child(
                div()
                    .flex()
                    .gap(px(6.0))
                    .children(draft.steps.iter().filter_map(|step| {
                        step.app
                            .read(cx)
                            .state
                            .selected
                            .and_then(|index| draft.app_ids.get(index))
                            .and_then(|id| {
                                self.store.document.apps.iter().find(|app| &app.id == id)
                            })
                            .map(|app| app_icon(app, 28.0, cx))
                    })),
            );
        let preview = preview.when(!draft.hotkey.read(cx).value.is_empty(), |preview| {
            preview.child(orbit::keycaps(
                presentation::hotkey_keys(&draft.hotkey.read(cx).value),
                cx,
            ))
        });
        vec![
            orbit::RailSection::new("Vista previa", "v-launch", preview),
            orbit::RailSection::new(
                "Comportamiento",
                "v-sliders",
                div()
                    .id("profile-behaviour-list")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(self.profile_advanced_section(draft, cx)),
            )
            .grow(),
        ]
    }

    pub(crate) fn rail_sections(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Vec<orbit::RailSection> {
        self.sync_showcase_controls(window, cx);
        if self.page == LauncherPage::Editor {
            return self.editor_rail(cx);
        }
        let adapt = self.adapt;
        let profile = self.showcase_profile();
        let apps = self.showcase_apps(profile, !adapt.show_notes(), cx);
        let options = if let Some(profile) = profile {
            div()
                .child(self.showcase_options(profile, cx))
                .when(adapt.show_notes(), |options| {
                    options.child(self.showcase_quick(profile, cx))
                })
        } else {
            div().child(orbit::text(
                "Crea un perfil para configurar su comportamiento.",
                13.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
        };
        let history = self.showcase_history(true, cx);
        let all_apps = orbit::ghost_button("rail-all-apps", "Ver todas", cx).on_click(cx.listener(
            |this, _, _, cx| {
                this.page = LauncherPage::Manage;
                cx.notify();
            },
        ));
        let all_history = orbit::ghost_button("rail-all-history", "Ver todo", cx).on_click(
            cx.listener(|this, _, _, cx| {
                this.page = LauncherPage::History;
                cx.notify();
            }),
        );
        let mut sections = vec![
            orbit::RailSection::new("Tus aplicaciones", "gamepad", apps).action(all_apps),
            orbit::RailSection::new(
                if self.launch_progress().is_some() {
                    "Opciones · próxima vez"
                } else {
                    "Opciones avanzadas"
                },
                "v-sliders",
                options,
            ),
        ];
        if self.page != LauncherPage::History {
            sections.push(
                orbit::RailSection::new("Últimas veces", "clock", history)
                    .grow()
                    .action(all_history),
            );
        }
        sections
    }

    #[allow(clippy::too_many_lines)] // Composición declarativa de tarjeta; la lógica del motor permanece separada.
    pub(super) fn showcase(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        self.sync_showcase_controls(window, cx);
        if self.profile_scroll.bounds().size.width == px(0.0) {
            let entity = cx.entity();
            window.on_next_frame(move |_, cx| entity.update(cx, |_, cx| cx.notify()));
        }
        let adapt = self.adapt;
        let (top, side, bottom) = adapt.padding();
        let gap = adapt.gap();
        let profile = self.showcase_profile();
        let heading = div()
            .flex_none()
            .flex()
            .items_center()
            .gap(px(12.0))
            .child(
                orbit::neo_page_header(
                    "Launcher",
                    "Elige un perfil y pulsa Lanzar: Vantare abre todo en orden por ti.",
                    self.adapt,
                    cx,
                )
                .flex_1(),
            )
            .child(
                orbit::button("showcase-new-top", "+ Nuevo perfil", cx).on_click(
                    cx.listener(|this, _, window, cx| this.new_profile(None, window, cx)),
                ),
            );
        let mut center = div()
            .id("showcase-center")
            .flex_1()
            .min_w_0()
            .min_h_0()
            .overflow_hidden()
            .flex()
            .flex_col()
            .gap(px(gap));
        if let Some(profile) = profile
            && self.launch_progress().is_none()
            && let Some(reason) = launch_block_reason(
                profile,
                &self.store.document.apps,
                &self.discovered,
                self.scanning,
            )
        {
            center = center.child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        orbit::text(reason, 12.0, 400, Tone::Warning.color(cx), cx)
                            .flex_1()
                            .min_w_0()
                            .truncate(),
                    )
                    .child(
                        orbit::button("showcase-fix-apps", "Aplicaciones", cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.page = LauncherPage::Manage;
                                cx.notify();
                            }),
                        ),
                    ),
            );
        }
        center = if let Some(profile) = profile {
            center.child(self.showcase_hero(
                profile,
                f32::from(window.viewport_size().height) < 1000.0,
                cx,
            ))
        } else {
            center.child(orbit::neo_card(cx).flex_1().child(orbit::text(
                "Crea tu primer perfil para lanzar tus aplicaciones en orden.",
                24.0,
                500,
                orbit::ink(cx),
                cx,
            )))
        };
        center = center
            .child(self.showcase_profiles(f32::from(window.viewport_size().width) < 1700.0, cx));
        div()
            .id("launcher-showcase")
            .size_full()
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .px(px(side))
            .pt(px(top))
            .pb(px(bottom))
            .gap(px(12.0))
            .child(heading)
            .when_some(self.error.clone(), |page, error| {
                page.child(orbit::callout(error, cx))
            })
            .child(div().flex_1().min_h_0().flex().gap(px(gap)).child(center))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn both_states_reserve_complete_controls_and_covers_at_seven_sizes() {
        for (width, height) in [
            (1920.0, 1080.0),
            (1680.0, 1050.0),
            (1512.0, 900.0),
            (1440.0, 900.0),
            (1366.0, 768.0),
            (1280.0, 720.0),
            (2048.0, 1152.0),
        ] {
            for rail in [true, false] {
                let adapt = orbit::Adapt::new(width, height, None, rail);
                let (top, _, bottom) = adapt.padding();
                let page = height - 52.0 - top - bottom;
                let covers = if adapt.show_optional() {
                    poster_height(adapt, 3) * 2.0 + 12.0
                } else {
                    poster_height(adapt, 3)
                };
                assert!(
                    hero_height(adapt) + covers + 60.0 + 30.0 + adapt.gap() * 2.0 <= page + 1.0,
                    "{width}x{height}, rail={rail}"
                );
                // A four-step chain plus Cancel and progress keeps an interactive viewport.
                assert!(adapt.center_width() - adapt.padding().1 * 2.0 >= 560.0);
                assert!(hero_height(adapt) >= 318.0);
            }
        }
    }

    #[test]
    fn card_projects_idle_retry_success_failure_and_cancellation() {
        use super::super::super::chain::Status;
        let event = |status, success| Progress {
            step: Some(0),
            status,
            pid: None,
            message: String::new(),
            success,
            decision: None,
        };
        assert_eq!(card_state(&[], false), CardState::Resting);
        assert_eq!(card_state(&[], true), CardState::Running);
        let retry = [
            event(Status::Launching, false),
            event(Status::Failed, false),
            event(Status::Launching, false),
        ];
        assert_eq!(card_state(&retry, true), CardState::Retry);
        assert_eq!(
            card_state(&[event(Status::Ready, true)], true),
            CardState::Running
        );
        assert_eq!(
            card_state(&[event(Status::Done, true)], false),
            CardState::Ready
        );
        assert_eq!(
            card_state(&[event(Status::Done, false)], false),
            CardState::Failed
        );
        assert_eq!(
            card_state(&[event(Status::Cancelled, false)], false),
            CardState::Cancelled
        );
    }

    #[test]
    fn carousel_stops_at_both_ends_and_keeps_the_last_card_reachable() {
        assert_eq!(carousel_offset(px(0.0), px(-300.0), px(500.0)), px(-300.0));
        assert_eq!(
            carousel_offset(px(-300.0), px(-300.0), px(500.0)),
            px(-500.0)
        );
        assert_eq!(carousel_offset(px(-500.0), px(900.0), px(500.0)), px(0.0));
        assert_eq!(carousel_offset(px(0.0), px(-300.0), px(0.0)), px(0.0));
    }

    #[test]
    fn run_pills_require_a_terminal_result_and_keep_recovered_retries() {
        use super::super::super::chain::Status;
        let event = |status, success| Progress {
            step: Some(0),
            status,
            pid: None,
            message: String::new(),
            success,
            decision: None,
        };
        let cases = [
            (vec![], None),
            (vec![event(Status::Launching, false)], None),
            (
                vec![
                    event(Status::Launching, false),
                    event(Status::Ready, true),
                    event(Status::Done, true),
                ],
                Some("Completado"),
            ),
            (
                vec![
                    event(Status::Launching, false),
                    event(Status::Failed, false),
                    event(Status::Launching, false),
                    event(Status::Ready, true),
                    event(Status::Done, true),
                ],
                Some("Completado con reintentos"),
            ),
            (
                vec![
                    event(Status::Waiting, false),
                    event(Status::Ready, true),
                    event(Status::Done, true),
                ],
                Some("Requirió confirmación"),
            ),
            (vec![event(Status::Cancelled, false)], Some("Cancelado")),
            (vec![event(Status::Done, false)], Some("Falló")),
        ];
        for (events, expected) in cases {
            assert_eq!(run_result(&events).map(|(label, _)| label), expected);
        }
        // Dos pasos normales no son un reintento de la misma aplicación.
        let mut second = event(Status::Launching, false);
        second.step = Some(1);
        assert_eq!(
            run_result(&[
                event(Status::Launching, false),
                second,
                event(Status::Done, true)
            ])
            .map(|result| result.0),
            Some("Completado")
        );
    }

    #[test]
    fn dropdowns_preserve_custom_delay_and_other_policy_preferences() {
        let mut profile = Profile::new("p".into(), "Perfil".into());
        let delays = [0, 5, 17];
        let cancel = profile.effective_policy().cancel;
        for (option, selected) in [(0, 2), (1, 2), (2, 3), (3, 1), (4, 1)] {
            set_option(&mut profile, &delays, option, selected).unwrap();
        }
        assert_eq!(option_indices(&profile, &delays), [2, 2, 3, 1, 1]);
        assert_eq!(profile.first_step_delay, 17);
        assert_eq!(profile.max_retries, 3);
        assert_eq!(profile.effective_policy().cancel, cancel);
        let before = serde_json::to_value(&profile).unwrap();
        for (option, selected) in [(0, 3), (1, 3), (2, 4), (3, 3), (4, 2), (5, 0)] {
            assert!(set_option(&mut profile, &delays, option, selected).is_err());
            assert_eq!(serde_json::to_value(&profile).unwrap(), before);
        }
    }

    #[test]
    fn blocked_launch_explains_scanning_empty_profile_and_unavailable_apps() {
        let mut profile = Profile::new("p".into(), "Perfil".into());
        let discovery = Discovery {
            apps: vec![],
            steam_executable: None,
            warnings: vec![],
        };
        assert!(
            launch_block_reason(&profile, &[], &discovery, true)
                .unwrap()
                .contains("detección")
        );
        assert!(
            launch_block_reason(&profile, &[], &discovery, false)
                .unwrap()
                .contains("Añade")
        );
        profile.steps.push(Step {
            app_id: "lmu".into(),
            delay_seconds: 0,
            args_override: None,
        });
        assert!(
            launch_block_reason(&profile, &[], &discovery, false)
                .unwrap()
                .contains("Le Mans Ultimate")
        );
    }

    #[test]
    fn blocked_launch_uses_catalog_and_custom_names() {
        let mut profile = Profile::new("p".into(), "Perfil".into());
        for id in ["lmu", "obs", "spotify", "custom:tool"] {
            profile.steps.push(Step {
                app_id: id.into(),
                delay_seconds: 0,
                args_override: None,
            });
        }
        let apps = vec![App {
            id: "custom:tool".into(),
            name: "Mi aplicación".into(),
            executable: None,
            args: vec![],
            favorite: false,
        }];
        let reason = launch_block_reason(&profile, &apps, &Discovery::default(), false)
            .expect("rutas pendientes");
        assert!(reason.contains("Le Mans Ultimate, OBS Studio, Spotify, Mi aplicación"));
        assert!(!reason.contains("custom:tool"));
    }

    #[test]
    fn quick_preferences_toggle_saved_policy_without_touching_cancel_or_steps() {
        let mut profile = Profile::new("p".into(), "Perfil".into());
        let original_cancel = profile.effective_policy().cancel;
        toggle_quick(&mut profile, 0);
        assert_eq!(profile.effective_policy().max_retries, 2);
        assert_eq!(profile.max_retries, 2);
        toggle_quick(&mut profile, 0);
        assert_eq!(profile.effective_policy().max_retries, 0);
        toggle_quick(&mut profile, 1);
        assert_eq!(profile.effective_policy().exit, Close::Started);
        toggle_quick(&mut profile, 1);
        assert_eq!(profile.effective_policy().exit, Close::Leave);
        toggle_quick(&mut profile, 2);
        assert!(profile.launch_on_windows_startup);
        toggle_quick(&mut profile, 2);
        assert!(!profile.launch_on_windows_startup);
        assert_eq!(profile.effective_policy().cancel, original_cancel);
        assert!(profile.steps.is_empty());
    }
    #[test]
    fn history_orders_by_instant_across_offsets_and_pushes_unreadable_last() {
        let mut recent = Profile::new("recent".into(), "Reciente".into());
        recent.last_launched_at = Some("2026-07-07T17:42:00Z".into());
        // 17:40Z: anterior al reciente aunque su texto con offset ordene después.
        let mut earlier = Profile::new("earlier".into(), "Anterior".into());
        earlier.last_launched_at = Some("2026-07-07T19:40:00+02:00".into());
        let mut invalid = Profile::new("invalid".into(), "Ilegible".into());
        invalid.last_launched_at = Some("no es una fecha".into());
        let mut profiles = vec![&earlier, &invalid, &recent];
        Launcher::sort_history(&mut profiles);
        assert_eq!(
            profiles
                .iter()
                .map(|profile| profile.id.as_str())
                .collect::<Vec<_>>(),
            ["recent", "earlier", "invalid"]
        );
    }
    #[test]
    fn retry_is_shown_only_after_a_second_launch_event_and_ready_wins() {
        use super::super::super::chain::Status;
        let event = |status| Progress {
            step: Some(0),
            status,
            pid: None,
            message: String::new(),
            success: false,
            decision: None,
        };
        let mut events = vec![event(Status::Launching)];
        assert_eq!(step_state(&events, 0).0, "Abriendo…");
        events.push(event(Status::Launching));
        assert_eq!(step_state(&events, 0).0, "Reintentando…");
        events.push(event(Status::Ready));
        assert_eq!(step_state(&events, 0).0, "Listo");
        assert_eq!(step_state(&events, 1).0, "En espera");
    }
    #[test]
    fn timeline_uses_latest_event_for_each_step_and_ignores_chain_result() {
        use super::super::super::chain::Status;
        let event = |step, status| Progress {
            step,
            status,
            pid: None,
            message: String::new(),
            success: false,
            decision: None,
        };
        let events = [
            event(Some(0), Status::Failed),
            event(Some(1), Status::Ready),
            event(Some(0), Status::Launching),
            event(None, Status::Done),
        ];
        assert_eq!(step_label(latest(&events, 0)).0, "Abriendo…");
        assert_eq!(step_label(latest(&events, 1)).0, "Listo");
        assert_eq!(step_label(latest(&events, 2)).0, "En espera");
    }

    #[test]
    fn timeline_distinguishes_waiting_failure_cancellation_and_completion() {
        use super::super::super::chain::Status;
        for (status, label) in [
            (Status::Pending, "En espera"),
            (Status::Waiting, "Esperando…"),
            (Status::Failed, "Falló"),
            (Status::Cancelled, "Cancelado"),
            (Status::Ready, "Listo"),
        ] {
            let event = Progress {
                step: Some(0),
                status,
                pid: None,
                message: String::new(),
                success: false,
                decision: None,
            };
            assert_eq!(step_label(Some(&event)).0, label);
        }
    }
}
