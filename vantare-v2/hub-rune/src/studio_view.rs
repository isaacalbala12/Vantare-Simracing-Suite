use crate::{
    State,
    catalog::text,
    design::{button, caption, display, label, surface},
};
use rune::{El, col, row};
use vantare_hub_host::{
    protocol::Request,
    studio::{InstancePatch, OPACITY_MAX, OPACITY_MIN, OffTrack, StudioState},
};

fn action(state: &State, key: &str, name: &str, request: Request) -> El {
    let disabled = state.studio.busy() || !state.studio.allowed(&request, &state.core);
    button(&state.theme, key, name, move |s: &mut State| {
        s.studio.queue(request.clone(), &s.core)
    })
    .disabled(disabled)
}

pub fn view(state: &State) -> El {
    let theme = &state.theme;
    let model = &state.studio;
    let mut page = col()
        .key("studio")
        .grow(1.0)
        .min_h(0.0)
        .padding(20.0)
        .gap(12.0);
    let mut toolbar = row()
        .gap(8.0)
        .center_y()
        .child(caption(theme, text("studio.layout")).grow(1.0));
    if let Some(v) = &model.value {
        toolbar = toolbar
            .child(action(
                state,
                "studio-undo",
                text("studio.undo"),
                Request::StudioUndo {
                    base_revision: v.revision.clone(),
                },
            ))
            .child(action(
                state,
                "studio-redo",
                text("studio.redo"),
                Request::StudioRedo {
                    base_revision: v.revision.clone(),
                },
            ))
            .child(action(
                state,
                "studio-track",
                text(if v.showing {
                    "studio.hide"
                } else {
                    "studio.show"
                }),
                Request::StudioTrack { show: !v.showing },
            ));
    }
    page = page.child(toolbar).child(button(
        theme,
        "studio-reload",
        text("studio.reload"),
        |s: &mut State| s.studio.reload(),
    ));
    if let Some(problem) = model.problem {
        page = page.child(
            surface(theme)
                .role("status")
                .child(label(theme, text(problem)).w_full().wrap()),
        );
    }
    let Some(v) = &model.value else {
        return page.child(
            label(
                theme,
                text(if model.problem.is_some() {
                    "studio.readFailedHelp"
                } else {
                    "studio.loading"
                }),
            )
            .role("status"),
        );
    };
    if v.state == StudioState::Missing {
        return page.child(
            surface(theme)
                .child(display(theme, text("studio.missing"), 26.0))
                .child(label(theme, text("studio.missingHelp"))),
        );
    }
    if v.state == StudioState::Protected {
        page = page.child(
            label(theme, text("studio.protectedHelp"))
                .role("status")
                .w_full()
                .wrap(),
        );
    }
    let mut list = surface(theme)
        .key("studio-list")
        .w(240.0)
        .h_full()
        .min_h(0.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(
            button(
                theme,
                "studio-catalog-open",
                text("studio.add"),
                |s: &mut State| s.studio.catalog_open = true,
            )
            .disabled(model.busy() || v.state != StudioState::Ready),
        );
    for item in &v.instances {
        let id = item.id.clone();
        let name = v
            .catalog
            .iter()
            .find(|c| c.kind == item.kind)
            .map_or(item.kind.id(), |c| c.name.as_str());
        list = list
            .child(
                button(
                    theme,
                    &format!("studio-select-{}", item.id),
                    name,
                    move |s: &mut State| {
                        s.studio.selected = id.clone();
                        s.studio.track_tab = false;
                    },
                )
                .fill(theme.color(if item.id == model.selected {
                    "active"
                } else {
                    "surface-1"
                })),
            )
            .child(label(
                theme,
                text(if item.visible {
                    "studio.visible"
                } else {
                    "studio.hidden"
                }),
            ));
    }
    let mut focus = col()
        .key("studio-focus")
        .grow(1.0)
        .min_w(0.0)
        .gap(12.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        });
    if let Some(item) = model.item() {
        let name = v
            .catalog
            .iter()
            .find(|c| c.kind == item.kind)
            .map_or(item.kind.id(), |c| c.name.as_str());
        focus = focus
            .child(display(theme, name, 28.0))
            .child(label(theme, text("studio.illustrationNote")))
            .child(crate::home_view::studio_picture(
                state,
                item.kind.id(),
                500.0,
                230.0,
            ))
            .child(
                row()
                    .gap(8.0)
                    .child(
                        button(
                            theme,
                            "studio-appearance-tab",
                            text("studio.appearance"),
                            |s: &mut State| s.studio.track_tab = false,
                        )
                        .disabled(item.settings.is_none()),
                    )
                    .child(button(
                        theme,
                        "studio-track-tab",
                        text("studio.track"),
                        |s: &mut State| s.studio.track_tab = true,
                    ))
                    .child(
                        button(
                            theme,
                            "studio-content-tab",
                            text("studio.content"),
                            |_: &mut State| {},
                        )
                        .disabled(true)
                        .help(text("studio.contentSoonHelp")),
                    ),
            );
        if model.track_tab || item.settings.is_none() {
            focus = focus.child(action(
                state,
                "studio-visible",
                text(if item.visible {
                    "studio.hideWidget"
                } else {
                    "studio.showWidget"
                }),
                Request::StudioVisibility {
                    id: item.id.clone(),
                    visible: !item.visible,
                    base_revision: v.revision.clone(),
                },
            ));
            let mut opacity = row().gap(8.0).child(label(
                theme,
                format!("{} · {} %", text("studio.opacity"), item.opacity),
            ));
            for (index, value) in [
                OPACITY_MIN,
                item.opacity.saturating_sub(1).max(OPACITY_MIN),
                item.opacity.saturating_add(1).min(OPACITY_MAX),
                OPACITY_MAX,
            ]
            .into_iter()
            .enumerate()
            {
                opacity = opacity.child(action(
                    state,
                    &format!("studio-opacity-{index}-{value}"),
                    &format!("{value} %"),
                    Request::StudioInstance {
                        id: item.id.clone(),
                        patch: InstancePatch::Opacity(value),
                        base_revision: v.revision.clone(),
                    },
                ));
            }
            focus = focus.child(opacity);
            for (key, name) in [
                ("practice", "studio.practice"),
                ("qualifying", "studio.qualifying"),
                ("race", "studio.race"),
            ] {
                let mut sessions = item.show_in.clone();
                let enabled = match key {
                    "practice" => sessions.practice,
                    "qualifying" => sessions.qualifying,
                    _ => sessions.race,
                };
                match key {
                    "practice" => sessions.practice = !sessions.practice,
                    "qualifying" => sessions.qualifying = !sessions.qualifying,
                    _ => sessions.race = !sessions.race,
                };
                focus = focus.child(
                    action(
                        state,
                        &format!("studio-session-{key}"),
                        text(name),
                        Request::StudioInstance {
                            id: item.id.clone(),
                            patch: InstancePatch::ShowIn(sessions),
                            base_revision: v.revision.clone(),
                        },
                    )
                    .fill(theme.color(if enabled {
                        "active"
                    } else {
                        "surface-1"
                    })),
                );
            }
            for (key, name, value) in [
                ("inherit", "studio.inherit", OffTrack::Inherit),
                ("always", "studio.always", OffTrack::AlwaysVisible),
                ("hide", "studio.offHide", OffTrack::Hide),
            ] {
                focus = focus.child(
                    action(
                        state,
                        &format!("studio-off-{key}"),
                        text(name),
                        Request::StudioInstance {
                            id: item.id.clone(),
                            patch: InstancePatch::OffTrack(value),
                            base_revision: v.revision.clone(),
                        },
                    )
                    .fill(theme.color(if item.off_track == value {
                        "active"
                    } else {
                        "surface-1"
                    })),
                );
            }
            focus = focus.child(label(theme, text("studio.placeHelp")));
        } else if v.state != StudioState::Ready {
            focus = focus.child(
                label(theme, text("studio.protectedSettings"))
                    .w_full()
                    .wrap(),
            );
        } else if let Some(settings) = &item.settings {
            let values = serde_json::to_value(settings).expect("typed widget settings");
            focus = focus.child(
                label(theme, text("studio.appearancePreviewNote"))
                    .w_full()
                    .wrap(),
            );
            let mut fields = vec![
                (
                    "designSystem",
                    "studio.widgetLook",
                    vec![
                        ("vantare", "studio.lookVantare"),
                        ("eficiencia", "studio.lookEficiencia"),
                    ],
                ),
                (
                    "style",
                    "studio.widgetStyle",
                    vec![
                        ("neo", "studio.styleNeo"),
                        ("neutro", "studio.styleNeutral"),
                    ],
                ),
                (
                    "accent",
                    "studio.widgetAccent",
                    vec![
                        ("red", "studio.accentRed"),
                        ("amber", "studio.accentAmber"),
                        ("green", "studio.accentGreen"),
                        ("white", "studio.accentWhite"),
                    ],
                ),
            ];
            let table_sizes = vec![
                ("compact", "studio.formatCompact"),
                ("standard", "studio.formatStandard"),
                ("expanded", "studio.formatExpanded"),
            ];
            match item.kind.id() {
                "standings" | "relative" => {
                    fields.push(("tablePreset", "studio.tablePreset", table_sizes))
                }
                "fuel-strategy" => fields.push(("size", "studio.fuelFormat", table_sizes)),
                "delta" => fields.push((
                    "size",
                    "studio.deltaFormat",
                    vec![
                        ("pill", "studio.deltaPill"),
                        ("bar", "studio.deltaBarFormat"),
                        ("expanded", "studio.deltaExpanded"),
                    ],
                )),
                _ => {}
            }
            if values["designSystem"].as_str() == Some("eficiencia") {
                match item.kind.id() {
                    "standings" => fields.push((
                        "templateId",
                        "studio.widgetDesign",
                        vec![
                            ("signature", "studio.designSignature"),
                            ("broadcast", "studio.designBroadcast"),
                        ],
                    )),
                    "delta" => fields.push((
                        "templateId",
                        "studio.widgetDesign",
                        vec![
                            ("instrument", "studio.designInstrument"),
                            ("capsule", "studio.designCapsule"),
                        ],
                    )),
                    _ => {}
                }
            }
            for (field, title, options) in fields {
                if matches!(field, "style" | "accent" | "tablePreset" | "size")
                    && values["designSystem"].as_str() != Some("vantare")
                {
                    continue;
                }
                let mut choices = row().gap(6.0).child(label(theme, text(title)));
                for (value, label_key) in options {
                    let patch = serde_json::json!({"kind":item.kind.id(),field:value});
                    let patch =
                        serde_json::from_value(patch).expect("closed shared appearance option");
                    choices = choices.child(
                        action(
                            state,
                            &format!("studio-{field}-{value}"),
                            text(label_key),
                            Request::StudioInstance {
                                id: item.id.clone(),
                                patch: InstancePatch::Settings(Box::new(patch)),
                                base_revision: v.revision.clone(),
                            },
                        )
                        .fill(theme.color(
                            if values[field].as_str() == Some(value) {
                                "active"
                            } else {
                                "surface-1"
                            },
                        )),
                    );
                }
                focus = focus.child(choices);
            }
            for (field, title) in [
                ("transparentBackground", "studio.transparentBackground"),
                ("showBar", "studio.deltaDifferenceBar"),
            ] {
                if item.kind.id() != "delta"
                    || values["designSystem"].as_str() != Some("vantare")
                    || (field == "showBar" && values["size"].as_str() == Some("pill"))
                {
                    continue;
                }
                if let Some(current) = values[field].as_bool() {
                    let patch = serde_json::from_value(
                        serde_json::json!({"kind":item.kind.id(),field:!current}),
                    )
                    .expect("closed shared boolean option");
                    focus = focus.child(
                        action(
                            state,
                            &format!("studio-{field}"),
                            text(title),
                            Request::StudioInstance {
                                id: item.id.clone(),
                                patch: InstancePatch::Settings(Box::new(patch)),
                                base_revision: v.revision.clone(),
                            },
                        )
                        .fill(theme.color(if current {
                            "active"
                        } else {
                            "surface-1"
                        })),
                    );
                }
            }
            if item.kind.id() == "standings" {
                focus = focus.child(label(theme, text("studio.brandReadOnly")).w_full().wrap());
            }
        }
        focus = focus.child(
            button(
                theme,
                "studio-remove",
                text("studio.remove"),
                |s: &mut State| s.studio.removing = Some(s.studio.selected.clone()),
            )
            .disabled(model.busy() || item.locked || v.state != StudioState::Ready),
        );
    } else {
        focus = focus
            .child(display(theme, text("studio.emptyTitle"), 28.0))
            .child(label(theme, text("studio.emptyHelp")));
    }
    page = page.child(
        row()
            .grow(1.0)
            .min_h(0.0)
            .gap(16.0)
            .child(list)
            .child(focus),
    );
    if model.catalog_open {
        let mut dialog = surface(theme)
            .key("studio-catalog")
            .role("dialog")
            .label(text("studio.catalog"))
            .w(640.0)
            .max_h(650.0)
            .modal(true, |s: &mut State| s.studio.catalog_open = false)
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            })
            .child(
                button(
                    theme,
                    "studio-catalog-close",
                    text("studio.close"),
                    |s: &mut State| s.studio.catalog_open = false,
                )
                .autofocus(),
            )
            .child(
                rune::text_input(&model.query, crate::design::body_style(14.0, 400.0))
                    .key("studio-search")
                    .w_full()
                    .min_h(36.0)
                    .single_line()
                    .label(text("studio.search"))
                    .on_edit(|s: &mut State| &mut s.studio.query),
            );
        let query = model.query.text.to_lowercase();
        for info in v.catalog.iter().filter(|i| {
            format!("{} {} {}", i.name, i.category, i.about)
                .to_lowercase()
                .contains(&query)
        }) {
            dialog = dialog
                .child(label(theme, &info.about).w_full().wrap())
                .child(action(
                    state,
                    &format!("studio-add-{}", info.kind.id()),
                    &info.name,
                    Request::StudioAdd {
                        kind: info.kind,
                        base_revision: v.revision.clone(),
                    },
                ));
        }
        page = page.child(
            row()
                .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                .center()
                .raise()
                .fill(theme.color("bg-base").alpha(0.65))
                .child(dialog),
        );
    }
    if let Some(id) = &model.removing {
        let dialog = surface(theme)
            .key("studio-remove-dialog")
            .role("dialog")
            .label(text("studio.removeTitle"))
            .w(420.0)
            .modal(true, |s: &mut State| s.studio.removing = None)
            .child(label(theme, text("studio.removeHelp")).w_full().wrap())
            .child(
                button(
                    theme,
                    "studio-remove-cancel",
                    text("studio.cancel"),
                    |s: &mut State| s.studio.removing = None,
                )
                .autofocus(),
            )
            .child(action(
                state,
                "studio-remove-confirm",
                text("studio.remove"),
                Request::StudioRemove {
                    id: id.clone(),
                    base_revision: v.revision.clone(),
                },
            ));
        page = page.child(
            row()
                .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                .center()
                .raise()
                .fill(theme.color("bg-base").alpha(0.65))
                .child(dialog),
        );
    }
    page
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn studio_states_and_appearance_controls_are_keyboard_named_without_a_window() {
        for scene in [
            "studio-base",
            "studio-vacio",
            "studio-protegido",
            "studio-missing",
        ] {
            for scale in [1.0, 1.25, 1.5] {
                let mut state = crate::init();
                state.section = "studio".into();
                state.core.access.verified = true;
                state.studio.event(crate::studio::scene(scene));
                state.studio.value = Some(crate::studio::scene(scene));
                state.studio.selected = state
                    .studio
                    .value
                    .as_ref()
                    .unwrap()
                    .instances
                    .first()
                    .map_or_else(String::new, |i| i.id.clone());
                let mut rt = rune::Runtime::new(
                    state,
                    crate::view,
                    (1440.0, 900.0),
                    rune::Env::new(true, scale),
                );
                rt.frame(0.0);
                for item in rt.elements().into_iter().filter(|e| e.focusable) {
                    assert!(
                        item.label.is_some_and(|s| !s.is_empty()),
                        "{scene}: {}",
                        item.path
                    );
                }
                assert!(rt.find("studio-reload").is_some());
                if scene == "studio-base" {
                    let (x, y) = rt.find("studio-track-tab").unwrap();
                    rt.pointer_down(x, y);
                    rt.pointer_up(x, y);
                    rt.frame(0.0);
                    assert!(rt.state.studio.track_tab);
                    assert!(rt.find("studio-opacity-0-20").is_some());
                }
            }
        }
    }
    #[test]
    fn appearance_controls_accept_all_five_shared_widget_settings() {
        let corpus: serde_json::Value = serde_json::from_str(include_str!(
            "../../hub-web/src/contract/generated/corpus/studio.json"
        ))
        .unwrap();
        let mut count = 0;
        for message in corpus["host"].as_array().unwrap() {
            if message["result"]["method"] != "studio.get"
                || message["result"]["value"]["instances"]
                    .as_array()
                    .is_none_or(|a| a.is_empty())
            {
                continue;
            }
            for look in ["eficiencia", "vantare"] {
                let mut state = crate::init();
                state.section = "studio".into();
                state.core.access.verified = true;
                let mut view = message["result"]["value"].clone();
                view["instances"][0]["settings"]["designSystem"] = look.into();
                state.studio.value = Some(serde_json::from_value(view).unwrap());
                state.studio.selected =
                    state.studio.value.as_ref().unwrap().instances[0].id.clone();
                let mut rt = rune::Runtime::new(
                    state,
                    crate::view,
                    (1440.0, 900.0),
                    rune::Env::new(true, 1.0),
                );
                rt.frame(0.0);
                assert!(rt.find("studio-designSystem-vantare").is_some());
                let original = rt.state.studio.value.clone();
                let (x, y) = rt.find("studio-designSystem-vantare").unwrap();
                rt.pointer_down(x, y);
                rt.pointer_up(x, y);
                rt.frame(0.0);
                assert_eq!(
                    rt.state.studio.value, original,
                    "wait for the host before changing the document"
                );
                let core = rt.state.core.clone();
                let messages = rt.state.studio.next(1.0, true, &core);
                let request = messages
                    .iter()
                    .find_map(|m| {
                        if let vantare_hub_host::protocol::UiToHost::Request { request, .. } = m {
                            Some(request)
                        } else {
                            None
                        }
                    })
                    .unwrap();
                assert!(matches!(
                    request,
                    Request::StudioInstance {
                        patch: InstancePatch::Settings(_),
                        ..
                    }
                ));
                assert_eq!(
                    serde_json::to_value(request).unwrap()["patch"]["value"]["designSystem"],
                    "vantare"
                );
                count += 1;
            }
        }
        assert_eq!(count, 10);
    }
    #[test]
    fn catalog_search_is_unicode_and_modal_escape_preserves_document() {
        let mut state = crate::init();
        state.section = "studio".into();
        state.core.access.verified = true;
        let value = crate::studio::scene("studio-base");
        state.studio.selected = value.instances[0].id.clone();
        state.studio.value = Some(value.clone());
        let mut rt = rune::Runtime::new(
            state,
            crate::view,
            (1440.0, 900.0),
            rune::Env::new(true, 1.0),
        );
        rt.frame(0.0);
        let (x, y) = rt.find("studio-catalog-open").unwrap();
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(0.0);
        assert!(rt.state.studio.catalog_open);
        // Newly mounted Rune elements enter with a spring. Advance only injected time,
        // as in the existing Home retry test, before simulating a physical click.
        for _ in 0..120 {
            rt.frame(1.0 / 60.0);
        }
        let (x, y) = rt.find("studio-search").unwrap();
        assert!(
            rt.elements()
                .iter()
                .any(|e| e.key.as_deref() == Some("studio-search") && e.opacity > 0.99)
        );
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(0.0);
        assert!(rt.state.studio.catalog_open);
        rt.paste("clasificación");
        rt.frame(0.0);
        assert_eq!(rt.state.studio.query.text, "clasificación");
        assert!(rt.find("studio-add-standings").is_some());
        assert!(rt.find("studio-add-pedals").is_none());
        rt.key(rune::KeyEvent {
            key: rune::Key::Escape,
            mods: Default::default(),
        });
        rt.frame(0.0);
        assert!(!rt.state.studio.catalog_open);
        assert_eq!(rt.state.studio.value, Some(value));
    }
}
