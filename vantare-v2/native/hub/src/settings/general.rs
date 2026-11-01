//! Preferencias del Hub, independientes del idioma y unidades de los widgets.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
pub(super) const STARTUP_PROGRESS: &str = "Cambiando el inicio con Windows…";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(in crate::shell) enum Density {
    Compact,
    #[default]
    Balanced,
    Comfortable,
}

impl Density {
    pub(in crate::shell) fn apply(self, adapt: &mut crate::orbit::Adapt) {
        use crate::orbit::adapt::Density as Responsive;
        match self {
            Self::Compact => adapt.density = adapt.density.max(Responsive::B),
            // La preferencia solo compacta: nunca amplía un viewport pequeño.
            Self::Balanced => adapt.density = adapt.density.max(Responsive::M),
            Self::Comfortable => {}
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub(in crate::shell) struct Preferences {
    pub onboarding_completed: bool,
    // Retirados del asistente (#1628): general.json anteriores aún los traen,
    // así que se toleran al leer pero ya no se escriben ni se usan.
    #[serde(skip_serializing)]
    pub onboarding_simulators: [bool; 2],
    #[serde(skip_serializing)]
    pub onboarding_automatic: bool,
    pub density: Density,
    pub startup: bool,
    pub minimized: bool,
    pub updates: bool,
    pub launcher: bool,
    pub toasts: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            // Los JSON anteriores al onboarding pertenecen a instalaciones existentes.
            onboarding_completed: true,
            onboarding_simulators: [true, false],
            onboarding_automatic: false,
            density: Density::Balanced,
            startup: false,
            minimized: false,
            updates: true,
            launcher: true,
            toasts: false,
        }
    }
}
pub(in crate::shell) struct Store {
    pub value: Preferences,
    startup_task: Option<gpui::Task<()>>,
    path: PathBuf,
    observed: Option<Vec<u8>>,
}
impl Store {
    pub fn load(root: &Path) -> Result<Self, String> {
        Self::load_with_startup(root, super::windows::installed_startup())
    }
    fn load_with_startup(root: &Path, startup: Option<bool>) -> Result<Self, String> {
        let path = root.join("general.json");
        let observed = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 4096)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("leer ajustes generales: {error}")),
        };
        let mut value = observed
            .as_deref()
            .map_or(Ok(Preferences::default()), |bytes| {
                serde_json::from_slice(bytes)
                    .map_err(|error| format!("leer ajustes generales: {error}"))
            })?;
        if observed.is_none() {
            value.onboarding_completed = false;
        }
        if let Some(enabled) = startup {
            value.startup = enabled;
        }
        Ok(Self {
            value,
            startup_task: None,
            path,
            observed,
        })
    }
    pub(super) fn startup_pending(&self) -> bool {
        self.startup_task.is_some()
    }
    fn refresh_startup(&mut self, startup: Option<bool>) -> bool {
        if let Some(enabled) = startup
            && !self.startup_pending()
            && self.value.startup != enabled
        {
            self.value.startup = enabled;
            return true;
        }
        false
    }
    pub fn save(&mut self, value: Preferences) -> Result<(), String> {
        let bytes = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
        crate::files::save(&self.path, &bytes, self.observed.as_deref())?;
        self.value = value;
        self.observed = Some(bytes);
        Ok(())
    }
    pub fn onboarding_needed(&mut self, layout_preexisted: bool) -> bool {
        if self.observed.is_none() && layout_preexisted {
            // Un layout anterior acredita una instalación existente, aunque nunca guardara General.
            self.value.onboarding_completed = true;
        }
        !self.value.onboarding_completed
    }
}

#[derive(Clone, Copy)]
pub(super) enum Toggle {
    Startup,
    Minimized,
    Updates,
    Launcher,
    Toasts,
}

impl Toggle {
    pub(super) fn enabled(self, startup_pending: bool) -> bool {
        !matches!(self, Self::Startup) || !startup_pending
    }
}

