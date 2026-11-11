//! Launcher projection: executable paths and arguments stay in Rust.
use crate::protocol::{CoreStatus, HostError, LinkState};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{files, launcher as mailbox};
use vantare_launcher::{Document, discovery::Discovery};

pub const ID_LIMIT: usize = 256;
pub const PROFILE_LIMIT: usize = 128;
pub const APP_LIMIT: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LauncherApp {
    pub id: String,
    pub name: String,
    pub available: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LauncherProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub favorite: bool,
    pub apps: Vec<String>,
    pub launchable: bool,
    pub options: LauncherOptions,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LauncherOptions {
    pub already_running: String,
    pub first_step_delay: u32,
    pub retries: u8,
    pub failure: String,
    pub startup: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)] // Independent document, discovery and resident observations.
pub struct LauncherView {
    pub exists: bool,
    pub protected: bool,
    pub revision: String,
    pub resident: bool,
    pub running: bool,
    pub scanning: bool,
    pub profiles: Vec<LauncherProfile>,
    pub apps: Vec<LauncherApp>,
}

impl Default for LauncherView {
    fn default() -> Self {
        Self {
            exists: false,
            protected: false,
            revision: vantare_services::content_hash(&[]),
            resident: false,
            running: false,
            scanning: false,
            profiles: vec![],
            apps: vec![],
        }
    }
}
fn open(path: &Path) -> Result<Option<(Vec<u8>, Document)>, HostError> {
    if path.is_absolute() && !vantare_launcher::is_local_path(path) {
        return Err(HostError::Denied);
    }
    let Some(bytes) = files::read_optional(path, files::MAX_DOCUMENT).map_err(|_| HostError::Io)?
    else {
        return Ok(None);
    };
    let document = Document::from_bytes(&bytes).map_err(|_| HostError::Protected)?;
    Ok(Some((bytes, document)))
}
fn project(
    bytes: &[u8],
    document: &Document,
    found: &Discovery,
    status: Option<&mailbox::Status>,
    scanning: bool,
) -> LauncherView {
    let running = status.is_some_and(|status| status.running);
    let view = LauncherView {
        exists: true,
        protected: false,
        revision: vantare_services::content_hash(bytes),
        resident: status.is_some(),
        running,
        scanning,
        apps: document
            .apps
            .iter()
            .map(|app| LauncherApp {
                id: app.id.clone(),
                name: app.name.clone(),
                available: found
                    .app(&app.id)
                    .is_some_and(|app| app.availability.launchable),
            })
            .collect(),
        profiles: document
            .profiles
            .iter()
            .map(|profile| LauncherProfile {
                id: profile.id.clone(),
                name: profile.name.clone(),
                description: profile.description.clone(),
                favorite: profile.favorite,
                apps: profile
                    .steps
                    .iter()
                    .map(|step| step.app_id.clone())
                    .collect(),
                options: {
                    let policy = profile.effective_policy();
                    LauncherOptions {
                        already_running: match policy.already_running {
                            vantare_launcher::policy::Running::Ask => "ask",
                            vantare_launcher::policy::Running::Reuse => "reuse",
                            vantare_launcher::policy::Running::Restart => "restart",
                        }
                        .into(),
                        first_step_delay: policy.first_step_delay,
                        retries: policy.max_retries,
                        failure: match policy.failure {
                            vantare_launcher::policy::Failure::Ask => "ask",
                            vantare_launcher::policy::Failure::Stop => "stop",
                            vantare_launcher::policy::Failure::Continue => "continue",
                        }
                        .into(),
                        startup: profile.launch_on_windows_startup,
                    }
                },
                launchable: !scanning
                    && !running
                    && status.is_some()
                    && !profile.steps.is_empty()
                    && profile.missing_steps(found).is_empty(),
            })
            .collect(),
    };
    protect_oversized_view(view)
}
fn protect_oversized_view(view: LauncherView) -> LauncherView {
    // Budget the complete envelopes, including the longest closed method name.
    // Protect the whole view rather than silently shortening a description/list.
    let method = crate::protocol::METHODS
        .iter()
        .max_by_key(|name| name.len());
    let envelopes = [
        serde_json::json!({"kind":"response","id":u32::MAX,"result":{"method":method,"value":null}}),
        serde_json::json!({"kind":"failure","id":u32::MAX,"error":{"kind":"launcherConflict","current":null}}),
        serde_json::json!({"kind":"event","event":{"topic":"launcher","value":null}}),
    ];
    let overhead = envelopes
        .iter()
        .map(|envelope| serde_json::to_vec(envelope).expect("closed envelope").len() - 4)
        .max()
        .expect("envelopes"); // `null` is replaced by the serialized view.
    if serde_json::to_vec(&view)
        .is_ok_and(|bytes| bytes.len() <= crate::frame::LIMIT.saturating_sub(overhead))
    {
        return view;
    }
    LauncherView {
        protected: true,
        profiles: vec![],
        apps: vec![],
        ..view
    }
}
pub fn read(path: &Path) -> LauncherView {
    match open(path) {
        Ok(Some((bytes, document))) => project(
            &bytes,
            &document,
            &Discovery::default(),
            mailbox::read_status(path).as_ref(),
            false,
        ),
        Ok(None) => LauncherView {
            revision: vantare_services::content_hash(&[]),
            ..Default::default()
        },
        Err(_) => LauncherView {
            exists: true,
            protected: true,
            ..Default::default()
        },
    }
}
pub fn launch(path: &Path, core: &CoreStatus, id: &str, revision: &str) -> Result<bool, HostError> {
    if core.rights != LinkState::Connected
        || !core.access.verified
        || core.access.blocked
        || core.live
    {
        return Err(HostError::Denied);
    }
    if id.is_empty() || id.len() > ID_LIMIT || id.contains('\0') {
        return Err(HostError::Denied);
    }
    let (bytes, document) = open(path)?.ok_or(HostError::Protected)?;
    if vantare_services::content_hash(&bytes) != revision {
        return Err(HostError::LauncherConflict {
            current: read(path),
        });
    }
    let profile = document
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .ok_or(HostError::Denied)?;
    if profile.steps.is_empty() {
        return Err(HostError::Denied);
    }
    let status = mailbox::read_status(path).ok_or(HostError::CoreUnavailable)?;
    if status.running {
        return Err(HostError::Busy);
    }
    // Best-effort parity with launch-v1, explicitly authorized in #1995.
    // Re-read immediately before enqueueing. This is NOT atomic with resident
    // consumption: the resident owns a separate cached document (follow-up #2028).
    let latest = files::read_optional(path, files::MAX_DOCUMENT).map_err(|_| HostError::Io)?;
    if latest.as_deref() != Some(bytes.as_slice()) {
        return Err(HostError::LauncherConflict {
            current: read(path),
        });
    }
    let request = serde_json::to_vec(&mailbox::Request::Launch {
        profile: profile.id.clone(),
    })
    .map_err(|_| HostError::Io)?;
    files::save(
        &mailbox::request_path(path),
        &request,
        files::Mode::Observed(None),
        &files::Options::default(),
    )
    .map_err(|error| {
        if error.kind().is_conflict() || error.kind() == files::Kind::Busy {
            HostError::Busy
        } else {
            HostError::Io
        }
    })?;
    // Acceptance means queued, never that the chain has finished successfully.
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projection_contains_ids_without_executables_arguments_or_import_sources() {
        let mut document = Document::fresh_install();
        document.apps.push(vantare_launcher::App {
            id: "custom:1".into(),
            name: "Aplicación QA".into(),
            executable: Some(r"C:\Users\x\a.exe".into()),
            args: vec![
                "--qa-private-argument".into(),
                "C:/Users/x/private.json".into(),
            ],
            favorite: false,
        });
        document.profiles[0].steps.push(vantare_launcher::Step {
            app_id: "custom:1".into(),
            delay_seconds: 0,
            args_override: None,
        });
        let input = serde_json::to_string(&document).unwrap();
        assert!(input.contains("Users") && input.contains("--qa-private-argument"));
        let view = project(b"revision", &document, &Discovery::default(), None, false);
        assert_eq!(view.profiles.len(), 2);
        assert!(view.profiles.iter().all(|profile| !profile.launchable));
        let json = serde_json::to_string(&view).unwrap();
        for forbidden in [
            "executable",
            "args",
            "wails",
            "source",
            "path",
            "Users",
            r"\\",
            ":/",
            "--qa-private-argument",
        ] {
            assert!(!json.contains(forbidden));
        }
    }
    #[test]
    fn a_large_step_projection_is_protected_instead_of_truncated() {
        let mut document = Document::fresh_install();
        let app_id = format!("custom:{}", "x".repeat(ID_LIMIT - "custom:".len()));
        document.apps.push(vantare_launcher::App {
            id: app_id.clone(),
            name: "QA".into(),
            executable: Some(r"C:\QA\a.exe".into()),
            args: vec![],
            favorite: false,
        });
        let mut profile = document.profiles[0].clone();
        profile.steps = vec![
            vantare_launcher::Step {
                app_id,
                delay_seconds: 0,
                args_override: None
            };
            128
        ];
        document.profiles = (0..PROFILE_LIMIT)
            .map(|index| {
                let mut item = profile.clone();
                item.id = format!("profile:{index}");
                item
            })
            .collect();
        let view = project(b"large", &document, &Discovery::default(), None, false);
        assert!(view.protected);
        assert!(view.profiles.is_empty() && view.apps.is_empty());
        assert_eq!(document.profiles.len(), PROFILE_LIMIT);
        assert_eq!(document.profiles[0].steps.len(), 128);
    }
    #[test]
    fn launch_requires_verified_non_live_access_before_reading_files() {
        assert_eq!(
            launch(Path::new("missing"), &CoreStatus::default(), "creator", ""),
            Err(HostError::Denied)
        );
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;
    use crate::test_support::Root;
    fn core() -> CoreStatus {
        CoreStatus {
            rights: LinkState::Connected,
            access: crate::protocol::AccessView {
                verified: true,
                ..Default::default()
            },
            ..Default::default()
        }
    }
    #[test]
    fn a_two_mib_description_keeps_its_bytes_and_all_launcher_frames_writable() {
        let root = Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::fresh_install();
        document.profiles[0].description = "x".repeat(2 * 1024 * 1024);
        let bytes = serde_json::to_vec(&document).unwrap();
        assert!(Document::from_bytes(&bytes).is_ok());
        std::fs::write(&path, &bytes).unwrap();
        let view = read(&path);
        assert!(view.protected && view.profiles.is_empty() && view.apps.is_empty());
        for message in [
            crate::protocol::HostToUi::Response {
                id: u32::MAX,
                result: crate::protocol::Reply::LauncherGet {
                    value: view.clone(),
                },
            },
            crate::protocol::HostToUi::Failure {
                id: u32::MAX,
                error: HostError::LauncherConflict {
                    current: view.clone(),
                },
            },
            crate::protocol::HostToUi::Event {
                event: crate::protocol::Event::Launcher {
                    value: view.clone(),
                },
            },
        ] {
            let mut output = Vec::new();
            crate::frame::write(&mut output, &message)
                .expect("protected view stays within the host frame");
            assert!(output.len() <= crate::frame::LIMIT + 4);
        }
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
    #[test]
    fn missing_future_and_corrupt_documents_are_never_created_or_repaired() {
        let root = Root::new();
        let path = root.path.join("launcher.json");
        assert!(!read(&path).exists);
        assert!(!path.exists());
        for bytes in [b"{".as_slice(), br#"{"version":999}"#] {
            std::fs::write(&path, bytes).unwrap();
            assert!(read(&path).protected);
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
        }
    }
    #[test]
    fn malformed_ids_empty_profiles_and_protected_documents_have_no_effects() {
        let root = Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::fresh_install();
        document.profiles[0].steps.clear();
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let revision = vantare_services::content_hash(&bytes);
        for id in [
            "bad\0id".to_owned(),
            "x".repeat(ID_LIMIT + 1),
            "creator".to_owned(),
        ] {
            assert_eq!(
                launch(&path, &core(), &id, &revision),
                Err(HostError::Denied)
            );
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
            assert!(!mailbox::request_path(&path).exists());
        }
        let protected = br#"{"version":999}"#;
        std::fs::write(&path, protected).unwrap();
        assert_eq!(
            launch(&path, &core(), "creator", &revision),
            Err(HostError::Protected)
        );
        assert_eq!(std::fs::read(&path).unwrap(), protected);
        assert!(!mailbox::request_path(&path).exists());
    }
    #[test]
    fn launch_checks_revision_identity_resident_and_exclusive_mailbox() {
        let root = Root::new();
        let path = root.path.join("launcher.json");
        let bytes = serde_json::to_vec(&Document::fresh_install()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let revision = vantare_services::content_hash(&bytes);
        assert!(matches!(
            launch(&path, &core(), "creator", "old"),
            Err(HostError::LauncherConflict { .. })
        ));
        assert_eq!(
            launch(&path, &core(), "unknown", &revision),
            Err(HostError::Denied)
        );
        assert_eq!(
            launch(&path, &core(), "creator", &revision),
            Err(HostError::CoreUnavailable)
        );
        let status = mailbox::Status {
            version: mailbox::VERSION,
            updated_ms: mailbox::now_ms(),
            ..Default::default()
        };
        std::fs::write(
            mailbox::status_path(&path),
            serde_json::to_vec(&status).unwrap(),
        )
        .unwrap();
        assert_eq!(launch(&path, &core(), "creator", &revision), Ok(true));
        let queued = std::fs::read(mailbox::request_path(&path)).unwrap();
        assert!(
            matches!(serde_json::from_slice::<mailbox::Request>(&queued).unwrap(), mailbox::Request::Launch { profile } if profile == "creator")
        );
        assert_eq!(
            launch(&path, &core(), "pro", &revision),
            Err(HostError::Busy)
        );
        assert_eq!(std::fs::read(mailbox::request_path(&path)).unwrap(), queued);
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }
}

#[path = "launcher/reader.rs"]
mod reader;
pub use reader::Reader;

#[path = "launcher/editor.rs"]
pub mod editor;
