//! Borrador local sobre controles Orbit; solo Guardar confirma en disco.
use super::presentation::{eyebrow, text, tracked_text};
use super::*;
use crate::orbit::{Choice, ChoiceKind, NumberControl, NumberKind, NumberRange, OptionItem};
use gpui::{
    AnyView, Context, Entity, EventEmitter, FocusHandle, IntoElement, Render, Window, deferred,
    div, px, rgb, rgba,
};

pub(super) struct LauncherDrawer {
    open: bool,
    capture: bool,
    label: String,
    content: AnyView,
    footer: Option<AnyView>,
    focus: FocusHandle,
    close_focus: FocusHandle,
    targets: Vec<FocusHandle>,
    restore: Option<FocusHandle>,
}

impl EventEmitter<orbit::Dismissed> for LauncherDrawer {}

impl LauncherDrawer {
    fn new(
        label: String,
        content: AnyView,
        footer: Option<AnyView>,
        targets: Vec<FocusHandle>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let focus = cx.focus_handle();
        let close_focus = cx.focus_handle();
        cx.on_focus_out(&focus, window, |this, _, window, cx| {
            let focus_stayed_in_drawer = this.close_focus.contains_focused(window, cx)
                || this
                    .targets
                    .iter()
                    .any(|target| target.contains_focused(window, cx));
            if this.open && !focus_stayed_in_drawer {
                if let Some(target) = this.targets.first() {
                    target.focus(window, cx);
                } else {
                    this.focus.focus(window, cx);
                }
            }
        })
        .detach();
        Self {
            open: false,
            capture: false,
            label,
            content,
            footer,
            focus,
            close_focus,
            targets,
            restore: None,
        }
    }

    fn show(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.open {
            self.restore = window.focused(cx);
        }
        self.open = true;
        self.focus.focus(window, cx);
        cx.notify();
    }

    pub(super) fn capture_focus(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.capture = true;
        self.close_focus.focus(window, cx);
    }

    pub(super) fn set_targets(&mut self, targets: Vec<FocusHandle>) {
        self.targets = targets;
    }

    fn dismiss(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.open {
            return;
        }
        self.open = false;
        if let Some(restore) = self.restore.take() {
            restore.focus(window, cx);
        }
        cx.emit(orbit::Dismissed);
        cx.notify();
    }

    fn key(&mut self, event: &gpui::KeyDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        match event.keystroke.key.as_str() {
            "escape" => self.dismiss(window, cx),
            "tab" => {
                let close_index = self.targets.len();
                let current = self
                    .close_focus
                    .contains_focused(window, cx)
                    .then_some(close_index)
                    .or_else(|| {
                        self.targets
                            .iter()
                            .position(|target| target.contains_focused(window, cx))
                    });
                let next = match (current, event.keystroke.modifiers.shift) {
                    (Some(0) | None, true) => close_index,
                    (Some(index), true) => index - 1,
                    (Some(index), false) if index < close_index => index + 1,
                    _ => 0,
                };
                if next == close_index {
                    self.close_focus.focus(window, cx);
                } else if let Some(target) = self.targets.get(next) {
                    target.focus(window, cx);
                } else {
                    self.focus.focus(window, cx);
                }
            }
            _ => return,
        }
        cx.stop_propagation();
    }

    fn header(&self, cx: &Context<Self>) -> gpui::Div {
        div()
            .h(px(64.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(12.0))
            .px(px(20.0))
            .border_b_1()
            .border_color(rgba(orbit::line(cx)))
            .child(
                tracked_text(self.label.clone(), 16.0, 650, orbit::ink(cx), -0.24)
                    .flex_1()
                    .min_w_0(),
            )
            .child(
                div()
                    .id("launcher-drawer-close")
                    .role(gpui::Role::Button)
                    .aria_label("Cerrar")
                    .track_focus(&self.close_focus)
                    .tab_index(0)
                    .size(px(28.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(7.0))
                    .text_size(px(18.0))
                    .text_color(rgb(orbit::ink_3(cx)))
                    .cursor_pointer()
                    .hover(|style| {
                        style
                            .bg(rgba(orbit::line_row(cx)))
                            .text_color(rgb(orbit::ink(cx)))
                    })
                    .child("×")
                    .on_click(cx.listener(|this, _, window, cx| this.dismiss(window, cx))),
            )
    }
}

impl Render for LauncherDrawer {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if !self.open {
            return div().id("launcher-drawer").into_any_element();
        }
        // La escena de captura conserva el foco en un control sin cursor de edición.
        if self.capture && !self.close_focus.is_focused(window) {
            self.close_focus.focus(window, cx);
        }
        let mut panel = div()
            .id("launcher-drawer-panel")
            .role(gpui::Role::Dialog)
            .aria_label(self.label.clone())
            .track_focus(&self.focus.clone().tab_stop(false))
            .tab_index(0)
            .tab_stop(false)
            .tab_group()
            .w(px(480.0))
            .max_w_full()
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .min_h_0()
            .overflow_hidden()
            .bg(rgb(orbit::surface_1(cx)))
            .border_l_1()
            .border_color(rgba(orbit::line(cx)))
            .capture_key_down(cx.listener(Self::key))
            .on_mouse_down_out(cx.listener(|this, _, window, cx| this.dismiss(window, cx)))
            .child(self.header(cx))
            .child(orbit::scroll_fade(
                div()
                    .id("launcher-drawer-body")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .py(px(18.0))
                    .px(px(20.0))
                    .child(self.content.clone()),
                orbit::surface_1(cx),
            ));
        if let Some(footer) = &self.footer {
            panel = panel.child(
                div()
                    .flex_none()
                    .flex()
                    .justify_end()
                    .gap(px(8.0))
                    .px(px(20.0))
                    .py(px(14.0))
                    .border_t_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgb(orbit::surface_2(cx)))
                    .child(footer.clone()),
            );
        }
        deferred(
            div()
                .id("launcher-drawer-scrim")
                .absolute()
                .inset_0()
                .size_full()
                .flex()
                .justify_end()
                .bg(rgba((orbit::surface_1(cx) << 8) | 0x99))
                .occlude()
                .child(panel),
        )
        .with_priority(orbit::MODAL_Z)
        .into_any_element()
    }
}

