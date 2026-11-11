//! Frozen Hub privacy adoption and CAS, using the existing consent/cleanup engine.
use crate::protocol::HostError;
pub const POLICY_URL: &str = "https://vantare.app/privacidad";
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::files;
use vantare_services::diagnostics::{ConsentSaveError, PRIVACY_FILE, Privacy};
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct PrivacyView {
    pub crashes: bool,
    pub usage: bool,
    pub crashes_decided: bool,
    pub usage_decided: bool,
    pub revision: String,
    pub protected: bool,
    pub cleanup_pending: bool,
    pub cleanup_busy: bool,
    pub reporting_configured: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "field",
    content = "value",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum PrivacyPatch {
    Crashes(bool),
    Usage(bool),
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MailView {
    pub consent: bool,
}
#[allow(clippy::struct_excessive_bools)] // Disk protection/cleanup and an independent session-only privacy decision.
pub struct State {
    root: Result<PathBuf, HostError>,
    value: Privacy,
    observed: Option<Vec<u8>>,
    protected: bool,
    cleanup_pending: bool,
    cleanup_busy: bool,
    private_session: bool,
}
fn adopt(data: &Path, shared: &Path) -> Result<(), HostError> {
    if data == shared {
        return Ok(());
    }
    let source = data.join(PRIVACY_FILE);
    let destination = shared.join(PRIVACY_FILE);
    let marker = data.join("privacy.json.adopted");
    if marker.try_exists().map_err(|_| HostError::Io)? {
        return Ok(());
    }
    let legacy = match files::read_optional(&source, 1024) {
        Ok(None) => return Ok(()),
        Ok(Some(bytes)) => Some(bytes),
        Err(_) => None,
    };
    let candidate = if destination.try_exists().map_err(|_| HostError::Io)? {
        None
    } else {
        legacy.filter(|bytes| serde_json::from_slice::<Privacy>(bytes).is_ok())
    };
    // Mark before publishing: revocation must never resurrect a legacy yes.
    if files::save(
        &marker,
        b"adoption attempted\n",
        files::Mode::Observed(None),
        &files::Options::default(),
    )
    .is_err()
    {
        return if marker.try_exists().unwrap_or(false) {
            Ok(())
        } else {
            Err(HostError::Io)
        };
    }
    if let Some(bytes) = candidate
        && files::save(
            &destination,
            &bytes,
            files::Mode::Observed(None),
            &files::Options::default(),
        )
        .is_err()
        && !destination.try_exists().unwrap_or(false)
    {
        return Err(HostError::Io);
    }
    Ok(())
}
impl State {
    pub fn open(data: &Path) -> Self {
        let root = vantare_services::diagnostics::data_root()
            .map_err(|_| HostError::Io)
            .and_then(|shared| {
                adopt(data, &shared)?;
                Ok(shared)
            });
        Self::at(root)
    }
    #[cfg(test)]
    pub(crate) fn isolated(root: &Path) -> Self {
        Self::at(Ok(root.to_path_buf()))
    }
    fn at(root: Result<PathBuf, HostError>) -> Self {
        let mut state = Self {
            root,
            value: Privacy::default(),
            observed: None,
            protected: false,
            cleanup_pending: false,
            cleanup_busy: false,
            private_session: false,
        };
        state.reload();
        state
    }
    fn reload(&mut self) {
        let Ok(root) = &self.root else {
            self.protect();
            return;
        };
        let read = files::read_optional(&root.join(PRIVACY_FILE), 1024)
            .map_err(|_| HostError::Io)
            .and_then(|bytes| {
                let value = Privacy::load(root).map_err(|_| HostError::Protected)?;
                Ok((value, bytes))
            });
        match read {
            Ok((value, bytes)) => {
                if value.crashes
                    || value.usage
                    || bytes
                        .as_deref()
                        .and_then(|bytes| serde_json::from_slice::<Privacy>(bytes).ok())
                        .is_some_and(|raw| raw.crashes || raw.usage)
                {
                    self.private_session = false;
                }
                self.value = if self.private_session {
                    private_value(value)
                } else {
                    value
                };
                self.observed = bytes;
                self.protected = false;
                let cleanup = value.discard_disabled(root);
                self.cleanup_busy = matches!(cleanup, Err(vantare_services::Error::Busy));
                self.cleanup_pending = cleanup.is_err();
            }
            Err(_) => self.protect(),
        }
    }
    fn protect(&mut self) {
        self.private_session = false;
        self.value = Privacy::default();
        self.observed = None;
        self.protected = true;
        self.cleanup_pending = false;
        self.cleanup_busy = false;
    }
    pub fn enter_private(&mut self) -> Result<(), HostError> {
        self.reload();
        if self.protected
            || self.value.crashes
            || self.value.usage
            || self
                .observed
                .as_deref()
                .and_then(|bytes| serde_json::from_slice::<Privacy>(bytes).ok())
                .is_some_and(|raw| raw.crashes || raw.usage)
        {
            return Err(HostError::Denied);
        }
        self.value = private_value(self.value);
        self.private_session = true;
        Ok(())
    }
    pub fn private_active(&self) -> bool {
        self.private_session
    }
    pub fn view(&self) -> PrivacyView {
        PrivacyView {
            crashes: !self.private_session && self.value.crashes,
            usage: !self.private_session && self.value.usage,
            crashes_decided: self.private_session || self.value.crashes_decided,
            usage_decided: self.private_session || self.value.usage_decided,
            revision: vantare_services::content_hash(self.observed.as_deref().unwrap_or_default()),
            protected: self.protected,
            cleanup_pending: self.cleanup_pending,
            cleanup_busy: self.cleanup_busy,
            reporting_configured: vantare_services::diagnostics::configured(),
        }
    }
    pub fn refresh(&mut self) -> PrivacyView {
        self.reload();
        self.view()
    }
    pub fn update(
        &mut self,
        patch: PrivacyPatch,
        revision: &str,
    ) -> Result<PrivacyView, HostError> {
        if self.protected {
            return Err(HostError::Protected);
        }
        if revision != self.view().revision {
            self.reload();
            return Err(HostError::PrivacyConflict {
                current: self.view(),
            });
        }
        let root = self.root.as_ref().map_err(Clone::clone)?;
        let mut next = self.value;
        match patch {
            PrivacyPatch::Crashes(value) => {
                next.crashes = value;
                next.crashes_decided = true;
            }
            PrivacyPatch::Usage(value) => {
                next.usage = value;
                next.usage_decided = true;
            }
        }
        let mut saved = None;
        let result = Privacy::try_save_with(root, next, |value| {
            let bytes = serde_json::to_vec(&value).map_err(|_| "serialize privacy".to_owned())?;
            files::save(
                &root.join(PRIVACY_FILE),
                &bytes,
                files::Mode::Observed(self.observed.as_deref()),
                &files::Options {
                    limit: 1024,
                    ..Default::default()
                },
            )
            .map_err(|_| "privacy write failed".to_owned())?;
            saved = Some(bytes);
            Ok(())
        });
        match result {
            Ok(value) => {
                self.private_session = false;
                self.value = value;
                self.observed = saved;
                self.cleanup_pending = false;
                self.cleanup_busy = false;
                Ok(self.view())
            }
            Err(ConsentSaveError::Busy) => Err(HostError::Busy),
            Err(ConsentSaveError::Failed(_)) => {
                if let Some(bytes) = saved {
                    self.private_session = false;
                    self.value = serde_json::from_slice(&bytes).map_err(|_| HostError::Io)?;
                    self.observed = Some(bytes);
                    self.cleanup_pending = true;
                    self.cleanup_busy = false;
                    return Err(HostError::PrivacyCleanup {
                        current: self.view(),
                    });
                }
                let before = self.observed.clone();
                self.reload();
                if self.protected {
                    Err(HostError::Protected)
                } else if self.observed != before {
                    Err(HostError::PrivacyConflict {
                        current: self.view(),
                    })
                } else {
                    Err(HostError::Io)
                }
            }
        }
    }
}
#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::test_support::Root;
    #[test]
    fn a_busy_cleanup_does_not_protect_the_document_and_can_retry_without_reload() {
        let root = Root::new();
        let mut state = State::isolated(&root.path);
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.path.join("consent.lock"))
            .expect("lock");
        lock.try_lock().expect("exclusive consent");
        let view = state.refresh();
        assert!(view.cleanup_pending && view.cleanup_busy && !view.protected);
        assert!(matches!(
            state.update(PrivacyPatch::Crashes(true), &view.revision),
            Err(HostError::Busy)
        ));
        drop(lock);
        let saved = state
            .update(PrivacyPatch::Crashes(true), &view.revision)
            .expect("retry without reload");
        assert!(saved.crashes && !saved.cleanup_busy && !saved.cleanup_pending);
    }
    #[test]
    fn a_durable_choice_with_failed_cleanup_is_not_a_conflict() {
        let root = Root::new();
        let mut state = State::isolated(&root.path);
        std::fs::create_dir(root.path.join("anonymous-id")).expect("inert cleanup obstruction");
        let result = state.update(PrivacyPatch::Crashes(true), &state.view().revision);
        assert!(
            matches!(result, Err(HostError::PrivacyCleanup { current }) if current.crashes && current.cleanup_pending)
        );
        assert!(Privacy::load(&root.path).expect("durable consent").crashes);
        std::fs::remove_dir(root.path.join("anonymous-id")).expect("remove obstruction");
        assert!(!state.refresh().cleanup_pending);
    }
    #[test]
    fn persist_failure_preserves_the_document_and_confirmed_choice() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = Root::new();
        let mut state = State::isolated(&root.path);
        let view = state
            .update(PrivacyPatch::Crashes(true), &state.view().revision)
            .expect("initial choice");
        let path = root.path.join(PRIVACY_FILE);
        let bytes = std::fs::read(&path).expect("initial bytes");
        let guard = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .expect("deny atomic replacement");
        assert!(matches!(
            state.update(PrivacyPatch::Crashes(false), &view.revision),
            Err(HostError::Io)
        ));
        assert_eq!(state.view(), view);
        assert_eq!(std::fs::read(&path).expect("preserved bytes"), bytes);
        drop(guard);
    }
    #[test]
    fn explicit_choices_cas_and_cleanup_preserve_the_other_permission() {
        let root = Root::new();
        let mut state = State::at(Ok(root.path.clone()));
        let revision = state.view().revision;
        let view = state
            .update(PrivacyPatch::Crashes(true), &revision)
            .expect("opt in");
        assert!(view.crashes);
        assert!(!view.usage_decided);
        let mut external = state.value;
        external.usage = true;
        external.usage_decided = true;
        std::fs::write(
            root.path.join(PRIVACY_FILE),
            serde_json::to_vec(&external).expect("winner"),
        )
        .expect("write");
        assert!(matches!(
            state.update(PrivacyPatch::Crashes(false), &view.revision),
            Err(HostError::PrivacyConflict { .. })
        ));
        let view = state
            .update(PrivacyPatch::Crashes(false), &state.view().revision)
            .expect("retry only crashes");
        assert!(!view.crashes);
        assert!(view.usage);
    }
    #[test]
    fn corruption_after_an_opt_in_forgets_the_previous_yes_without_rewriting() {
        let root = Root::new();
        let mut state = State::at(Ok(root.path.clone()));
        state
            .update(PrivacyPatch::Crashes(true), &state.view().revision)
            .expect("opt in");
        state
            .update(PrivacyPatch::Usage(true), &state.view().revision)
            .expect("opt in usage");
        let path = root.path.join(PRIVACY_FILE);
        let corrupt = b"{invalid privacy";
        std::fs::write(&path, corrupt).expect("external corruption");
        let view = state.refresh();
        assert!(view.protected);
        assert!(!view.crashes && !view.usage && !view.crashes_decided && !view.usage_decided);
        assert_eq!(view.revision, vantare_services::content_hash(b""));
        assert!(state.observed.is_none());
        assert!(matches!(
            state.update(PrivacyPatch::Crashes(true), &view.revision),
            Err(HostError::Protected)
        ));
        assert_eq!(std::fs::read(path).expect("corruption preserved"), corrupt);
    }
    #[test]
    fn malformed_legacy_is_marked_without_importing_a_permission_or_rewriting_it() {
        let root = Root::new();
        let data = root.path.join("hub");
        let shared = root.path.join("native");
        std::fs::create_dir_all(&data).expect("source");
        std::fs::create_dir_all(&shared).expect("destination");
        let source = data.join(PRIVACY_FILE);
        std::fs::write(&source, b"{bad legacy").expect("malformed");
        adopt(&data, &shared).expect("skip legacy with protective marker");
        assert!(data.join("privacy.json.adopted").exists());
        assert!(!shared.join(PRIVACY_FILE).exists());
        assert_eq!(
            std::fs::read(source).expect("legacy unchanged"),
            b"{bad legacy"
        );
        assert!(!State::isolated(&shared).view().crashes);
    }
    #[test]
    fn adoption_does_not_resurrect_an_old_yes_after_revocation() {
        let root = Root::new();
        let data = root.path.join("hub");
        let shared = root.path.join("native");
        std::fs::create_dir_all(&data).expect("source");
        std::fs::create_dir_all(&shared).expect("destination");
        let source = data.join(PRIVACY_FILE);
        std::fs::write(
            &source,
            br#"{"crashes":true,"usage":false,"crashes_decided":true,"usage_decided":true}"#,
        )
        .expect("legacy");
        adopt(&data, &shared).expect("adopt");
        let mut state = State::at(Ok(shared.clone()));
        assert!(state.view().crashes);
        state
            .update(PrivacyPatch::Crashes(false), &state.view().revision)
            .expect("revoke");
        std::fs::remove_file(shared.join(PRIVACY_FILE)).expect("remove current");
        adopt(&data, &shared).expect("marker");
        assert!(!shared.join(PRIVACY_FILE).exists());
        assert!(source.exists());
    }
}

