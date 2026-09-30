//! Borrador local sobre controles Orbit; solo Guardar confirma en disco.
use super::*;
use crate::orbit::{Choice, ChoiceKind, NumberControl, NumberKind, NumberRange, OptionItem};

struct FormHost(WeakEntity<Launcher>);
impl Render for FormHost {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.0
            .update(cx, |launcher, cx| {
                if launcher.app_draft.is_some() {
                    launcher.app_form(cx)
                } else {
                    launcher.profile_form(cx)
                }
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

// NumberControl conserva enteros no negativos acotados a 3600 (o 3 reintentos).
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
    action: fn(&mut Launcher, &mut Window, &mut Context<Launcher>),
    cx: &Context<Launcher>,
) -> gpui::Stateful<gpui::Div> {
    button
        .track_focus(focus)
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
        if let Some(draft) = &self.app_draft {
            return vec![
                draft.name.read(cx).focus_handle(),
                draft.args.read(cx).focus_handle(),
                self.form_actions[0].clone(),
                self.form_actions[1].clone(),
                self.form_actions[2].clone(),
            ];
        }
        let Some(draft) = &self.profile_draft else {
            return vec![];
        };
        let mut targets = vec![
            draft.name.read(cx).focus_handle(),
            draft.tabs.read(cx).focus_handle(),
        ];
        for (index, step) in draft.steps.iter().enumerate() {
            targets.push(step.app.read(cx).focus_handle());
            targets.push(if index == 0 {
                draft.first_delay.read(cx).focus_handle()
            } else {
                step.delay.read(cx).focus_handle()
            });
            if draft.tabs.read(cx).state.selected == Some(1) {
                targets.push(step.args.read(cx).focus_handle());
            }
        }
        targets.extend([
            draft.failure.read(cx).focus_handle(),
            draft.reuse.read(cx).focus_handle(),
            draft.retries.read(cx).focus_handle(),
            self.form_actions[0].clone(),
            self.form_actions[1].clone(),
            self.form_actions[2].clone(),
        ]);
        targets
    }

    pub(super) fn open_form(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let launcher = cx.entity();
        let host = cx.new(|cx| {
            cx.observe(&launcher, |_, _, cx| cx.notify()).detach();
            FormHost(launcher.downgrade())
        });
        let targets = self.form_targets(cx);
        let layer = cx.new(|cx| {
            orbit::Layer::new(
                "Editar Launcher",
                orbit::LayerKind::Modal,
                host.into(),
                targets,
                window,
                cx,
            )
        });
        cx.subscribe(&layer, |this, _, _: &orbit::Dismissed, cx| {
            this.app_draft = None;
            this.profile_draft = None;
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
        cx.notify();
    }

    fn make_step(
        step: &Step,
        apps: &[App],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> StepDraft {
        StepDraft {
            app: cx.new(|cx| {
                Choice::new(
                    "Aplicación del paso",
                    ChoiceKind::Dropdown,
                    apps.iter().map(|app| OptionItem::new(&app.name)).collect(),
                    apps.iter().position(|app| app.id == step.app_id),
                    window,
                    cx,
                )
            }),
            delay: number(step.delay_seconds, 3600, "Espera del paso (s)", cx),
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
                Some(0),
                window,
                cx,
            )
        });
        cx.subscribe(&tabs, |_, _, _: &orbit::ChoiceChanged, cx| cx.notify())
            .detach();
        let description = input(
            "pendiente".into(),
            "Descripción · pendiente de contrato nativo",
            cx,
        );
        description.update(cx, |field, cx| field.set_enabled(false, cx));
        let notes = cx.new(|cx| {
            Input::multiline(
                "pendiente".into(),
                "Notas · pendiente de contrato nativo",
                cx,
            )
        });
        notes.update(cx, |field, cx| field.set_enabled(false, cx));
        self.profile_draft = Some(ProfileDraft {
            name: input(profile.name.clone(), "Nombre de perfil", cx),
            description,
            notes,
            first_delay: number(profile.first_step_delay, 3600, "Espera inicial (s)", cx),
            retries: number(u32::from(profile.max_retries), 3, "Reintentos por paso", cx),
            failure: cx.new(|cx| {
                orbit::Checkbox::new("Continuar ante un fallo", profile.continue_on_error, cx)
            }),
            reuse: cx.new(|cx| {
                orbit::Checkbox::new(
                    "Reutilizar aplicaciones abiertas",
                    profile.reuse_running,
                    cx,
                )
            }),
            tabs,
            app_ids: apps.iter().map(|app| app.id.clone()).collect(),
            profile,
            steps,
        });
        self.app_draft = None;
        self.open_form(window, cx);
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
        let mut profile = source.unwrap_or_else(|| Profile::new(id.clone(), "Nuevo perfil".into()));
        profile.id = id;
        self.profile_editor(profile, window, cx);
    }

    fn save_profile(&mut self, cx: &mut Context<Self>) {
        let Some(draft) = &self.profile_draft else {
            return;
        };
        let result = (|| {
            let mut profile = draft.profile.clone();
            profile.name = draft.name.read(cx).value.trim().into();
            profile.first_step_delay = seconds(&draft.first_delay, cx);
            profile.max_retries = u8::try_from(seconds(&draft.retries, cx))
                .map_err(|error| format!("reintentos inválidos: {error}"))?;
            profile.continue_on_error = draft.failure.read(cx).checked;
            profile.reuse_running = draft.reuse.read(cx).checked;
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
            move |doc| {
                if let Some(current) = doc.profiles.iter_mut().find(|p| p.id == profile.id) {
                    *current = profile;
                } else {
                    doc.profiles.push(profile);
                }
                Ok(())
            },
            cx,
        ) {
            self.profile_draft = None;
        }
    }

    fn append_step(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self
            .profile_draft
            .as_ref()
            .is_none_or(|draft| draft.steps.len() >= 128)
        {
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

    fn profile_form(&self, cx: &mut Context<Self>) -> gpui::Div {
        let Some(draft) = &self.profile_draft else {
            return div();
        };
        let advanced = draft.tabs.read(cx).state.selected == Some(1);
        let mut steps = orbit::card_body().child(draft.tabs.clone());
        for (index, step) in draft.steps.iter().enumerate() {
            let mut row = orbit::card_body()
                .child(orbit::setting_row(
                    &format!("Paso {}", index + 1),
                    "Aplicación y espera en segundos",
                    step.app.clone(),
                ))
                .child(if index == 0 {
                    draft.first_delay.clone()
                } else {
                    step.delay.clone()
                });
            if advanced {
                row = row.child(orbit::setting_row(
                    "Argumentos propios",
                    "JSON; vacío hereda los de la app",
                    step.args.clone(),
                ));
            }
            row = row.child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        button("step-up", "↑ Subir")
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
                        button("step-down", "↓ Bajar")
                            .when(index + 1 < draft.steps.len(), |button| {
                                button.on_click(cx.listener(move |this, _, _, cx| {
                                    if let Some(draft) = &mut this.profile_draft {
                                        move_step(&mut draft.steps, index, 1);
                                    }
                                    cx.notify();
                                }))
                            })
                            .when(index + 1 == draft.steps.len(), |button| {
                                button.tab_stop(false).opacity(orbit::DISABLED)
                            }),
                    )
                    .child(button("remove-step", "Quitar").on_click(cx.listener(
                        move |this, _, _, cx| {
                            if let Some(draft) = &mut this.profile_draft
                                && index < draft.steps.len()
                            {
                                draft.steps.remove(index);
                            }
                            cx.notify();
                        },
                    ))),
            );
            steps = steps.child(orbit::card("").id(("edit-step", index)).child(row));
        }
        orbit::card("Editar perfil").child(orbit::card_body()
            .when_some(self.error.clone(), |body, error| body.child(orbit::callout(error)))
            .child(orbit::eyebrow("Nombre")).child(draft.name.clone())
            .child(orbit::eyebrow("Descripción")).child(draft.description.clone())
            .child(orbit::eyebrow("Notas")).child(draft.notes.clone())
            .child(orbit::eyebrow("Pasos")).child(steps)
            .child(form_button(button("append-step", "+ Añadir paso"), &self.form_actions[0], Self::append_step, cx))
            .child(orbit::setting_row("Atajo global", "Lanza este perfil desde cualquier sitio", orbit::chip("pendiente", orbit::Tone::Neutral)))
            .child(orbit::setting_row("Iniciar con Windows", "pendiente: sin contrato nativo", orbit::toggle("windows-start", "Iniciar con Windows", false, false)))
            .child(draft.failure.clone()).child(draft.reuse.clone())
            .child(orbit::setting_row("Reintentos por paso", "De 0 a 3", draft.retries.clone()))
            .child(orbit::callout("Al cancelar o salir, las aplicaciones lanzadas permanecen abiertas. Políticas preguntar/reiniciar/cerrar: pendiente."))
            .child(div().flex().justify_end().gap_2()
                .child(form_button(button("discard-profile", "Cancelar"), &self.form_actions[1], Self::close_form, cx))
                .child(form_button(button("save-profile", "Guardar"), &self.form_actions[2], Self::commit_form, cx))))
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
