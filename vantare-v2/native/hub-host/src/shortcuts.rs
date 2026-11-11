//! Read-only projection. Reading shortcuts never registers or launches a profile.
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{files, launcher};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum RegistrationState {
    Unconfirmed,
    Registered,
    Inactive,
    Error,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileShortcut {
    pub id: String,
    pub name: String,
    pub hotkey: String,
    pub state: RegistrationState,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShortcutsView {
    pub profiles: Vec<ProfileShortcut>,
    pub protected: bool,
}

fn state(
    profile: &vantare_launcher::Profile,
    status: Option<&launcher::Status>,
) -> RegistrationState {
    registration_state(&profile.id, &profile.hotkey, status)
}

pub(crate) fn registration_state(
    id: &str,
    hotkey: &str,
    status: Option<&launcher::Status>,
) -> RegistrationState {
    let registration = status
        .filter(|status| launcher::is_fresh(status))
        .and_then(|status| {
            status
                .profiles
                .iter()
                .find(|item| item.profile == id && item.hotkey == hotkey)
        });
    match registration {
        None => RegistrationState::Unconfirmed,
        Some(item) if item.error.is_some() => RegistrationState::Error,
        Some(item) if item.registered => RegistrationState::Registered,
        Some(_) => RegistrationState::Inactive,
    }
}

pub fn read(path: &Path) -> ShortcutsView {
    let document = match files::read_optional(path, files::MAX_DOCUMENT) {
        Ok(None) => return ShortcutsView::default(),
        Ok(Some(bytes)) => vantare_launcher::Document::from_bytes(&bytes),
        Err(_) => {
            return ShortcutsView {
                protected: true,
                ..ShortcutsView::default()
            };
        }
    };
    let Ok(document) = document else {
        return ShortcutsView {
            protected: true,
            ..ShortcutsView::default()
        };
    };
    let status = launcher::read_status(path);
    project(&document, status.as_ref())
}

pub(crate) fn project(
    document: &vantare_launcher::Document,
    status: Option<&launcher::Status>,
) -> ShortcutsView {
    let mut profiles = document
        .profiles
        .iter()
        .filter(|profile| !profile.hotkey.is_empty())
        .map(|profile| ProfileShortcut {
            id: profile.id.clone(),
            name: profile.name.clone(),
            hotkey: profile.hotkey.clone(),
            state: state(profile, status),
        })
        .collect::<Vec<_>>();
    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    ShortcutsView {
        profiles,
        protected: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registration_requires_a_fresh_matching_profile_and_combination() {
        let mut profile = vantare_launcher::Profile::new("qa".into(), "Perfil QA".into());
        profile.hotkey = "Ctrl Alt F8".into();
        let mut status = launcher::Status {
            version: launcher::VERSION,
            updated_ms: launcher::now_ms(),
            profiles: vec![launcher::Registration {
                profile: profile.id.clone(),
                hotkey: profile.hotkey.clone(),
                registered: true,
                error: None,
            }],
            ..Default::default()
        };
        assert_eq!(
            state(&profile, Some(&status)),
            RegistrationState::Registered
        );
        status.updated_ms = 0;
        assert_eq!(
            state(&profile, Some(&status)),
            RegistrationState::Unconfirmed
        );
        status.updated_ms = launcher::now_ms();
        status.profiles[0].hotkey = "Ctrl Alt F9".into();
        assert_eq!(
            state(&profile, Some(&status)),
            RegistrationState::Unconfirmed
        );
        status.profiles[0].hotkey.clone_from(&profile.hotkey);
        status.profiles[0].error = Some("QA registration denied".into());
        assert_eq!(state(&profile, Some(&status)), RegistrationState::Error);
    }
}

#[cfg(all(test, windows))]
mod read_tests {
    use super::*;
    use crate::test_support::Root;
    #[test]
    fn missing_malformed_and_ordered_documents_remain_read_only() {
        let root = Root::new();
        let path = root.path.join("launcher.json");
        let view = read(&path);
        assert!(view.profiles.is_empty());
        assert!(!view.protected);
        assert!(!path.exists());
        let invalid = br#"{"version":999}"#;
        std::fs::write(&path, invalid).expect("invalid fixture");
        assert!(read(&path).protected);
        assert_eq!(std::fs::read(&path).expect("untouched"), invalid);
        let mut document = vantare_launcher::Document::default();
        for (id, name, hotkey) in [
            ("qa-z", "Zulu", "Ctrl Alt F9"),
            ("qa-a", "Alpha", "Ctrl Alt F8"),
        ] {
            let mut profile = vantare_launcher::Profile::new(id.into(), name.into());
            profile.hotkey = hotkey.into();
            document.profiles.push(profile);
        }
        let bytes = serde_json::to_vec(&document).expect("fixture");
        std::fs::write(&path, &bytes).expect("valid fixture");
        let view = read(&path);
        assert!(!view.protected);
        assert_eq!(
            view.profiles
                .iter()
                .map(|p| p.id.as_str())
                .collect::<Vec<_>>(),
            ["qa-a", "qa-z"]
        );
        assert!(
            view.profiles
                .iter()
                .all(|p| p.state == RegistrationState::Unconfirmed)
        );
        assert_eq!(std::fs::read(path).expect("still untouched"), bytes);
    }
}
