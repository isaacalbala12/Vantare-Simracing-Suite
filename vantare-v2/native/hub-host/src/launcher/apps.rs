//! Application paths enter only from the main-process picker, never a renderer draft.
use super::{APP_LIMIT, Discovery, Document, HostError, Path, editor, files, open, read};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_launcher::{CATALOG, Store};

// Trusted main-process result; never admitted by the renderer port guard.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutableSelection {
    pub id: u32,
    pub path: Option<String>,
}
pub const PICK_LIFETIME_SECONDS: u64 = 600;
pub const PICK_PATH_MAX: usize = 32768;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PickedApp {
    pub token: String,
    pub name: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppDraft {
    pub use_discovery: bool,
    pub id: Option<String>,
    pub name: String,
    pub favorite: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppEditor {
    pub revision: String,
    pub draft: AppDraft,
    pub has_executable: bool,
    pub has_custom_arguments: bool,
    pub custom_profiles: usize,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)] // Independent app provenance and discovery observations.
pub struct CatalogApp {
    pub id: String,
    pub name: String,
    pub category: String,
    pub steam: bool,
    pub favorite: bool,
    pub removable: bool,
    pub found: bool,
    pub installed: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogView {
    pub revision: String,
    pub scanning: bool,
    pub apps: Vec<CatalogApp>,
}
struct Pick {
    token: String,
    path: PathBuf,
    expires: Instant,
    target: Option<String>,
}
struct Dialog {
    request: u32,
    target: Option<String>,
    expires: Instant,
}
#[derive(Default)]
pub struct Picker {
    pending: Option<Pick>,
    dialog: Option<Dialog>,
}
fn canonical_executable(path: &Path) -> Result<PathBuf, HostError> {
    if !vantare_launcher::is_local_path(path)
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("exe"))
    {
        return Err(HostError::Denied);
    }
    let canonical = std::fs::canonicalize(path).map_err(|_| HostError::Denied)?;
    if !vantare_launcher::is_local_path(&canonical)
        || !canonical.is_file()
        || !canonical
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("exe"))
    {
        return Err(HostError::Denied);
    }
    #[cfg(windows)]
    let canonical = PathBuf::from(
        canonical
            .to_str()
            .ok_or(HostError::Denied)?
            .strip_prefix(r"\\?\")
            .unwrap_or(canonical.to_str().ok_or(HostError::Denied)?),
    );
    if !vantare_launcher::is_local_path(&canonical) {
        return Err(HostError::Denied);
    }
    Ok(canonical)
}
impl Picker {
    pub fn request_dialog(
        &mut self,
        id: u32,
        target: Option<String>,
        now: Instant,
    ) -> Result<(), HostError> {
        if self
            .dialog
            .as_ref()
            .is_some_and(|dialog| now < dialog.expires)
        {
            return Err(HostError::Busy);
        }
        self.dialog = Some(Dialog {
            request: id,
            target,
            expires: now + Duration::from_secs(PICK_LIFETIME_SECONDS),
        });
        Ok(())
    }
    pub fn complete_dialog(
        &mut self,
        selection: &ExecutableSelection,
        now: Instant,
    ) -> Result<Option<PickedApp>, HostError> {
        let Some(dialog) = self.dialog.as_ref() else {
            return Err(HostError::Denied);
        };
        if selection.id != dialog.request {
            return Err(HostError::Denied);
        }
        let dialog = self.dialog.take().expect("matched dialog");
        if now >= dialog.expires {
            return Err(HostError::Denied);
        }
        self.selected(selection.path.as_deref(), dialog.target, now)
    }

    fn selected(
        &mut self,
        path: Option<&str>,
        target: Option<String>,
        now: Instant,
    ) -> Result<Option<PickedApp>, HostError> {
        let Some(path) = path else {
            return Ok(None);
        };
        if path.len() > PICK_PATH_MAX || path.contains('\0') {
            return Err(HostError::Denied);
        }
        let chosen = Path::new(path);
        let path = canonical_executable(chosen)?;
        let name = chosen
            .file_stem()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty() && name.len() <= editor::NAME_MAX)
            .ok_or(HostError::Denied)?
            .to_owned();
        let token = vantare_services::random_id().map_err(|_| HostError::Io)?;
        self.pending = Some(Pick {
            token: token.clone(),
            path,
            expires: now + Duration::from_secs(PICK_LIFETIME_SECONDS),
            target,
        });
        Ok(Some(PickedApp { token, name }))
    }
    fn path(&self, token: &str, target: Option<&str>, now: Instant) -> Result<&Path, HostError> {
        let pick = self
            .pending
            .as_ref()
            .filter(|pick| {
                pick.token == token && now < pick.expires && pick.target.as_deref() == target
            })
            .ok_or(HostError::Denied)?;
        if canonical_executable(&pick.path).as_ref() != Ok(&pick.path) {
            return Err(HostError::Denied);
        }
        Ok(&pick.path)
    }
    pub fn save(
        &mut self,
        path: &Path,
        draft: &AppDraft,
        token: Option<&str>,
        revision: &str,
        now: Instant,
    ) -> Result<(), HostError> {
        if draft.name.trim().is_empty()
            || draft.name.len() > editor::NAME_MAX
            || draft.name.contains('\0')
        {
            return Err(HostError::Denied);
        }
        if draft.use_discovery
            && (token.is_some()
                || !draft
                    .id
                    .as_ref()
                    .is_some_and(|id| CATALOG.iter().any(|entry| entry.id == id)))
        {
            return Err(HostError::Denied);
        }
        let selected = token
            .map(|token| self.path(token, draft.id.as_deref(), now))
            .transpose()?
            .map(Path::to_path_buf);
        edit(path, revision, |document| {
            let id = if let Some(id) = &draft.id {
                id.clone()
            } else {
                if document.apps.len() >= APP_LIMIT {
                    return Err(HostError::Denied);
                }
                document
                    .add_app(
                        draft.name.clone(),
                        selected.clone().ok_or(HostError::Denied)?,
                    )
                    .map_err(|_| HostError::Denied)?
            };
            let app = document
                .apps
                .iter_mut()
                .find(|app| app.id == id)
                .ok_or(HostError::Denied)?;
            let reset_arguments =
                selected.is_some() || (draft.use_discovery && app.executable.is_some());
            app.name.clone_from(&draft.name);
            app.favorite = draft.favorite;
            if draft.use_discovery {
                if app.executable.is_some() {
                    app.args.clear();
                }
                app.executable = None;
            }
            if let Some(selected) = &selected {
                app.executable = Some(selected.clone());
                app.args.clear();
            }
            if reset_arguments {
                for profile in &mut document.profiles {
                    for step in &mut profile.steps {
                        if step.app_id == id {
                            step.args_override = None;
                        }
                    }
                }
            }
            Ok(())
        })?;
        if token.is_some() {
            self.pending = None;
        }
        Ok(())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn dialog_requires_host_request_matching_id_single_use_and_unexpired_deadline() {
        let root = crate::test_support::Root::new();
        let exe = root.path.join("chosen.exe");
        std::fs::write(&exe, b"inert QA fixture").unwrap();
        let now = Instant::now();
        let mut picker = Picker::default();
        let mut selection = ExecutableSelection {
            id: 7,
            path: Some(exe.to_str().unwrap().into()),
        };
        assert_eq!(
            picker.complete_dialog(&selection, now),
            Err(HostError::Denied)
        );
        assert!(picker.pending.is_none());
        picker.request_dialog(7, None, now).unwrap();
        assert_eq!(picker.request_dialog(8, None, now), Err(HostError::Busy));
        selection.id = 8;
        assert_eq!(
            picker.complete_dialog(&selection, now),
            Err(HostError::Denied)
        );
        assert!(picker.pending.is_none());
        selection.id = 7;
        let chosen = picker.complete_dialog(&selection, now).unwrap().unwrap();
        assert_eq!(
            picker.complete_dialog(&selection, now),
            Err(HostError::Denied)
        );
        assert_eq!(picker.pending.as_ref().unwrap().token, chosen.token);
        picker.request_dialog(9, None, now).unwrap();
        selection.id = 9;
        assert_eq!(
            picker.complete_dialog(&selection, now + Duration::from_secs(PICK_LIFETIME_SECONDS)),
            Err(HostError::Denied)
        );
        assert_eq!(picker.pending.as_ref().unwrap().token, chosen.token);
        picker.request_dialog(10, None, now).unwrap();
        selection.id = 10;
        selection.path = None;
        assert_eq!(picker.complete_dialog(&selection, now), Ok(None));
        assert_eq!(
            picker.complete_dialog(&selection, now),
            Err(HostError::Denied)
        );
        assert_eq!(picker.pending.as_ref().unwrap().token, chosen.token);
    }
    #[test]
    fn app_arguments_cannot_cross_the_contract_and_saved_arguments_are_preserved() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::fresh_install();
        document.apps[0].args = vec!["private-argument".repeat(500); 128];
        let bytes = serde_json::to_vec(&document).unwrap();
        assert!(Document::from_bytes(&bytes).is_ok());
        std::fs::write(&path, &bytes).unwrap();
        let mut value = get(&path, Some(&document.apps[0].id)).unwrap();
        assert!(value.has_custom_arguments);
        let json = serde_json::to_string(&value).unwrap();
        assert!(!json.contains("private-argument") && !json.contains("\"args\""));
        let mut forged = serde_json::to_value(&value.draft).unwrap();
        forged["args"] = serde_json::json!(["--renderer-cmd-prefix=untrusted"]);
        assert!(serde_json::from_value::<AppDraft>(forged).is_err());
        value.draft.name = "Nombre editado".into();
        Picker::default()
            .save(&path, &value.draft, None, &value.revision, Instant::now())
            .unwrap();
        let saved = Document::from_bytes(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved.apps[0].args, document.apps[0].args);
        assert_eq!(saved.apps[0].name, "Nombre editado");
    }
    #[test]
    fn picker_rejects_scripts_network_paths_and_forged_or_expired_tokens() {
        let root = crate::test_support::Root::new();
        let exe = root.path.join("picked.exe");
        std::fs::write(&exe, b"inert QA fixture").unwrap();
        let script = root.path.join("picked.bat");
        std::fs::write(&script, b"inert QA fixture").unwrap();
        let now = Instant::now();
        let mut picker = Picker::default();
        assert_eq!(
            picker.selected(script.to_str(), None, now),
            Err(HostError::Denied)
        );
        assert_eq!(
            picker.selected(Some(r"\\server\share\app.exe"), None, now),
            Err(HostError::Denied)
        );
        let selected = picker.selected(exe.to_str(), None, now).unwrap().unwrap();
        assert_eq!(picker.path("forged", None, now), Err(HostError::Denied));
        assert_eq!(
            picker.path(
                &selected.token,
                None,
                now + Duration::from_secs(PICK_LIFETIME_SECONDS)
            ),
            Err(HostError::Denied)
        );
        assert!(picker.path(&selected.token, None, now).is_ok());
        assert_eq!(picker.selected(None, None, now).unwrap(), None);
        assert!(picker.path(&selected.token, None, now).is_ok());
        let replacement = picker.selected(exe.to_str(), None, now).unwrap().unwrap();
        assert_eq!(
            picker.path(&selected.token, None, now),
            Err(HostError::Denied)
        );
        assert!(picker.path(&replacement.token, None, now).is_ok());
    }
    #[test]
    fn conflict_preserves_the_selection_for_explicit_retry_and_success_consumes_it() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let exe = root.path.join("qa.exe");
        std::fs::write(&exe, b"inert QA fixture").unwrap();
        let bytes = serde_json::to_vec(&Document::fresh_install()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let now = Instant::now();
        let mut picker = Picker::default();
        let selected = picker.selected(exe.to_str(), None, now).unwrap().unwrap();
        let draft = AppDraft {
            use_discovery: false,
            id: None,
            name: "QA".into(),
            favorite: true,
        };
        assert!(matches!(
            picker.save(&path, &draft, Some(&selected.token), &"0".repeat(64), now),
            Err(HostError::LauncherConflict { .. })
        ));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        picker
            .save(
                &path,
                &draft,
                Some(&selected.token),
                &vantare_services::content_hash(&bytes),
                now,
            )
            .unwrap();
        let saved = std::fs::read(&path).unwrap();
        assert_eq!(
            Document::from_bytes(&saved).unwrap().apps.len(),
            Document::fresh_install().apps.len() + 1
        );
        assert_eq!(
            picker.save(
                &path,
                &draft,
                Some(&selected.token),
                &vantare_services::content_hash(&saved),
                now
            ),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).unwrap(), saved);
        let projected = serde_json::to_value(catalog(&path, Some(&Discovery::default())).unwrap())
            .unwrap()
            .to_string();
        assert!(!projected.contains("executable"));
        assert!(!projected.contains(&exe.to_string_lossy().to_string()));
    }
    #[test]
    fn qa_catalog_matches_the_shared_native_catalog_without_paths() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::fresh_install();
        document.apps.push(vantare_launcher::App {
            id: "custom:vantare".into(),
            name: "Vantare Overlay".into(),
            executable: Some(r"C:/QA/vantare.exe".into()),
            args: vec![],
            favorite: false,
        });
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, bytes).unwrap();
        let found = Discovery {
            apps: document
                .apps
                .iter()
                .map(|app| vantare_launcher::discovery::Detected {
                    id: app.id.clone(),
                    executable: None,
                    availability: vantare_launcher::discovery::Availability {
                        found: true,
                        installed: true,
                        launchable: true,
                    },
                })
                .collect(),
            ..Default::default()
        };
        let observed = catalog(&path, Some(&found)).unwrap();
        let fixture: CatalogView = serde_json::from_str(include_str!(
            "../../../../hub-web/fixtures/launcher-apps.json"
        ))
        .unwrap();
        assert_eq!(
            observed.apps.iter().map(|app| &app.id).collect::<Vec<_>>(),
            document.apps.iter().map(|app| &app.id).collect::<Vec<_>>()
        );
        let mut projected = observed.apps;
        let mut expected = fixture.apps;
        projected.sort_by(|a, b| a.id.cmp(&b.id));
        expected.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(projected, expected);
        assert!(!observed.scanning);
    }
    #[test]
    fn official_and_referenced_applications_cannot_be_removed() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let bytes = serde_json::to_vec(&Document::fresh_install()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        assert_eq!(
            remove(&path, "lmu", &vantare_services::content_hash(&bytes)),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        let exe = root.path.join("referenced.exe");
        std::fs::write(&exe, b"inert QA fixture").unwrap();
        let mut document = Document::fresh_install();
        let id = document.add_app("QA".into(), exe).unwrap();
        document.profiles[0].steps[0].app_id = id.clone();
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        assert_eq!(
            remove(&path, &id, &vantare_services::content_hash(&bytes)),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
}
pub fn get(path: &Path, id: Option<&str>) -> Result<AppEditor, HostError> {
    let (bytes, document) = open(path)?.ok_or(HostError::Protected)?;
    let (draft, has_executable) = match id {
        None => (
            AppDraft {
                use_discovery: false,
                id: None,
                name: String::new(),
                favorite: false,
            },
            false,
        ),
        Some(id) => {
            let app = document
                .apps
                .iter()
                .find(|app| app.id == id)
                .ok_or(HostError::Denied)?;
            (
                AppDraft {
                    use_discovery: false,
                    id: Some(app.id.clone()),
                    name: app.name.clone(),
                    favorite: app.favorite,
                },
                app.executable.is_some(),
            )
        }
    };
    let custom_profiles = id.map_or(0, |id| {
        document
            .profiles
            .iter()
            .filter(|profile| {
                profile
                    .steps
                    .iter()
                    .any(|step| step.app_id == id && step.args_override.is_some())
            })
            .count()
    });
    let value = AppEditor {
        revision: vantare_services::content_hash(&bytes),
        draft,
        has_executable,
        has_custom_arguments: id
            .and_then(|id| document.apps.iter().find(|app| app.id == id))
            .is_some_and(|app| !app.args.is_empty())
            || custom_profiles > 0,
        custom_profiles,
    };
    let response = crate::protocol::HostToUi::Response {
        id: u32::MAX,
        result: crate::protocol::Reply::LauncherAppGet {
            value: value.clone(),
        },
    };
    crate::frame::write(&mut std::io::sink(), &response).map_err(|_| HostError::Protected)?;
    Ok(value)
}
pub fn catalog(path: &Path, discovery: Option<&Discovery>) -> Result<CatalogView, HostError> {
    let (bytes, document) = open(path)?.ok_or(HostError::Protected)?;
    Ok(CatalogView {
        revision: vantare_services::content_hash(&bytes),
        scanning: discovery.is_none(),
        apps: document
            .apps
            .iter()
            .map(|app| {
                let entry = CATALOG.iter().find(|entry| entry.id == app.id);
                let detected = discovery.and_then(|found| found.app(&app.id));
                CatalogApp {
                    id: app.id.clone(),
                    name: app.name.clone(),
                    category: entry.map_or("Manual", |entry| entry.category).into(),
                    steam: entry.is_some_and(|entry| entry.steam_id.is_some()),
                    favorite: app.favorite,
                    removable: entry.is_none(),
                    found: detected.is_some_and(|detected| detected.availability.found),
                    installed: detected.is_some_and(|detected| detected.availability.installed),
                }
            })
            .collect(),
    })
}
pub fn favorite(path: &Path, id: &str, value: bool, revision: &str) -> Result<(), HostError> {
    edit(path, revision, |document| {
        document
            .apps
            .iter_mut()
            .find(|app| app.id == id)
            .ok_or(HostError::Denied)?
            .favorite = value;
        Ok(())
    })
}
pub fn remove(path: &Path, id: &str, revision: &str) -> Result<(), HostError> {
    edit(path, revision, |document| {
        document.remove_app(id).map_err(|_| HostError::Denied)
    })
}
fn edit(
    path: &Path,
    revision: &str,
    change: impl FnOnce(&mut Document) -> Result<(), HostError>,
) -> Result<(), HostError> {
    let (bytes, _) = open(path)?.ok_or(HostError::Protected)?;
    if vantare_services::content_hash(&bytes) != revision {
        return Err(HostError::LauncherConflict {
            current: read(path),
        });
    }
    let mut store = Store::from_observed(path.into(), bytes).map_err(|_| HostError::Protected)?;
    let mut document = store.document.clone();
    change(&mut document)?;
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

/// Trusted main-process channel. The picker enforces request ownership before projection.
pub fn picked_executable(
    picker: &mut Picker,
    pipe: &mut impl std::io::Write,
    selection: &ExecutableSelection,
) -> std::io::Result<()> {
    let result = match picker.complete_dialog(selection, Instant::now()) {
        Ok(value) => crate::protocol::HostToUi::Response {
            id: selection.id,
            result: crate::protocol::Reply::LauncherAppPick { value },
        },
        Err(error) => crate::protocol::HostToUi::Failure {
            id: selection.id,
            error,
        },
    };
    crate::frame::write(pipe, &result)
}

#[cfg(test)]
mod dialog_wire_tests {
    use super::*;
    use crate::protocol::{HostToUi, Reply};
    fn deliver(picker: &mut Picker, selection: &ExecutableSelection) -> HostToUi {
        let mut pipe = Vec::new();
        picked_executable(picker, &mut pipe, selection).unwrap();
        crate::frame::Reader::default()
            .next(&mut std::io::Cursor::new(pipe))
            .unwrap()
            .unwrap()
    }
    #[test]
    fn trusted_result_handler_requires_an_outstanding_request_and_consumes_it() {
        let mut picker = Picker::default();
        let selection = ExecutableSelection { id: 7, path: None };
        let denied = HostToUi::Failure {
            id: 7,
            error: HostError::Denied,
        };
        assert_eq!(deliver(&mut picker, &selection), denied);
        picker.request_dialog(7, None, Instant::now()).unwrap();
        assert_eq!(
            deliver(&mut picker, &ExecutableSelection { id: 8, path: None }),
            HostToUi::Failure {
                id: 8,
                error: HostError::Denied
            }
        );
        assert_eq!(
            deliver(&mut picker, &selection),
            HostToUi::Response {
                id: 7,
                result: Reply::LauncherAppPick { value: None }
            }
        );
        assert_eq!(deliver(&mut picker, &selection), denied);
        assert!(picker.pending.is_none());
    }
}

#[cfg(all(test, windows))]
#[path = "apps/picker_tests.rs"]
mod picker_tests;