struct FormHost(WeakEntity<Launcher>);
impl Render for FormHost {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.0
            .update(cx, |launcher, cx| {
                if launcher.pending_decision.is_some() {
                    launcher.decision_form(cx)
                } else if launcher.pending_app_removal.is_some()
                    || launcher.pending_profile_removal.is_some()
                {
                    if let Some(id) = &launcher.pending_profile_removal {
                        div().child(text(
                            format!("Eliminar perfil {id}? Esta accion no se puede deshacer."),
                            orbit::BODY,
                            500,
                            orbit::ink(cx),
                            cx,
                        ))
                    } else {
                        launcher.app_removal_confirmation(cx)
                    }
                } else if launcher.app_draft.is_some() {
                    launcher.app_form(cx)
                } else {
                    launcher.profile_form(cx)
                }
            })
            .unwrap_or_else(|_| div())
    }
}

struct ProfileFooter(WeakEntity<Launcher>);
struct AppRemovalFooter(WeakEntity<Launcher>);

fn drawer_action_button(
    id: &'static str,
    label: &'static str,
    primary: bool,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    let (background, foreground, border, weight) = if primary {
        (
            rgb(crate::orbit::legacy_rgb(0x00f3_eeee, cx)),
            cx.global::<crate::orbit::theme::Theme>().primary_ink,
            rgb(crate::orbit::legacy_rgb(0x00f3_eeee, cx)),
            650,
        )
    } else {
        (
            rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx)),
            orbit::ink_3(cx),
            rgba(crate::orbit::legacy_rgba(0xffff_ff12, cx)),
            400,
        )
    };
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_index(0)
        .h(px(39.0))
        .px(px(if primary { 13.0 } else { 16.0 }))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(orbit::RADIUS_CONTROL))
        .bg(background)
        .border_1()
        .border_color(border)
        .cursor_pointer()
        .hover(|style| style.bg(rgb(orbit::ink(cx))))
        .child(text(label.to_owned(), 13.0, weight, foreground, cx))
}

impl Render for ProfileFooter {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.0
            .update(cx, |launcher, cx| {
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(form_button(
                        drawer_action_button("discard-profile", "Cancelar", false, cx),
                        &launcher.form_actions[1],
                        Launcher::close_form,
                        cx,
                    ))
                    .child(form_button(
                        drawer_action_button("save-profile", "Guardar", true, cx),
                        &launcher.form_actions[2],
                        Launcher::commit_form,
                        cx,
                    ))
            })
            .unwrap_or_else(|_| div())
    }
}

fn drawer_danger_button(
    id: &'static str,
    label: &'static str,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_index(0)
        .h(px(39.0))
        .px(px(16.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(orbit::RADIUS_CONTROL))
        .bg(rgb(orbit::carmine(cx)))
        .border_1()
        .border_color(rgb(orbit::carmine(cx)))
        .cursor_pointer()
        .hover(|style| {
            style
                .bg(rgb(orbit::coral(cx)))
                .border_color(rgb(orbit::coral(cx)))
        })
        .child(text(label.to_owned(), 13.0, 800, orbit::white(cx), cx))
}

impl Render for AppRemovalFooter {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.0
            .update(cx, |launcher, cx| {
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(form_button(
                        drawer_action_button("cancel-app-removal", "Cancelar", false, cx),
                        &launcher.form_actions[1],
                        Launcher::close_form,
                        cx,
                    ))
                    .child(form_button(
                        drawer_danger_button("confirm-app-removal", "Eliminar", cx),
                        &launcher.form_actions[2],
                        Launcher::confirm_app_removal,
                        cx,
                    ))
            })
            .unwrap_or_else(|_| div())
    }
}

