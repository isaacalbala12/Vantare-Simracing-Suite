//! Ajustes persistidos y último estado publicado; no arranca procesos.
use crate::{
    engineer_control::{self as control, Document, Settings, Status},
    shell::button,
};
use gpui::{Context, IntoElement, Render, Window, div, prelude::*};
use std::{path::PathBuf, time::SystemTime};

pub struct Engineer {
    document: Document,
    status_path: PathBuf,
    stamp: Option<SystemTime>,
    status: Option<Status>,
    loaded: bool,
    pub error: Option<String>,
    status_error: Option<String>,
}
impl Engineer {
    pub fn load(path: PathBuf) -> Self {
        let status_path = control::status_path(&path);
        let mut document = Document::new(path, Settings::default());
        let error = document.poll().err().map(|error| error.to_string());
        Self {
            document,
            status_path,
            stamp: None,
            status: None,
            loaded: false,
            error,
            status_error: None,
        }
    }
    pub fn settings(&self) -> &Settings {
        self.document.settings()
    }
    pub fn status(&self) -> Option<&Status> {
        self.status.as_ref()
    }
    pub fn change(&mut self, edit: impl FnOnce(&mut Settings)) -> Result<(), String> {
        let mut next = self.settings().clone();
        edit(&mut next);
        self.document.save(next).map_err(|error| error.to_string())
    }
    pub fn reload(&mut self) -> Result<(), String> {
        self.document.reload().map_err(|error| error.to_string())
    }
    pub fn poll(&mut self) -> bool {
        let stamp = control::modified(&self.status_path);
        if self.loaded && stamp == self.stamp && self.status_error.is_none() {
            return false;
        }
        let previous = (self.status.clone(), self.status_error.clone());
        match control::read(&self.status_path)
            .and_then(|bytes| bytes.as_deref().map(Status::parse).transpose())
        {
            Ok(status) => {
                self.loaded = true;
                self.status = status;
                self.stamp = stamp;
                self.status_error = None;
            }
            Err(error) => {
                self.status_error = Some(format!("estado: {error}; se conserva el último válido"));
            }
        }
        previous != (self.status.clone(), self.status_error.clone())
    }
    fn edit(&mut self, edit: impl FnOnce(&mut Settings), cx: &mut Context<Self>) {
        self.error = self.change(edit).err();
        cx.notify();
    }
}

impl Render for Engineer {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let settings = self.settings();
        let mut view = div()
            .id("engineer-section")
            .flex()
            .flex_col()
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .gap_2()
            .child(format!(
                "Radio: {} · Locale: {} · Voz local: {}",
                settings.enabled, settings.locale, settings.voice
            ))
            .child(
                button("engineer-enable", "Activar / desactivar radio").on_click(
                    cx.listener(|this, _, _, cx| this.edit(|s| s.enabled = !s.enabled, cx)),
                ),
            )
            .child(
                button("engineer-voice", "Activar / desactivar voz local")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(|s| s.voice = !s.voice, cx))),
            )
            .child(
                button("engineer-reload", "Recargar ajustes de disco").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.error = this.reload().err();
                        cx.notify();
                    },
                )),
            );
        for &locale in control::LOCALES {
            view = view.child(button(locale, locale).on_click(
                cx.listener(move |this, _, _, cx| this.edit(|s| s.locale = locale.into(), cx)),
            ));
        }
        for (id, label, enabled) in [
            ("engineer-fuel", "Combustible", settings.families.fuel),
            ("engineer-flags", "Banderas", settings.families.flags),
            (
                "engineer-pits",
                "Entrada / salida de boxes",
                settings.families.pitstops,
            ),
            (
                "engineer-laps",
                "Vueltas completadas",
                settings.families.laps,
            ),
        ] {
            view = view.child(
                div()
                    .flex()
                    .gap_2()
                    .child(format!("{label}: {enabled}"))
                    .child(
                        button(id, label).on_click(cx.listener(move |this, _, _, cx| {
                            this.edit(
                                |s| match id {
                                    "engineer-fuel" => s.families.fuel = !s.families.fuel,
                                    "engineer-flags" => s.families.flags = !s.families.flags,
                                    "engineer-pits" => s.families.pitstops = !s.families.pitstops,
                                    _ => s.families.laps = !s.families.laps,
                                },
                                cx,
                            );
                        })),
                    ),
            );
        }
        view = view.child("Spotter no disponible: falta velocidad de rivales. Volumen, elección de voz, penalties y timings no tienen control nativo. La voz usa --clips y el volumen de Windows.")
            .child("Guardar ajustes no inicia Engineer. Arrancar con el launcher --engineer CURSOR; los cambios se aplican mientras esté en marcha.")
            .when_some(self.error.clone(), gpui::ParentElement::child)
            .when_some(self.status_error.clone(), gpui::ParentElement::child);
        if let Some(status) = &self.status {
            view = view.child(format!("Último estado publicado: proceso {} · activo {} · radio {} · locale {} · voz {}", status.pid, status.active, status.settings.enabled, status.settings.locale, status.settings.voice))
                .child("El estado es el último informe, no una prueba de vida tras muerte abrupta. Un cierre ordenado publica activo=false.");
            for (locale, present) in &status.assets {
                view = view.child(format!("Clips completos y válidos {locale}: {present}"));
            }
            if let Some(message) = &status.last_message {
                view = view.child(format!(
                    "Última radio ({}): {} · {}",
                    message.locale, message.intent, message.text
                ));
            }
            view = view.when_some(status.error.clone(), gpui::ParentElement::child);
            if status.settings != *settings {
                view = view.child("Ajustes guardados pendientes de confirmación por Engineer.");
            }
        } else {
            view = view.child("Sin estado publicado por Engineer.");
        }
        view
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editor_conflicts_and_invalid_status_preserve_observed_values() {
        let root = std::env::temp_dir().join(format!("hub-engineer-{}", std::process::id()));
        std::fs::create_dir(&root).expect("temporal");
        let path = root.join("engineer.json");
        let mut first = Engineer::load(path.clone());
        first.change(|s| s.locale = "it".into()).expect("guardar");
        let mut second = Engineer::load(path.clone());
        first.change(|s| s.enabled = false).expect("primer editor");
        assert!(second.change(|s| s.voice = true).is_err());
        assert_eq!(second.settings().locale, "it");
        second.reload().expect("recargar");
        assert!(!second.settings().enabled);
        let status = Status {
            version: 1,
            pid: 7,
            active: true,
            settings: second.settings().clone(),
            assets: control::LOCALES
                .iter()
                .map(|l| ((*l).into(), false))
                .collect(),
            last_message: None,
            error: None,
        };
        let bytes = serde_json::to_vec(&status.json()).expect("json");
        control::save(&second.status_path, None, &bytes).expect("publicar");
        assert!(second.poll());
        assert_eq!(second.status(), Some(&status));
        std::fs::write(&second.status_path, b"{").expect("inválido");
        second.stamp = None;
        assert!(second.poll());
        assert_eq!(second.status(), Some(&status));
        assert!(second.status_error.is_some());
        control::save(&second.status_path, Some(b"{"), &bytes).expect("recuperar");
        assert!(second.poll());
        assert!(second.status_error.is_none());
        for file in [
            path.clone(),
            path.with_extension("json.lock"),
            second.status_path.clone(),
            second.status_path.with_extension("json.lock"),
        ] {
            std::fs::remove_file(file).expect("limpiar");
        }
        std::fs::remove_dir(root).expect("limpiar temporal");
    }
}
