//! Lectura Wails acotada; solo se archivan claves Launcher, nunca otros ajustes.
use super::files;
use super::{App, CATALOG, Document, Profile, Step, is_local_path, policy::Policy};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Import {
    pub source: PathBuf,
    pub launcher: BTreeMap<String, serde_json::Value>,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct WailsApp {
    id: String,
    display_name: String,
    executable_path: String,
    user_executable_path: String,
    args: String,
    is_favorite: bool,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct WailsStep {
    app_id: String,
    delay: u32,
    args_override: String,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct WailsProfile {
    id: String,
    name: String,
    description: String,
    notes: String,
    steps: Vec<WailsStep>,
    is_favorite: bool,
    advanced: bool,
    hotkey: String,
    launch_on_windows_startup: bool,
    launch_count: u64,
    last_launched_at: Option<String>,
    avg_chain_duration_ms: u64,
    policy: Option<Policy>,
}

/// Mismo orden que `configsDir()`: carpeta portable, CWD y finalmente APPDATA.
pub fn source() -> Result<Option<PathBuf>, String> {
    let executable = std::env::current_exe().map_err(|e| format!("ruta del Hub: {e}"))?;
    let cwd = std::env::current_dir().map_err(|e| format!("directorio de trabajo: {e}"))?;
    let mut directories = vec![
        executable
            .parent()
            .ok_or("Hub sin directorio")?
            .join("configs"),
        cwd.join("configs"),
        cwd.join("vantare-v2/configs"),
    ];
    if let Some(roaming) = std::env::var_os("APPDATA") {
        directories.push(PathBuf::from(roaming).join("Vantare/configs"));
    }
    source_in(&directories)
}

pub fn source_in(directories: &[PathBuf]) -> Result<Option<PathBuf>, String> {
    for directory in directories {
        if !is_local_path(directory) {
            return Err("la configuración Wails debe estar en disco local".into());
        }
        match std::fs::metadata(directory) {
            Ok(meta) if meta.is_dir() => {
                let source = directory.join("app-settings.json");
                return match std::fs::metadata(&source) {
                    Ok(_) => Ok(Some(source)),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                    Err(e) => Err(format!("inspeccionar configuración Wails: {e}")),
                };
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("inspeccionar configuración Wails: {e}")),
        }
    }
    Ok(None)
}

pub fn read(source: &Path) -> Result<Document, String> {
    if !is_local_path(source) {
        return Err("la configuración Wails debe estar en disco local".into());
    }
    let bytes = files::read(source, files::MAX_DOCUMENT)?;
    let settings: BTreeMap<String, serde_json::Value> =
        serde_json::from_slice(&bytes).map_err(|e| format!("configuración Wails inválida: {e}"))?;
    let mut document = Document::default();
    import_apps(settings.get("launcherApps"), &mut document)?;
    import_profiles(settings.get("launcherProfiles"), &mut document)?;
    if settings
        .get("launcherLmuTriggerEnabled")
        .and_then(serde_json::Value::as_bool)
        == Some(true)
    {
        document.lmu_trigger_profile = Some(
            settings
                .get("launcherLmuTriggerProfileId")
                .and_then(serde_json::Value::as_str)
                .ok_or("trigger Wails sin perfil")?
                .into(),
        );
    }
    document.wails_import = Some(Import {
        source: source.to_path_buf(),
        launcher: settings
            .into_iter()
            .filter(|(key, _)| {
                matches!(
                    key.as_str(),
                    "launcherApps"
                        | "launcherProfiles"
                        | "launcherLmuTriggerEnabled"
                        | "launcherLmuTriggerProfileId"
                        | "launcherOnboardingCompleted"
                )
            })
            .collect(),
    });
    document.validate()?;
    Ok(document)
}

fn import_apps(value: Option<&serde_json::Value>, document: &mut Document) -> Result<(), String> {
    if let Some(apps) = value.filter(|v| !v.is_null()) {
        let apps: BTreeMap<String, WailsApp> = serde_json::from_value(apps.clone())
            .map_err(|e| format!("apps Wails inválidas: {e}"))?;
        for (id, app) in apps {
            if !app.id.is_empty() && app.id != id {
                return Err(format!("ID de app Wails distinto de su clave: {id}"));
            }
            let path = if app.user_executable_path.is_empty() {
                app.executable_path
            } else {
                app.user_executable_path
            };
            let imported = App {
                id: id.clone(),
                name: if app.display_name.is_empty() {
                    CATALOG
                        .iter()
                        .find(|a| a.id == id)
                        .map_or(id.clone(), |a| a.name.into())
                } else {
                    app.display_name
                },
                executable: (!path.is_empty()).then(|| PathBuf::from(path)),
                args: parse_args(&app.args)?,
                favorite: app.is_favorite,
            };
            if let Some(current) = document.apps.iter_mut().find(|a| a.id == id) {
                *current = imported;
            } else {
                document.apps.push(imported);
            }
        }
    }
    Ok(())
}

fn import_profiles(
    value: Option<&serde_json::Value>,
    document: &mut Document,
) -> Result<(), String> {
    if value.is_none_or(serde_json::Value::is_null) {
        document.profiles = Document::fresh_install().profiles;
    }
    if let Some(profiles) = value.filter(|v| !v.is_null()) {
        let profiles: Vec<WailsProfile> = serde_json::from_value(profiles.clone())
            .map_err(|e| format!("perfiles Wails inválidos: {e}"))?;
        for profile in profiles {
            let policy = profile.policy.unwrap_or_default();
            let steps = profile
                .steps
                .into_iter()
                .map(|step| {
                    Ok(Step {
                        app_id: step.app_id,
                        delay_seconds: step.delay,
                        args_override: if step.args_override.is_empty() {
                            None
                        } else {
                            Some(parse_args(&step.args_override)?)
                        },
                    })
                })
                .collect::<Result<_, String>>()?;
            document.profiles.push(Profile {
                id: profile.id,
                name: profile.name,
                favorite: profile.is_favorite,
                steps,
                first_step_delay: policy.first_step_delay,
                max_retries: policy.max_retries,
                continue_on_error: policy.failure == super::policy::Failure::Continue,
                reuse_running: policy.already_running != super::policy::Running::Restart,
                policy: Some(policy),
                description: profile.description,
                notes: profile.notes,
                advanced: profile.advanced,
                hotkey: profile.hotkey,
                launch_on_windows_startup: profile.launch_on_windows_startup,
                launch_count: profile.launch_count,
                last_launched_at: profile.last_launched_at,
                avg_chain_duration_ms: profile.avg_chain_duration_ms,
                imported: true,
            });
        }
    }
    Ok(())
}

/// Tokenización del contrato Go parseWindowsArgs; nunca se invoca un shell.
pub fn parse_args(raw: &str) -> Result<Vec<String>, String> {
    if raw.contains('\0') {
        return Err("argumentos Wails con NUL".into());
    }
    let mut args = Vec::new();
    let mut token = String::new();
    let mut quoted = false;
    let mut started = false;
    let mut slashes = 0;
    for ch in raw.chars() {
        if ch == '\\' {
            slashes += 1;
            started = true;
            continue;
        }
        if ch == '"' {
            started = true;
            let literal = slashes % 2 != 0;
            if literal {
                slashes = (slashes - 1) / 2;
            } else {
                quoted = !quoted;
            }
            token.extend(std::iter::repeat_n('\\', slashes));
            if literal {
                token.push('"');
            }
        } else {
            token.extend(std::iter::repeat_n('\\', slashes));
            if matches!(ch, ' ' | '\t') && !quoted {
                if started {
                    args.push(std::mem::take(&mut token));
                    started = false;
                }
            } else {
                token.push(ch);
                started = true;
            }
        }
        slashes = 0;
    }
    token.extend(std::iter::repeat_n('\\', slashes));
    if quoted {
        return Err("argumentos Wails con comillas sin cerrar".into());
    }
    if started {
        args.push(token);
    }
    super::validate_args(&args)?;
    Ok(args)
}
