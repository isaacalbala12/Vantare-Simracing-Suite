//! Cableado del diseño de Opus; I/O y procesado fuera del hilo de UI.
use super::{Hub, Page};
use crate::pilot::{Draft, view::PilotEvent};
use base64::{Engine, engine::general_purpose::STANDARD};
use gpui::{Context, PathPromptOptions, Window};
use std::sync::Arc;
use vantare_ipc::services_protocol::{Command, pilot_document::PilotProfile};

fn draft(profile: &PilotProfile) -> Draft {
    Draft {
        public_name: profile.public_name.clone(),
        description: profile.description.clone(),
        country: profile.country.clone(),
        simulators: profile.simulators.clone(),
        favorite_car: profile.favorite_car.clone(),
        favorite_team: profile.favorite_team.clone(),
    }
}
fn merge(profile: &mut PilotProfile, edits: &Draft, baseline: &Draft) {
    let draft = edits.merge_edited(baseline, &draft(profile));
    profile.public_name = draft.public_name;
    profile.description = draft.description;
    profile.country = draft.country;
    profile.simulators = draft.simulators;
    profile.favorite_car = draft.favorite_car;
    profile.favorite_team = draft.favorite_team;
}
fn photo(profile: &PilotProfile) -> Option<Arc<gpui::Image>> {
    profile
        .photo
        .as_ref()
        .and_then(|p| STANDARD.decode(&p.jpeg).ok())
        .map(|bytes| Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Jpeg, bytes)))
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Load {
    New,
    Requested,
}
#[derive(PartialEq, Eq)]
pub(super) enum PhotoEdit {
    Unchanged,
    Remove,
    Replace(vantare_ipc::services_protocol::pilot_document::PilotPhoto),
}
impl Hub {
    pub(super) fn observe_pilot(&mut self, cx: &mut Context<Self>) {
        let remote = self.remote.read(cx);
        let generation = remote.pilot.generation;
        if generation != self.settings.pilot_generation {
            let state = remote.pilot.saved.clone();
            let succeeded =
                remote.pilot.result == crate::services::view::pilot::PilotResult::Loaded;
            let message = remote.pilot.message.clone();
            self.settings.pilot_generation = generation;
            if !succeeded && !message.is_empty() {
                self.pilot_error(message, cx);
                return;
            }
            if let Some(state) = state {
                let first = self.settings.pilot_saved.is_none();
                let draft = draft(&state.profile);
                let image = photo(&state.profile);
                self.settings.pilot.update(cx, |editor, cx| {
                    if first {
                        editor.load_preserving_edits(draft, cx);
                    } else {
                        editor.mark_saved(draft, cx);
                    }
                    editor.set_saved_photo(image, cx);
                    editor.set_status(Some(message), cx);
                });
                self.settings.pilot_saved = Some(state);
                self.settings.pilot_photo = PhotoEdit::Unchanged;
            } else {
                self.settings.pilot_saved = None;
                self.settings.pilot_load = Load::New;
                self.settings.pilot_photo = PhotoEdit::Unchanged;
                self.settings.pilot_source = None;
                self.settings.pilot.update(cx, |editor, cx| {
                    editor.reset_for_load(cx);
                    editor.set_saved_photo(None, cx);
                    editor.set_status(Some(message), cx);
                });
            }
        }
        if self.settings.page == Page::Account
            && self.settings.pilot_load == Load::New
            && !self.remote.read(cx).busy()
            && self.demo.is_none()
            && self.capture.is_none()
        {
            self.settings.pilot_load = Load::Requested;
            self.remote
                .update(cx, |remote, cx| remote.request(Command::PilotLoad, cx));
        }
    }
    fn pilot_error(&mut self, message: String, cx: &mut Context<Self>) {
        self.settings
            .pilot
            .update(cx, |editor, cx| editor.set_status(Some(message), cx));
    }
    pub(super) fn pilot_event(
        &mut self,
        event: PilotEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if matches!(
            &event,
            PilotEvent::ChoosePhoto | PilotEvent::ApplyCrop(_) | PilotEvent::RemovePhoto
        ) && self.settings.pilot_saved.is_none()
        {
            return self.pilot_error(
                "Espera a que se cargue tu perfil antes de cambiar la foto.".into(),
                cx,
            );
        }
        match event {
            PilotEvent::OpenAccount => self.navigate(crate::Section::Account, cx),
            PilotEvent::Save(draft) => {
                let Some(state) = &self.settings.pilot_saved else {
                    return self.pilot_error(
                        "No se ha podido cargar tu perfil. Vuelve a abrir Ajustes para reintentar."
                            .into(),
                        cx,
                    );
                };
                if self.remote.read(cx).busy() {
                    return self.pilot_error(
                        "Espera a que termine la operación en curso y vuelve a guardar.".into(),
                        cx,
                    );
                }
                let mut profile = state.profile.clone();
                merge(
                    &mut profile,
                    &draft,
                    self.settings.pilot.read(cx).saved_draft(),
                );
                match &self.settings.pilot_photo {
                    PhotoEdit::Unchanged => {}
                    PhotoEdit::Remove => profile.photo = None,
                    PhotoEdit::Replace(photo) => profile.photo = Some(photo.clone()),
                }
                self.remote.update(cx, |remote, cx| {
                    remote.request(
                        Command::PilotSave {
                            profile,
                            expected_revision: state.revision,
                        },
                        cx,
                    );
                });
            }
            PilotEvent::RemovePhoto => {
                self.settings.pilot_photo = PhotoEdit::Remove;
                self.settings
                    .pilot
                    .update(cx, |editor, cx| editor.set_photo(None, cx));
            }
            PilotEvent::Discard => {
                self.settings.pilot_photo = PhotoEdit::Unchanged;
                self.settings.pilot_source = None;
            }
            PilotEvent::ChoosePhoto => self.pick_pilot_photo(window, cx),
            PilotEvent::ApplyCrop(crop) => self.crop_pilot_photo(crop, cx),
        }
    }
    fn pick_pilot_photo(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let generation = self.remote.read(cx).pilot.generation;
        let picker = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Selecciona una foto JPEG o PNG".into()),
        });
        cx.spawn_in(window, async move |this, cx| {
            let result = async {
                let paths = picker
                    .await
                    .map_err(|e| e.to_string())?
                    .map_err(|e| e.to_string())?;
                let Some(path) = paths.and_then(|p| p.into_iter().next()) else {
                    return Ok(None);
                };
                cx.background_executor()
                    .spawn(async move {
                        let bytes = crate::files::read(&path, 5 * 1024 * 1024)?;
                        let (width, height) = vantare_services::pilot::photo_dimensions(&bytes)
                            .map_err(|_| {
                                "Usa una foto JPEG/PNG de hasta 5 MiB y 4096 píxeles.".to_owned()
                            })?;
                        Ok::<_, String>(Some((bytes, width, height)))
                    })
                    .await
            }
            .await;
            let _ = this.update_in(cx, |hub, window, cx| {
                if hub.remote.read(cx).pilot.generation != generation {
                    return;
                }
                match result {
                    Ok(Some((bytes, width, height))) => {
                        let format = if bytes.starts_with(b"\x89PNG") {
                            gpui::ImageFormat::Png
                        } else {
                            gpui::ImageFormat::Jpeg
                        };
                        let image = Arc::new(gpui::Image::from_bytes(format, bytes.clone()));
                        hub.settings.pilot_source = Some(bytes);
                        hub.settings.pilot.update(cx, |editor, cx| {
                            editor.begin_crop(image, width, height, window, cx);
                        });
                    }
                    Ok(None) => hub.pilot_error("Selección cancelada.".into(), cx),
                    Err(error) => hub.pilot_error(error, cx),
                }
            });
        })
        .detach();
    }
    fn crop_pilot_photo(&mut self, crop: crate::pilot::Crop, cx: &mut Context<Self>) {
        let generation = self.remote.read(cx).pilot.generation;
        let Some(bytes) = self.settings.pilot_source.clone() else {
            return self.pilot_error("Selecciona de nuevo la foto.".into(), cx);
        };
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    vantare_services::pilot::crop_photo(
                        &bytes,
                        vantare_services::pilot::Crop {
                            x: crop.x,
                            y: crop.y,
                            size: crop.side,
                        },
                    )
                })
                .await;
            let _ = this.update(cx, |hub, cx| {
                if hub.remote.read(cx).pilot.generation != generation {
                    return;
                }
                match result {
                    Ok(value) => {
                        if let Some(state) = &mut hub.settings.pilot_saved {
                            let mut profile = state.profile.clone();
                            profile.photo = Some(value.clone());
                            let image = photo(&profile);
                            hub.settings.pilot_photo = PhotoEdit::Replace(value);
                            hub.settings
                                .pilot
                                .update(cx, |editor, cx| editor.set_photo(image, cx));
                            hub.settings.pilot_source = None;
                        }
                    }
                    Err(_) => hub.pilot_error(
                        "No se pudo recortar la foto. Prueba otra imagen.".into(),
                        cx,
                    ),
                }
            });
        })
        .detach();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    fn delayed_initial_load(edit_simulators: bool) {
        use gpui::AppContext;
        struct Root(std::path::PathBuf);
        impl Drop for Root {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        gpui_platform::application().run(move |cx| {
            crate::orbit::theme::apply(
                crate::orbit::theme::AppearanceSettings::default(),
                gpui::WindowAppearance::Dark,
                cx,
            );
            // This QA window never shows; also keep its creation bounds away
            // from every monitor so the tests obey the capture screen policy.
            let left = cx
                .displays()
                .iter()
                .map(|display| f32::from(display.bounds().origin.x))
                .reduce(f32::min)
                .expect("monitor de la sesión QA")
                - 2048.0
                - 640.0;
            let _window = cx
                .open_window(
                    gpui::WindowOptions {
                        window_bounds: Some(gpui::WindowBounds::Windowed(gpui::Bounds::new(
                            gpui::point(gpui::px(left), gpui::px(0.0)),
                            gpui::size(gpui::px(640.0), gpui::px(480.0)),
                        ))),
                        kind: gpui::WindowKind::PopUp,
                        focus: false,
                        show: false,
                        ..Default::default()
                    },
                    |window, cx| {
                        let path = std::env::temp_dir().join(format!(
                            "vantare-pilot-initial-{}-{edit_simulators}",
                            std::process::id()
                        ));
                        std::fs::create_dir(&path).expect("QA exclusiva");
                        let root = Root(path);
                        let root = &root.0;
                        let original = PilotProfile {
                            public_name: "Ana".into(),
                            description: "Resistencia local".into(),
                            country: Some("ES".into()),
                            simulators: vec!["lmu".into()],
                            favorite_car: "Porsche".into(),
                            favorite_team: "Equipo QA".into(),
                            ..Default::default()
                        };
                        let mut local =
                            vantare_services::pilot::Local::open(root, None, None).expect("abrir");
                        local
                            .save(original.clone(), 0)
                            .expect("perfil previo en disco");
                        drop(local);
                        let mut local = vantare_services::pilot::Local::open(root, None, None)
                            .expect("reiniciar");
                        let loaded = local.state().clone();
                        let editor = cx.new(|cx| {
                            crate::pilot::view::initial_load_tests::delayed_load(
                                &draft(&loaded.profile),
                                edit_simulators,
                                window,
                                cx,
                            )
                        });
                        let mut profile = loaded.profile;
                        merge(
                            &mut profile,
                            &editor.read(cx).draft(cx).trimmed(),
                            editor.read(cx).saved_draft(),
                        );
                        let mut expected = original;
                        if edit_simulators {
                            expected.simulators = vec!["acc".into()];
                        } else {
                            expected.public_name = "Bea".into();
                        }
                        assert_eq!(
                            profile, expected,
                            "editar un campo antes de PilotLoad debe conservar el resto al guardar"
                        );
                        local
                            .save(profile, loaded.revision)
                            .expect("guardar edición");
                        drop(local);
                        let reopened = vantare_services::pilot::Local::open(root, None, None)
                            .expect("reabrir");
                        assert_eq!(
                            reopened.state().profile,
                            expected,
                            "perfil completo durable tras reapertura"
                        );
                        editor
                    },
                )
                .expect("ventana GPUI QA oculta");
            cx.quit();
        });
    }
    #[cfg(windows)]
    #[test]
    fn initial_pilot_load_name_edit_preserves_saved_local_fields() {
        delayed_initial_load(false);
    }
    #[cfg(windows)]
    #[test]
    fn initial_pilot_load_simulator_edit_preserves_saved_local_fields() {
        delayed_initial_load(true);
    }
    #[test]
    fn saving_only_name_keeps_untouched_fields_from_the_current_profile() {
        let mut profile = PilotProfile {
            public_name: "Ana".into(),
            description: "  Resistencia local  ".into(),
            country: Some("ES".into()),
            simulators: vec!["acc".into(), "lmu".into(), "future-sim".into()],
            favorite_car: "Porsche".into(),
            favorite_team: "Equipo QA".into(),
            ..Default::default()
        };
        let baseline = draft(&profile);
        let mut edited = baseline.trimmed();
        edited.public_name = "Bea".into();
        edited.simulators.swap(0, 1); // Orden del catálogo UI: no es edición del usuario.
        profile.description = "Datos locales posteriores".into();
        profile.country = Some("NZ".into());
        profile.favorite_car = "BMW".into();
        profile.favorite_team = "Otro equipo".into();
        profile
            .extensions
            .insert("future".into(), serde_json::json!(true));
        let mut expected = profile.clone();
        expected.public_name = "Bea".into();
        merge(&mut profile, &edited, &baseline);
        assert_eq!(profile, expected, "Guardar solo modifica el campo editado");
    }

    #[test]
    fn saving_explicitly_cleared_fields_keeps_the_clears() {
        let mut profile = PilotProfile {
            public_name: "Ana".into(),
            description: "Resistencia local".into(),
            country: Some("ES".into()),
            simulators: vec!["lmu".into()],
            favorite_car: "Porsche".into(),
            favorite_team: "Equipo QA".into(),
            ..Default::default()
        };
        let baseline = draft(&profile);
        let edited = Draft {
            public_name: "Ana".into(),
            ..Default::default()
        };
        merge(&mut profile, &edited, &baseline);
        assert_eq!(
            draft(&profile),
            edited,
            "Vaciar un campo ya cargado es una edición explícita"
        );
    }
    #[test]
    fn editing_preserves_photo_and_future_fields() {
        let mut profile = PilotProfile::default();
        profile
            .extensions
            .insert("future_team".into(), serde_json::json!(["A"]));
        profile.photo = Some(vantare_ipc::services_protocol::pilot_document::PilotPhoto {
            jpeg: "fixture".into(),
        });
        let original = profile.photo.clone();
        let baseline = draft(&profile);
        merge(
            &mut profile,
            &Draft {
                public_name: "Piloto".into(),
                country: Some("ES".into()),
                ..Default::default()
            },
            &baseline,
        );
        assert_eq!(profile.photo, original);
        assert_eq!(profile.extensions["future_team"], serde_json::json!(["A"]));
        assert_eq!(draft(&profile).public_name, "Piloto");
    }
}
