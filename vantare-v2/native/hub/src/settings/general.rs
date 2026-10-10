//! Preferencias del Hub, independientes del idioma y unidades de los widgets.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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
    path: PathBuf,
    observed: Option<Vec<u8>>,
}
impl Store {
    pub fn load(root: &Path) -> Result<Self, String> {
        let path = root.join("general.json");
        let observed = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 4096)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("leer ajustes generales: {error}")),
        };
        let value = observed
            .as_deref()
            .map_or(Ok(Preferences::default()), |bytes| {
                serde_json::from_slice(bytes)
                    .map_err(|error| format!("leer ajustes generales: {error}"))
            })?;
        Ok(Self {
            value,
            path,
            observed,
        })
    }
    pub fn save(&mut self, value: Preferences) -> Result<(), String> {
        let bytes = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
        crate::files::save(&self.path, &bytes, self.observed.as_deref())?;
        self.value = value;
        self.observed = Some(bytes);
        Ok(())
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
            if let Err(error) = super::windows::startup(next.startup) {
                self.settings.status = Some(error);
                cx.notify();
                return;
            }
        }
        self.save_general(next, cx);
        if self.settings.status.is_some()
            && matches!(toggle, Toggle::Startup)
            && let Err(error) = super::windows::startup(old.startup)
        {
            self.settings.status = Some(format!(
                "No se guardaron los ajustes ni se pudo restaurar el inicio: {error}"
            ));
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