fn number(
    value: u32,
    max: u32,
    label: &'static str,
    cx: &mut Context<Launcher>,
) -> Entity<NumberControl> {
    cx.new(|cx| {
        NumberControl::new(
            label,
            NumberKind::Stepper,
            NumberRange {
                min: 0.0,
                max: f64::from(max),
                step: 1.0,
                value: f64::from(value),
            },
            cx,
        )
    })
}

// NumberControl conserva enteros u32 no negativos (o de 0 a 3 reintentos).
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn seconds(control: &Entity<NumberControl>, cx: &Context<Launcher>) -> u32 {
    control.read(cx).range.value as u32
}

fn draft_step(
    ids: &[String],
    selected: Option<usize>,
    delay: u32,
    args: &str,
) -> Result<Step, String> {
    let index = selected.ok_or("elige una aplicación para cada paso")?;
    Ok(Step {
        app_id: ids.get(index).ok_or("aplicación inexistente")?.clone(),
        delay_seconds: delay,
        args_override: if args.trim().is_empty() {
            None
        } else {
            Some(parse_args(args)?)
        },
    })
}

pub(super) fn form_button(
    button: gpui::Stateful<gpui::Div>,
    focus: &gpui::FocusHandle,
    action: impl Fn(&mut Launcher, &mut Window, &mut Context<Launcher>) + Copy + 'static,
    cx: &Context<Launcher>,
) -> gpui::Stateful<gpui::Div> {
    button
        .track_focus(&focus.clone().tab_stop(true))
        .on_click(cx.listener(move |this, _, window, cx| action(this, window, cx)))
        .on_key_down(
            cx.listener(move |this, event: &gpui::KeyDownEvent, window, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    action(this, window, cx);
                    cx.stop_propagation();
                }
            }),
        )
}

fn editor_field(label: &str, control: impl IntoElement, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .gap(px(9.0))
        .child(
            tracked_text(label.to_owned(), 12.0, 600, orbit::ink_3(cx), 0.0).line_height(px(16.0)),
        )
        .child(div().w_full().child(control))
}

impl Launcher {
    pub(super) fn commit_form(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.app_draft.is_some() {
            self.save_app(cx);
        } else {
            self.save_profile(cx);
        }
        if self.app_draft.is_none() && self.profile_draft.is_none() {
            self.close_form(window, cx);
        }
    }
    pub(super) fn form_targets(&self, cx: &Context<Self>) -> Vec<gpui::FocusHandle> {
        if let Some(decision) = &self.pending_decision {
            return self
                .form_actions
                .iter()
                .take(decision.actions.len())
                .cloned()
                .collect();
        }
        if self.pending_app_removal.is_some() || self.pending_profile_removal.is_some() {
            return vec![self.form_actions[1].clone(), self.form_actions[2].clone()];
        }
        if let Some(draft) = &self.app_draft {
            return vec![
                draft.name.read(cx).focus_handle(),
                draft.executable.read(cx).focus_handle(),
                draft.args.read(cx).focus_handle(),
                self.form_actions[0].clone(),
                self.form_actions[1].clone(),
                self.form_actions[2].clone(),
            ];
        }
        let Some(draft) = &self.profile_draft else {
            return vec![];
        };
        let advanced = draft.tabs.read(cx).state.selected == Some(1);
        let mut targets = vec![
            draft.name.read(cx).focus_handle(),
            draft.description.read(cx).focus_handle(),
            draft.notes.read(cx).focus_handle(),
            draft.tabs.read(cx).focus_handle(),
        ];
        for (index, step) in draft.steps.iter().enumerate() {
            targets.push(step.app.read(cx).focus_handle());
            targets.push(if index == 0 {
                draft.first_delay.read(cx).focus_handle()
            } else {
                step.delay.read(cx).focus_handle()
            });
            if advanced {
                targets.push(step.args.read(cx).focus_handle());
            }
        }
        if advanced {
            targets.extend([
                draft.failure.read(cx).focus_handle(),
                draft.reuse.read(cx).focus_handle(),
                draft.cancel.read(cx).focus_handle(),
                draft.exit.read(cx).focus_handle(),
                draft.retry_policy.read(cx).focus_handle(),
                draft.hotkey.read(cx).focus_handle(),
                draft.autostart.read(cx).focus_handle(),
                draft.retries.read(cx).focus_handle(),
            ]);
        }
        targets.extend(self.form_actions.iter().cloned());
        targets
    }

