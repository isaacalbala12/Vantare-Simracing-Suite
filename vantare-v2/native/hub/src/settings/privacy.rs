//! Usa el mismo guardado atómico y detección de conflictos que los demás ajustes.
use crate::orbit;
use gpui::{Context, Div, FocusHandle, Stateful, Window, div, prelude::*, px, rgb};
use std::path::{Path, PathBuf};
use vantare_services::diagnostics::{PRIVACY_FILE, Privacy};

// El Hub aún muestra la interfaz en español; el idioma de widgets es independiente.
const PRIVACY_POLICY_URL: &str = "https://vantare.app/privacidad";

pub(super) fn policy_link(id: &'static str, focus: &FocusHandle, cx: &gpui::App) -> Stateful<Div> {
    orbit::button(id, "Política de privacidad", cx)
        .track_focus(focus)
        .on_click(|_, _, cx| cx.open_url(PRIVACY_POLICY_URL))
        .on_key_down(|event, _, cx| {
            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                cx.open_url(PRIVACY_POLICY_URL);
                cx.stop_propagation();
            }
        })
}

pub(super) struct Store {
    pub value: Privacy,
    path: PathBuf,
    observed: Option<Vec<u8>>,
}
impl Store {
    pub fn load(root: &Path) -> Result<Self, String> {
        let path = root.join(PRIVACY_FILE);
        let observed = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("leer privacidad: {error}")),
        };
        let value = Privacy::load(root).map_err(|error| format!("leer privacidad: {error}"))?;
        value
            .discard_disabled(root)
            .map_err(|error| format!("borrar informes pendientes: {error}"))?;
        Ok(Self {
            value,
            path,
            observed,
        })
    }
    pub fn save(&mut self, value: Privacy) -> Result<(), String> {
        let root = self
            .path
            .parent()
            .ok_or("ruta de privacidad sin directorio")?;
        // Antes de aceptar, elimina informes recogidos sin la nueva decisión.
        self.value
            .discard_disabled(root)
            .map_err(|error| format!("borrar informes pendientes: {error}"))?;
        value
            .discard_disabled(root)
            .map_err(|error| format!("borrar informes pendientes: {error}"))?;
        let bytes =
            serde_json::to_vec(&value).map_err(|error| format!("guardar privacidad: {error}"))?;
        crate::files::save(&self.path, &bytes, self.observed.as_deref())?;
        self.observed = Some(bytes);
        self.value = value;
        Ok(())
    }
}

impl super::Hub {
    pub(in crate::shell) fn privacy_question_pending(&self) -> bool {
        self.demo.is_none()
            && self.capture.is_none()
            && self
                .settings
                .privacy
                .as_ref()
                .is_ok_and(|store| !store.value.crashes_decided)
    }

    fn decide_crashes(&mut self, accept: bool, window: &mut Window, cx: &mut Context<Self>) {
        if let Ok(store) = &mut self.settings.privacy {
            let mut next = store.value;
            next.crashes = accept;
            next.crashes_decided = true;
            self.settings.status = store.save(next).err();
            if self.settings.status.is_none() {
                self.focus.focus(window, cx);
            }
        }
        cx.notify();
    }

