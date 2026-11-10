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
    let registration = status
        .filter(|status| launcher::is_fresh(status))
        .and_then(|status| {
            status
                .profiles
                .iter()
                .find(|item| item.profile == profile.id && item.hotkey == profile.hotkey)
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
    let mut profiles = document
        .profiles
        .iter()
        .filter(|profile| !profile.hotkey.is_empty())
        .map(|profile| ProfileShortcut {
            name: profile.name.clone(),
            hotkey: profile.hotkey.clone(),
            state: state(profile, status.as_ref()),
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