impl super::Hub {
    pub(in crate::shell) fn general_preferences(&self) -> Preferences {
        self.settings
            .general
            .as_ref()
            .map_or_else(|_| Preferences::default(), |store| store.value)
    }
    fn save_general(&mut self, next: Preferences, cx: &mut gpui::Context<Self>) {
        self.settings.status = match &mut self.settings.general {
            Ok(store) => store.save(next).err(),
            Err(error) => Some(error.clone()),
        };
        cx.notify();
    }
    pub(super) fn general_toggle(&mut self, toggle: Toggle, cx: &mut gpui::Context<Self>) {
        if self.settings.general.is_err() {
            return;
        }
        if self
            .settings
            .general
            .as_ref()
            .is_ok_and(|store| !toggle.enabled(store.startup_pending()))
        {
            return;
        }
        let old = self.general_preferences();
        let mut next = old;
        match toggle {
            Toggle::Startup => next.startup = !next.startup,
            Toggle::Minimized => next.minimized = !next.minimized,
            Toggle::Updates => next.updates = !next.updates,
            Toggle::Launcher => next.launcher = !next.launcher,
            Toggle::Toasts => next.toasts = !next.toasts,
        }
        if matches!(toggle, Toggle::Startup) {
            if self.demo.is_some() || self.capture.is_some() {
                self.settings.status =
                    Some("El inicio con Windows solo se cambia desde el Hub normal.".into());
                cx.notify();
                return;
            }
            let change = match super::windows::StartupChange::start(next.startup) {
                Ok(change) => change,
                Err(error) => {
                    self.settings.status = Some(error);
                    cx.notify();
                    return;
                }
            };
            self.settings.status = Some(STARTUP_PROGRESS.into());
            let executor = cx.background_executor().clone();
            let task = cx.spawn(async move |this, cx| {
                let result = change.complete(executor).await;
                let _ = this.update(cx, |this, cx| {
                    match result {
                        Ok(()) => {
                            // The installer committed the root preference. Never
                            // write data/general.json for Startup, including legacy installs.
                            if let Ok(store) = &mut this.settings.general {
                                store.value.startup = next.startup;
                            }
                            if this.settings.status.as_deref() == Some(STARTUP_PROGRESS) {
                                this.settings.status = None;
                            }
                        }
                        Err(error) => this.settings.status = Some(error),
                    }
                    if let Ok(store) = &mut this.settings.general {
                        store.startup_task.take();
                    }
                    cx.notify();
                });
            });
            if let Ok(store) = &mut self.settings.general {
                store.startup_task = Some(task);
            }
            cx.notify();
            return;
        }
        self.save_general(next, cx);
    }
    pub(super) fn refresh_startup_preference(&mut self, cx: &mut gpui::Context<Self>) {
        if let Ok(store) = &mut self.settings.general
            && store.refresh_startup(super::windows::installed_startup())
        {
            cx.notify();
        }
    }
    pub(in crate::shell) fn notify_system(
        &self,
        tag: &str,
        title: &str,
        body: &str,
        cx: &mut gpui::Context<Self>,
    ) {
        if cfg!(windows) && self.general_preferences().toasts {
            cx.show_system_notification(gpui::SystemNotification {
                tag: tag.to_owned().into(),
                title: title.to_owned().into(),
                body: body.to_owned().into(),
                actions: vec![],
            });
        }
    }
    pub(super) fn test_notification(&mut self, cx: &mut gpui::Context<Self>) {
        if !cfg!(windows) || !self.general_preferences().toasts {
            return;
        }
        self.notify_system("vantare.test", "Vantare", "Notificación de prueba", cx);
        self.settings.status =
            Some("Solicitud enviada a Windows. El modo No molestar puede ocultar el aviso.".into());
        cx.notify();
    }
}

