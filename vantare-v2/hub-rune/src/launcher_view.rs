use crate::{
    State,
    catalog::text,
    design::{Theme, button, caption, display, label, surface},
};
use rune::{El, col, row};
use vantare_hub_host::{
    launcher::{apps::AppDraft, editor::*},
    launcher_resident::{ResidentAction, ResidentResults, ResidentRetryScope, ResidentStepState},
    protocol::Request,
};

pub fn action(state: &State, key: &str, name: &str, request: Option<Request>) -> El {
    let disabled = request.as_ref().is_none_or(|r| {
        state.launcher.action_busy(r)
            || !state
                .launcher
                .allowed(r, &state.core, state.home.launching())
    });
    button(&state.theme, key, name, move |s: &mut State| {
        if let Some(request) = &request {
            s.launcher
                .queue(request.clone(), &s.core, s.home.launching());
        }
    })
    .disabled(disabled)
}
fn field(
    theme: &Theme,
    key: &str,
    title: &str,
    value: &rune::TextEdit,
    edit: fn(&mut State) -> &mut rune::TextEdit,
    disabled: bool,
) -> El {
    let input = rune::text_input(value, crate::design::body_style(14.0, 400.0))
        .key(key)
        .label(title)
        .w_full()
        .min_h(36.0)
        .disabled(disabled)
        .on_edit(edit);
    let input = if matches!(
        key,
        "launcher-profile-description" | "launcher-profile-notes"
    ) {
        input.h(80.0)
    } else {
        input.single_line()
    };
    col()
        .gap(4.0)
        .w_full()
        .child(caption(theme, title))
        .child(input)
}
fn backdrop(theme: &Theme, key: &str, dialog: El) -> El {
    row()
        .key(key)
        .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
        .center()
        .raise()
        .fill(theme.color("bg-base").alpha(0.65))
        .child(dialog)
}
pub fn view(state: &State) -> El {
    let t = &state.theme;
    let m = &state.launcher;
    let mut page = col()
        .key("launcher")
        .grow(1.0)
        .min_h(0.0)
        .padding(20.0)
        .gap(12.0);
    let mut tabs = row()
        .gap(8.0)
        .child(
            button(
                t,
                "launcher-profiles-tab",
                text("launcher.profilesTab"),
                |s: &mut State| s.launcher.applications = false,
            )
            .disabled(m.profile.is_some() || m.app.is_some()),
        )
        .child(
            button(
                t,
                "launcher-apps-tab",
                text("launcher.applications"),
                |s: &mut State| {
                    s.launcher.applications = true;
                    s.launcher.reload();
                },
            )
            .disabled(m.profile.is_some() || m.app.is_some()),
        )
        .child(button(
            t,
            "launcher-reload",
            text("launcher.reload"),
            |s: &mut State| s.launcher.reload(),
        ));
    if m.busy() {
        tabs = tabs.child(label(t, text("launcher.loading")).role("status"));
    }
    page = page.child(tabs);
    if let Some(problem) = m.problem {
        page = page.child(
            surface(t)
                .role("status")
                .child(label(t, text(problem)).w_full().wrap()),
        );
    }
    if let Some(notice) = m.orders.notice() {
        page = page.child(label(t, text(notice)).role("status").w_full().wrap());
    }
    page = page.child(resident(state));
    let Some(v) = &m.value else {
        return page.child(label(t, text("launcher.loading")).role("status"));
    };
    if v.protected {
        page = page.child(label(t, text("launcher.protected")).role("status"));
    }
    if m.profile.is_some() {
        return page.child(profile_editor(state));
    }
    if m.app.is_some() {
        return page.child(app_editor(state));
    }
    if m.applications {
        return page.child(applications(state));
    }
    let mut profiles = col()
        .grow(1.0)
        .min_w(0.0)
        .gap(12.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        });
    profiles = profiles.child(
        row()
            .gap(8.0)
            .child(display(t, text("launcher.yourProfiles"), 26.0).grow(1.0))
            .child(action(
                state,
                "launcher-new-profile",
                text("launcher.newProfile"),
                Some(Request::LauncherProfileGet { id: None }),
            )),
    );
    if let Some(p) = m.selected() {
        let mut hero = surface(t)
            .key("launcher-selected")
            .gap(10.0)
            .child(caption(
                t,
                text(if p.favorite {
                    "launcher.favoriteHeading"
                } else {
                    "launcher.selectedHeading"
                }),
            ))
            .child(display(t, &p.name, 32.0))
            .child(
                label(
                    t,
                    if p.description.is_empty() {
                        text("launcher.defaultDescription")
                    } else {
                        &p.description
                    },
                )
                .w_full()
                .wrap(),
            );
        for (index, id) in p.apps.iter().enumerate() {
            let app = v.apps.iter().find(|a| &a.id == id);
            hero = hero.child(
                row()
                    .gap(8.0)
                    .child(
                        label(
                            t,
                            format!("{} · {}", index + 1, app.map_or(id.as_str(), |a| &a.name)),
                        )
                        .grow(1.0),
                    )
                    .child(caption(
                        t,
                        text(if app.is_some_and(|a| a.available) {
                            "launcher.available"
                        } else {
                            "launcher.unavailable"
                        }),
                    )),
            );
        }
        hero = hero.child(
            row()
                .gap(8.0)
                .child(action(
                    state,
                    "launcher-launch",
                    text("launcher.launch"),
                    m.orders.launch(&p.id, v, &state.core),
                ))
                .child(action(
                    state,
                    "launcher-rehearse",
                    text("launcher.rehearse"),
                    m.orders.rehearse(&p.id, v, &state.core),
                ))
                .child(action(
                    state,
                    "launcher-edit",
                    text("launcher.edit"),
                    Some(Request::LauncherProfileGet {
                        id: Some(p.id.clone()),
                    }),
                )),
        );
        profiles = profiles.child(hero);
    }
    for p in &v.profiles {
        let id = p.id.clone();
        profiles = profiles.child(
            surface(t)
                .key(format!("launcher-card-{}", p.id))
                .child(button(
                    t,
                    &format!("launcher-select-{}", p.id),
                    &p.name,
                    move |s: &mut State| s.launcher.selected = id.clone(),
                ))
                .child(
                    row()
                        .gap(8.0)
                        .child(action(
                            state,
                            &format!("launcher-favorite-{}", p.id),
                            text(if p.favorite {
                                "action.unfavorite"
                            } else {
                                "action.favorite"
                            }),
                            Some(Request::LauncherProfileFavorite {
                                id: p.id.clone(),
                                favorite: !p.favorite,
                                base_revision: v.revision.clone(),
                            }),
                        ))
                        .child(action(
                            state,
                            &format!("launcher-duplicate-{}", p.id),
                            text("action.duplicate"),
                            Some(Request::LauncherProfileDuplicate {
                                id: p.id.clone(),
                                base_revision: v.revision.clone(),
                            }),
                        ))
                        .child(action(
                            state,
                            &format!("launcher-trigger-{}", p.id),
                            text(if v.lmu_trigger.as_deref() == Some(&p.id) {
                                "action.triggered"
                            } else {
                                "action.trigger"
                            }),
                            Some(Request::LauncherTrigger {
                                id: if v.lmu_trigger.as_deref() == Some(&p.id) {
                                    None
                                } else {
                                    Some(p.id.clone())
                                },
                                base_revision: v.revision.clone(),
                            }),
                        )),
                ),
        );
    }
    if v.profiles.is_empty() {
        profiles = profiles.child(label(t, text("launcher.empty")).w_full().wrap());
    }
    let rail = surface(t)
        .w(280.0)
        .min_h(0.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .gap(10.0)
        .child(caption(t, text("launcher.yourApps")))
        .children(v.apps.iter().map(|a| {
            row()
                .gap(6.0)
                .child(label(t, &a.name).grow(1.0))
                .child(caption(
                    t,
                    text(if a.available {
                        "launcher.available"
                    } else {
                        "launcher.unavailable"
                    }),
                ))
        }));
    page.child(
        row()
            .grow(1.0)
            .min_h(0.0)
            .gap(16.0)
            .child(profiles)
            .child(rail.child(quick_options(state))),
    )
}
fn quick_options(state: &State) -> El {
    use vantare_hub_host::launcher::actions::{FIRST_STEP_DELAYS, ProfileOption};
    let t = &state.theme;
    let m = &state.launcher;
    let Some(v) = &m.value else {
        return col();
    };
    let Some(p) = m.selected() else {
        return col();
    };
    let mut out = col()
        .gap(8.0)
        .child(caption(t, text("launcher.nextOptions")));
    if v.running {
        out = out.child(
            label(t, text("launcher.runningOptionsReadOnly"))
                .w_full()
                .wrap(),
        );
    }
    let groups = [
        (
            "running",
            "launcher.alreadyRunning",
            vec![
                (
                    ProfileOption::AlreadyRunning(ProfileRunning::Ask),
                    text("launcher.ask").to_string(),
                ),
                (
                    ProfileOption::AlreadyRunning(ProfileRunning::Reuse),
                    text("launcher.reuse").to_string(),
                ),
                (
                    ProfileOption::AlreadyRunning(ProfileRunning::Restart),
                    text("launcher.restart").to_string(),
                ),
            ],
        ),
        (
            "failure",
            "launcher.failure",
            vec![
                (
                    ProfileOption::Failure(ProfileFailure::Ask),
                    text("launcher.ask").to_string(),
                ),
                (
                    ProfileOption::Failure(ProfileFailure::Stop),
                    text("launcher.stop").to_string(),
                ),
                (
                    ProfileOption::Failure(ProfileFailure::Continue),
                    text("launcher.keepGoing").to_string(),
                ),
            ],
        ),
        (
            "delay",
            "launcher.firstDelay",
            FIRST_STEP_DELAYS
                .into_iter()
                .map(|value| (ProfileOption::FirstStepDelay(value), value.to_string()))
                .collect(),
        ),
        (
            "retries",
            "launcher.retries",
            (0..=RETRIES_MAX)
                .map(|value| (ProfileOption::Retries(value), value.to_string()))
                .collect(),
        ),
        (
            "startup",
            "launcher.startup",
            vec![(
                ProfileOption::Startup(!p.options.startup),
                text(if p.options.startup {
                    "launcher.enabled"
                } else {
                    "launcher.disabled"
                })
                .to_string(),
            )],
        ),
        (
            "exit",
            "action.closeOnExit",
            vec![(
                ProfileOption::CloseOnExit(!p.options.close_on_exit),
                text(if p.options.close_on_exit {
                    "launcher.enabled"
                } else {
                    "launcher.disabled"
                })
                .to_string(),
            )],
        ),
    ];
    for (key, title, choices) in groups {
        out = out.child(caption(t, text(title)));
        for (index, (patch, name)) in choices.into_iter().enumerate() {
            out = out.child(action(
                state,
                &format!("launcher-option-{key}-{index}"),
                &name,
                Some(Request::LauncherProfileOption {
                    id: p.id.clone(),
                    patch,
                    base_revision: v.revision.clone(),
                }),
            ));
        }
    }
    out
}
fn resident(state: &State) -> El {
    let m = &state.launcher;
    let t = &state.theme;
    let Some(v) = &m.orders.view else {
        return label(t, text("control.unavailable")).role("status");
    };
    let mut panel = col().gap(8.0).key("launcher-resident");
    if v.running {
        panel = panel.child(
            row()
                .gap(8.0)
                .child(label(t, text("launcher.running")).grow(1.0))
                .child(action(
                    state,
                    "launcher-cancel-run",
                    text("control.cancelAction"),
                    m.orders.cancel(&state.core),
                )),
        );
    }
    if let Some(question) = &v.decision {
        let key = match question.kind {
            vantare_hub_host::launcher_resident::ResidentQuestionKind::Authorization => {
                "authorization"
            }
            vantare_hub_host::launcher_resident::ResidentQuestionKind::AlreadyRunning => {
                "alreadyRunning"
            }
            vantare_hub_host::launcher_resident::ResidentQuestionKind::Failure => "failure",
            vantare_hub_host::launcher_resident::ResidentQuestionKind::Closing => "closing",
            vantare_hub_host::launcher_resident::ResidentQuestionKind::Generic => "generic",
        };
        let mut choices = row().gap(8.0);
        for (index, choice) in question.actions.iter().enumerate() {
            choices = choices.child(action(
                state,
                &format!("launcher-answer-{index}"),
                &choice.label,
                m.orders.answer(choice.id, &state.core),
            ));
        }
        panel = panel.child(
            surface(t)
                .role("region")
                .label(text("resident.title"))
                .child(
                    label(t, text(&format!("resident.question.{key}")))
                        .w_full()
                        .wrap(),
                )
                .child(choices),
        );
        if question
            .actions
            .iter()
            .any(|a| a.id == ResidentAction::Trust)
        {
            panel = panel.child(label(t, text("resident.trustUnavailable")).w_full().wrap());
        }
    }
    let mut results = surface(t)
        .key("launcher-results")
        .role("region")
        .label(text("results.title"))
        .child(label(t, text("results.title")));
    match v.execution.as_ref().map(|e| &e.results) {
        Some(ResidentResults::Known { value }) => {
            let profile = m
                .value
                .as_ref()
                .filter(|d| d.revision == value.revision && !d.protected)
                .and_then(|d| d.profiles.iter().find(|p| p.id == value.profile));
            let mode = match value.mode {
                vantare_hub_host::launcher_resident::ResidentRunMode::Profile => "results.profile",
                vantare_hub_host::launcher_resident::ResidentRunMode::Rehearsal => {
                    "results.rehearsal"
                }
            };
            let outcome = match &value.outcome {
                None => "results.running",
                Some(vantare_hub_host::launcher_resident::ResidentOutcome::Completed) => {
                    "results.completed"
                }
                Some(vantare_hub_host::launcher_resident::ResidentOutcome::Cancelled {
                    ..
                }) => "results.cancelled",
                Some(vantare_hub_host::launcher_resident::ResidentOutcome::Failed { .. }) => {
                    "results.failed"
                }
            };
            results = results
                .child(
                    label(
                        t,
                        format!(
                            "{} · {} · {}",
                            value.run,
                            profile.map_or(value.profile.as_str(), |p| p.name.as_str()),
                            text(mode)
                        ),
                    )
                    .w_full()
                    .wrap(),
                )
                .child(label(t, text(outcome)).w_full().wrap());
            if profile.is_none() {
                results = results.child(
                    label(t, text("results.stale"))
                        .key("launcher-results-stale")
                        .w_full()
                        .wrap(),
                );
            }
            for step in &value.steps {
                let key = match step.state {
                    ResidentStepState::NotSelected => "not-selected",
                    ResidentStepState::Pending => "pending",
                    ResidentStepState::Waiting => "waiting",
                    ResidentStepState::Launching => "launching",
                    ResidentStepState::Ready => "ready",
                    ResidentStepState::Failed => "failed",
                    ResidentStepState::Cancelled => "cancelled",
                    ResidentStepState::NotRun => "not-run",
                };
                let name = text(&format!("results.states.{key}"));
                results = results.child(caption(
                    t,
                    &format!("{} · {name}", u32::from(step.index) + 1),
                ));
            }
        }
        Some(ResidentResults::Unsupported) => {
            results = results.child(
                label(t, text("results.unsupported"))
                    .key("launcher-results-unsupported")
                    .w_full()
                    .wrap(),
            )
        }
        _ => {
            results = results.child(
                label(t, text("results.unknown"))
                    .key("launcher-results-unknown")
                    .w_full()
                    .wrap(),
            )
        }
    }
    for (scope, key, name, help) in [
        (
            ResidentRetryScope::Failed,
            "launcher-retry-failed",
            "control.retryFailed",
            "results.failedSteps",
        ),
        (
            ResidentRetryScope::All,
            "launcher-retry-all",
            "control.retryAll",
            "results.sameSteps",
        ),
    ] {
        let reason = m.value.as_ref().map_or(Some("control.unavailable"), |doc| {
            m.orders.retry_reason(scope, doc, &state.core)
        });
        let request = m
            .value
            .as_ref()
            .and_then(|doc| m.orders.retry(scope, doc, &state.core));
        let explanation = reason
            .or_else(|| (m.busy() || state.home.launching()).then_some("control.busy"))
            .unwrap_or(help);
        results = results
            .child(action(state, key, text(name), request))
            .child(
                label(t, text(explanation))
                    .key(format!("{key}-help"))
                    .w_full()
                    .wrap(),
            );
    }
    panel = panel.child(results);
    panel
}
fn profile_editor(state: &State) -> El {
    let m = &state.launcher;
    let t = &state.theme;
    let Some(edit) = &m.profile else {
        return col();
    };
    let disabled = m.busy()
        || m.value
            .as_ref()
            .is_none_or(|v| v.protected || v.running || v.revision != edit.source.revision)
        || !state.core.access.verified
        || state.core.access.blocked;
    let draft = &edit.source.draft;
    let mut page = col()
        .key("launcher-profile-editor")
        .grow(1.0)
        .min_h(0.0)
        .gap(12.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(display(t, text("profile.title"), 26.0))
        .child(field(
            t,
            "launcher-profile-name",
            text("profile.name"),
            &m.fields.name,
            |s| &mut s.launcher.fields.name,
            disabled,
        ))
        .child(field(
            t,
            "launcher-profile-description",
            text("profile.description"),
            &m.fields.description,
            |s| &mut s.launcher.fields.description,
            disabled,
        ))
        .child(field(
            t,
            "launcher-profile-notes",
            text("profile.notes"),
            &m.fields.notes,
            |s| &mut s.launcher.fields.notes,
            disabled,
        ))
        .child(field(
            t,
            "launcher-profile-hotkey",
            text("profile.hotkey"),
            &m.fields.hotkey,
            |s| &mut s.launcher.fields.hotkey,
            disabled,
        ));
    if m.value
        .as_ref()
        .is_some_and(|v| v.revision != edit.source.revision)
    {
        page = page.child(label(t, text("profile.conflict")).role("status"));
    }
    for (index, step) in draft.steps.iter().enumerate() {
        let name = m
            .value
            .as_ref()
            .and_then(|v| v.apps.iter().find(|a| a.id == step.app_id))
            .map_or(step.app_id.as_str(), |a| &a.name);
        let mut controls = row().gap(8.0).child(
            label(
                t,
                format!("{} · {name} · {} s", index + 1, step.delay_seconds),
            )
            .grow(1.0),
        );
        for (id, name, delta) in [("less", "−", -1i32), ("more", "+", 1)] {
            controls = controls.child(
                button(
                    t,
                    &format!("launcher-step-{index}-{id}"),
                    &format!("{} {name}", text("profile.stepDelay")),
                    move |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile
                            && let Some(step) = e.source.draft.steps.get_mut(index)
                        {
                            step.delay_seconds = if delta < 0 {
                                step.delay_seconds.saturating_sub(1)
                            } else {
                                step.delay_seconds.saturating_add(1)
                            };
                        }
                    },
                )
                .disabled(disabled),
            );
        }
        controls = controls
            .child(
                button(
                    t,
                    &format!("launcher-step-{index}-up"),
                    text("profile.up"),
                    move |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile
                            && index > 0
                            && index < e.source.draft.steps.len()
                        {
                            e.source.draft.steps.swap(index, index - 1);
                        }
                    },
                )
                .disabled(disabled || index == 0),
            )
            .child(
                button(
                    t,
                    &format!("launcher-step-{index}-down"),
                    text("profile.down"),
                    move |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile
                            && index + 1 < e.source.draft.steps.len()
                        {
                            e.source.draft.steps.swap(index, index + 1);
                        }
                    },
                )
                .disabled(disabled || index + 1 == draft.steps.len()),
            )
            .child(
                button(
                    t,
                    &format!("launcher-step-{index}-remove"),
                    text("profile.remove"),
                    move |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile
                            && index < e.source.draft.steps.len()
                        {
                            e.source.draft.steps.remove(index);
                        }
                    },
                )
                .disabled(disabled),
            );
        page = page.child(controls);
        if step.has_custom_arguments {
            page = page.child(label(t, text("profile.customArguments")));
        }
    }
    if let Some(v) = &m.value {
        let mut add = row().gap(8.0).child(caption(t, text("profile.addStep")));
        for app in &v.apps {
            let id = app.id.clone();
            add = add.child(
                button(
                    t,
                    &format!("launcher-step-add-{}", app.id),
                    &app.name,
                    move |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile
                            && e.source.draft.steps.len() < STEPS_MAX
                        {
                            e.source.draft.steps.push(ProfileStep {
                                key: None,
                                app_id: id.clone(),
                                delay_seconds: 0,
                                has_custom_arguments: false,
                            });
                        }
                    },
                )
                .disabled(disabled || draft.steps.len() >= STEPS_MAX),
            );
        }
        page = page.child(add);
    }
    page = page.child(
        row()
            .gap(8.0)
            .child(caption(t, text("profile.mode")))
            .child(
                button(
                    t,
                    "launcher-profile-basic",
                    text("profile.basic"),
                    |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile {
                            e.source.draft.advanced = false;
                        }
                    },
                )
                .disabled(disabled),
            )
            .child(
                button(
                    t,
                    "launcher-profile-advanced",
                    text("profile.advanced"),
                    |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile {
                            e.source.draft.advanced = true;
                        }
                    },
                )
                .disabled(disabled),
            ),
    );
    if draft.advanced {
        page = page.child(profile_policy(state, disabled));
    }
    if edit.loses_arguments() {
        page = page.child(
            button(
                t,
                "launcher-profile-confirm-arguments",
                text("profile.confirmArgumentLoss"),
                |s: &mut State| {
                    if let Some(e) = &mut s.launcher.profile {
                        e.confirm_arguments = !e.confirm_arguments;
                    }
                },
            )
            .fill(t.color(if edit.confirm_arguments {
                "active"
            } else {
                "surface-1"
            }))
            .disabled(disabled),
        );
    }
    page = page.child(
        row()
            .gap(8.0)
            .child(action(
                state,
                "launcher-profile-save",
                text("profile.save"),
                Some(Request::LauncherProfileSave {
                    draft: m.fields.draft(draft),
                    base_revision: edit.source.revision.clone(),
                }),
            ))
            .child(
                button(
                    t,
                    "launcher-profile-cancel",
                    text("profile.cancel"),
                    |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile {
                            e.discard = true;
                        }
                    },
                )
                .disabled(m.busy()),
            ),
    );
    if edit.discard {
        page = page.child(backdrop(
            t,
            "launcher-profile-discard-backdrop",
            surface(t)
                .w(440.0)
                .role("dialog")
                .label(text("profile.discardTitle"))
                .modal(true, |s: &mut State| {
                    if let Some(e) = &mut s.launcher.profile {
                        e.discard = false;
                    }
                })
                .child(label(t, text("profile.discardMessage")))
                .child(
                    button(
                        t,
                        "launcher-profile-keep",
                        text("profile.keepEditing"),
                        |s: &mut State| {
                            if let Some(e) = &mut s.launcher.profile {
                                e.discard = false;
                            }
                        },
                    )
                    .autofocus(),
                )
                .child(button(
                    t,
                    "launcher-profile-discard",
                    text("profile.confirmDiscard"),
                    |s: &mut State| s.launcher.profile = None,
                )),
        ));
    }
    page
}
fn profile_policy(state: &State, disabled: bool) -> El {
    let t = &state.theme;
    let Some(e) = &state.launcher.profile else {
        return col();
    };
    let p = &e.source.draft.policy;
    let mut out = col().gap(8.0).child(caption(t, text("profile.behavior")));
    for (field, title, values) in [
        (
            "alreadyRunning",
            "profile.running",
            vec![
                ("ask", "profile.ask"),
                ("reuse", "profile.reuse"),
                ("restart", "profile.restart"),
            ],
        ),
        (
            "failure",
            "profile.failure",
            vec![
                ("ask", "profile.ask"),
                ("stop", "profile.stop"),
                ("continue", "profile.keepGoing"),
            ],
        ),
        (
            "cancel",
            "profile.cancelPolicy",
            vec![
                ("ask", "profile.ask"),
                ("leave", "profile.leave"),
                ("closeStarted", "profile.closeStarted"),
            ],
        ),
        (
            "exit",
            "profile.exitPolicy",
            vec![
                ("ask", "profile.ask"),
                ("leave", "profile.leave"),
                ("closeStarted", "profile.closeStarted"),
            ],
        ),
        (
            "retry",
            "profile.retryPolicy",
            vec![
                ("ask", "profile.ask"),
                ("failed", "profile.failedSteps"),
                ("all", "profile.wholeChain"),
            ],
        ),
    ] {
        let mut choices = row().gap(6.0).child(caption(t, text(title)));
        for (value, key) in values {
            let Ok(mut json) = serde_json::to_value(p) else {
                continue;
            };
            json[field] = value.into();
            let Ok(_) = serde_json::from_value::<ProfilePolicy>(json) else {
                continue;
            };
            choices = choices.child(
                button(
                    t,
                    &format!("launcher-policy-{field}-{value}"),
                    text(key),
                    move |s: &mut State| {
                        if let Some(e) = &mut s.launcher.profile
                            && let Ok(mut json) = serde_json::to_value(&e.source.draft.policy)
                        {
                            json[field] = value.into();
                            if let Ok(next) = serde_json::from_value::<ProfilePolicy>(json) {
                                e.source.draft.policy = next;
                            }
                        }
                    },
                )
                .disabled(disabled),
            );
        }
        out = out.child(choices);
    }
    let mut retries = row().gap(8.0).child(caption(t, text("profile.retries")));
    for value in 0..=RETRIES_MAX {
        retries = retries.child(
            button(
                t,
                &format!("launcher-retries-{value}"),
                &value.to_string(),
                move |s: &mut State| {
                    if let Some(e) = &mut s.launcher.profile {
                        e.source.draft.policy.retries = value;
                    }
                },
            )
            .fill(t.color(if p.retries == value {
                "active"
            } else {
                "surface-1"
            }))
            .disabled(disabled),
        );
    }
    out = out.child(retries);
    for (key, title) in [
        ("favorite", "profile.favorite"),
        ("startup", "profile.startup"),
    ] {
        out = out.child(
            button(
                t,
                &format!("launcher-profile-{key}"),
                text(title),
                move |s: &mut State| {
                    if let Some(e) = &mut s.launcher.profile {
                        if key == "favorite" {
                            e.source.draft.favorite = !e.source.draft.favorite;
                        } else {
                            e.source.draft.startup = !e.source.draft.startup;
                        }
                    }
                },
            )
            .disabled(disabled),
        );
    }
    out
}
fn applications(state: &State) -> El {
    let t = &state.theme;
    let m = &state.launcher;
    let mut page = col()
        .grow(1.0)
        .min_h(0.0)
        .gap(10.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(
            row()
                .gap(8.0)
                .child(action(
                    state,
                    "launcher-scan",
                    text("app.detect"),
                    Some(Request::LauncherScan {}),
                ))
                .child(action(
                    state,
                    "launcher-app-new",
                    text("app.add"),
                    Some(Request::LauncherAppGet { id: None }),
                )),
        )
        .child(field(
            t,
            "launcher-app-search",
            text("app.search"),
            &m.search,
            |s| &mut s.launcher.search,
            false,
        ));
    let Some(catalog) = &m.catalog else {
        return page.child(label(t, text("launcher.loading")));
    };
    let query = m.search.text.to_lowercase();
    let mut found = false;
    for app in catalog.apps.iter().filter(|a| {
        format!("{} {}", a.name, a.category)
            .to_lowercase()
            .contains(&query)
    }) {
        found = true;
        let mut card = surface(t)
            .key(format!("launcher-app-{}", app.id))
            .child(display(t, &app.name, 22.0))
            .child(label(t, &app.category));
        card = card.child(
            row()
                .gap(8.0)
                .child(action(
                    state,
                    &format!("launcher-app-edit-{}", app.id),
                    text("profile.title"),
                    Some(Request::LauncherAppGet {
                        id: Some(app.id.clone()),
                    }),
                ))
                .child(action(
                    state,
                    &format!("launcher-app-favorite-{}", app.id),
                    text(if app.favorite {
                        "action.unfavorite"
                    } else {
                        "action.favorite"
                    }),
                    Some(Request::LauncherAppFavorite {
                        id: app.id.clone(),
                        favorite: !app.favorite,
                        base_revision: catalog.revision.clone(),
                    }),
                )),
        );
        if app.removable {
            let id = app.id.clone();
            card = card.child(
                button(
                    t,
                    &format!("launcher-app-remove-{}", app.id),
                    text("app.remove"),
                    move |s: &mut State| s.launcher.removing_app = Some(id.clone()),
                )
                .disabled(m.busy()),
            );
        }
        page = page.child(card);
    }
    if !found {
        page = page.child(label(t, text("app.empty")));
    }
    if let Some(id) = &m.removing_app {
        page = page.child(backdrop(
            t,
            "launcher-app-remove-backdrop",
            surface(t)
                .w(440.0)
                .role("dialog")
                .label(text("app.remove"))
                .modal(true, |s: &mut State| s.launcher.removing_app = None)
                .child(label(t, text("app.confirmHelp")).w_full().wrap())
                .child(
                    button(
                        t,
                        "launcher-app-remove-cancel",
                        text("app.cancel"),
                        |s: &mut State| s.launcher.removing_app = None,
                    )
                    .autofocus(),
                )
                .child(action(
                    state,
                    "launcher-app-remove-confirm",
                    text("app.remove"),
                    Some(Request::LauncherAppRemove {
                        id: id.clone(),
                        base_revision: catalog.revision.clone(),
                    }),
                )),
        ));
    }
    page
}
fn app_editor(state: &State) -> El {
    let t = &state.theme;
    let m = &state.launcher;
    let Some(e) = &m.app else {
        return col();
    };
    let disabled = m.busy()
        || m.value
            .as_ref()
            .is_none_or(|v| v.protected || v.running || v.revision != e.source.revision);
    let mut page = col()
        .key("launcher-app-editor")
        .grow(1.0)
        .min_h(0.0)
        .gap(12.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(display(t, text("app.editor"), 26.0))
        .child(field(
            t,
            "launcher-app-name",
            text("app.name"),
            &m.app_name,
            |s| &mut s.launcher.app_name,
            disabled,
        ))
        .child(action(
            state,
            "launcher-app-pick",
            text("app.pick"),
            Some(Request::LauncherAppPick {
                id: e.source.draft.id.clone(),
            }),
        ))
        .child(
            button(
                t,
                "launcher-app-discovery",
                text("app.discovery"),
                |s: &mut State| {
                    if let Some(e) = &mut s.launcher.app {
                        e.source.draft.use_discovery = !e.source.draft.use_discovery;
                        if e.source.draft.use_discovery {
                            e.picked = None;
                        }
                        e.confirm_arguments = false;
                    }
                },
            )
            .disabled(
                disabled
                    || e.source.draft.id.as_ref().is_none_or(|id| {
                        !m.catalog
                            .as_ref()
                            .is_some_and(|c| c.apps.iter().any(|a| &a.id == id && !a.removable))
                    }),
            ),
        );
    page = page.child(label(
        t,
        e.picked.as_ref().map_or(
            text(if e.source.has_executable {
                "app.configured"
            } else {
                "app.automatic"
            }),
            |p| &p.file_name,
        ),
    ));
    if e.loses_arguments() {
        page = page.child(
            button(
                t,
                "launcher-app-confirm-arguments",
                text("app.confirmArgumentReset"),
                |s: &mut State| {
                    if let Some(e) = &mut s.launcher.app {
                        e.confirm_arguments = !e.confirm_arguments;
                    }
                },
            )
            .fill(t.color(if e.confirm_arguments {
                "active"
            } else {
                "surface-1"
            }))
            .disabled(disabled),
        );
    }
    let draft = AppDraft {
        name: m.app_name.text.clone(),
        ..e.source.draft.clone()
    };
    page = page.child(
        row()
            .gap(8.0)
            .child(action(
                state,
                "launcher-app-save",
                text("app.save"),
                Some(Request::LauncherAppSave {
                    draft,
                    pick_token: e.picked.as_ref().map(|p| p.token.clone()),
                    base_revision: e.source.revision.clone(),
                }),
            ))
            .child(
                button(
                    t,
                    "launcher-app-cancel",
                    text("app.cancel"),
                    |s: &mut State| {
                        if let Some(e) = &mut s.launcher.app {
                            e.discard = true;
                        }
                    },
                )
                .disabled(m.busy()),
            ),
    );
    if e.discard {
        page = page.child(backdrop(
            t,
            "launcher-app-discard-backdrop",
            surface(t)
                .w(440.0)
                .role("dialog")
                .label(text("app.unsaved"))
                .modal(true, |s: &mut State| {
                    if let Some(e) = &mut s.launcher.app {
                        e.discard = false;
                    }
                })
                .child(
                    button(
                        t,
                        "launcher-app-keep",
                        text("profile.keepEditing"),
                        |s: &mut State| {
                            if let Some(e) = &mut s.launcher.app {
                                e.discard = false;
                            }
                        },
                    )
                    .autofocus(),
                )
                .child(button(
                    t,
                    "launcher-app-discard",
                    text("profile.confirmDiscard"),
                    |s: &mut State| s.launcher.app = None,
                )),
        ));
    }
    page
}
