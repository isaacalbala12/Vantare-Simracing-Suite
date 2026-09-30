//! Ajustes persistidos y último estado publicado; no arranca procesos.
use crate::{
    engineer_control::{self as control, Document, Settings, Status},
    orbit,
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

impl Engineer {
    fn locale_choices(&self, cx: &Context<Self>) -> gpui::Div {
        let settings = self.settings();
        let mut locales = div().flex().flex_wrap().gap(gpui::px(orbit::GUTTER / 4.0));
        for &locale in control::LOCALES {
            locales = locales.child(
                orbit::select(
                    locale,
                    &format!(
                        "{locale}{}",
                        if settings.locale == locale {
                            " ✓"
                        } else {
                            ""
                        }
                    ),
                )
                .on_click(
                    cx.listener(move |this, _, _, cx| this.edit(|s| s.locale = locale.into(), cx)),
                ),
            );
        }
        locales
    }

    fn status_view(&self) -> gpui::Div {
        let mut status_body = orbit::card_body();
        if let Some(status) = &self.status {
            status_body = status_body
                .child(orbit::setting_row("Último informe", "Un cierre ordenado publica activo=false; no acredita vida tras una muerte abrupta.",
                    orbit::text(format!("PID {} · activo {}", status.pid, status.active), 13.5, 600, orbit::INK_2)))
                .child(orbit::setting_row("Radio publicada", "Valores confirmados en el informe del proceso.",
                    orbit::text(format!("{} · {} · voz {}", status.settings.enabled, status.settings.locale, status.settings.voice), 13.5, 600, orbit::INK_2)));
            for (locale, present) in &status.assets {
                status_body = status_body.child(orbit::setting_row(
                    &format!("Clips {locale}"),
                    "Conjunto completo y válido.",
                    orbit::text(
                        if *present {
                            "Disponible"
                        } else {
                            "No disponible"
                        },
                        12.0,
                        600,
                        orbit::INK_2,
                    ),
                ));
            }
            if let Some(message) = &status.last_message {
                status_body = status_body.child(orbit::callout(format!(
                    "Última radio ({}): {} · {}",
                    message.locale, message.intent, message.text
                )));
            }
            status_body = status_body.when_some(status.error.clone(), |body, error| {
                body.child(orbit::callout(error))
            });
            if status.settings != *self.settings() {
                status_body = status_body.child(orbit::callout(
                    "Ajustes guardados pendientes de confirmación por Engineer.",
                ));
            }
        } else {
            status_body = status_body.child(orbit::callout("Sin estado publicado por Engineer."));
        }
        orbit::card("Estado y última radio").child(status_body)
    }
}

impl Render for Engineer {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let settings = self.settings();
        let locales = self.locale_choices(cx);
        let controls = orbit::card("Radio y voz local")
            .flex_1()
            .min_w(gpui::px(orbit::COLUMN_W))
            .child(
                orbit::card_body()
                    .child(orbit::setting_row(
                        "Engineer",
                        "Mensajes de radio de las familias activas.",
                        orbit::toggle("engineer-enable", "Activar radio", settings.enabled, true)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.edit(|s| s.enabled = !s.enabled, cx);
                            })),
                    ))
                    .child(orbit::setting_row(
                        "Voz local",
                        "Reproduce los clips disponibles en este equipo.",
                        orbit::toggle("engineer-voice", "Activar voz local", settings.voice, true)
                            .on_click(
                                cx.listener(|this, _, _, cx| this.edit(|s| s.voice = !s.voice, cx)),
                            ),
                    ))
                    .child(orbit::eyebrow("Idioma de radio"))
                    .child(locales)
                    .child(orbit::setting_row(
                        "Ajustes guardados",
                        "Recupera la versión actual del disco.",
                        orbit::button("engineer-reload", "Recargar").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.error = this.reload().err();
                                cx.notify();
                            },
                        )),
                    )),
            );
        let mut families = orbit::card_body();
        for (id, label, help, enabled) in [
            (
                "engineer-fuel",
                "Combustible",
                "Avisos de combustible disponible.",
                settings.families.fuel,
            ),
            (
                "engineer-flags",
                "Banderas",
                "Cambios de bandera observados.",
                settings.families.flags,
            ),
            (
                "engineer-pits",
                "Boxes",
                "Entrada y salida de boxes.",
                settings.families.pitstops,
            ),
            (
                "engineer-laps",
                "Vueltas",
                "Vueltas completadas.",
                settings.families.laps,
            ),
        ] {
            families = families.child(orbit::setting_row(
                label,
                help,
                orbit::toggle(id, label, enabled, true).on_click(cx.listener(
                    move |this, _, _, cx| {
                        this.edit(
                            |s| match id {
                                "engineer-fuel" => s.families.fuel = !s.families.fuel,
                                "engineer-flags" => s.families.flags = !s.families.flags,
                                "engineer-pits" => s.families.pitstops = !s.families.pitstops,
                                _ => s.families.laps = !s.families.laps,
                            },
                            cx,
                        );
                    },
                )),
            ));
        }
        div().id("engineer-section").flex().flex_col().gap(gpui::px(orbit::GUTTER / 2.0))
            .child(div().flex().flex_wrap().gap(gpui::px(orbit::GUTTER / 2.0)).child(controls)
                .child(orbit::card("Familias de mensajes").flex_1().min_w(gpui::px(orbit::COLUMN_W)).child(families)))
            .child(self.status_view())
            .child(orbit::callout("Guardar ajustes no inicia Engineer. Arrancar con el launcher --engineer CURSOR; los cambios se aplican mientras esté en marcha."))
            .child(orbit::callout("Spotter no disponible: falta velocidad de rivales. Volumen, elección de voz, penalties y timings no tienen control nativo. La voz usa --clips y el volumen de Windows."))
            .when_some(self.error.clone(), |view, error| view.child(orbit::callout(error)))
            .when_some(self.status_error.clone(), |view, error| view.child(orbit::callout(error)))
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