    pub(super) fn open_form(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let launcher = cx.entity();
        let host = cx.new(|cx| {
            cx.observe(&launcher, |_, _, cx| cx.notify()).detach();
            FormHost(launcher.downgrade())
        });
        let targets = self.form_targets(cx);
        let label = if self.pending_decision.is_some() {
            "Decisión de lanzamiento"
        } else if self.pending_app_removal.is_some() || self.pending_profile_removal.is_some() {
            "Eliminar aplicación"
        } else if self.app_draft.is_some() {
            "Editar aplicación"
        } else if self.profile_draft.as_ref().is_some_and(|draft| {
            !self
                .store
                .document
                .profiles
                .iter()
                .any(|profile| profile.id == draft.profile.id)
        }) {
            "Nuevo perfil"
        } else {
            "Editar perfil"
        };
        let footer = if self.pending_decision.is_some() {
            None
        } else if self.pending_app_removal.is_some() || self.pending_profile_removal.is_some() {
            let footer = cx.new(|cx| {
                cx.observe(&launcher, |_, _, cx| cx.notify()).detach();
                AppRemovalFooter(launcher.downgrade())
            });
            Some(footer.into())
        } else if self.app_draft.is_none() {
            let footer = cx.new(|cx| {
                cx.observe(&launcher, |_, _, cx| cx.notify()).detach();
                ProfileFooter(launcher.downgrade())
            });
            Some(footer.into())
        } else {
            None
        };
        let layer = cx
            .new(|cx| LauncherDrawer::new(label.into(), host.into(), footer, targets, window, cx));
        cx.subscribe(&layer, |this, _, _: &orbit::Dismissed, cx| {
            if let Some(decision) = this.pending_decision.take() {
                if decision.id == 0 {
                    this.exit_cancelled = true;
                } else if let Some(chain) = &this.chain {
                    if decision.actions.contains(&Action::Leave) {
                        let result = chain.answer(decision.id, Action::Leave);
                        this.report(result, cx);
                    } else {
                        chain.cancel();
                    }
                }
            }
            this.app_draft = None;
            this.profile_draft = None;
            this.pending_app_removal = None;
            this.pending_profile_removal = None;
            this.form_layer = None;
            cx.notify();
        })
        .detach();
        layer.update(cx, |layer, cx| layer.show(window, cx));
        self.form_layer = Some(layer);
        cx.notify();
    }

    pub(super) fn close_form(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(layer) = self.form_layer.take() {
            layer.update(cx, |layer, cx| layer.dismiss(window, cx));
        }
        self.app_draft = None;
        self.profile_draft = None;
        self.pending_app_removal = None;
        self.pending_profile_removal = None;
        if self.page == LauncherPage::Editor {
            self.page = LauncherPage::Showcase;
        }
        cx.notify();
    }

