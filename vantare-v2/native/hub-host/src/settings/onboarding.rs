//! Finalization writes completion only after layout and presentation succeed.
use super::{SaveError, Settings};
use crate::onboarding::FinishError;
use crate::protocol::HostError;
use std::path::Path;
impl Settings {
    pub(crate) fn onboarding_layout(path: &Path) -> (bool, Option<String>) {
        super::layout::onboarding::state(path)
    }
    pub(crate) fn finish_onboarding(
        &mut self,
        path: &Path,
        choice: &crate::onboarding::Finish,
    ) -> Result<(), FinishError> {
        self.finish_onboarding_with(path, choice, crate::onboarding::show)
    }
    fn finish_onboarding_with(
        &mut self,
        path: &Path,
        choice: &crate::onboarding::Finish,
        present: impl FnOnce(&Path) -> Result<(), FinishError>,
    ) -> Result<(), FinishError> {
        let current = self.refresh();
        if current.protected {
            return Err(HostError::Protected.into());
        }
        if current.revision != choice.base_revision {
            return Err(FinishError::Conflict);
        }
        if current.general.onboarding_completed {
            return Err(HostError::Denied.into());
        }
        let layout_ready = super::layout::onboarding::apply(
            path,
            &choice.kit,
            choice.level,
            choice.layout_revision.as_deref(),
        )?;
        if layout_ready && choice.show {
            present(path)?;
        }
        let mut general = self.store.value.general;
        general.onboarding_completed = true;
        let result = self.store.save_general(general);
        self.saved(&result)
            .map(|_| ())
            .map_err(|error| match error {
                SaveError::Conflict(_) => FinishError::Conflict,
                SaveError::Protected => HostError::Protected.into(),
                SaveError::Busy => HostError::Busy.into(),
                SaveError::Unsupported => HostError::Unsupported.into(),
                SaveError::Io => HostError::Io.into(),
            })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Root;
    use crate::{onboarding::WidgetKind, settings::track::PerformanceLevel};
    #[test]
    fn absent_design_completes_without_creating_layout_or_presentation_and_cannot_finish_twice() {
        let root = Root::new();
        let path = root.path.join("layout.json");
        let args = crate::args::Args {
            controlled: false,
            pipe: "test".into(),
            data: root.path.clone(),
            layout: path.clone(),
            launcher: root.path.join("launcher.json"),
            engineer: root.path.join("engineer.json"),
        };
        let mut settings = Settings::load(&args);
        let (_, layout_revision) = Settings::onboarding_layout(&path);
        let mut choice = crate::onboarding::Finish {
            kit: vec![WidgetKind::Delta],
            level: PerformanceLevel::Balanced,
            show: true,
            base_revision: settings.view().revision,
            layout_revision,
        };
        settings.finish_onboarding(&path, &choice).unwrap();
        assert!(settings.view().general.onboarding_completed);
        assert!(!path.exists());
        assert!(!path.with_extension("show.json").exists());
        choice.base_revision = settings.view().revision;
        assert!(matches!(
            settings.finish_onboarding(&path, &choice),
            Err(FinishError::Failure(HostError::Denied))
        ));
    }
    #[test]
    fn presentation_failure_leaves_onboarding_unfinished_after_the_kit_is_saved() {
        let root = Root::new();
        let path = root.path.join("layout.json");
        let args = crate::args::Args {
            controlled: false,
            pipe: "test".into(),
            data: root.path.clone(),
            layout: path.clone(),
            launcher: root.path.join("launcher.json"),
            engineer: root.path.join("engineer.json"),
        };
        let mut settings = Settings::load(&args);
        std::fs::write(&path, r#"{"version":1,"instances":[]}"#).unwrap();
        let (_, layout_revision) = Settings::onboarding_layout(&path);
        let base = settings.view().revision;
        assert!(matches!(
            settings.finish_onboarding_with(
                &path,
                &crate::onboarding::Finish {
                    kit: vec![WidgetKind::Delta],
                    level: PerformanceLevel::Balanced,
                    show: true,
                    base_revision: base,
                    layout_revision
                },
                |_| Err(FinishError::Failure(HostError::Io))
            ),
            Err(FinishError::Failure(HostError::Io))
        ));
        assert!(!settings.view().general.onboarding_completed);
        assert!(!Settings::load(&args).view().general.onboarding_completed);
        let choice = crate::onboarding::Finish {
            kit: vec![WidgetKind::Delta],
            level: PerformanceLevel::Balanced,
            show: true,
            base_revision: settings.view().revision,
            layout_revision: Settings::onboarding_layout(&path).1,
        };
        settings
            .finish_onboarding_with(&path, &choice, |_| Ok(()))
            .unwrap();
        let saved: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved["instances"].as_array().unwrap().len(), 1);
        assert!(settings.view().general.onboarding_completed);
    }
    #[test]
    fn failed_settings_save_after_layout_keeps_completion_false_and_retry_does_not_duplicate() {
        let root = Root::new();
        let path = root.path.join("layout.json");
        let args = crate::args::Args {
            controlled: false,
            pipe: "test".into(),
            data: root.path.clone(),
            layout: path.clone(),
            launcher: root.path.join("launcher.json"),
            engineer: root.path.join("engineer.json"),
        };
        let mut settings = Settings::load(&args);
        std::fs::write(&path, br#"{"version":2,"instances":[]}"#).unwrap();
        let mut choice = crate::onboarding::Finish {
            kit: vec![WidgetKind::Delta],
            level: PerformanceLevel::Balanced,
            show: true,
            base_revision: settings.view().revision,
            layout_revision: Settings::onboarding_layout(&path).1,
        };
        let settings_path = root.path.join(super::super::store::FILE);
        let old = std::fs::read(&settings_path).ok();
        assert!(
            settings
                .finish_onboarding_with(&path, &choice, |_| {
                    if settings_path.is_file() {
                        std::fs::remove_file(&settings_path).unwrap();
                    }
                    std::fs::create_dir(&settings_path).unwrap();
                    Ok(())
                })
                .is_err()
        );
        std::fs::remove_dir(&settings_path).unwrap();
        if let Some(old) = old {
            std::fs::write(&settings_path, old).unwrap();
        }
        let mut settings = Settings::load(&args);
        assert!(!settings.view().general.onboarding_completed);
        choice.base_revision = settings.view().revision;
        choice.layout_revision = Settings::onboarding_layout(&path).1;
        settings
            .finish_onboarding_with(&path, &choice, |_| Ok(()))
            .unwrap();
        let saved: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved["instances"].as_array().unwrap().len(), 1);
    }
}
