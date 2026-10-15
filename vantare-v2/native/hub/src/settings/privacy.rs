//! Usa el mismo guardado atómico y detección de conflictos que los demás ajustes.
use crate::orbit;
use gpui::{Context, Div, FocusHandle, Stateful, Window, div, prelude::*, px};
use std::path::{Path, PathBuf};
use vantare_services::diagnostics::{ConsentSaveError, PRIVACY_FILE, Privacy};
#[path = "privacy_cleanup.rs"]
mod cleanup;

// El Hub aún muestra la interfaz en español; el idioma de widgets es independiente.
const PRIVACY_POLICY_URL: &str = "https://vantare.app/privacidad";

/// Qué se envía y qué no en un informe de fallos. Una sola redacción para el
/// aviso del primer arranque y el paso de privacidad del asistente (#1628).
pub(in crate::shell) const CRASH_REPORT_WHAT: &str = "la versión de la app, el sistema operativo, el código del fallo y direcciones numéricas de la pila. Sin mensajes, rutas, nombre de usuario ni identificador personal.";

fn resolve_root(data: &Path, default_hub: &Path, shared: PathBuf) -> PathBuf {
    if data == default_hub {
        shared
    } else {
        data.to_path_buf()
    }
}

pub(super) fn root(data: &Path) -> Result<PathBuf, String> {
    let base = vantare_ui::paths::default_data_dir().map_err(str::to_owned)?;
    let shared = vantare_services::diagnostics::data_root().map_err(|error| error.to_string())?;
    Ok(resolve_root(data, &base.join("VantareNative/hub"), shared))
}

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

pub(in crate::shell) struct Store {
    pub value: Privacy,
    path: PathBuf,
    observed: Option<Vec<u8>>,
    cleanup: Option<cleanup::Cleanup>,
}
impl Store {
    fn read(root: &Path) -> Result<Self, String> {
        let path = root.join(PRIVACY_FILE);
        let observed = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("leer privacidad: {error}")),
        };
        let value = Privacy::load(root).map_err(|error| format!("leer privacidad: {error}"))?;
        Ok(Self {
            value,
            path,
            observed,
            cleanup: None,
        })
    }
    pub fn load(root: &Path) -> Result<Self, String> {
        let mut store = Self::read(root)?;
        let import = if store.value.usage_decided {
            None
        } else {
            vantare_services::diagnostics::installer::choice(root)
                .map_err(|error| format!("leer elección del instalador: {error}"))?
        };
        let mut deferred = match store.value.discard_disabled(root) {
            Ok(()) => false,
            Err(vantare_services::Error::Busy) => true,
            Err(error) => return Err(format!("borrar informes pendientes: {error}")),
        };
        if !deferred && let Some(usage) = import {
            let mut next = store.value;
            next.usage = usage;
            next.usage_decided = true;
            match store.save_typed(next) {
                Ok(()) => {}
                Err(ConsentSaveError::Busy) => deferred = true,
                Err(error) => return Err(error.to_string()),
            }
        }
        if deferred {
            store.cleanup = Some(cleanup::Cleanup::start(
                root.to_owned(),
                import,
                store.observed.clone(),
            )?);
        }
        Ok(store)
    }
    fn poll(&mut self) -> Option<Result<(), String>> {
        let worker = self.cleanup.as_ref()?;
        let unchanged = worker.unchanged(self.observed.as_deref());
        let result = worker.poll()?;
        drop(self.cleanup.take());
        if !unchanged {
            // Una respuesta anterior no sustituye una decisión manual posterior.
            return None;
        }
        Some(result.map(|(value, observed)| {
            self.value = value;
            self.observed = observed;
        }))
    }
    pub fn save(&mut self, value: Privacy) -> Result<(), String> {
        self.save_typed(value).map_err(|error| error.to_string())
    }
    fn save_typed(&mut self, value: Privacy) -> Result<(), ConsentSaveError> {
        let root = self
            .path
            .parent()
            .ok_or_else(|| ConsentSaveError::Failed("ruta de privacidad sin directorio".into()))?;
        let mut saved = None;
        let next = Privacy::try_save_with(root, value, |next| {
            let bytes = serde_json::to_vec(&next)
                .map_err(|error| format!("guardar privacidad: {error}"))?;
            crate::files::save(&self.path, &bytes, self.observed.as_deref())?;
            saved = Some(bytes);
            Ok(())
        })?;
        self.observed = saved;
        self.value = next;
        Ok(())
    }
}

