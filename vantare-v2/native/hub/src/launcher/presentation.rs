//! Composición de la sección y su contexto con el kit compartido.
use super::*;
use crate::orbit::{Tone, chip, text};
use gpui::px;

fn matches_query(query: &str, values: &[&str]) -> bool {
    let query = query.trim().to_lowercase();
    values
        .iter()
        .any(|value| value.to_lowercase().contains(&query))
}

fn category(app: &App) -> &'static str {
    CATALOG
        .iter()
        .find(|entry| entry.id == app.id)
        .map_or("Manual", |entry| entry.category)
}

fn availability(app: Option<&discovery::Detected>, scanning: bool) -> (&'static str, Tone) {
    if scanning {
        return ("ESCANEANDO", Tone::Warning);
    }
    match app.map(|app| &app.availability) {
        Some(value) if value.installed => ("INSTALADA", Tone::Success),
        Some(value) if value.found => ("DETECTADA", Tone::Neutral),
        _ => ("CATÁLOGO", Tone::Neutral),
    }
}

fn launchable(profile: &Profile, discovered: &Discovery, busy: bool) -> bool {
    !busy
        && !profile.steps.is_empty()
        && profile.steps.iter().all(|step| {
            discovered
                .app(&step.app_id)
                .is_some_and(|app| app.availability.launchable)
        })
}

impl Launcher {
    fn profile_matches(&self, profile: &Profile, query: &str) -> bool {
        matches_query(query, &[&profile.name])
            || profile.steps.iter().any(|step| {
                self.store
                    .document
                    .apps
                    .iter()
                    .find(|app| app.id == step.app_id)
                    .is_some_and(|app| matches_query(query, &[&app.name]))
            })
    }