    pub(super) fn confirm_app_removal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(id) = self.pending_profile_removal.clone() {
            let owned = self
                .processes
                .lock()
                .map_err(|e| e.to_string())
                .and_then(|mut p| p.has_profile(&id));
            match owned {
                Ok(false) if self.chain.is_none() => {
                    if self.edit(|doc| doc.remove_profile(&id), cx) {
                        self.close_form(window, cx);
                    }
                }
                Ok(_) => self.report(
                    Err(
                        "termina la cadena y cierra las apps iniciadas antes de borrar el perfil"
                            .into(),
                    ),
                    cx,
                ),
                Err(error) => self.report(Err(error), cx),
            }
        } else if let Some(id) = self.pending_app_removal.clone()
            && self.edit(move |document| document.remove_app(&id), cx)
        {
            self.close_form(window, cx);
            self.scan(cx);
        }
    }
    pub(super) fn request_profile_removal(
        &mut self,
        id: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.profile_draft = None;
        self.app_draft = None;
        self.page = LauncherPage::Showcase;
        self.pending_profile_removal = Some(id);
        self.open_form(window, cx);
    }

    pub(super) fn request_app_removal(
        &mut self,
        app: &App,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.app_draft = None;
        self.profile_draft = None;
        self.pending_app_removal = Some(app.id.clone());
        self.open_form(window, cx);
    }

    fn make_step(
        step: &Step,
        apps: &[App],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> StepDraft {
        let app = cx.new(|cx| {
            Choice::new(
                "Aplicación del paso",
                ChoiceKind::Dropdown,
                apps.iter().map(|app| OptionItem::new(&app.name)).collect(),
                apps.iter().position(|app| app.id == step.app_id),
                window,
                cx,
            )
        });
        cx.observe(&app, |_, _, cx| cx.notify()).detach();
        StepDraft {
            app,
            delay: number(step.delay_seconds, u32::MAX, "Espera del paso (s)", cx),
            args: input(
                step.args_override
                    .as_deref()
                    .map_or(String::new(), args_json),
                "Argumentos del paso en JSON",
                cx,
            ),
        }
    }

    pub(super) fn profile_editor(
        &mut self,
        profile: Profile,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let policy = profile.effective_policy();
        let apps = &self.store.document.apps;
        let steps = profile
            .steps
            .iter()
            .map(|step| Self::make_step(step, apps, window, cx))
            .collect();
        let tabs = cx.new(|cx| {
            Choice::new(
                "Editor de pasos",
                ChoiceKind::Tabs,
                vec![OptionItem::new("Básico"), OptionItem::new("Avanzado")],
                Some(usize::from(profile.advanced)),
                window,
                cx,
            )
        });
        cx.subscribe(&tabs, |_, _, _: &orbit::ChoiceChanged, cx| cx.notify())
            .detach();
        let description = input(profile.description.clone(), "Descripcion", cx);
        let notes = cx.new(|cx| Input::multiline(profile.notes.clone(), "Notas", cx));
        self.profile_draft = Some(ProfileDraft {
            name: input(profile.name.clone(), "Nombre de perfil", cx),
            description,
            notes,
            hotkey: input(profile.hotkey.clone(), "Atajo: ctrl+shift+1", cx),
            autostart: cx.new(|cx| {
                orbit::Checkbox::new("Iniciar con Windows", profile.launch_on_windows_startup, cx)
            }),
            first_delay: number(policy.first_step_delay, u32::MAX, "Espera inicial (s)", cx),
            retries: number(u32::from(policy.max_retries), 3, "Reintentos por paso", cx),
            failure: policy_choice(
                "Ante un fallo",
                &["Preguntar", "Parar", "Continuar"],
                match policy.failure {
                    Failure::Ask => 0,
                    Failure::Stop => 1,
                    Failure::Continue => 2,
                },
                window,
                cx,
            ),
            reuse: policy_choice(
                "Aplicación ya abierta",
                &[
                    "Preguntar",
                    "Reutilizar",
                    "Reiniciar solo si Vantare la inició",
                ],
                match policy.already_running {
                    Running::Ask => 0,
                    Running::Reuse => 1,
                    Running::Restart => 2,
                },
                window,
                cx,
            ),
            cancel: policy_choice(
                "Al cancelar",
                &["Preguntar", "Dejar abiertas", "Cerrar solo las iniciadas"],
                close_index(policy.cancel),
                window,
                cx,
            ),
            exit: policy_choice(
                "Al salir",
                &["Preguntar", "Dejar abiertas", "Cerrar solo las iniciadas"],
                close_index(policy.exit),
                window,
                cx,
            ),
            retry_policy: policy_choice(
                "Reintentar",
                &["Preguntar", "Pasos fallidos", "Cadena entera"],
                match policy.retry {
                    super::super::policy::Retry::Ask => 0,
                    super::super::policy::Retry::Failed => 1,
                    super::super::policy::Retry::All => 2,
                },
                window,
                cx,
            ),
            tabs,
            app_ids: apps.iter().map(|app| app.id.clone()).collect(),
            profile,
            steps,
        });
        self.observe_profile_preview(cx);
        self.app_draft = None;
        self.page = LauncherPage::Editor;
        if let Some(draft) = &self.profile_draft {
            draft.name.read(cx).focus_handle().focus(window, cx);
        }
        cx.notify();
    }

    fn observe_profile_preview(&self, cx: &mut Context<Self>) {
        if let Some(draft) = &self.profile_draft {
            cx.observe(&draft.name, |_, _, cx| cx.notify()).detach();
            cx.observe(&draft.description, |_, _, cx| cx.notify())
                .detach();
            cx.observe(&draft.hotkey, |_, _, cx| cx.notify()).detach();
        }
    }
    pub(super) fn new_profile(
        &mut self,
        source: Option<Profile>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(id) = (1..=129)
            .map(|n| format!("profile:{n}"))
            .find(|id| !self.store.document.profiles.iter().any(|p| &p.id == id))
        else {
            self.report(Err("límite de perfiles alcanzado".into()), cx);
            return;
        };
        let mut profile = source.map_or_else(
            || Profile::new(id.clone(), "Nuevo perfil".into()),
            |profile| profile.duplicate(id.clone()),
        );
        profile.id = id;
        if profile.policy.is_none() {
            profile.policy = Some(super::super::policy::Policy::default());
        }
        self.profile_editor(profile, window, cx);
    }

    fn save_profile(&mut self, cx: &mut Context<Self>) {
        let Some(draft) = &self.profile_draft else {
            return;
        };
        let result = (|| {
            let mut profile = draft.profile.clone();
            profile.name = draft.name.read(cx).value.trim().into();
            profile
                .description
                .clone_from(&draft.description.read(cx).value);
            profile.notes.clone_from(&draft.notes.read(cx).value);
            profile.advanced = draft.tabs.read(cx).state.selected == Some(1);
            profile.hotkey.clone_from(&draft.hotkey.read(cx).value);
            profile.launch_on_windows_startup = draft.autostart.read(cx).checked;
            profile.first_step_delay = seconds(&draft.first_delay, cx);
            profile.max_retries = u8::try_from(seconds(&draft.retries, cx))
                .map_err(|error| format!("reintentos inválidos: {error}"))?;
            let mut policy = profile.effective_policy();
            policy.failure = match draft.failure.read(cx).state.selected {
                Some(1) => Failure::Stop,
                Some(2) => Failure::Continue,
                _ => Failure::Ask,
            };
            policy.already_running = match draft.reuse.read(cx).state.selected {
                Some(1) => Running::Reuse,
                Some(2) => Running::Restart,
                _ => Running::Ask,
            };
            policy.cancel = selected_close(draft.cancel.read(cx).state.selected);
            policy.exit = selected_close(draft.exit.read(cx).state.selected);
            policy.retry = match draft.retry_policy.read(cx).state.selected {
                Some(1) => super::super::policy::Retry::Failed,
                Some(2) => super::super::policy::Retry::All,
                _ => super::super::policy::Retry::Ask,
            };
            policy.first_step_delay = profile.first_step_delay;
            policy.max_retries = profile.max_retries;
            profile.continue_on_error = policy.failure == Failure::Continue;
            profile.reuse_running = policy.already_running == Running::Reuse;
            profile.policy = Some(policy);
            profile.steps = draft
                .steps
                .iter()
                .map(|step| {
                    draft_step(
                        &draft.app_ids,
                        step.app.read(cx).state.selected,
                        seconds(&step.delay, cx),
                        &step.args.read(cx).value,
                    )
                })
                .collect::<Result<Vec<_>, String>>()?;
            profile.validate_editor(&self.discovered)?;
            Ok::<_, String>(profile)
        })();
        let profile = match result {
            Ok(profile) => profile,
            Err(error) => {
                self.report(Err(error), cx);
                return;
            }
        };
        if self.edit(move |doc| doc.save_profile(profile), cx) {
            self.profile_draft = None;
        }
    }

    const MAX_STEPS: usize = 128;
    /// Aviso al llegar al tope de pasos: antes se ignoraba sin informar.
    fn append_limit_message(steps: usize) -> Option<&'static str> {
        (steps >= Self::MAX_STEPS).then_some("Pasos: el perfil admite como máximo 128 pasos")
    }
    fn append_step(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self
            .profile_draft
            .as_ref()
            .is_none_or(|draft| draft.steps.len() >= Self::MAX_STEPS)
        {
            if let Some(message) = Self::append_limit_message(
                self.profile_draft
                    .as_ref()
                    .map_or(0, |draft| draft.steps.len()),
            ) {
                self.report(Err(message.into()), cx);
            }
            return;
        }
        let step = Self::make_step(
            &Step {
                app_id: String::new(),
                delay_seconds: 2,
                args_override: None,
            },
            &self.store.document.apps,
            window,
            cx,
        );
        if let Some(draft) = &mut self.profile_draft {
            draft.steps.push(step);
        }
        cx.notify();
    }

    pub(super) fn profile_form(&self, cx: &mut Context<Self>) -> gpui::Div {
        let Some(draft) = &self.profile_draft else {
            return div();
        };
        let advanced = draft.tabs.read(cx).state.selected == Some(1);
        div()
            .flex()
            .flex_col()
            .when_some(self.error.clone(), |form, error| {
                form.child(super::presentation::error_panel(error, cx))
            })
            .child(editor_field("Nombre", draft.name.clone(), cx))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .mt(px(12.0))
                    .child(
                        orbit::toggle(
                            "profile-favorite",
                            "Perfil favorito",
                            draft.profile.favorite,
                            true,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft {
                                draft.profile.favorite = !draft.profile.favorite;
                                cx.notify();
                            }
                        })),
                    )
                    .child(orbit::text(
                        "Perfil favorito",
                        13.0,
                        500,
                        orbit::ink(cx),
                        cx,
                    )),
            )
            .child(
                div()
                    .flex()
                    .gap(px(12.0))
                    .child(editor_field(
                        "Color",
                        orbit::pending_button(
                            "profile-color-soon",
                            "Próximamente",
                            "El perfil aún no guarda un color",
                            cx,
                        ),
                        cx,
                    ))
                    .child(editor_field(
                        "Circuito",
                        orbit::pending_button(
                            "profile-track-soon",
                            "Próximamente",
                            "El perfil aún no guarda un circuito",
                            cx,
                        ),
                        cx,
                    ))
                    .mt(px(14.0)),
            )
            .child(editor_field("Descripción", draft.description.clone(), cx).mt(px(14.0)))
            .when(advanced, |form| {
                form.child(editor_field("Notas", draft.notes.clone(), cx).mt(px(14.0)))
            })
            .child(self.profile_steps_section(draft, advanced, cx))
    }

    pub(super) fn editor_page(&self, cx: &mut Context<Self>) -> gpui::Div {
        let adapt = self.adapt;
        let (top, side, bottom) = adapt.padding();
        div()
            .size_full()
            .min_h_0()
            .flex()
            .flex_col()
            .px(px(side))
            .pt(px(top))
            .pb(px(bottom))
            .gap(px(adapt.gap()))
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(
                        orbit::neo_page_header(
                            "Editar perfil",
                            "Los cambios se aplican al guardar.",
                            self.adapt,
                            cx,
                        )
                        .flex_1(),
                    )
                    .child(form_button(
                        orbit::button("profile-page-cancel", "Cancelar", cx),
                        &self.form_actions[1],
                        Self::close_form,
                        cx,
                    ))
                    .child(form_button(
                        orbit::play_button("profile-page-save", "Guardar", 36.0, false, cx),
                        &self.form_actions[2],
                        Self::commit_form,
                        cx,
                    )),
            )
            .child(
                orbit::neo_card(cx).flex_1().min_h_0().child(
                    div()
                        .id("profile-page-fields")
                        .flex_1()
                        .min_h_0()
                        .overflow_y_scroll()
                        .child(self.profile_form(cx)),
                ),
            )
            .capture_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    this.close_form(window, cx);
                    cx.stop_propagation();
                }
            }))
    }

    fn profile_steps_section(
        &self,
        draft: &ProfileDraft,
        advanced: bool,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let tabs = draft.tabs.clone();
        let mut section = div()
            .mt(px(20.0))
            .pt(px(16.0))
            .flex()
            .flex_col()
            .gap(px(10.0))
            .border_t_1()
            .border_color(rgba(orbit::line(cx)))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(orbit::eyebrow("Pasos", cx))
                    .child(
                        div()
                            .id("launcher-editor-mode")
                            .role(gpui::Role::Button)
                            .aria_label(if advanced { "Básico" } else { "Avanzado" })
                            .track_focus(&tabs.read(cx).focus_handle().tab_stop(true))
                            .tab_index(0)
                            .tab_stop(true)
                            .rounded(px(4.0))
                            .border_1()
                            .border_color(gpui::transparent_black())
                            .px(px(6.0))
                            .py(px(3.0))
                            .focus_visible(|style| {
                                style.border_color(rgb(orbit::skin(cx).selection >> 8))
                            })
                            .cursor_pointer()
                            .child(tracked_text(
                                if advanced { "Básico" } else { "Avanzado" },
                                12.0,
                                600,
                                orbit::ink_3(cx),
                                0.0,
                            ))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                let Some(draft) = &mut this.profile_draft else {
                                    return;
                                };
                                draft.tabs.update(cx, |tabs, cx| {
                                    tabs.state.selected = Some(usize::from(!advanced));
                                    cx.notify();
                                });
                                cx.notify();
                            })),
                    ),
            );
        if !draft.steps.is_empty() {
            section = section.child(Self::profile_steps(draft, advanced, cx));
        }
        section.child(form_button(
            div()
                .id("append-step")
                .mt(px(0.0))
                .role(gpui::Role::Button)
                .aria_label("Añadir paso")
                .tab_index(0)
                .h(px(36.0))
                .px(px(12.0))
                .flex()
                .items_center()
                .justify_center()
                .self_start()
                .rounded(px(12.0))
                .border_1()
                .border_dashed()
                .border_color(rgba(orbit::line_strong(cx)))
                .text_size(px(12.0))
                .font_family(crate::orbit::sans_override("Inter W650", cx))
                .font_weight(gpui::FontWeight::NORMAL)
                .text_color(rgb(orbit::ink_2(cx)))
                .cursor_pointer()
                .child("+ Añadir paso"),
            &self.form_actions[0],
            Self::append_step,
            cx,
        ))
    }

    fn profile_steps(draft: &ProfileDraft, advanced: bool, cx: &Context<Self>) -> gpui::Div {
        let mut steps = div().flex().flex_col().gap(px(10.0));
        for (index, step) in draft.steps.iter().enumerate() {
            let mut row = div()
                .flex()
                .flex_wrap()
                .items_center()
                .gap(px(6.0))
                .child(step.app.clone())
                .child(if index == 0 {
                    draft.first_delay.clone()
                } else {
                    step.delay.clone()
                });
            if advanced {
                row = row.child(editor_field(
                    "Argumentos propios · JSON",
                    step.args.clone(),
                    cx,
                ));
            }
            row = row.child(Self::profile_step_actions(index, draft.steps.len(), cx));
            steps = steps.child(
                div()
                    .id(("edit-step", index))
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(text(
                        format!("PASO {}", index + 1),
                        10.0,
                        700,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(row),
            );
        }
        steps
    }

    fn profile_step_actions(index: usize, count: usize, cx: &Context<Self>) -> gpui::Div {
        div()
            .flex()
            .gap_2()
            .child(
                button("step-up", "↑ Subir", cx)
                    .when(index > 0, |button| {
                        button.on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft {
                                move_step(&mut draft.steps, index, -1);
                            }
                            cx.notify();
                        }))
                    })
                    .when(index == 0, |button| {
                        button.tab_stop(false).opacity(orbit::DISABLED)
                    }),
            )
            .child(
                button("step-down", "↓ Bajar", cx)
                    .when(index + 1 < count, |button| {
                        button.on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft {
                                move_step(&mut draft.steps, index, 1);
                            }
                            cx.notify();
                        }))
                    })
                    .when(index + 1 == count, |button| {
                        button.tab_stop(false).opacity(orbit::DISABLED)
                    }),
            )
            .child(button("remove-step", "Quitar", cx).on_click(cx.listener(
                move |this, _, _, cx| {
                    if let Some(draft) = &mut this.profile_draft
                        && index < draft.steps.len()
                    {
                        draft.steps.remove(index);
                    }
                    cx.notify();
                },
            )))
    }

    pub(super) fn profile_advanced_section(
        &self,
        draft: &ProfileDraft,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        div()
            .mt(px(18.0))
            .flex()
            .flex_col()
            .gap(px(12.0))
            .child(eyebrow("Opciones de lanzamiento", cx))
            .child(editor_field("Atajo global", draft.hotkey.clone(), cx))
            .child(editor_field(
                "Iniciar con Windows",
                draft.autostart.clone(),
             cx))
            .child(editor_field("Ante un fallo", draft.failure.clone(), cx))
            .child(editor_field("Aplicación ya abierta", draft.reuse.clone(), cx))
            .child(editor_field("Al cancelar", draft.cancel.clone(), cx))
            .child(editor_field("Al salir", draft.exit.clone(), cx))
            .child(editor_field("Reintentar", draft.retry_policy.clone(), cx))
            .child(orbit::setting_row(
                "Reintentos por paso",
                "De 0 a 3",
                draft.retries.clone(),
             cx))
            .child(orbit::callout(
                if vantare_ipc::launcher::read_status(&self.store.path).is_some() {
                    "El supervisor aplica estos ajustes al guardar. Los conflictos de atajo se muestran en Launcher."
                } else {
                    "Supervisor no disponible: los ajustes quedan guardados. Inicia la aplicación con vantare para activar los atajos y el inicio Windows."
                },
             cx))
            .when(
                self.store
                    .document
                    .profiles
                    .iter()
                    .any(|profile| profile.id == draft.profile.id),
                |advanced| advanced.child(self.profile_actions(&draft.profile, cx)),
            )
    }
}