pub(super) fn wire(state: &super::State, cx: &mut gpui::Context<super::Hub>) {
    cx.subscribe(
        &state.density,
        |hub, _, event: &crate::orbit::ChoiceChanged, cx| {
            let Some(density) = [Density::Compact, Density::Balanced, Density::Comfortable]
                .get(event.0)
                .copied()
            else {
                return;
            };
            let mut next = hub.general_preferences();
            next.density = density;
            hub.save_general(next, cx);
            let saved = hub.general_preferences().density as usize;
            hub.settings.density.update(cx, |choice, cx| {
                choice.state.selected = Some(saved);
                cx.notify();
            });
        },
    )
    .detach();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gpui_load_projects_startup_without_rewriting_or_creating_general() {
        let root =
            std::env::temp_dir().join(format!("vantare-startup-load-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("general.json");
        let bytes = br#"{ "startup": false, "density": "compact" }"#;
        std::fs::write(&path, bytes).unwrap();
        let store = Store::load_with_startup(&root, Some(true)).unwrap();
        assert!(store.value.startup);
        assert_eq!(store.value.density, Density::Compact);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        std::fs::remove_file(&path).unwrap();
        let store = Store::load_with_startup(&root, Some(true)).unwrap();
        assert!(store.value.startup);
        assert!(!path.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn installer_run_migration_is_adopted_after_load_without_rewriting_general() {
        let root =
            std::env::temp_dir().join(format!("vantare-startup-migrate-{}", std::process::id()));
        let data = root.join("data");
        std::fs::create_dir_all(&data).unwrap();
        let bytes = br#"{"startup":false,"updates":false}"#;
        std::fs::write(data.join("general.json"), bytes).unwrap();
        let mut store = Store::load_with_startup(&data, None).unwrap();
        assert!(!store.value.startup);
        std::fs::write(
            root.join("startup-options.json"),
            br#"{"schema":1,"autostart":true}"#,
        )
        .unwrap();
        let migrated = super::super::windows::installed_startup_at(&root);
        assert!(store.refresh_startup(migrated));
        assert!(store.value.startup);
        assert!(!store.value.updates);
        std::fs::write(
            root.join("installer-ui.json"),
            br#"{"schema":1,"kind":"rust-gpui","autostart":false}"#,
        )
        .unwrap();
        assert!(store.refresh_startup(super::super::windows::installed_startup_at(&root)));
        assert!(!store.value.startup);
        assert_eq!(std::fs::read(data.join("general.json")).unwrap(), bytes);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn pending_startup_disables_only_its_own_control() {
        for toggle in [
            Toggle::Minimized,
            Toggle::Updates,
            Toggle::Launcher,
            Toggle::Toasts,
        ] {
            assert!(toggle.enabled(true));
            assert!(toggle.enabled(false));
        }
        assert!(!Toggle::Startup.enabled(true));
        assert!(Toggle::Startup.enabled(false));
    }
    #[test]
    fn existing_layout_without_general_skips_onboarding_but_interrupted_setup_resumes() {
        let root = std::env::temp_dir().join(format!(
            "vantare-onboarding-migration-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("root");
        let mut legacy = Store::load(&root).expect("legacy without General");
        assert!(!legacy.onboarding_needed(true));
        legacy.save(legacy.value).expect("later settings edit");
        assert!(
            !Store::load(&root)
                .expect("legacy restart")
                .onboarding_needed(true)
        );
        std::fs::remove_file(root.join("general.json")).expect("new installation case");
        let mut fresh = Store::load(&root).expect("fresh");
        assert!(fresh.onboarding_needed(false));
        fresh
            .save(fresh.value)
            .expect("persist pending before opening wizard");
        assert!(
            Store::load(&root)
                .expect("interrupted wizard")
                .onboarding_needed(true)
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }
    #[test]
    fn onboarding_runs_only_on_new_installations_and_completion_survives_restart() {
        let root =
            std::env::temp_dir().join(format!("vantare-onboarding-general-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("root");
        let mut store = Store::load(&root).expect("new installation");
        assert!(!store.value.onboarding_completed);
        let mut next = store.value;
        next.onboarding_completed = true;
        store.save(next).expect("completed");
        assert!(
            Store::load(&root)
                .expect("restart")
                .value
                .onboarding_completed
        );
        std::fs::write(root.join("general.json"), b"{}").expect("legacy");
        assert!(
            Store::load(&root)
                .expect("existing installation")
                .value
                .onboarding_completed
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }
    #[test]
    fn retired_onboarding_choices_still_load_but_are_never_written() {
        let root =
            std::env::temp_dir().join(format!("vantare-onboarding-retired-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("root");
        // Una instalación previa conserva sus campos retirados al reabrir.
        std::fs::write(
            root.join("general.json"),
            br#"{"onboarding_completed":true,"onboarding_simulators":[false,true],"onboarding_automatic":true}"#,
        )
        .expect("legacy choices");
        let mut store = Store::load(&root).expect("legacy installation");
        assert!(store.value.onboarding_completed);
        store.save(store.value).expect("rewrite");
        let saved = String::from_utf8(std::fs::read(root.join("general.json")).expect("read"))
            .expect("utf8");
        assert!(saved.contains("\"onboarding_completed\":true"));
        assert!(!saved.contains("onboarding_simulators"));
        assert!(!saved.contains("onboarding_automatic"));
        std::fs::remove_dir_all(root).expect("cleanup");
    }
    #[test]
    fn density_changes_spacing_and_never_overrides_small_window_limits() {
        let base = crate::orbit::Adapt::new(1920.0, 1080.0, None, true);
        let mut compact = base;
        Density::Compact.apply(&mut compact);
        let mut balanced = base;
        Density::Balanced.apply(&mut balanced);
        let mut comfortable = base;
        Density::Comfortable.apply(&mut comfortable);
        assert!(compact.gap() < balanced.gap());
        assert!(balanced.gap() < comfortable.gap());
        assert!(balanced.setting_height() < comfortable.setting_height());
        assert_ne!(balanced.padding(), comfortable.padding());
        assert_eq!(comfortable, base);
        for density in [Density::Compact, Density::Balanced, Density::Comfortable] {
            let mut small = crate::orbit::Adapt::new(1280.0, 700.0, None, true);
            density.apply(&mut small);
            assert_eq!(small.density, crate::orbit::adapt::Density::Xs);
        }
    }
    #[test]
    fn preferences_reopen_and_preserve_external_changes() {
        let root = std::env::temp_dir().join(format!("vantare-general-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("directorio");
        let mut store = Store::load(&root).expect("abrir");
        let mut next = store.value;
        next.minimized = true;
        next.density = Density::Compact;
        next.toasts = true;
        store.save(next).expect("guardar");
        assert_eq!(Store::load(&root).expect("reabrir").value, next);
        std::fs::write(root.join("general.json"), b"{}").expect("edicion externa");
        assert!(store.save(Preferences::default()).is_err());
        assert_eq!(
            std::fs::read(root.join("general.json")).expect("leer"),
            b"{}"
        );
        std::fs::remove_dir_all(root).expect("limpiar");
    }
}
