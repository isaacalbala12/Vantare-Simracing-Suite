//! Launcher: presentación sobre el motor compartido con el supervisor.
use std::path::PathBuf;
mod engine;
pub use engine::*;
pub mod view;

pub fn default_path() -> Result<PathBuf, String> {
    vantare_ui::paths::default_data_dir()
        .map(|root| root.join("Vantare/native/launcher.json"))
        .map_err(str::to_owned)
}

impl Store {
    pub fn demo(path: PathBuf, demo: &crate::demo::DemoData) -> Result<Self, String> {
        let document = Document {
            version: 1,
            apps: demo
                .launcher
                .apps
                .iter()
                .map(|app| App {
                    id: app.id.clone(),
                    name: app.display_name.clone(),
                    executable: None,
                    args: vec![],
                    favorite: false,
                })
                .collect(),
            profiles: demo
                .launcher
                .profiles
                .iter()
                .map(|profile| Profile {
                    id: profile.id.clone(),
                    name: profile.name.clone(),
                    favorite: profile.favorite,
                    steps: profile
                        .steps
                        .iter()
                        .map(|step| Step {
                            app_id: step.app_id.clone(),
                            delay_seconds: step.delay_seconds,
                            args_override: None,
                        })
                        .collect(),
                    first_step_delay: profile.steps.first().map_or(0, |step| step.delay_seconds),
                    continue_on_error: profile.retry_limit > 0,
                    reuse_running: true,
                    max_retries: profile.retry_limit,
                    ..Profile::new(profile.id.clone(), profile.name.clone())
                })
                .collect(),
            lmu_trigger_profile: None,
            wails_import: None,
        };
        document.validate()?;
        Ok(Self {
            document,
            path,
            saved: None,
        })
    }
}

#[cfg(test)]
mod tests;

impl discovery::Discovery {
    pub fn demo(data: &crate::demo::DemoData) -> Self {
        Self {
            apps: data
                .launcher
                .apps
                .iter()
                .map(|app| discovery::Detected {
                    id: app.id.clone(),
                    executable: None,
                    source: "fixture demo Wails",
                    availability: discovery::Availability {
                        catalogued: true,
                        found: app.found,
                        installed: app.installed,
                        launchable: false,
                    },
                })
                .collect(),
            ..Self::default()
        }
    }
}
