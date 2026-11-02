//! Preferencias del Hub, independientes del idioma y unidades de los widgets.
use serde::{Deserialize, Serialize};
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
    pub density: Density,
    #[serde(skip)]
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
            density: Density::Balanced,
            startup: false,
            minimized: false,
            updates: true,
            launcher: true,
            toasts: false,
        }
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
        self.settings.store.value.general
    }
    fn save_general(&mut self, next: Preferences, cx: &mut gpui::Context<Self>) {
        self.settings.status = self.settings.store.save_general(next).err();
        cx.notify();
    }
    pub(super) fn general_toggle(&mut self, toggle: Toggle, cx: &mut gpui::Context<Self>) {
        if !toggle.enabled(self.settings.startup_task.is_some()) {
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
                            this.settings.store.value.general.startup = next.startup;
                            if this.settings.status.as_deref() == Some(STARTUP_PROGRESS) {
                                this.settings.status = None;
                            }
                        }
                        Err(error) => this.settings.status = Some(error),
                    }
                    this.settings.startup_task.take();
                    cx.notify();
                });
            });
            self.settings.startup_task = Some(task);
            cx.notify();
            return;
        }
        self.save_general(next, cx);
    }
    pub(super) fn refresh_startup_preference(&mut self, cx: &mut gpui::Context<Self>) {
        if self.settings.startup_task.is_none()
            && let Some(enabled) = super::windows::installed_startup()
            && self.settings.store.value.general.startup != enabled
        {
            self.settings.store.value.general.startup = enabled;
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
}
