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
fn merge(profile: &mut PilotProfile, draft: Draft) {
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
        let generation = remote.pilot_generation;
        if generation != self.settings.pilot_generation {
            let state = remote.pilot.clone();
            let succeeded = remote.pilot_result == crate::services::view::PilotResult::Loaded;
            let message = remote.pilot_message.clone();
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
                    editor.load(Draft::default(), cx);
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
                merge(&mut profile, draft);
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
        let generation = self.remote.read(cx).pilot_generation;
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
                if hub.remote.read(cx).pilot_generation != generation {
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
        let generation = self.remote.read(cx).pilot_generation;
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
                if hub.remote.read(cx).pilot_generation != generation {
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
        merge(
            &mut profile,
            Draft {
                public_name: "Piloto".into(),
                country: Some("ES".into()),
                ..Default::default()
            },
        );
        assert_eq!(profile.photo, original);
        assert_eq!(profile.extensions["future_team"], serde_json::json!(["A"]));
        assert_eq!(draft(&profile).public_name, "Piloto");
    }
}