    fn sorted_profiles(&self) -> Vec<&Profile> {
        let mut profiles: Vec<_> = self.store.document.profiles.iter().collect();
        profiles.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| a.name.cmp(&b.name))
        });
        profiles
    }

    fn chain_names(&self, profile: &Profile) -> String {
        profile
            .steps
            .iter()
            .filter_map(|step| {
                self.store
                    .document
                    .apps
                    .iter()
                    .find(|app| app.id == step.app_id)
                    .map(|app| app.name.as_str())
            })
            .collect::<Vec<_>>()
            .join(" → ")
    }

    fn context_profiles(&self, query: &str, cx: &mut Context<Self>) -> gpui::Div {
        let mut profiles = orbit::card_body().child(orbit::eyebrow(format!(
            "Perfiles · {}",
            self.store.document.profiles.len()
        )));
        let visible: Vec<_> = self
            .sorted_profiles()
            .into_iter()
            .filter(|profile| self.profile_matches(profile, query))
            .collect();
        for (index, profile) in visible.iter().enumerate() {
            let edit = (*profile).clone();
            let launch = (*profile).clone();
            let can_launch = launchable(
                profile,
                &self.discovered,
                self.scanning || self.chain.is_some(),
            );
            profiles = profiles.child(
                div()
                    .id(("context-profile-group", index))
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        orbit::profile_avatar(
                            "context-profile-avatar",
                            &profile.name,
                            profile.favorite,
                            true,
                        )
                        .tab_stop(false),
                    )
                    .child(
                        orbit::list_row(
                            ("context-profile", index),
                            &profile.name,
                            &self.chain_names(profile),
                            false,
                            true,
                        )
                        .flex_1()
                        .min_w_0()
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.profile_editor(edit.clone(), window, cx);
                            },
                        )),
                    )
                    .child(
                        button("context-launch", "▶")
                            .aria_label(format!("Lanzar {}", profile.name))
                            .when(can_launch, |button| {
                                button.on_click(cx.listener(move |this, _, _, cx| {
                                    this.start(launch.clone(), cx);
                                }))
                            })
                            .when(!can_launch, |button| {
                                button.tab_stop(false).opacity(orbit::DISABLED)
                            }),
                    ),
            );
        }
        if visible.is_empty() {
            profiles = profiles.child(orbit::empty_state(
                "Sin perfiles",
                "Crea un perfil o cambia la búsqueda.",
            ));
        }
        profiles
    }

    pub fn context_column(&self, window: &Window, cx: &mut Context<Self>) -> gpui::Div {
        let query = self.query.read(cx).value.clone();
        let profiles = self.context_profiles(&query, cx);
        let mut favorites = orbit::card_body().child(orbit::eyebrow("Favoritas"));
        let mut count = 0;
        for (index, app) in self
            .store
            .document
            .apps
            .iter()
            .filter(|app| app.favorite && matches_query(&query, &[&app.name, category(app)]))
            .enumerate()
        {
            count += 1;
            let edit = app.clone();
            favorites = favorites.child(
                orbit::list_row(
                    ("context-favorite", index),
                    &app.name,
                    category(app),
                    false,
                    true,
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.app_editor(Some(edit.clone()), window, cx);
                })),
            );
        }
        if count == 0 {
            favorites = favorites.child(text(
                "Sin favoritas: marca la estrella de una aplicación.",
                orbit::BODY,
                400,
                orbit::INK_2,
            ));
        }
        let detected = self
            .discovered
            .apps
            .iter()
            .filter(|app| app.availability.found)
            .count();
        orbit::column("Launcher", env!("CARGO_PKG_VERSION"))
            .w(px(orbit::column_width(f32::from(window.viewport_size().width))))
            .child(orbit::card_body().child(text("Buscar aplicaciones y perfiles", orbit::SECONDARY, 500, orbit::INK_3)).child(self.query.clone()))
            .child(div().id("launcher-context").flex_1().min_h_0().overflow_y_scroll()
                .child(profiles).child(favorites)
                .child(orbit::card_body().child(orbit::eyebrow(format!("Catálogo · {} · {detected} detectadas", self.store.document.apps.len())))
                    .child(text("La detección busca en el registro y Steam. Accesos directos: pendiente.", orbit::SECONDARY, 400, orbit::INK_3))))
            .child(orbit::card_body()
                .child(orbit::eyebrow("Próximas carreras"))
                .child(chip("pendiente · contexto de calendario", Tone::Neutral))
                .child(orbit::eyebrow("Perfil de overlay"))
                .child(chip("pendiente · perfil activo", Tone::Neutral)))
    }

    fn catalog(&self, cx: &mut Context<Self>) -> gpui::Div {
        let query = &self.query.read(cx).value;
        let mut apps: Vec<_> = self
            .store
            .document
            .apps
            .iter()
            .filter(|app| matches_query(query, &[&app.name, category(app)]))
            .collect();
        apps.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| a.name.cmp(&b.name))
        });
        let mut rows = orbit::card_body();
        for (index, app) in apps.iter().enumerate() {
            rows = rows.child(self.app_row(index, app, cx));
        }
        if apps.is_empty() {
            rows = rows.child(orbit::empty_state(
                "Sin aplicaciones",
                "Prueba otra búsqueda.",
            ));
        }
        orbit::card("Aplicaciones").child(
            rows.child(
                button("launcher-add-app", "+ Añadir aplicación")
                    .on_click(cx.listener(|this, _, window, cx| this.app_editor(None, window, cx))),
            ),
        )
    }

    fn app_row(
        &self,
        index: usize,
        app: &App,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let edit = app.clone();
        let id = app.id.clone();
        let launch_id = id.clone();
        let detected = self.discovered.app(&id);
        let (label, tone) = availability(detected, self.scanning);
        let can_launch = !self.scanning
            && self.chain.is_none()
            && detected.is_some_and(|app| app.availability.launchable);
        div()
            .id(("launcher-app", index))
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        orbit::profile_avatar("app-avatar", &app.name, false, true).tab_stop(false),
                    )
                    .child(
                        orbit::list_row("app-name", &app.name, category(app), false, true)
                            .flex_1()
                            .min_w_0()
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.app_editor(Some(edit.clone()), window, cx);
                            })),
                    )
                    .child(chip(label, tone)),
            )
            .child(
                div()
                    .flex()
                    .justify_end()
                    .gap_2()
                    .child(
                        button("app-favorite", if app.favorite { "★" } else { "☆" })
                            .aria_label(format!("Favorita: {}", app.name))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.edit(
                                    |doc| {
                                        let app = doc
                                            .apps
                                            .iter_mut()
                                            .find(|app| app.id == id)
                                            .ok_or("app inexistente")?;
                                        app.favorite = !app.favorite;
                                        Ok(())
                                    },
                                    cx,
                                );
                            })),
                    )
                    .child(
                        button("launch-app", "▶ Abrir")
                            .aria_label(format!("Abrir {}", app.name))
                            .when(can_launch, |button| {
                                button.on_click(cx.listener(move |this, _, _, cx| {
                                    this.launch_app(&launch_id, cx);
                                }))
                            })
                            .when(!can_launch, |button| {
                                button.tab_stop(false).opacity(orbit::DISABLED)
                            }),
                    ),
            )
    }

    fn profiles(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut rows = div().flex().flex_col().gap_4();
        let query = &self.query.read(cx).value;
        let profiles: Vec<_> = self
            .sorted_profiles()
            .into_iter()
            .filter(|profile| self.profile_matches(profile, query))
            .collect();
        for (index, profile) in profiles.iter().enumerate() {
            rows = rows.child(self.profile_card(index, profile, cx));
        }
        if profiles.is_empty() {
            rows = rows.child(orbit::card("").child(orbit::empty_state(
                "Sin perfiles",
                "Crea una cadena de aplicaciones para tu próxima sesión.",
            )));
        }
        rows.child(
            orbit::card("Crear perfil").child(
                orbit::card_body()
                    .child(text(
                        "Organiza aplicaciones y ejecuta sus pasos en orden.",
                        orbit::BODY,
                        400,
                        orbit::INK_2,
                    ))
                    .child(button("launcher-add-profile", "+ Crear perfil").on_click(
                        cx.listener(|this, _, window, cx| this.new_profile(None, window, cx)),
                    )),
            ),
        )
    }

    fn profile_card(
        &self,
        index: usize,
        profile: &Profile,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let edit = profile.clone();
        let launch = profile.clone();
        let can_launch = launchable(
            profile,
            &self.discovered,
            self.scanning || self.chain.is_some(),
        );
        let chain = self.profile_chain(profile);
        orbit::card("").id(("launcher-profile", index)).child(
            orbit::card_body()
                .gap_3()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .child(
                            orbit::profile_avatar(
                                "profile-avatar",
                                &profile.name,
                                profile.favorite,
                                true,
                            )
                            .tab_stop(false),
                        )
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .child(orbit::eyebrow(if index == 0 {
                                    "Perfil destacado"
                                } else {
                                    "Perfil"
                                }))
                                .child(text(profile.name.clone(), 18.0, 700, orbit::INK)),
                        )
                        .child(button("edit-profile", "Editar").on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.profile_editor(edit.clone(), window, cx);
                            },
                        )))
                        .child(
                            button("launch-profile", "▶ Lanzar")
                                .when(can_launch, |button| {
                                    button.on_click(cx.listener(move |this, _, _, cx| {
                                        this.start(launch.clone(), cx);
                                    }))
                                })
                                .when(!can_launch, |button| {
                                    button.tab_stop(false).opacity(orbit::DISABLED)
                                }),
                        ),
                )
                .when(profile.steps.is_empty(), |body| {
                    body.child(text("Sin pasos todavía.", orbit::BODY, 400, orbit::INK_3))
                })
                .child(chain)
                .child(Self::policy_chips(profile))
                .child(self.profile_actions(profile, cx)),
        )
    }
    fn profile_chain(&self, profile: &Profile) -> gpui::Div {
        let mut chain = div().flex().flex_wrap().gap_2();
        for (step_index, step) in profile.steps.iter().enumerate() {
            let Some(app) = self
                .store
                .document
                .apps
                .iter()
                .find(|app| app.id == step.app_id)
            else {
                continue;
            };
            let delay = if step_index == 0 {
                profile.first_step_delay
            } else {
                step.delay_seconds
            };
            chain = chain.child(
                orbit::card("").id(("profile-step", step_index)).child(
                    orbit::card_body()
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap_2()
                                .child(orbit::profile_avatar(
                                    "chain-avatar",
                                    &app.name,
                                    false,
                                    false,
                                ))
                                .child(text(app.name.clone(), orbit::SECONDARY, 650, orbit::INK)),
                        )
                        .child(text(
                            if delay == 0 {
                                "sin espera".into()
                            } else {
                                format!("+{delay} s")
                            },
                            orbit::MICRO,
                            400,
                            orbit::INK_3,
                        )),
                ),
            );
            if step_index + 1 < profile.steps.len() {
                chain = chain.child(text("→", orbit::BODY, 400, orbit::INK_4));
            }
        }
        chain
    }
    fn policy_chips(profile: &Profile) -> gpui::Div {
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(chip(
                if profile.reuse_running {
                    "YA ABIERTA · REUTILIZAR"
                } else {
                    "YA ABIERTA · ABRIR"
                },
                Tone::Neutral,
            ))
            .child(chip(
                if profile.continue_on_error {
                    "FALLO · CONTINUAR"
                } else {
                    "FALLO · DETENER"
                },
                Tone::Neutral,
            ))
            .child(chip(
                &format!("FALLO · REINTENTAR ×{}", profile.max_retries),
                Tone::Neutral,
            ))
            .child(chip("AL SALIR · DEJAR ABIERTAS", Tone::Neutral))
    }
    fn profile_actions(&self, profile: &Profile, cx: &mut Context<Self>) -> gpui::Div {
        let duplicate = profile.clone();
        let favorite = profile.id.clone();
        let remove = profile.id.clone();
        let trigger = profile.id.clone();
        let triggered = self.store.document.lmu_trigger_profile.as_deref() == Some(&profile.id);
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(
                button(
                    "favorite-profile",
                    if profile.favorite {
                        "★ Favorito"
                    } else {
                        "☆ Favorito"
                    },
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.edit(
                        |doc| {
                            let profile = doc
                                .profiles
                                .iter_mut()
                                .find(|p| p.id == favorite)
                                .ok_or("perfil inexistente")?;
                            profile.favorite = !profile.favorite;
                            Ok(())
                        },
                        cx,
                    );
                })),
            )
            .child(
                button("duplicate-profile", "Duplicar").on_click(cx.listener(
                    move |this, _, window, cx| {
                        this.new_profile(Some(duplicate.clone()), window, cx);
                    },
                )),
            )
            .child(button("delete-profile", "Eliminar").on_click(cx.listener(
                move |this, _, _, cx| {
                    this.edit(
                        |doc| {
                            doc.profiles.retain(|profile| profile.id != remove);
                            if doc.lmu_trigger_profile.as_deref() == Some(&remove) {
                                doc.lmu_trigger_profile = None;
                            }
                            Ok(())
                        },
                        cx,
                    );
                },
            )))
            .child(
                button(
                    "trigger-profile",
                    if triggered {
                        "LMU · activado"
                    } else {
                        "Al abrir LMU"
                    },
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    if this.edit(
                        |doc| {
                            doc.lmu_trigger_profile =
                                if doc.lmu_trigger_profile.as_deref() == Some(&trigger) {
                                    None
                                } else {
                                    Some(trigger.clone())
                                };
                            Ok(())
                        },
                        cx,
                    ) {
                        this.trigger = LmuTrigger::default();
                    }
                })),
            )
    }

    fn stats(&self) -> gpui::Div {
        let mut stats = div().flex().flex_wrap().gap_3();
        for (label, value, help) in [
            (
                "Aplicaciones",
                format!("{} en catálogo", self.store.document.apps.len()),
                format!(
                    "{} detectadas",
                    self.discovered
                        .apps
                        .iter()
                        .filter(|app| app.availability.found)
                        .count()
                ),
            ),
            (
                "Perfiles",
                format!("{} cadenas", self.store.document.profiles.len()),
                format!(
                    "{} favoritos",
                    self.store
                        .document
                        .profiles
                        .iter()
                        .filter(|p| p.favorite)
                        .count()
                ),
            ),
            (
                "Última ejecución",
                if self.progress.is_empty() {
                    "Sin ejecuciones"
                } else {
                    "Esta sesión"
                }
                .into(),
                "Historial · pendiente".into(),
            ),
            (
                "Atajo global",
                "pendiente".into(),
                "Lanza el perfil destacado".into(),
            ),
        ] {
            stats = stats.child(
                orbit::card("").flex_1().min_w(px(orbit::FIELD_W)).child(
                    orbit::card_body()
                        .child(orbit::eyebrow(label))
                        .child(text(value, 20.0, 700, orbit::INK))
                        .child(text(help, orbit::SECONDARY, 400, orbit::INK_3)),
                ),
            );
        }
        stats
    }
    fn progress_panel(&self) -> gpui::Div {
        let mut progress = orbit::card_body();
        for (index, event) in self.progress.iter().enumerate() {
            progress = progress.child(orbit::list_row(
                ("chain-progress", index),
                &event.message,
                &format!(
                    "{:?}{} · {}",
                    event.status,
                    event
                        .pid
                        .map_or(String::new(), |pid| format!(" · PID {pid}")),
                    event.step.map_or_else(
                        || format!("Resultado · éxito: {}", event.success),
                        |step| format!("Paso {}", step + 1)
                    ),
                ),
                false,
                false,
            ));
        }
        orbit::card("Progreso de la cadena").child(progress)
    }
}

