mod appearance;
#[cfg(windows)]
mod onboarding;
pub mod track;
use track::{PerformanceLevel, TrackView};
#[cfg(windows)]
pub(crate) mod layout;
pub mod model;
mod store;
use crate::args::Args;
use model::{AppearanceSettings, Density, InterfaceFont, MonoFont, Palette, Preferences, Scheme};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsView {
    pub version: String,
    pub general: Preferences,
    pub appearance: AppearanceSettings,
    pub zoom: u16,
    pub revision: String,
    pub protected: bool,
    pub can_retry: bool,
    pub warning: bool,
    pub startup: StartupView,
    pub track: TrackView,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartupView {
    pub supported: bool,
    pub enabled: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "field",
    content = "value",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum SettingsPatch {
    Density(Density),
    Minimized(bool),
    Updates(bool),
    Launcher(bool),
    Toasts(bool),
    Palette(Palette),
    Scheme(Scheme),
    Contrast(u8),
    GlassOpacity(u8),
    InterfaceFont(InterfaceFont),
    MonoFont(MonoFont),
    ReducedMotion(bool),
    Zoom(u16),
    Startup(bool),
    Performance(PerformanceLevel),
    HideOffTrack(bool),
}
#[derive(Debug)]
pub enum SaveError {
    Busy,
    Conflict(SettingsView),
    Protected,
    Io,
    Unsupported,
}
pub struct Settings {
    store: store::Store,
    #[cfg(windows)]
    layout: layout::Layout,
    root: std::path::PathBuf,
    layout_preexisted: bool,
    installation: Option<std::path::PathBuf>,
}
impl Settings {
    pub fn load(args: &Args) -> Self {
        let layout_preexisted = args.layout.try_exists().unwrap_or(true);
        Self {
            store: store::Store::load(&args.data, layout_preexisted),
            #[cfg(windows)]
            layout: layout::Layout::open(args.layout.clone()),
            root: args.data.clone(),
            layout_preexisted,
            installation: std::env::var_os("VANTARE_BETA_ROOT")
                .map(std::path::PathBuf::from)
                .filter(|path| path.is_absolute()),
        }
    }
    pub fn view(&self) -> SettingsView {
        #[cfg(windows)]
        let motion = self.layout.motion();
        #[cfg(not(windows))]
        let motion = None;
        let appearance = AppearanceSettings {
            reduced_motion: motion.unwrap_or(self.store.value.appearance.reduced_motion),
            ..self.store.value.appearance
        };
        #[cfg(windows)]
        let layout_pending = self.layout.pending();
        #[cfg(not(windows))]
        let layout_pending = false;
        SettingsView {
            version: vantare_ipc::product::VERSION.into(),
            general: self.store.value.general,
            appearance,
            zoom: self.store.value.zoom,
            revision: self.store.revision(),
            protected: self.store.protected(),
            can_retry: self.store.has_pending() || layout_pending,
            warning: self.store.warning_text().is_some(),
            startup: self.startup(),
            #[cfg(windows)]
            track: self.layout.track(),
            #[cfg(not(windows))]
            track: TrackView::default(),
        }
    }
    pub fn refresh(&mut self) -> SettingsView {
        #[cfg(windows)]
        self.layout.refresh(false);
        if !self.store.has_pending() {
            self.store = store::Store::load(&self.root, self.layout_preexisted);
        }
        self.view()
    }
    fn startup(&self) -> StartupView {
        #[cfg(windows)]
        let enabled = self
            .installation
            .as_deref()
            .and_then(vantare_installer::engine::context::startup);
        #[cfg(not(windows))]
        let enabled: Option<bool> = None;
        StartupView {
            supported: enabled.is_some(),
            enabled: enabled.unwrap_or(false),
        }
    }
    pub fn update(
        &mut self,
        patch: SettingsPatch,
        revision: &str,
    ) -> Result<SettingsView, SaveError> {
        if revision != self.store.revision() {
            return Err(SaveError::Conflict(self.view()));
        }
        if matches!(patch, SettingsPatch::Startup(_)) {
            return self.change_startup(patch);
        }
        #[cfg(windows)]
        if let SettingsPatch::ReducedMotion(enabled) = patch {
            let change = self.layout.set_motion(enabled);
            if self.layout_result(change)? {
                return Ok(self.view());
            }
        }
        if matches!(
            patch,
            SettingsPatch::Performance(_) | SettingsPatch::HideOffTrack(_)
        ) {
            #[cfg(windows)]
            {
                let change = match patch {
                    SettingsPatch::Performance(level) => self.layout.set_level(level),
                    SettingsPatch::HideOffTrack(enabled) => self.layout.set_hide_off_track(enabled),
                    _ => unreachable!(),
                };
                self.layout_result(change)?;
                return Ok(self.view());
            }
            #[cfg(not(windows))]
            return Err(SaveError::Unsupported);
        }
        let result = self.save(patch);
        self.saved(&result)
    }
    pub fn discard(&mut self) -> SettingsView {
        #[cfg(windows)]
        self.layout.refresh(true);
        self.store = store::Store::load(&self.root, self.layout_preexisted);
        self.view()
    }
    #[cfg(windows)]
    fn layout_result(&self, change: layout::Change) -> Result<bool, SaveError> {
        match change {
            layout::Change::Busy => Err(SaveError::Busy),
            layout::Change::Fallback => Ok(false),
            layout::Change::Saved => Ok(true),
            layout::Change::Conflict => Err(SaveError::Conflict(self.view())),
            layout::Change::Protected => Err(SaveError::Protected),
            layout::Change::Io => Err(SaveError::Io),
        }
    }
    pub fn retry(&mut self) -> Result<SettingsView, SaveError> {
        #[cfg(windows)]
        if let Some(change) = self.layout.retry() {
            self.layout_result(change)?;
            return Ok(self.view());
        }
        let result = self.store.retry();
        self.saved(&result)
    }
    fn saved(&self, result: &Result<(), String>) -> Result<SettingsView, SaveError> {
        match result {
            Ok(()) => Ok(self.view()),
            Err(_) if self.store.has_pending() => Err(SaveError::Conflict(self.view())),
            Err(_) if self.store.protected() || !self.store.value.migration_pending.is_empty() => {
                Err(SaveError::Protected)
            }
            Err(_) => Err(SaveError::Io),
        }
    }
    fn change_startup(&mut self, patch: SettingsPatch) -> Result<SettingsView, SaveError> {
        let SettingsPatch::Startup(enabled) = patch else {
            return Err(SaveError::Unsupported);
        };
        let root = self.installation.as_deref().ok_or(SaveError::Unsupported)?;
        if !self.startup().supported {
            return Err(SaveError::Unsupported);
        }
        #[cfg(windows)]
        vantare_installer::engine::shell::sync_running(root, Some(enabled)).map_err(|error| {
            eprintln!("Startup update failed: {error}");
            SaveError::Io
        })?;
        #[cfg(not(windows))]
        {
            let _ = (root, enabled);
            return Err(SaveError::Unsupported);
        }
        #[cfg(windows)]
        Ok(self.view())
    }
    fn save(&mut self, patch: SettingsPatch) -> Result<(), String> {
        let mut general = self.store.value.general;
        let mut appearance = self.store.value.appearance;
        match patch {
            SettingsPatch::Zoom(zoom) => return self.store.save_zoom(zoom),
            SettingsPatch::Density(value) => general.density = value,
            SettingsPatch::Minimized(value) => general.minimized = value,
            SettingsPatch::Updates(value) => general.updates = value,
            SettingsPatch::Launcher(value) => general.launcher = value,
            SettingsPatch::Toasts(value) => general.toasts = value,
            SettingsPatch::Palette(value) => appearance.palette = value,
            SettingsPatch::Scheme(value) => appearance.scheme = value,
            SettingsPatch::Contrast(value) => appearance.contrast = value,
            SettingsPatch::GlassOpacity(value) => appearance.glass_opacity = value,
            SettingsPatch::InterfaceFont(value) => appearance.interface_font = value,
            SettingsPatch::MonoFont(value) => appearance.mono_font = value,
            SettingsPatch::ReducedMotion(value) => appearance.reduced_motion = value,
            SettingsPatch::Startup(_)
            | SettingsPatch::Performance(_)
            | SettingsPatch::HideOffTrack(_) => return Err("separate document operation".into()),
        }
        if general != self.store.value.general {
            self.store.save_general(general)
        } else if appearance != self.store.value.appearance {
            self.store.save_appearance(appearance)
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests;
