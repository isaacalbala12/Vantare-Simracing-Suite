//! Profile actions keep commands and opaque settings entirely in the native store.
use super::{ID_LIMIT, apps, editor};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_launcher::{Profile, policy};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(
    tag = "option",
    content = "value",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum ProfileOption {
    AlreadyRunning(editor::ProfileRunning),
    FirstStepDelay(u32),
    Retries(u8),
    Failure(editor::ProfileFailure),
    Startup(bool),
    CloseOnExit(bool),
    RetryFailed(bool),
}
fn valid_id(id: &str) -> Result<(), HostError> {
    if id.is_empty() || id.len() > ID_LIMIT || id.contains('\0') {
        Err(HostError::Denied)
    } else {
        Ok(())
    }
}
fn profile<'a>(
    document: &'a vantare_launcher::Document,
    id: &str,
) -> Result<&'a Profile, HostError> {
    valid_id(id)?;
    document
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .ok_or(HostError::Denied)
}
pub fn remove(path: &Path, id: &str, revision: &str) -> Result<(), HostError> {
    valid_id(id)?;
    apps::edit(path, revision, |document| {
        document.remove_profile(id).map_err(|_| HostError::Denied)
    })
}
pub fn duplicate(path: &Path, id: &str, revision: &str) -> Result<(), HostError> {
    apps::edit(path, revision, |document| {
        let id_new = format!(
            "profile-{}",
            vantare_services::random_id().map_err(|_| HostError::Io)?
        );
        let copy = profile(document, id)?.duplicate(id_new);
        document.save_profile(copy).map_err(|_| HostError::Denied)
    })
}
pub fn favorite(path: &Path, id: &str, favorite: bool, revision: &str) -> Result<(), HostError> {
    apps::edit(path, revision, |document| {
        let mut saved = profile(document, id)?.clone();
        saved.favorite = favorite;
        document.save_profile(saved).map_err(|_| HostError::Denied)
    })
}
pub fn option(
    path: &Path,
    id: &str,
    option: ProfileOption,
    revision: &str,
) -> Result<(), HostError> {
    apps::edit(path, revision, |document| {
        let mut saved = profile(document, id)?.clone();
        let mut current = saved.effective_policy();
        match option {
            ProfileOption::AlreadyRunning(value) => {
                current.already_running = match value {
                    editor::ProfileRunning::Ask => policy::Running::Ask,
                    editor::ProfileRunning::Reuse => policy::Running::Reuse,
                    editor::ProfileRunning::Restart => policy::Running::Restart,
                }
            }
            ProfileOption::FirstStepDelay(value) => current.first_step_delay = value,
            ProfileOption::Retries(value) if value <= editor::RETRIES_MAX => {
                current.max_retries = value;
            }
            ProfileOption::Retries(_) => return Err(HostError::Denied),
            ProfileOption::Failure(value) => {
                current.failure = match value {
                    editor::ProfileFailure::Ask => policy::Failure::Ask,
                    editor::ProfileFailure::Stop => policy::Failure::Stop,
                    editor::ProfileFailure::Continue => policy::Failure::Continue,
                }
            }
            ProfileOption::Startup(value) => saved.launch_on_windows_startup = value,
            ProfileOption::CloseOnExit(value) => {
                current.exit = if value {
                    policy::Close::Started
                } else {
                    policy::Close::Leave
                }
            }
            ProfileOption::RetryFailed(value) => {
                current.retry = if value {
                    policy::Retry::Failed
                } else {
                    policy::Retry::Ask
                }
            }
        }
        saved.set_policy(current);
        document.save_profile(saved).map_err(|_| HostError::Denied)
    })
}
pub fn trigger(path: &Path, id: Option<&str>, revision: &str) -> Result<(), HostError> {
    apps::edit(path, revision, |document| {
        if let Some(id) = id {
            profile(document, id)?;
        }
        document.lmu_trigger_profile = id.map(str::to_owned);
        Ok(())
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use vantare_launcher::{Document, Step};
    fn fixture() -> (
        crate::test_support::Root,
        std::path::PathBuf,
        Vec<u8>,
        String,
    ) {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::fresh_install();
        document.profiles[0].steps = vec![Step {
            app_id: "lmu".into(),
            delay_seconds: 7,
            args_override: Some(vec!["private QA".into()]),
        }];
        let bytes = serde_json::to_vec(&document).expect("QA fixture");
        std::fs::write(&path, &bytes).expect("QA fixture");
        let revision = vantare_services::content_hash(&bytes);
        (root, path, bytes, revision)
    }
    #[test]
    fn quick_option_preserves_steps_arguments_and_unrelated_profiles() {
        let (_root, path, bytes, revision) = fixture();
        let before = Document::from_bytes(&bytes).expect("QA fixture");
        option(
            &path,
            &before.profiles[0].id,
            ProfileOption::Retries(3),
            &revision,
        )
        .expect("QA fixture");
        let after =
            Document::from_bytes(&std::fs::read(&path).expect("QA fixture")).expect("QA fixture");
        assert_eq!(
            serde_json::to_value(&after.profiles[0].steps).expect("QA fixture"),
            serde_json::to_value(&before.profiles[0].steps).expect("QA fixture")
        );
        assert_eq!(after.profiles[0].effective_policy().max_retries, 3);
        assert_eq!(
            serde_json::to_value(&after.profiles[1..]).expect("QA fixture"),
            serde_json::to_value(&before.profiles[1..]).expect("QA fixture")
        );
    }
    #[test]
    fn duplicate_uses_native_reset_rules_and_keeps_private_steps() {
        let (_root, path, bytes, revision) = fixture();
        let before = Document::from_bytes(&bytes).expect("QA fixture");
        duplicate(&path, &before.profiles[0].id, &revision).expect("QA fixture");
        let after =
            Document::from_bytes(&std::fs::read(&path).expect("QA fixture")).expect("QA fixture");
        let copy = after.profiles.last().expect("QA fixture");
        assert_ne!(copy.id, before.profiles[0].id);
        assert_eq!(
            serde_json::to_value(&copy.steps).expect("QA fixture"),
            serde_json::to_value(&before.profiles[0].steps).expect("QA fixture")
        );
        assert!(!copy.favorite && !copy.launch_on_windows_startup);
        assert!(copy.hotkey.is_empty());
    }
    #[test]
    fn conflict_and_invalid_option_have_no_effects() {
        let (_root, path, bytes, revision) = fixture();
        let before = Document::from_bytes(&bytes).expect("QA fixture");
        let id = &before.profiles[0].id;
        assert!(matches!(
            remove(&path, id, &"0".repeat(64)),
            Err(HostError::LauncherConflict { .. })
        ));
        assert_eq!(
            option(&path, id, ProfileOption::Retries(4), &revision),
            Err(HostError::Denied)
        );
        for id in ["\0", &"x".repeat(ID_LIMIT + 1), "missing"] {
            assert_eq!(favorite(&path, id, true, &revision), Err(HostError::Denied));
        }
        assert_eq!(std::fs::read(path).expect("QA fixture"), bytes);
    }
    #[test]
    fn removing_trigger_profile_clears_the_trigger_and_keeps_apps() {
        let (_root, path, bytes, revision) = fixture();
        let before = Document::from_bytes(&bytes).expect("QA fixture");
        let id = &before.profiles[0].id;
        trigger(&path, Some(id), &revision).expect("QA fixture");
        let revision = vantare_services::content_hash(&std::fs::read(&path).expect("QA fixture"));
        remove(&path, id, &revision).expect("QA fixture");
        let after =
            Document::from_bytes(&std::fs::read(path).expect("QA fixture")).expect("QA fixture");
        assert_eq!(after.apps, before.apps);
        assert!(after.lmu_trigger_profile.is_none());
        assert!(!after.profiles.iter().any(|profile| &profile.id == id));
    }
    #[test]
    fn protected_documents_are_never_created_or_rewritten_by_actions() {
        for bytes in [
            None,
            Some(b"{".as_slice()),
            Some(br#"{"version":999}"#.as_slice()),
        ] {
            let root = crate::test_support::Root::new();
            let path = root.path.join("launcher.json");
            if let Some(bytes) = bytes {
                std::fs::write(&path, bytes).expect("fixture");
            }
            let revision = "0".repeat(64);
            for result in [
                remove(&path, "creator", &revision),
                duplicate(&path, "creator", &revision),
                favorite(&path, "creator", false, &revision),
                option(&path, "creator", ProfileOption::Startup(true), &revision),
                trigger(&path, Some("creator"), &revision),
            ] {
                assert_eq!(result, Err(HostError::Protected));
            }
            match bytes {
                None => assert!(!path.exists()),
                Some(bytes) => assert_eq!(std::fs::read(path).expect("untouched"), bytes),
            }
        }
    }
    #[test]
    fn favorite_action_keeps_other_favorites_and_startup_stays_exclusive() {
        let (_root, path, bytes, revision) = fixture();
        let document = Document::from_bytes(&bytes).expect("document");
        favorite(&path, &document.profiles[1].id, true, &revision).expect("favorite");
        let bytes = std::fs::read(&path).expect("saved");
        let after = Document::from_bytes(&bytes).expect("saved document");
        assert!(after.profiles.iter().all(|profile| profile.favorite));
        option(
            &path,
            &document.profiles[1].id,
            ProfileOption::Startup(true),
            &vantare_services::content_hash(&bytes),
        )
        .expect("startup");
        let after = Document::from_bytes(&std::fs::read(&path).expect("saved")).expect("document");
        assert_eq!(
            after
                .profiles
                .iter()
                .filter(|profile| profile.launch_on_windows_startup)
                .count(),
            1
        );
    }
}
