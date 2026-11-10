//! Profile editing stays in the shared Launcher model and atomic CAS store.
use super::{Discovery, Document, HostError, Path, files, open, read};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_launcher::{Profile, Store, policy};
pub const NAME_MAX: usize = 256;
pub const DESCRIPTION_MAX: usize = 8192;
pub const NOTES_MAX: usize = 32768;
pub const HOTKEY_MAX: usize = 64;
pub const STEPS_MAX: usize = 128;
pub const RETRIES_MAX: u8 = 3;
pub const DELAY_MAX: u32 = u32::MAX;

macro_rules! choice {
    ($name:ident { $($variant:ident),+ }) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
        #[cfg_attr(any(test, feature = "bindings"), derive(TS))]
        #[serde(rename_all = "camelCase")]
        pub enum $name { $($variant),+ }
        impl $name { pub const ALL: &[Self] = &[$(Self::$variant),+]; }
    };
}
choice!(ProfileRunning {
    Ask,
    Reuse,
    Restart
});
choice!(ProfileFailure {
    Ask,
    Stop,
    Continue
});
choice!(ProfileClose {
    Ask,
    Leave,
    CloseStarted
});
choice!(ProfileRetry { Ask, Failed, All });
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileStep {
    #[serde(deserialize_with = "step_key")]
    pub key: Option<String>,
    pub app_id: String,
    pub delay_seconds: u32,
    pub has_custom_arguments: bool,
}
fn step_key<'de, D: serde::Deserializer<'de>>(input: D) -> Result<Option<String>, D::Error> {
    let key = Option::<String>::deserialize(input)?;
    if key.as_ref().is_some_and(|key| key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))) {
        return Err(serde::de::Error::custom("invalid step key"));
    }
    Ok(key)
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfilePolicy {
    pub already_running: ProfileRunning,
    pub failure: ProfileFailure,
    pub cancel: ProfileClose,
    pub exit: ProfileClose,
    pub retry: ProfileRetry,
    pub retries: u8,
    pub first_step_delay: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileDraft {
    pub id: Option<String>,
    pub name: String,
    pub favorite: bool,
    pub description: String,
    pub notes: String,
    pub advanced: bool,
    pub hotkey: String,
    pub startup: bool,
    pub steps: Vec<ProfileStep>,
    pub policy: ProfilePolicy,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileEditorView {
    pub revision: String,
    pub draft: ProfileDraft,
}
fn close(value: policy::Close) -> ProfileClose {
    match value {
        policy::Close::Ask => ProfileClose::Ask,
        policy::Close::Leave => ProfileClose::Leave,
        policy::Close::Started => ProfileClose::CloseStarted,
    }
}
fn close_policy(value: ProfileClose) -> policy::Close {
    match value {
        ProfileClose::Ask => policy::Close::Ask,
        ProfileClose::Leave => policy::Close::Leave,
        ProfileClose::CloseStarted => policy::Close::Started,
    }
}
pub fn draft(profile: &Profile) -> ProfileDraft {
    let effective = profile.effective_policy();
    ProfileDraft {
        id: Some(profile.id.clone()),
        name: profile.name.clone(),
        favorite: profile.favorite,
        description: profile.description.clone(),
        notes: profile.notes.clone(),
        advanced: profile.advanced,
        hotkey: profile.hotkey.clone(),
        startup: profile.launch_on_windows_startup,
        steps: profile
            .steps
            .iter()
            .map(|step| ProfileStep {
                key: None,
                app_id: step.app_id.clone(),
                delay_seconds: step.delay_seconds,
                has_custom_arguments: step.args_override.is_some(),
            })
            .collect(),
        policy: ProfilePolicy {
            already_running: match effective.already_running {
                policy::Running::Ask => ProfileRunning::Ask,
                policy::Running::Reuse => ProfileRunning::Reuse,
                policy::Running::Restart => ProfileRunning::Restart,
            },
            failure: match effective.failure {
                policy::Failure::Ask => ProfileFailure::Ask,
                policy::Failure::Stop => ProfileFailure::Stop,
                policy::Failure::Continue => ProfileFailure::Continue,
            },
            cancel: close(effective.cancel),
            exit: close(effective.exit),
            retry: match effective.retry {
                policy::Retry::Ask => ProfileRetry::Ask,
                policy::Retry::Failed => ProfileRetry::Failed,
                policy::Retry::All => ProfileRetry::All,
            },
            retries: effective.max_retries,
            first_step_delay: effective.first_step_delay,
        },
    }
}
pub fn new_draft() -> ProfileDraft {
    let mut profile = Profile::new(String::new(), "Nuevo perfil".into());
    profile.set_policy(policy::Policy::default());
    ProfileDraft {
        id: None,
        ..draft(&profile)
    }
}
pub fn get(path: &Path, id: Option<&str>) -> Result<ProfileEditorView, HostError> {
    let (bytes, document) = open(path)?.ok_or(HostError::Protected)?;
    let draft = match id {
        None => ProfileDraft {
            id: Some(format!(
                "profile-{}",
                vantare_services::random_id().map_err(|_| HostError::Io)?
            )),
            ..new_draft()
        },
        Some(id) => draft(
            document
                .profiles
                .iter()
                .find(|profile| profile.id == id)
                .ok_or(HostError::Denied)?,
        ),
    };
    let view = ProfileEditorView {
        revision: vantare_services::content_hash(&bytes),
        draft,
    };
    checked(view)
}
fn checked(view: ProfileEditorView) -> Result<ProfileEditorView, HostError> {
    let response = crate::protocol::HostToUi::Response {
        id: u32::MAX,
        result: crate::protocol::Reply::LauncherProfileGet {
            value: view.clone(),
        },
    };
    crate::frame::write(&mut std::io::sink(), &response).map_err(|_| HostError::Protected)?;
    Ok(view)
}
fn apply(
    document: &mut Document,
    value: &ProfileDraft,
    found: &Discovery,
    reserved_new: Option<&str>,
    keys: Option<&StepKeys>,
) -> Result<(), HostError> {
    if value.name.len() > NAME_MAX
        || value.description.len() > DESCRIPTION_MAX
        || value.notes.len() > NOTES_MAX
        || value.hotkey.len() > HOTKEY_MAX
        || value.steps.len() > STEPS_MAX
        || value.policy.retries > RETRIES_MAX
    {
        return Err(HostError::Denied);
    }
    let id = value.id.as_deref().ok_or(HostError::Denied)?;
    let mut profile = match document.profiles.iter().find(|profile| profile.id == id) {
        Some(profile) => profile.clone(),
        None if reserved_new == Some(id) => Profile::new(id.into(), value.name.clone()),
        None => return Err(HostError::Denied),
    };
    profile.name.clone_from(&value.name);
    profile.favorite = value.favorite;
    profile.description.clone_from(&value.description);
    profile.notes.clone_from(&value.notes);
    profile.advanced = value.advanced;
    profile.hotkey.clone_from(&value.hotkey);
    profile.launch_on_windows_startup = value.startup;
    profile.steps = steps::preserve(&profile, value, keys)?;
    profile.set_policy(policy::Policy {
        already_running: match value.policy.already_running {
            ProfileRunning::Ask => policy::Running::Ask,
            ProfileRunning::Reuse => policy::Running::Reuse,
            ProfileRunning::Restart => policy::Running::Restart,
        },
        failure: match value.policy.failure {
            ProfileFailure::Ask => policy::Failure::Ask,
            ProfileFailure::Stop => policy::Failure::Stop,
            ProfileFailure::Continue => policy::Failure::Continue,
        },
        cancel: close_policy(value.policy.cancel),
        exit: close_policy(value.policy.exit),
        retry: match value.policy.retry {
            ProfileRetry::Ask => policy::Retry::Ask,
            ProfileRetry::Failed => policy::Retry::Failed,
            ProfileRetry::All => policy::Retry::All,
        },
        max_retries: value.policy.retries,
        first_step_delay: value.policy.first_step_delay,
    });
    profile
        .validate_editor(found)
        .map_err(|_| HostError::Denied)?;
    document
        .save_profile(profile)
        .map_err(|_| HostError::Denied)
}
pub fn save(
    path: &Path,
    value: &ProfileDraft,
    revision: &str,
    found: &Discovery,
    reserved_new: Option<&str>,
    keys: Option<&StepKeys>,
) -> Result<(), HostError> {
    let (bytes, _) = open(path)?.ok_or(HostError::Protected)?;
    if vantare_services::content_hash(&bytes) != revision {
        return Err(HostError::LauncherConflict {
            current: read(path),
        });
    }
    // Establish preserve()'s invariant before apply: this exact document revision
    // and profile own the current read capabilities. CAS checks the bytes again.
    if keys.is_some_and(|keys| !keys.matches(value.id.as_deref(), revision)) {
        return Err(HostError::Denied);
    }
    let mut store = Store::from_observed(path.into(), bytes).map_err(|_| HostError::Protected)?;
    let mut document = store.document.clone();
    apply(&mut document, value, found, reserved_new, keys)?;
    store.replace(document).map_err(|error| {
        if error.kind().is_conflict() {
            HostError::LauncherConflict {
                current: read(path),
            }
        } else if error.kind() == files::Kind::Busy {
            HostError::Busy
        } else {
            HostError::Io
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editor_wire_rejects_executable_paths_and_unknown_fields() {
        let mut value = serde_json::to_value(new_draft()).unwrap();
        value["executable"] = serde_json::json!("D:/QA/forbidden.exe");
        assert!(serde_json::from_value::<ProfileDraft>(value).is_err());
        let value = serde_json::json!({ "appId":"lmu", "delaySeconds":0, "hasCustomArguments":false, "path":"D:/QA/forbidden.exe" });
        assert!(serde_json::from_value::<ProfileStep>(value).is_err());
    }
    #[test]
    fn mock_new_profile_is_exactly_the_rust_default() {
        let fixture: ProfileEditorView = serde_json::from_str(include_str!(
            "../../../../hub-web/fixtures/launcher-editor.json"
        ))
        .unwrap();
        assert_eq!(fixture.draft, new_draft());
    }
    fn available(document: &Document) -> Discovery {
        Discovery {
            apps: document
                .apps
                .iter()
                .map(|app| vantare_launcher::discovery::Detected {
                    id: app.id.clone(),
                    executable: None,
                    availability: vantare_launcher::discovery::Availability {
                        launchable: true,
                        ..Default::default()
                    },
                })
                .collect(),
            ..Default::default()
        }
    }
    #[test]
    fn arguments_never_cross_the_contract_and_only_matching_existing_steps_keep_them() {
        let mut document = Document::fresh_install();
        document.profiles[0].steps[0].args_override =
            Some(vec!["--existing-private-argument".into()]);
        let mut view = ProfileEditorView {
            revision: "0".repeat(64),
            draft: draft(&document.profiles[0]),
        };
        let keys = StepKeys::issue(&mut view).unwrap();
        let mut value = view.draft;
        assert!(value.steps[0].has_custom_arguments);
        let json = serde_json::to_string(&value).unwrap();
        assert!(!json.contains("argsOverride") && !json.contains("existing-private-argument"));
        let mut forged = serde_json::to_value(&value.steps[0]).unwrap();
        forged["argsOverride"] = serde_json::json!(["--renderer-cmd-prefix=untrusted"]);
        assert!(serde_json::from_value::<ProfileStep>(forged).is_err());
        let found = available(&document);
        value.steps[0].has_custom_arguments = false;
        apply(&mut document, &value, &found, None, Some(&keys)).unwrap();
        assert_eq!(
            document.profiles[0].steps[0].args_override,
            Some(vec!["--existing-private-argument".into()])
        );
        value.advanced = true;
        value.steps[0].app_id = "obs".into();
        value.steps.push(ProfileStep {
            key: None,
            app_id: "lmu".into(),
            delay_seconds: 0,
            has_custom_arguments: true,
        });
        apply(&mut document, &value, &found, None, Some(&keys)).unwrap();
        assert!(document.profiles[0].steps[0].args_override.is_none());
        assert!(
            document.profiles[0]
                .steps
                .last()
                .unwrap()
                .args_override
                .is_none()
        );
    }
    #[test]
    fn opaque_keys_keep_duplicate_app_steps_distinct_when_swapped_or_preceded_by_a_new_step() {
        let mut original = Document::fresh_install();
        let mut first = original.profiles[0].steps[0].clone();
        first.args_override = Some(vec!["private-first".into()]);
        let mut second = first.clone();
        second.args_override = Some(vec!["private-second".into()]);
        original.profiles[0].advanced = true;
        original.profiles[0].steps = vec![first, second];
        let found = available(&original);
        let mut view = ProfileEditorView {
            revision: "0".repeat(64),
            draft: draft(&original.profiles[0]),
        };
        let keys = StepKeys::issue(&mut view).unwrap();
        let mut swapped = view.draft.clone();
        swapped.steps.swap(0, 1);
        let mut copy = original.clone();
        apply(&mut copy, &swapped, &found, None, Some(&keys)).unwrap();
        assert_eq!(
            copy.profiles[0].steps[0].args_override,
            Some(vec!["private-second".into()])
        );
        assert_eq!(
            copy.profiles[0].steps[1].args_override,
            Some(vec!["private-first".into()])
        );
        let mut inserted = view.draft.clone();
        inserted.steps.insert(
            0,
            ProfileStep {
                key: None,
                app_id: "lmu".into(),
                delay_seconds: 0,
                has_custom_arguments: false,
            },
        );
        let mut copy = original.clone();
        apply(&mut copy, &inserted, &found, None, Some(&keys)).unwrap();
        assert!(copy.profiles[0].steps[0].args_override.is_none());
        assert_eq!(
            copy.profiles[0].steps[1].args_override,
            original.profiles[0].steps[0].args_override
        );
        assert_eq!(
            copy.profiles[0].steps[2].args_override,
            original.profiles[0].steps[1].args_override
        );
        let mut changed = view.draft;
        changed.steps[0].app_id = "obs".into();
        let mut copy = original.clone();
        apply(&mut copy, &changed, &found, None, Some(&keys)).unwrap();
        assert!(copy.profiles[0].steps[0].args_override.is_none());
        assert_eq!(
            copy.profiles[0].steps[1].args_override,
            original.profiles[0].steps[1].args_override
        );
    }
    #[test]
    fn invented_repeated_and_other_read_keys_are_rejected_without_changes() {
        let original = Document::fresh_install();
        let found = available(&original);
        let mut view = ProfileEditorView {
            revision: "0".repeat(64),
            draft: draft(&original.profiles[0]),
        };
        let keys = StepKeys::issue(&mut view).unwrap();
        let mut forged = view.draft.clone();
        forged.steps[0].key = Some("f".repeat(64));
        let mut copy = original.clone();
        assert_eq!(
            apply(&mut copy, &forged, &found, None, Some(&keys)),
            Err(HostError::Denied)
        );
        assert_eq!(
            serde_json::to_vec(&copy).unwrap(),
            serde_json::to_vec(&original).unwrap()
        );
        let mut repeated = view.draft.clone();
        repeated.steps[1].key.clone_from(&view.draft.steps[0].key);
        assert_eq!(
            apply(&mut copy, &repeated, &found, None, Some(&keys)),
            Err(HostError::Denied)
        );
        let old = view.draft.clone();
        view.revision = "1".repeat(64);
        let other = StepKeys::issue(&mut view).unwrap();
        assert!(!other.matches(view.draft.id.as_deref(), &"0".repeat(64)));
        assert_eq!(
            apply(&mut copy, &old, &found, None, Some(&other)),
            Err(HostError::Denied)
        );
        assert_eq!(
            serde_json::to_vec(&copy).unwrap(),
            serde_json::to_vec(&original).unwrap()
        );
    }
    #[test]
    fn favorites_remain_multiple_but_startup_is_exclusive() {
        let mut document = Document::fresh_install();
        document.profiles[1].favorite = true;
        document.profiles[1].launch_on_windows_startup = true;
        let found = available(&document);
        let mut value = draft(&document.profiles[0]);
        value.favorite = true;
        value.startup = true;
        apply(&mut document, &value, &found, None, None).unwrap();
        assert!(document.profiles.iter().all(|profile| profile.favorite));
        assert!(document.profiles[0].launch_on_windows_startup);
        assert!(!document.profiles[1].launch_on_windows_startup);
    }
    #[test]
    fn invalid_text_and_basic_duplicate_apps_do_not_change_the_document() {
        let document = Document::fresh_install();
        let found = available(&document);
        let initial = serde_json::to_vec(&document).unwrap();
        for case in 0..5 {
            let mut copy = document.clone();
            let mut value = draft(&copy.profiles[0]);
            match case {
                0 => value.name.clear(),
                1 => value.name = "bad\0name".into(),
                2 => value.description = "bad\0description".into(),
                3 => value.notes = "bad\0notes".into(),
                _ => {
                    value.advanced = false;
                    value.steps.push(value.steps[0].clone());
                }
            }
            assert_eq!(
                apply(&mut copy, &value, &found, None, None),
                Err(HostError::Denied)
            );
            assert_eq!(serde_json::to_vec(&copy).unwrap(), initial);
        }
    }
    #[test]
    fn host_limits_match_the_shared_launcher_behavior_at_each_boundary() {
        let document = Document::fresh_install();
        let found = available(&document);
        for (field, maximum) in [(0, NAME_MAX), (1, DESCRIPTION_MAX), (2, NOTES_MAX)] {
            for (length, accepted) in [(maximum, true), (maximum + 1, false)] {
                let mut profile = document.profiles[0].clone();
                match field {
                    0 => profile.name = "x".repeat(length),
                    1 => profile.description = "x".repeat(length),
                    _ => profile.notes = "x".repeat(length),
                }
                assert_eq!(profile.validate_editor(&found).is_ok(), accepted);
            }
        }
        let hotkey = format!(
            "ctrl+shift+1{}",
            " ".repeat(HOTKEY_MAX - "ctrl+shift+1".len())
        );
        assert!(vantare_launcher::triggers::Hotkey::parse(&hotkey).is_ok());
        assert!(vantare_launcher::triggers::Hotkey::parse(&(hotkey + " ")).is_err());
        for (count, accepted) in [(STEPS_MAX, true), (STEPS_MAX + 1, false)] {
            let mut copy = document.clone();
            copy.profiles[0].advanced = true;
            copy.profiles[0].steps = vec![copy.profiles[0].steps[0].clone(); count];
            assert_eq!(copy.validate().is_ok(), accepted);
        }
        for (retries, accepted) in [(RETRIES_MAX, true), (RETRIES_MAX + 1, false)] {
            let mut copy = document.clone();
            let mut policy = copy.profiles[0].effective_policy();
            policy.max_retries = retries;
            copy.profiles[0].set_policy(policy);
            assert_eq!(copy.validate().is_ok(), accepted);
        }
    }
    #[cfg(windows)]
    #[test]
    fn keys_from_another_revision_or_replaced_read_cannot_save_and_never_write() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::fresh_install();
        std::fs::write(&path, serde_json::to_vec(&document).unwrap()).unwrap();
        let found = available(&document);
        let mut keys = StepKeys::default();
        let old = keys.open(&path, Some("creator")).unwrap();
        document.profiles[1].name = "Cambio ajeno".into();
        let changed = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &changed).unwrap();
        let revision = vantare_services::content_hash(&changed);
        assert_eq!(
            save(&path, &old.draft, &revision, &found, None, Some(&keys)),
            Err(HostError::Denied)
        );
        let fresh = keys.open(&path, Some("creator")).unwrap();
        assert_eq!(
            save(
                &path,
                &old.draft,
                &fresh.revision,
                &found,
                None,
                Some(&keys)
            ),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).unwrap(), changed);
        save(
            &path,
            &fresh.draft,
            &fresh.revision,
            &found,
            None,
            Some(&keys),
        )
        .unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn editor_get_and_save_protect_missing_malformed_and_future_documents_without_writes() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let value = draft(&Document::fresh_install().profiles[0]);
        assert_eq!(get(&path, Some("creator")), Err(HostError::Protected));
        assert_eq!(
            save(
                &path,
                &value,
                &"0".repeat(64),
                &Discovery::default(),
                None,
                None
            ),
            Err(HostError::Protected)
        );
        assert!(!path.exists());
        for bytes in [b"{".as_slice(), br#"{"version":999}"#] {
            std::fs::write(&path, bytes).unwrap();
            assert_eq!(get(&path, Some("creator")), Err(HostError::Protected));
            assert_eq!(
                save(
                    &path,
                    &value,
                    &"0".repeat(64),
                    &Discovery::default(),
                    None,
                    None
                ),
                Err(HostError::Protected)
            );
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
        }
    }
    #[cfg(windows)]
    #[test]
    fn large_private_arguments_are_not_projected_and_oversized_metadata_is_protected() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::fresh_install();
        let repeated = document.profiles[0].steps[0].clone();
        document.profiles[0]
            .steps
            .extend([repeated.clone(), repeated]);
        for step in &mut document.profiles[0].steps {
            step.args_override = Some(vec!["x".repeat(8192 - 128); 128]);
        }
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        assert!(bytes.len() > 4 * 1024 * 1024);
        assert!(bytes.len() as u64 <= files::MAX_DOCUMENT);
        let view = get(&path, Some("creator")).unwrap();
        assert!(serde_json::to_vec(&view).unwrap().len() < crate::frame::LIMIT);
        assert!(
            view.draft
                .steps
                .iter()
                .all(|step| step.has_custom_arguments)
        );
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        for step in &mut document.profiles[0].steps {
            step.args_override = None;
        }
        document.profiles[0].description = "x".repeat(2 * 1024 * 1024);
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        assert_eq!(get(&path, Some("creator")), Err(HostError::Protected));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
    #[test]
    fn editor_preserves_statistics_imported_provenance_and_unedited_profiles() {
        let mut document = Document::fresh_install();
        document.profiles[0].launch_count = 9;
        document.profiles[0].imported = true;
        document.profiles[1].first_step_delay = 23;
        let untouched = serde_json::to_vec(&document.profiles[1]).unwrap();
        let mut value = draft(&document.profiles[0]);
        value.name = "Editado".into();
        apply(
            &mut document,
            &value,
            &available(&Document::fresh_install()),
            None,
            None,
        )
        .unwrap();
        assert_eq!(document.profiles[0].launch_count, 9);
        assert!(document.profiles[0].imported);
        assert_eq!(
            serde_json::to_vec(&document.profiles[1]).unwrap(),
            untouched
        );
    }
    #[test]
    fn validates_unknown_apps_limits_duplicate_hotkeys_and_retains_custom_delay() {
        let mut document = Document::fresh_install();
        let found = available(&document);
        let mut value = draft(&document.profiles[0]);
        value.policy.first_step_delay = u32::MAX;
        apply(&mut document, &value, &found, None, None).unwrap();
        assert_eq!(
            document.profiles[0].effective_policy().first_step_delay,
            u32::MAX
        );
        value.steps[0].app_id = "untrusted".into();
        assert_eq!(
            apply(&mut document, &value, &found, None, None),
            Err(HostError::Denied)
        );
        value = draft(&document.profiles[0]);
        value.steps = vec![value.steps[0].clone(); STEPS_MAX + 1];
        assert_eq!(
            apply(&mut document, &value, &found, None, None),
            Err(HostError::Denied)
        );
        value = draft(&document.profiles[0]);
        document.profiles[1].hotkey = "ctrl+shift+1".into();
        value.hotkey = "ctrl+shift+1".into();
        assert_eq!(
            apply(&mut document, &value, &found, None, None),
            Err(HostError::Denied)
        );
        value.hotkey = "ctrl+c".into();
        assert_eq!(
            apply(&mut document, &value, &found, None, None),
            Err(HostError::Denied)
        );
    }
    #[test]
    fn a_reserved_creation_id_is_required_and_retry_updates_the_same_profile() {
        let mut document = Document::fresh_install();
        let found = available(&document);
        let mut value = draft(&document.profiles[0]);
        value.id = Some("profile-reserved".into());
        value.name = "Mi perfil".into();
        assert_eq!(
            apply(&mut document, &value, &found, None, None),
            Err(HostError::Denied)
        );
        let count = document.profiles.len();
        apply(
            &mut document,
            &value,
            &found,
            Some("profile-reserved"),
            None,
        )
        .unwrap();
        assert_eq!(document.profiles.len(), count + 1);
        value.name = "Reintento explícito".into();
        apply(
            &mut document,
            &value,
            &found,
            Some("profile-reserved"),
            None,
        )
        .unwrap();
        assert_eq!(document.profiles.len(), count + 1);
        assert_eq!(document.profiles.last().unwrap().name, value.name);
    }
    #[cfg(windows)]
    #[test]
    fn conflicts_and_invalid_drafts_have_zero_file_effects_then_retry_uses_current_revision() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let document = Document::fresh_install();
        let found = available(&document);
        let bytes = serde_json::to_vec_pretty(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let mut edit = get(&path, Some("creator")).unwrap();
        edit.draft.name = "Cambio propio".into();
        let mut concurrent = document.clone();
        concurrent.profiles[1].name = "Cambio ajeno".into();
        let changed = serde_json::to_vec_pretty(&concurrent).unwrap();
        std::fs::write(&path, &changed).unwrap();
        assert!(matches!(
            save(&path, &edit.draft, &edit.revision, &found, None, None),
            Err(HostError::LauncherConflict { .. })
        ));
        assert_eq!(std::fs::read(&path).unwrap(), changed);
        let revision = vantare_services::content_hash(&changed);
        save(&path, &edit.draft, &revision, &found, None, None).unwrap();
        let saved = Document::from_bytes(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved.profiles[0].name, "Cambio propio");
        assert_eq!(saved.profiles[1].name, "Cambio ajeno");
    }
}

mod steps;
pub use steps::StepKeys;