impl Drop for Store {
    fn drop(&mut self) {
        // Cancela y reúne el reintento antes de liberar el estado de privacidad.
        drop(self.cleanup.take());
    }
}

impl super::Hub {
    pub(in crate::shell) fn poll_privacy(&mut self, cx: &mut gpui::Context<Self>) {
        if let Ok(store) = &mut self.settings.privacy
            && let Some(result) = store.poll()
        {
            if let Err(error) = result {
                self.settings.status = Some(error);
            } else {
                vantare_ui::analytics::consent(cx, store.value);
                self.analytics
                    .consent(vantare_ui::analytics::generation(cx));
            }
            cx.notify();
        }
    }

    pub(in crate::shell) fn privacy_question_pending(&self) -> bool {
        self.demo.is_none()
            && self.capture.is_none()
            && self
                .settings
                .privacy
                .as_ref()
                .is_ok_and(|store| !store.value.crashes_decided || !store.value.usage_decided)
    }

    fn consent_targets(&self) -> &[FocusHandle] {
        if self
            .settings
            .privacy
            .as_ref()
            .is_ok_and(|store| store.value.crashes_decided)
        {
            &self.settings.consent_focus[..]
        } else {
            &self.settings.consent_focus[..3]
        }
    }

    fn decide_privacy(&mut self, accept: bool, window: &mut Window, cx: &mut Context<Self>) {
        if let Ok(store) = &mut self.settings.privacy {
            let mut next = store.value;
            if next.crashes_decided {
                next.usage = accept && self.settings.usage_choice.read(cx).checked;
                next.usage_decided = true;
            } else {
                next.crashes = accept;
                next.crashes_decided = true;
            }
            let usage_activated = next.usage && !store.value.usage;
            self.settings.status = store.save(next).err();
            if self.settings.status.is_none() {
                vantare_ui::analytics::consent(cx, store.value);
                if usage_activated {
                    vantare_ui::analytics::record_once(
                        cx,
                        &vantare_services::diagnostics::Usage::UsageOptIn {},
                    );
                }
                self.analytics
                    .consent(vantare_ui::analytics::generation(cx));
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
        let asking_usage = self
            .settings
            .privacy
            .as_ref()
            .is_ok_and(|store| store.value.crashes_decided);
        let targets = self.consent_targets();
        if !targets
            .iter()
            .any(|focus| focus.contains_focused(window, cx))
        {
            targets[0].focus(window, cx);
        }
        let mut actions = div().flex().flex_wrap().gap(px(12.0));
        // Mismo estilo y acceso por teclado para ambas decisiones; foco inicial en rechazar.
        for (index, accept, label) in [
            (0, false, "No, gracias"),
            (1, true, if asking_usage { "Continuar" } else { "Aceptar" }),
        ] {
            actions = actions.child(
                orbit::button(format!("crash-consent-{index}"), label, cx)
                    .track_focus(&targets[index])
                    .on_click(cx.listener(move |hub, _, window, cx| {
                        hub.decide_privacy(accept, window, cx);
                    }))
                    .on_key_down(cx.listener(
                        move |hub, event: &gpui::KeyDownEvent, window, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                hub.decide_privacy(accept, window, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
            );
        }
        let policy = policy_link("crash-consent-policy", &targets[2], cx);
        let question = if asking_usage {
            "¿Quieres compartir datos de uso para mejorar Vantare?"
        } else {
            "¿Quieres enviar informes de fallos para ayudarnos a corregir errores?"
        };
        let description = if asking_usage {
            "Solo si marcas la casilla, enviaremos a PostHog (Unión Europea) páginas, funciones, tipos de widgets y tiempo de uso, además de instalación, sesión de cuenta y licencia observadas. Con un identificador aleatorio de instalación; sin nombres, contenido, rutas ni datos de pilotos.".to_owned()
        } else {
            format!(
                "Solo si aceptas, Vantare enviará a PostHog (Unión Europea) {CRASH_REPORT_WHAT}"
            )
        };
        let body = orbit::card_body().gap(px(16.0))
            .child(orbit::text(question, 16.0, 600, orbit::skin(cx).text1, cx))
            .child(orbit::text(description, 13.0, 400, orbit::skin(cx).text2, cx))
            .child(orbit::text("Es opcional. Puedes usar Vantare si rechazas y cambiar tu decisión en Ajustes › Privacidad. Uso e informes de fallos se aceptan por separado.", 13.0, 400, orbit::skin(cx).text2, cx))
            .when(asking_usage, |body| body.child(self.settings.usage_choice.clone()))
            .child(policy)
            .when_some(self.settings.status.as_ref(), |body, error| body.child(orbit::text(format!("No se pudo confirmar tu decisión: {error}. Puedes volver a intentarlo."), 13.0, 400, orbit::skin(cx).text1, cx)))
            .child(actions);
        div()
            .id("crash-consent-screen")
            .size_full()
            .bg(orbit::ramp(orbit::skin(cx).window, 155.0))
            .flex()
            .items_center()
            .justify_center()
            .p(px(24.0))
            .capture_key_down(cx.listener(|hub, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "tab" {
                    let targets = hub.consent_targets();
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
                    .aria_label(if asking_usage {
                        "Consentimiento para datos de uso"
                    } else {
                        "Consentimiento para informes de fallos"
                    })
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
                next.usage_decided = true;
            } else {
                next.crashes = !next.crashes;
                next.crashes_decided = true;
            }
            self.settings.status = store.save(next).err();
            if self.settings.status.is_none() {
                vantare_ui::analytics::consent(cx, store.value);
                if usage && store.value.usage {
                    vantare_ui::analytics::record_once(
                        cx,
                        &vantare_services::diagnostics::Usage::UsageOptIn {},
                    );
                }
                self.analytics
                    .consent(vantare_ui::analytics::generation(cx));
            }
        }
        cx.notify();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolated_settings_never_load_or_discard_the_installed_privacy_queue() {
        let default_hub = Path::new("C:/fixture/VantareNative/hub");
        let shared = PathBuf::from("C:/fixture/Vantare/native");
        let isolated = Path::new("C:/tmp/1612-privacy-qa");
        assert_eq!(
            resolve_root(isolated, default_hub, shared.clone()),
            isolated
        );
        assert_eq!(
            resolve_root(default_hub, default_hub, shared.clone()),
            shared
        );
    }
    #[test]
    fn isa1609_busy_installer_import_keeps_privacy_available() {
        let path = std::env::temp_dir().join(format!(
            "vantare-busy-installer-{}",
            vantare_services::random_id().expect("entropy")
        ));
        let mut initial = Store::load(&path).expect("initial");
        initial
            .save(Privacy {
                crashes: true,
                crashes_decided: true,
                ..Privacy::default()
            })
            .expect("crash consent");
        std::fs::write(
            path.join(vantare_services::diagnostics::installer::CHOICE_FILE),
            r#"{"version":1,"usage":true,"explicit":true}"#,
        )
        .expect("setup choice");
        let guard = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path.join("consent.lock"))
            .expect("lock");
        guard.try_lock().expect("crash POST");
        let mut loaded = Store::load(&path);
        if let Ok(store) = &mut loaded {
            let previous = store.value;
            let mut next = previous;
            next.usage = true;
            next.usage_decided = true;
            assert!(
                store.save(next).is_err(),
                "Busy must not confirm a decision"
            );
            assert_eq!(store.value, previous);
            assert_eq!(Privacy::load(&path).expect("disk while busy"), previous);
        }
        drop(guard);
        let mut store = loaded.expect("load must not depend on installer write lock");
        assert!(store.value.crashes);
        assert!(!store.value.usage_decided);
        store.cleanup.as_mut().expect("deferred import").finish();
        store
            .poll()
            .expect("background reply")
            .expect("import after POST");
        assert!(store.value.usage && store.value.usage_decided);
        let mut next = store.value;
        next.usage = false;
        store
            .save(next)
            .expect("revoke without restarting after import");
        assert!(!store.value.usage);
        assert!(!Privacy::load(&path).expect("disk").usage);
        std::fs::remove_dir_all(path).expect("cleanup");
    }
    #[test]
    fn isa1609_completed_background_reply_cannot_restore_manual_revocation() {
        let path = std::env::temp_dir().join(format!(
            "vantare-privacy-reply-{}",
            vantare_services::random_id().expect("entropy")
        ));
        let mut initial = Store::load(&path).expect("initial");
        initial
            .save(Privacy {
                usage: true,
                usage_decided: true,
                crashes_decided: true,
                ..Privacy::default()
            })
            .expect("consent");
        let guard = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path.join("consent.lock"))
            .expect("lock");
        guard.try_lock().expect("POST");
        let mut store = Store::load(&path).expect("deferred cleanup");
        drop(guard);
        store.cleanup.as_mut().expect("worker").finish();
        // El resultado ya está en memoria; el heartbeat aún no lo ha recibido.
        let mut next = store.value;
        next.usage = false;
        store.save(next).expect("manual revocation before reply");
        let revoked = store.value;
        assert!(store.poll().is_none(), "stale reply must not update the UI");
        assert_eq!(store.value, revoked);
        assert!(!store.value.usage);
        assert_eq!(Privacy::load(&path).expect("disk"), revoked);
        std::fs::remove_dir_all(path).expect("cleanup");
    }
    #[test]
    fn isa1609_privacy_load_during_post_keeps_controls_and_can_revoke_without_restart() {
        let path = std::env::temp_dir().join(format!(
            "vantare-busy-{}",
            vantare_services::random_id().expect("entropy")
        ));
        let mut initial = Store::load(&path).expect("initial");
        initial
            .save(Privacy {
                crashes: true,
                usage: true,
                crashes_decided: true,
                usage_decided: true,
                ..Privacy::default()
            })
            .expect("accept");
        let guard = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path.join("consent.lock"))
            .expect("lock file");
        guard.try_lock().expect("POST boundary");
        let loaded = Store::load(&path);
        drop(guard);
        let mut store = loaded.expect("controls must load while sender is busy");
        assert!(store.value.usage && store.value.crashes);
        let mut next = store.value;
        next.usage = false;
        store.save(next).expect("revoke in same session");
        assert!(!store.value.usage);
        std::fs::remove_dir_all(path).expect("cleanup");
    }
    #[test]
    fn isa1609_busy_cleanup_retries_in_background_without_losing_controls() {
        let path = std::env::temp_dir().join(format!(
            "vantare-busy-cleanup-{}",
            vantare_services::random_id().expect("entropy")
        ));
        let mut initial = Store::load(&path).expect("initial");
        initial
            .save(Privacy {
                usage: true,
                usage_decided: true,
                crashes_decided: true,
                ..Privacy::default()
            })
            .expect("choice");
        std::fs::create_dir_all(path.join("crashes")).expect("queue");
        std::fs::write(path.join("crashes/00.json"), b"old crash").expect("slot");
        let guard = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path.join("consent.lock"))
            .expect("lock");
        guard.try_lock().expect("POST holds boundary");
        let mut store = Store::load(&path).expect("controls despite cleanup Busy");
        assert!(store.value.usage);
        assert!(path.join("crashes/00.json").exists());
        assert!(store.cleanup.is_some());
        drop(guard);
        store.cleanup.as_mut().expect("retry scheduled").finish();
        store
            .poll()
            .expect("worker replied")
            .expect("cleanup completed");
        assert!(!path.join("crashes/00.json").exists());
        let mut next = store.value;
        next.usage = false;
        store.save(next).expect("revoke without restart");
        assert!(!store.value.usage);
        std::fs::remove_dir_all(path).expect("cleanup");
    }
    #[test]
    fn installer_choice_is_imported_once_and_never_overrides_revocation() {
        let path = std::env::temp_dir().join(format!(
            "vantare-usage-choice-{}",
            vantare_services::random_id().expect("entropy")
        ));
        std::fs::create_dir_all(&path).expect("fixture");
        std::fs::write(
            path.join(vantare_services::diagnostics::installer::CHOICE_FILE),
            r#"{"version":1,"usage":true,"explicit":true}"#,
        )
        .expect("installer choice");
        let mut store = Store::load(&path).expect("first run");
        assert!(store.value.usage && store.value.usage_decided);
        assert!(!store.value.crashes && !store.value.crashes_decided);
        std::fs::create_dir_all(path.join("usage")).expect("queue");
        std::fs::write(path.join("usage/00.json"), b"pending").expect("pending");
        let mut revoked = store.value;
        revoked.usage = false;
        store.save(revoked).expect("revoke");
        assert!(!path.join("usage/00.json").exists());
        assert_eq!(
            Store::load(&path).expect("reinstall/restart").value,
            store.value
        );
        std::fs::remove_dir_all(path).expect("cleanup");
    }
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
            assert!(!store.value.usage);
            assert!(!store.value.usage_decided);
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
                    usage_decided: false,
                    crashes_decided: true,
                    ..Privacy::default()
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
                    usage_decided: false,
                    crashes_decided: true,
                    ..Privacy::default()
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
            usage_decided: true,
            crashes_decided: true,
            ..Privacy::default()
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