    pub(in crate::shell) fn privacy_question(
        &self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let targets = &self.settings.consent_focus;
        if !targets
            .iter()
            .any(|focus| focus.contains_focused(window, cx))
        {
            targets[0].focus(window, cx);
        }
        let mut actions = div().flex().flex_wrap().gap(px(12.0));
        // Mismo estilo y acceso por teclado para ambas decisiones; foco inicial en rechazar.
        for (index, accept, label) in [(0, false, "No, gracias"), (1, true, "Aceptar")] {
            actions = actions.child(
                orbit::button(format!("crash-consent-{index}"), label, cx)
                    .track_focus(&targets[index])
                    .on_click(cx.listener(move |hub, _, window, cx| {
                        hub.decide_crashes(accept, window, cx);
                    }))
                    .on_key_down(cx.listener(
                        move |hub, event: &gpui::KeyDownEvent, window, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                hub.decide_crashes(accept, window, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
            );
        }
        let policy = policy_link("crash-consent-policy", &targets[2], cx);
        let body = orbit::card_body().gap(px(16.0))
            .child(orbit::text("¿Quieres enviar informes de fallos para ayudarnos a corregir errores?", 16.0, 600, orbit::skin(cx).text1, cx))
            .child(orbit::text("Solo si aceptas, Vantare enviará a PostHog (Unión Europea) la versión de la app, el sistema operativo, el código del fallo y direcciones numéricas de la pila. Sin mensajes, rutas, nombre de usuario ni identificador personal.", 13.0, 400, orbit::skin(cx).text2, cx))
            .child(orbit::text("Es opcional. Puedes usar Vantare si rechazas y cambiar tu decisión en Ajustes › Privacidad. Esta elección no cambia los datos de uso, que se gestionan por separado.", 13.0, 400, orbit::skin(cx).text2, cx))
            .child(policy)
            .when_some(self.settings.status.as_ref(), |body, error| body.child(orbit::text(format!("No se pudo guardar tu decisión: {error}. Los informes siguen desactivados."), 13.0, 400, orbit::skin(cx).text1, cx)))
            .child(actions);
        div()
            .id("crash-consent-screen")
            .size_full()
            .bg(rgb(orbit::skin(cx).bg))
            .flex()
            .items_center()
            .justify_center()
            .p(px(24.0))
            .capture_key_down(cx.listener(|hub, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "tab" {
                    let targets = &hub.settings.consent_focus;
                    let current = targets
                        .iter()
                        .position(|focus| focus.contains_focused(window, cx));
                    let index = if event.keystroke.modifiers.shift {
                        current.map_or(targets.len() - 1, |index| {
                            (index + targets.len() - 1) % targets.len()
                        })
                    } else {
                        current.map_or(0, |index| (index + 1) % targets.len())
                    };
                    targets[index].focus(window, cx);
                    cx.stop_propagation();
                }
            }))
            .child(
                orbit::neo_card(cx)
                    .child(orbit::card_header("Tu privacidad", cx))
                    .id("crash-consent-card")
                    .role(gpui::Role::Dialog)
                    .aria_label("Consentimiento para informes de fallos")
                    .w(px(560.0))
                    .max_w_full()
                    .max_h_full()
                    .overflow_y_scroll()
                    .child(body),
            )
    }

    pub(super) fn settings_privacy_toggle(&mut self, usage: bool, cx: &mut gpui::Context<Self>) {
        if let Ok(store) = &mut self.settings.privacy {
            let mut next = store.value;
            if usage {
                next.usage = !next.usage;
            } else {
                next.crashes = !next.crashes;
                next.crashes_decided = true;
            }
            self.settings.status = store.save(next).err();
        }
        cx.notify();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn first_choice_migrates_legacy_and_survives_restart_and_revocation() {
        for accept in [false, true] {
            let path = std::env::temp_dir().join(format!(
                "vantare-consent-{}",
                vantare_services::random_id().expect("entropy")
            ));
            std::fs::create_dir_all(path.join("crashes")).expect("queue");
            std::fs::write(
                path.join(PRIVACY_FILE),
                serde_json::to_vec(&serde_json::json!({"crashes":accept,"usage":true}))
                    .expect("legacy json"),
            )
            .expect("legacy");
            std::fs::write(path.join("crashes/00.json"), b"old crash").expect("pending");
            let mut store = Store::load(&path).expect("migrate");
            assert!(!store.value.crashes);
            assert!(!store.value.crashes_decided);
            assert!(store.value.usage);
            assert!(!path.join("crashes/00.json").exists());
            let mut next = store.value;
            next.crashes = accept;
            next.crashes_decided = true;
            store.save(next).expect("choice");
            let mut reopened = Store::load(&path).expect("restart");
            assert_eq!(reopened.value, next);
            std::fs::write(path.join("crashes/00.json"), b"pending").expect("pending");
            next.crashes = false;
            reopened.save(next).expect("revoke");
            assert!(!path.join("crashes/00.json").exists());
            assert!(Store::load(&path).expect("restart").value.crashes_decided);
            std::fs::remove_dir_all(path).expect("cleanup");
        }
    }

    #[test]
    fn new_installation_persists_acceptance_or_rejection_without_enabling_usage() {
        for accept in [false, true] {
            let path = std::env::temp_dir().join(format!(
                "vantare-consent-{}",
                vantare_services::random_id().expect("entropy")
            ));
            let mut store = Store::load(&path).expect("new installation");
            assert_eq!(store.value, Privacy::default());
            store
                .save(Privacy {
                    crashes: accept,
                    usage: false,
                    crashes_decided: true,
                })
                .expect("choice");
            let saved = Store::load(&path).expect("restart").value;
            assert_eq!(saved.crashes, accept);
            assert!(saved.crashes_decided);
            assert!(!saved.usage);
            std::fs::remove_dir_all(path).expect("cleanup");
        }
    }

    #[test]
    fn failed_first_choice_keeps_reports_disabled_and_question_pending() {
        let path = std::env::temp_dir().join(format!(
            "vantare-consent-{}",
            vantare_services::random_id().expect("entropy")
        ));
        let mut store = Store::load(&path).expect("load");
        std::fs::create_dir_all(path.join(PRIVACY_FILE)).expect("block save");
        assert!(
            store
                .save(Privacy {
                    crashes: true,
                    usage: false,
                    crashes_decided: true
                })
                .is_err()
        );
        assert_eq!(store.value, Privacy::default());
        std::fs::remove_dir_all(path).expect("cleanup");
    }
    #[test]
    fn persists_both_switches_and_preserves_changes_on_conflict() {
        let path = std::env::temp_dir().join(format!(
            "vantare-privacy-{}",
            vantare_services::random_id().expect("entropy")
        ));
        let mut first = Store::load(&path).expect("load");
        let mut second = Store::load(&path).expect("load");
        assert_eq!(first.value, Privacy::default());
        let next = Privacy {
            crashes: false,
            usage: true,
            crashes_decided: true,
        };
        first.save(next).expect("save");
        assert_eq!(Store::load(&path).expect("reload").value, next);
        assert!(second.save(Privacy::default()).is_err());
        assert_eq!(Store::load(&path).expect("reload").value, next);
        std::fs::write(path.join(PRIVACY_FILE), b"invalid").expect("invalid config");
        assert!(Store::load(&path).is_err());
        std::fs::remove_dir_all(path).expect("cleanup");
    }
}