fn policy_choice(
    label: &'static str,
    labels: &[&str],
    selected: usize,
    window: &mut Window,
    cx: &mut Context<Launcher>,
) -> Entity<Choice> {
    cx.new(|cx| {
        Choice::new(
            label,
            ChoiceKind::Dropdown,
            labels.iter().map(|label| OptionItem::new(*label)).collect(),
            Some(selected),
            window,
            cx,
        )
    })
}
fn close_index(policy: Close) -> usize {
    match policy {
        Close::Ask => 0,
        Close::Leave => 1,
        Close::Started => 2,
    }
}
fn selected_close(selected: Option<usize>) -> Close {
    match selected {
        Some(1) => Close::Leave,
        Some(2) => Close::Started,
        _ => Close::Ask,
    }
}

fn move_step<T>(steps: &mut [T], index: usize, delta: isize) {
    if let Some(target) = index.checked_add_signed(delta)
        && index < steps.len()
        && target < steps.len()
    {
        steps.swap(index, target);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn step_limit_reports_instead_of_silently_ignoring() {
        assert_eq!(Launcher::append_limit_message(0), None);
        assert_eq!(Launcher::append_limit_message(127), None);
        assert_eq!(
            Launcher::append_limit_message(128),
            Some("Pasos: el perfil admite como máximo 128 pasos")
        );
        assert_eq!(
            Launcher::append_limit_message(200),
            Some("Pasos: el perfil admite como máximo 128 pasos")
        );
    }
    #[test]
    fn ordering_preserves_steps_and_rejects_edges() {
        let mut steps = ["LMU", "OBS", "Spotify"];
        move_step(&mut steps, 0, -1);
        move_step(&mut steps, 2, 1);
        move_step(&mut steps, 9, -1);
        assert_eq!(steps, ["LMU", "OBS", "Spotify"]);
        move_step(&mut steps, 0, 1);
        move_step(&mut steps, 2, -1);
        assert_eq!(steps, ["OBS", "Spotify", "LMU"]);
        move_step::<u8>(&mut [], 0, 1);
    }
    #[test]
    fn arguments_keep_token_boundaries_and_reject_shell_text() {
        assert_eq!(
            parse_args(r#"["--name", "nombre con espacios", ""]"#).expect("JSON"),
            ["--name", "nombre con espacios", ""]
        );
        assert!(parse_args("--name foo").is_err());
        assert!(parse_args("[1]").is_err());
    }
    #[test]
    fn draft_requires_a_known_selection_and_preserves_argument_inheritance() {
        let ids = vec!["lmu".into(), "obs".into()];
        assert!(draft_step(&ids, None, 2, "").is_err());
        assert!(draft_step(&ids, Some(9), 2, "").is_err());
        let step = draft_step(&ids, Some(1), 7, "  ").expect("selección válida");
        assert_eq!(step.app_id, "obs");
        assert_eq!(step.delay_seconds, 7);
        assert!(step.args_override.is_none());
        assert_eq!(
            draft_step(&ids, Some(0), 0, "[]")
                .expect("override vacío explícito")
                .args_override,
            Some(vec![])
        );
        assert!(draft_step(&ids, Some(0), 0, "[1]").is_err());
    }
}