impl Render for Launcher {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if let Some(layer) = &self.form_layer {
            let targets = self.form_targets(cx);
            layer.update(cx, |layer, _| layer.set_targets(targets));
        }
        let detection_label = self.last_scan.map_or_else(
            || "SIN DETECTAR".into(),
            |when| format!("DETECCIÓN EJECUTADA {}", when.format("%d/%m, %H:%M")),
        );
        let stats = self.stats();
        let mut page = div()
            .id("launcher")
            .flex()
            .flex_col()
            .min_w_0()
            .gap_4()
            .child(text(
                "Detecta aplicaciones compatibles, organiza perfiles y ejecuta sus pasos en orden.",
                orbit::BODY,
                400,
                orbit::INK_2,
            ))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap_2()
                    .child(orbit::pill(
                        if self.scanning {
                            "DETECTANDO…"
                        } else {
                            &detection_label
                        },
                        if self.scanning {
                            Tone::Warning
                        } else {
                            Tone::Neutral
                        },
                    ))
                    .child(
                        button("launcher-rescan", "Volver a detectar")
                            .on_click(cx.listener(|this, _, _, cx| this.scan(cx))),
                    )
                    .child(
                        button("launcher-reload", "Recargar datos locales")
                            .on_click(cx.listener(|this, _, _, cx| this.reload(cx))),
                    )
                    .when(self.chain.is_some(), |row| {
                        row.child(button("launcher-cancel", "Cancelar cadena").on_click(
                            cx.listener(|this, _, _, cx| {
                                if let Some(chain) = &this.chain {
                                    chain.cancel();
                                }
                                cx.notify();
                            }),
                        ))
                    }),
            )
            .child(stats)
            .when_some(self.error.clone(), |page, error| {
                page.child(orbit::callout(error))
            })
            .when(!self.progress.is_empty(), |page| {
                page.child(self.progress_panel())
            })
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(orbit::GUTTER / 2.0))
                    .child(
                        div()
                            .w(px(orbit::COLUMN_W + orbit::GUTTER))
                            .min_w(px(orbit::COLUMN_W))
                            .child(self.catalog(cx)),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w(px(orbit::COLUMN_W))
                            .child(self.profiles(cx)),
                    ),
            );
        for warning in &self.discovered.warnings {
            page = page.child(orbit::callout(warning.clone()));
        }
        page
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_ignores_case_and_whitespace_and_matches_categories() {
        assert!(matches_query("  oBs  ", &["OBS Studio", "Streaming"]));
        assert!(matches_query("stream", &["OBS Studio", "Streaming"]));
        assert!(matches_query("", &["Discord"]));
        assert!(!matches_query("LMU", &["Discord", "Utilidad"]));
    }
    #[test]
    fn profile_requires_every_app_launchable_and_an_idle_launcher() {
        let mut profile = Profile::new("p".into(), "Perfil".into());
        let mut discovery = Discovery::default();
        assert!(!launchable(&profile, &discovery, false));
        profile.steps.push(Step {
            app_id: "lmu".into(),
            delay_seconds: 0,
            args_override: None,
        });
        assert!(!launchable(&profile, &discovery, false));
        discovery.apps.push(discovery::Detected {
            id: "lmu".into(),
            executable: None,
            source: "Steam",
            availability: discovery::Availability {
                installed: true,
                ..Default::default()
            },
        });
        assert!(!launchable(&profile, &discovery, false));
        discovery.apps[0].availability.launchable = true;
        assert!(launchable(&profile, &discovery, false));
        assert!(!launchable(&profile, &discovery, true));
        profile.steps.push(Step {
            app_id: "obs".into(),
            delay_seconds: 2,
            args_override: None,
        });
        assert!(!launchable(&profile, &discovery, false));
    }
    #[test]
    fn installation_and_detection_are_not_launchability() {
        let mut app = discovery::Detected {
            id: "lmu".into(),
            executable: None,
            source: "Steam",
            availability: discovery::Availability::default(),
        };
        assert_eq!(availability(Some(&app), false).0, "CATÁLOGO");
        app.availability.found = true;
        assert_eq!(availability(Some(&app), false).0, "DETECTADA");
        app.availability.installed = true;
        assert_eq!(availability(Some(&app), false).0, "INSTALADA");
        assert!(!app.availability.launchable);
        assert_eq!(availability(Some(&app), true).0, "ESCANEANDO");
    }
}
