//! Profile actions keep commands and opaque settings entirely in the native store.
use super::{ID_LIMIT, apps, editor};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_launcher::{Profile, policy};

pub const COPY_SUFFIX: &str = " (copia)";
pub const FIRST_STEP_DELAYS: [u32; 6] = [0, 5, 10, 20, 30, 60];

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
fn edit(
    path: &Path,
    revision: &str,
    change: impl FnOnce(&mut vantare_launcher::Document) -> Result<(), HostError>,
) -> Result<(), HostError> {
    // Same fresh status and best-effort guarantee as launch-v1; #2028 owns atomic resident CAS.
    if vantare_ipc::launcher::read_status(path).is_some_and(|status| status.running) {
        return Err(HostError::Busy);
    }
    apps::edit(path, revision, change)
}
pub fn remove(path: &Path, id: &str, revision: &str) -> Result<(), HostError> {
    valid_id(id)?;
    edit(path, revision, |document| {
        document.remove_profile(id).map_err(|_| HostError::Denied)
    })
}
pub fn duplicate(path: &Path, id: &str, revision: &str) -> Result<(), HostError> {
    edit(path, revision, |document| {
        let source = profile(document, id)?;
        if document.profiles.len() >= super::PROFILE_LIMIT
            || source.name.len() + COPY_SUFFIX.len() > editor::NAME_MAX
        {
            return Err(HostError::Denied);
        }
        let id_new = format!(
            "profile-{}",
            vantare_services::random_id().map_err(|_| HostError::Io)?
        );
        let copy = profile(document, id)?.duplicate(id_new);
        document.save_profile(copy).map_err(|_| HostError::Denied)
    })
}
pub fn favorite(path: &Path, id: &str, favorite: bool, revision: &str) -> Result<(), HostError> {
    edit(path, revision, |document| {
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
    edit(path, revision, |document| {
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
            ProfileOption::FirstStepDelay(value)
                if FIRST_STEP_DELAYS.contains(&value) || value == current.first_step_delay =>
            {
                current.first_step_delay = value;
            }
            ProfileOption::Retries(value) if value <= editor::RETRIES_MAX => {
                current.max_retries = value;
            }
            ProfileOption::FirstStepDelay(_) | ProfileOption::Retries(_) => {
                return Err(HostError::Denied);
            }
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
        }
        saved.set_policy(current);
        document.save_profile(saved).map_err(|_| HostError::Denied)
    })
}
pub fn trigger(path: &Path, id: Option<&str>, revision: &str) -> Result<(), HostError> {
    edit(path, revision, |document| {
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
            after.profiles[0].effective_policy().retry,
            before.profiles[0].effective_policy().retry
        );
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
        favorite(&path, &document.profiles[0].id, true, &revision).expect("first favorite");
        let revision = vantare_services::content_hash(&std::fs::read(&path).expect("first saved"));
        favorite(&path, &document.profiles[1].id, true, &revision).expect("second favorite");
        let bytes = std::fs::read(&path).expect("saved");
        let after = Document::from_bytes(&bytes).expect("saved document");
        assert!(after.profiles.iter().all(|profile| profile.favorite));
        option(
            &path,
            &document.profiles[0].id,
            ProfileOption::Startup(true),
            &vantare_services::content_hash(&bytes),
        )
        .expect("first startup");
        let bytes = std::fs::read(&path).expect("first startup saved");
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
    #[test]
    fn retries_preserve_both_ask_and_all_modes() {
        for retry in [policy::Retry::Ask, policy::Retry::All] {
            let (_root, path, bytes, _revision) = fixture();
            let mut document = Document::from_bytes(&bytes).unwrap();
            let mut policy = document.profiles[0].effective_policy();
            policy.retry = retry;
            document.profiles[0].set_policy(policy);
            let bytes = serde_json::to_vec(&document).unwrap();
            std::fs::write(&path, &bytes).unwrap();
            option(
                &path,
                &document.profiles[0].id,
                ProfileOption::Retries(3),
                &vantare_services::content_hash(&bytes),
            )
            .unwrap();
            let after = Document::from_bytes(&std::fs::read(path).unwrap()).unwrap();
            assert_eq!(after.profiles[0].effective_policy().retry, retry);
        }
    }
    #[test]
    fn first_delay_accepts_native_choices_or_the_unchanged_custom_value() {
        let (_root, path, bytes, _revision) = fixture();
        let mut document = Document::from_bytes(&bytes).unwrap();
        let id = document.profiles[0].id.clone();
        let mut policy = document.profiles[0].effective_policy();
        policy.first_step_delay = 17;
        document.profiles[0].set_policy(policy);
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let revision = vantare_services::content_hash(&bytes);
        assert_eq!(
            option(&path, &id, ProfileOption::FirstStepDelay(18), &revision),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        option(&path, &id, ProfileOption::FirstStepDelay(17), &revision).unwrap();
        for delay in FIRST_STEP_DELAYS {
            let revision = vantare_services::content_hash(&std::fs::read(&path).unwrap());
            option(&path, &id, ProfileOption::FirstStepDelay(delay), &revision).unwrap();
        }
    }
    #[test]
    fn every_new_write_is_busy_while_the_resident_is_running() {
        let (_root, path, bytes, revision) = fixture();
        let document = Document::from_bytes(&bytes).unwrap();
        let id = &document.profiles[0].id;
        let status = vantare_ipc::launcher::Status {
            version: vantare_ipc::launcher::VERSION,
            updated_ms: vantare_ipc::launcher::now_ms(),
            running: true,
            ..Default::default()
        };
        std::fs::write(
            vantare_ipc::launcher::status_path(&path),
            serde_json::to_vec(&status).unwrap(),
        )
        .unwrap();
        for result in [
            remove(&path, id, &revision),
            duplicate(&path, id, &revision),
            favorite(&path, id, false, &revision),
            option(&path, id, ProfileOption::Retries(3), &revision),
            trigger(&path, None, &revision),
        ] {
            assert_eq!(result, Err(HostError::Busy));
        }
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }
    #[test]
    fn duplicate_refuses_the_profile_limit_and_overflowing_copy_name() {
        for full in [false, true] {
            let (_root, path, bytes, _revision) = fixture();
            let mut document = Document::from_bytes(&bytes).unwrap();
            let id = document.profiles[0].id.clone();
            if full {
                while document.profiles.len() < super::super::PROFILE_LIMIT {
                    let mut copy = document.profiles[0].clone();
                    copy.id = format!("qa-{}", document.profiles.len());
                    document.profiles.push(copy);
                }
            } else {
                document.profiles[0].name = "a".repeat(editor::NAME_MAX);
            }
            let bytes = serde_json::to_vec(&document).unwrap();
            Document::from_bytes(&bytes).unwrap();
            std::fs::write(&path, &bytes).unwrap();
            assert_eq!(
                duplicate(&path, &id, &vantare_services::content_hash(&bytes)),
                Err(HostError::Denied)
            );
            assert_eq!(std::fs::read(path).unwrap(), bytes);
        }
    }
    #[test]
    fn removing_startup_and_last_profile_and_clearing_trigger_are_valid() {
        let (_root, path, bytes, _revision) = fixture();
        let mut document = Document::from_bytes(&bytes).unwrap();
        document.profiles.truncate(1);
        document.profiles[0].launch_on_windows_startup = true;
        document.lmu_trigger_profile = Some(document.profiles[0].id.clone());
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        trigger(&path, None, &vantare_services::content_hash(&bytes)).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(
            Document::from_bytes(&bytes)
                .unwrap()
                .lmu_trigger_profile
                .is_none()
        );
        assert_eq!(
            trigger(
                &path,
                Some("unknown"),
                &vantare_services::content_hash(&bytes)
            ),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        remove(
            &path,
            &document.profiles[0].id,
            &vantare_services::content_hash(&bytes),
        )
        .unwrap();
        let after = Document::from_bytes(&std::fs::read(path).unwrap()).unwrap();
        assert!(after.profiles.is_empty());
        assert!(after.lmu_trigger_profile.is_none());
    }
}