#[cfg(test)]
mod reporting_tests {
    use super::{HostError, State};
    #[test]
    fn configuration_projection_uses_the_service_build_without_exposing_its_key() {
        let state = State::at(Err(HostError::Io));
        assert_eq!(state.view().reporting_configured, vantare_services::diagnostics::configured());
        let view = serde_json::to_value(state.view()).expect("view");
        assert!(view["reportingConfigured"].is_boolean());
        assert!(view.as_object().expect("view object").keys().all(|key| !key.to_ascii_lowercase().contains("key")));
    }
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MailOrigin {
    Onboarding,
    Settings,
}
impl MailOrigin {
    pub const ALL: [Self; 2] = [Self::Onboarding, Self::Settings];
    pub fn command(self, consent: bool) -> vantare_ipc::services_protocol::Command {
        use vantare_ipc::services_protocol::{Command, MailSource};
        Command::MailConsentSet {
            consent,
            source: match self {
                Self::Onboarding => MailSource::Onboarding,
                Self::Settings => MailSource::Settings,
            },
        }
    }
}
#[cfg(test)]
mod mail_source_tests {
    use super::*;
    #[test]
    fn only_closed_origins_reach_the_existing_service_command() {
        use vantare_ipc::services_protocol::{Command, MailSource};
        assert!(matches!(
            MailOrigin::Onboarding.command(true),
            Command::MailConsentSet {
                consent: true,
                source: MailSource::Onboarding
            }
        ));
        assert!(matches!(
            MailOrigin::Settings.command(false),
            Command::MailConsentSet {
                consent: false,
                source: MailSource::Settings
            }
        ));
        assert!(serde_json::from_str::<MailOrigin>("\"arbitrary\"").is_err());
    }
}

fn private_value(mut value: Privacy) -> Privacy {
    value.crashes = false;
    value.usage = false;
    value.crashes_decided = true;
    value.usage_decided = true;
    value
}
#[cfg(all(test, windows))]
mod onboarding_private_tests {
    use super::*;
    #[test]
    fn onboarding_private_exit_preserves_disk_and_never_revives_an_old_permission() {
        let root = crate::test_support::Root::new();
        let mut state = State::isolated(&root.path);
        state
            .update(PrivacyPatch::Crashes(true), &state.view().revision)
            .unwrap();
        state
            .update(PrivacyPatch::Usage(true), &state.view().revision)
            .unwrap();
        let path = root.path.join(PRIVACY_FILE);
        assert!(matches!(state.enter_private(), Err(HostError::Denied)));
        state
            .update(PrivacyPatch::Crashes(false), &state.view().revision)
            .unwrap();
        state
            .update(PrivacyPatch::Usage(false), &state.view().revision)
            .unwrap();
        let before = std::fs::read(&path).unwrap();
        let revision = state.view().revision;
        state.enter_private().unwrap();
        let view = state.refresh();
        assert!(!view.crashes && !view.usage && view.crashes_decided && view.usage_decided);
        assert_eq!(view.revision, revision);
        assert_eq!(std::fs::read(&path).unwrap(), before);
        let updated = state
            .update(PrivacyPatch::Usage(true), &view.revision)
            .unwrap();
        assert!(updated.usage);
        assert!(!updated.crashes);
        assert!(!Privacy::load(&root.path).unwrap().crashes);
    }
    #[test]
    fn private_escape_denies_protected_disk_and_exposes_external_opt_in() {
        let root = crate::test_support::Root::new();
        let path = root.path.join(PRIVACY_FILE);
        let mut state = State::isolated(&root.path);
        state.enter_private().unwrap();
        std::fs::write(
            &path,
            serde_json::to_vec(&Privacy {
                crashes: true,
                crashes_decided: true,
                ..Privacy::default()
            })
            .unwrap(),
        )
        .unwrap();
        assert!(state.refresh().crashes);
        assert!(!state.private_active());
        assert!(matches!(state.enter_private(), Err(HostError::Denied)));
        std::fs::write(&path, b"broken").unwrap();
        assert!(matches!(state.enter_private(), Err(HostError::Denied)));
        assert!(!state.private_active());
    }
}
