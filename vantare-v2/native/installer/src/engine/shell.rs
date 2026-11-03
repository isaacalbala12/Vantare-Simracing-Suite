//! Idempotent Windows projection. No registry/link byte snapshots.
use super::{
    State,
    context::{self, Context},
    installation,
    windows::{self as os, Link},
    write_fs::{self as disk, Result, ensure},
};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) const RUN: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const CURRENT: &str = "Vantare";
const LEGACY: &str = "Vantare Native Beta";
const MANDATORY: [&str; 3] = [
    "Vantare Simracing Suite.lnk",
    "Vantare.lnk",
    "Desinstalar.lnk",
];
const LEGACY_LINK: &str = "Vantare Native Beta.lnk";
pub use super::host::ShellOptions as Options;
use super::powershell as powershell_path;
fn powershell() -> Result<PathBuf> {
    powershell_path().map_err(|error| super::WriteError::new(1, error))
}
fn same(left: &Path, right: &Path) -> bool {
    context::same_path(left, right).unwrap_or(false)
}
fn argument_root(root: &Path) -> String {
    format!("-Root \"{}\"", root.display())
}
fn owned(link: &Link, root: &Path) -> Result<bool> {
    let root_arg = argument_root(root);
    let ps = same(&link.target, &powershell()?);
    Ok((same(&link.target, &root.join("Vantare.exe"))
        && [
            format!("--root {root_arg}"),
            format!("--root {root_arg} --background"),
        ]
        .contains(&link.arguments))
        || same(&link.target, &root.join("Uninstall.exe"))
        || (ps
            && link.arguments.contains(&root_arg)
            && ["beta.ps1", "candidate.ps1"].iter().any(|name| {
                link.arguments
                    .contains(&format!("-File \"{}\"", root.join(name).display()))
            }))
        || (link
            .target
            .ancestors()
            .skip(1)
            .any(|parent| same(parent, &root.join("generations")))
            && link
                .target
                .file_name()
                .is_some_and(|n| n.eq_ignore_ascii_case("vantare.exe"))
            && [
                format!("--beta {root_arg}"),
                format!("--beta {root_arg} --background"),
            ]
            .contains(&link.arguments)))
}
fn launch(root: &Path, _state: Option<&State>, startup: bool) -> Result<Link> {
    let target = root.join("Vantare.exe");
    ensure(target.is_file(), "Falta el lanzador raíz")?;
    Ok(Link {
        arguments: format!(
            "--root {}{}",
            argument_root(root),
            if startup { " --background" } else { "" }
        ),
        icon: target.clone(),
        target,
    })
}
fn folder(context: &Context, name: &str) -> Result<PathBuf> {
    let path = if let Some(root) = &context.shell_root {
        root.join(name)
    } else {
        os::folder(name)?
    };
    ensure(
        !path.as_os_str().is_empty(),
        "Windows no proporciona la carpeta de accesos",
    )?;
    super::reject_links(&path).map_err(|e| super::WriteError::new(1, e))?;
    Ok(path)
}
fn owned_at(path: &Path, root: &Path) -> Result<bool> {
    super::reject_links(path).map_err(|e| super::WriteError::new(1, e))?;
    Ok(path.try_exists()? && path.is_file() && owned(&os::read_link(path)?, root)?)
}
fn remove_owned(path: &Path, root: &Path) -> Result<()> {
    if owned_at(path, root)? {
        disk::remove_file(path)?;
    }
    Ok(())
}

fn remove_empty(path: &Path) -> Result<()> {
    if path.is_dir() && fs::read_dir(path)?.next().is_none() {
        fs::remove_dir(path)?;
    }
    Ok(())
}
fn save(
    path: &Path,
    root: &Path,
    value: &Link,
    branded: bool,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    ensure(
        owned_at(path, root)? || !path.try_exists()?,
        "El acceso pertenece a otra instalación; se conserva",
    )?;
    fs::create_dir_all(path.parent().expect("shortcut folder"))?;
    os::write_link(path, value, branded, warning)
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum OptionalAction {
    Remove,
    Create,
    Existing,
}
fn optional(
    context: &Context,
    root: &Path,
    kind: &str,
    action: OptionalAction,
    state: Option<&State>,
    warning: &mut dyn FnMut(&str),
) {
    let remove = action == OptionalAction::Remove;
    let existing_only = action == OptionalAction::Existing;
    let mut run = || -> Result<()> {
        let parent = folder(context, kind)?;
        let name = if kind == "Startup" {
            "Vantare.lnk"
        } else {
            MANDATORY[0]
        };
        let path = parent.join(name);
        let old: Vec<_> = [parent.join("Vantare.lnk"), parent.join(LEGACY_LINK)]
            .into_iter()
            .filter(|old| old != &path && owned_at(old, root).unwrap_or(false))
            .collect();
        let is_owned = owned_at(&path, root)?;
        if remove {
            remove_owned(&path, root)?;
            for path in old {
                disk::remove_file(&path)?;
            }
            return Ok(());
        }
        if existing_only && !is_owned && old.is_empty() {
            return Ok(());
        }
        save(
            &path,
            root,
            &launch(root, state, kind == "Startup")?,
            true,
            warning,
        )?;
        for path in old {
            disk::remove_file(&path)?;
        }
        Ok(())
    };
    if let Err(cause) = run() {
        warning(&format!("No se pudo sincronizar {kind}: {cause}"));
    }
}
fn legacy_run(context: &Context, root: &Path) -> Result<Option<(String, String)>> {
    let name = "VantareNative.Hub".to_owned();
    let value = super::windows::registry_string(&context.registry_prefix, RUN, &name, false)?;
    Ok(value
        .filter(|command| {
            let normalized = command.to_ascii_lowercase();
            let root = root.to_string_lossy().to_ascii_lowercase();
            normalized.contains(&root)
                && (normalized.contains("beta.ps1") || normalized.contains("vantare-hub.exe"))
        })
        .map(|value| (name, value)))
}

/// Rebuild from the resulting state, including after a failed Setup restores it.
/// Caller owns beta-session.lock and .operation.lock throughout synchronization.
pub fn sync(
    root: &Path,
    context: &Context,
    projection: Option<(&State, &str)>,
    options: &Options<'_>,
    progress: &mut dyn FnMut(crate::model::Progress),
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let state = projection.map(|(state, _)| state);
    let version = projection.map(|(_, version)| version);
    context.validate_root(root)?;
    disk::open_root(root, false)?;
    ensure(
        state.is_some() == root.join("state.json").try_exists()?,
        "La proyección no corresponde al estado resultante",
    )?;
    if !options.restoring {
        progress(crate::model::Progress::step(
            "shortcuts",
            if state.is_some() { 84 } else { 72 },
            false,
        ));
    }
    if context.has_registration()? {
        let registered = context.install_location()?;
        ensure(
            registered
                .as_deref()
                .is_some_and(|path| same(Path::new(path), root)),
            "El registro pertenece a otra instalación",
        )?;
    }
    let _apartment = os::Apartment::new()?;
    let programs = folder(context, "Programs")?;
    let Some(state) = state else {
        remove_projection(root, context, &programs, options, warning)?;
        if !options.restoring {
            progress(crate::model::Progress::step("register", 88, false));
        }
        return Ok(());
    };
    let version = version.expect("state projection");
    let run = legacy_run(context, root)?;
    let ui = prepare_projection(root, &programs.join(CURRENT), options, run.is_some())?;
    if !options.restoring {
        progress(crate::model::Progress::step("register", 93, false));
    }
    project_links(root, &programs, state, warning)?;
    project_registration(root, context, version)?;
    project_preferences(
        root,
        context,
        state,
        options.previous,
        ui.desktop,
        ui.autostart,
        run,
        warning,
    )
}

/// Maintenance after a confirmed boot, or an explicit Startup preference
/// change. This is the same projection and ownership contract as Setup, with
/// no payload copy and no second PowerShell implementation.
pub fn sync_running(root: &Path, startup: Option<bool>) -> Result<()> {
    sync_running_with_context(root, &Context::system()?, startup)
}

pub fn sync_running_with_context(
    root: &Path,
    context: &Context,
    startup: Option<bool>,
) -> Result<()> {
    context.validate_root(root)?;
    let root = disk::open_root(root, false)?;
    let _lock = disk::lock(&root, ".operation.lock")?;
    let view = super::Installation::read(&root)?;
    let state = view
        .state
        .as_ref()
        .ok_or_else(|| super::WriteError::new(1, "Falta instalación activa"))?;
    let manifest = view
        .manifest
        .as_ref()
        .ok_or_else(|| super::WriteError::new(1, "Falta manifiesto activo"))?;
    ensure(
        state.channel == "beta" && manifest.engine() == 2,
        "Registro requiere motor 2 beta",
    )?;
    if context.has_registration()? {
        ensure(
            context
                .install_location()?
                .as_deref()
                .is_some_and(|path| same(Path::new(path), &root)),
            "El registro pertenece a otra instalación",
        )?;
    }
    let ui = context::options(&root, true)?;
    let autostart = startup.unwrap_or_else(|| context::startup(&root).unwrap_or(false));
    let _apartment = os::Apartment::new()?;
    let programs = folder(context, "Programs")?;
    let mut warning = |message: &str| eprintln!("Registro: {message}");
    project_links(&root, &programs, state, &mut warning)?;
    project_registration(&root, context, &manifest.version)?;
    let run = legacy_run(context, &root)?;
    project_preferences(
        &root,
        context,
        state,
        None,
        ui.as_ref().is_some_and(|ui| ui.desktop),
        autostart,
        run,
        &mut warning,
    )?;
    if let Some(startup) = startup {
        if let Some(mut ui) = ui {
            ui.autostart = startup;
            disk::publish_json(&root.join("installer-ui.json"), &ui)?;
        } else {
            disk::publish_json(
                &root.join("startup-options.json"),
                &json!({"schema":1,"autostart":startup}),
            )?;
        }
    }
    Ok(())
}

fn remove_projection(
    root: &Path,
    context: &Context,
    programs: &Path,
    options: &Options<'_>,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let marker = root.join("installer-cleanup.json");
    context::cleanup_marker(root, options.previous.map(|ui| ui.sha256.as_str()))?;
    for directory in [programs.join(CURRENT), programs.join(LEGACY)] {
        for name in MANDATORY.into_iter().chain(std::iter::once(LEGACY_LINK)) {
            remove_owned(&directory.join(name), root)?;
        }
        remove_empty(&directory)?;
    }
    for kind in ["DesktopDirectory", "Startup"] {
        optional(context, root, kind, OptionalAction::Remove, None, warning);
    }
    if !options.restoring
        && let Some(ui) = options.previous
        && !marker.try_exists()?
    {
        disk::write_json(&marker, &json!({"schema":1,"sha256":ui.sha256}))?;
    }
    let run = legacy_run(context, root)?;
    os::delete_key(&context.registry_prefix, context::UNINSTALL_KEY)?;
    for name in [
        "beta.ps1",
        "candidate.ps1",
        "registration-identity.txt",
        "uninstall-vantare.ps1",
        "installer-ui.json",
        "startup-options.json",
        "installer-notices.txt",
    ] {
        disk::remove_file(&root.join(name))?;
    }
    disk::remove_file(&root.join("Vantare.exe"))?;
    disk::remove_file(&root.join("launcher-image.json"))?;
    if options.restoring {
        disk::remove_file(&root.join("Uninstall.exe"))?;
    }
    if let Some((name, _)) = run
        && let Err(cause) = os::delete_value(&context.registry_prefix, RUN, &name)
    {
        warning(&cause.to_string());
    }
    Ok(())
}
fn prepare_projection(
    root: &Path,
    current: &Path,
    options: &Options<'_>,
    has_run: bool,
) -> Result<context::Options> {
    let request = options.request;
    let previous = options.previous;
    let autostart = if options.restoring {
        previous.is_some_and(|ui| ui.autostart)
    } else if has_run {
        previous
            .map(|ui| ui.autostart)
            .or(context::startup_preference(root))
            .unwrap_or(true)
    } else {
        request.autostart
    };
    let desktop = if options.restoring {
        previous.is_some_and(|ui| ui.desktop)
    } else {
        request.desktop
    };
    // Validate all mandatory links before the first mandatory write.
    for name in MANDATORY {
        let path = current.join(name);
        ensure(
            owned_at(&path, root)? || !path.try_exists()?,
            "El acceso pertenece a otra instalación; se conserva",
        )?;
    }
    let incoming = options.payload.join("Uninstall.exe");
    super::reject_links(&incoming).map_err(|cause| super::WriteError::new(1, cause))?;
    installation::verify_pe(&incoming)?;
    super::reject_links(&options.payload.join("installer-notices.txt"))
        .map_err(|cause| super::WriteError::new(1, cause))?;
    fs::copy(incoming, root.join("Uninstall.exe"))?;
    fs::copy(
        options.payload.join("installer-notices.txt"),
        root.join("installer-notices.txt"),
    )?;
    let ui = context::Options {
        schema: 1,
        kind: "rust-gpui".into(),
        uninstaller: "Uninstall.exe".into(),
        sha256: installation::hash_file(&root.join("Uninstall.exe"))?,
        desktop,
        autostart,
    };
    disk::publish_json(&root.join("installer-ui.json"), &ui)?;
    Ok(ui)
}
fn project_links(
    root: &Path,
    programs: &Path,
    state: &State,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let current = programs.join(CURRENT);
    let old = programs.join(LEGACY);
    save(
        &current.join(MANDATORY[0]),
        root,
        &launch(root, Some(state), false)?,
        true,
        warning,
    )?;
    disk::remove_file(&current.join(MANDATORY[1]))?;
    let uninstaller = root.join("Uninstall.exe");
    save(
        &current.join(MANDATORY[2]),
        root,
        &Link {
            target: uninstaller.clone(),
            arguments: format!("/D=\"{}\"", root.display()),
            icon: uninstaller.clone(),
        },
        false,
        warning,
    )?;
    for name in [LEGACY_LINK, MANDATORY[1], MANDATORY[2]] {
        remove_owned(&old.join(name), root)?;
    }
    remove_empty(&old)?;
    Ok(())
}
fn write_registration_values(
    root: &Path,
    version: &str,
    mut set: impl FnMut(&str, &str) -> Result<()>,
) -> Result<()> {
    let uninstaller = root.join("Uninstall.exe");
    // Ownership must survive an interruption before any presentation metadata.
    for (name, value) in [
        ("InstallLocation", root.display().to_string()),
        ("DisplayName", "Vantare Simracing Suite".to_owned()),
        ("DisplayVersion", version.to_owned()),
        ("DisplayIcon", format!("\"{}\",0", uninstaller.display())),
        (
            "UninstallString",
            format!("\"{}\" /D=\"{}\"", uninstaller.display(), root.display()),
        ),
    ] {
        set(name, &value)?;
    }
    Ok(())
}
fn project_registration(root: &Path, context: &Context, version: &str) -> Result<()> {
    write_registration_values(root, version, |name, value| {
        os::set(
            &context.registry_prefix,
            context::UNINSTALL_KEY,
            name,
            value,
        )
    })?;
    for name in ["NoModify", "NoRepair"] {
        os::dword(&context.registry_prefix, context::UNINSTALL_KEY, name, 1)?;
    }
    Ok(())
}
#[allow(clippy::too_many_arguments)] // Inputs are the persisted options and two independent shell projections.
fn project_preferences(
    root: &Path,
    context: &Context,
    state: &State,
    previous: Option<&context::Options>,
    desktop: bool,
    autostart: bool,
    run: Option<(String, String)>,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let suppress = run.as_ref().is_some_and(|(name, _)| {
        if let Err(cause) = os::delete_value(&context.registry_prefix, RUN, name) {
            warning(&cause.to_string());
            true
        } else {
            false
        }
    });
    let desktop_action = if desktop {
        OptionalAction::Create
    } else if previous.is_some_and(|ui| ui.desktop) {
        OptionalAction::Remove
    } else {
        OptionalAction::Existing
    };
    let startup_action = if autostart && !suppress {
        OptionalAction::Create
    } else {
        OptionalAction::Remove
    };
    for (kind, action) in [
        ("DesktopDirectory", desktop_action),
        ("Startup", startup_action),
    ] {
        optional(context, root, kind, action, Some(state), warning);
    }
    let startup_owned = owned_at(&folder(context, "Startup")?.join("Vantare.lnk"), root)?;
    if startup_owned != (autostart && !suppress) {
        if let Some((name, command)) = run.filter(|_| autostart) {
            os::set(&context.registry_prefix, RUN, &name, &command)?;
        }
        return Err(super::WriteError::new(
            1,
            "No se pudo aplicar la preferencia de inicio",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn interrupted_registration_preserves_ownership_before_metadata_and_can_retry() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let id = disk::id().expect("ID");
        let root = parent.join("p5a-registration-tests").join(&id);
        let context = Context::isolated(
            root.join("local"),
            format!("Software\\VantareInstallerMatrix\\{id}"),
            root.join("shell"),
        )
        .expect("isolated context");
        let key = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VantareNativeBeta";
        let mut writes = 0;
        assert!(
            write_registration_values(&root, "0.0.988", |name, value| {
                writes += 1;
                ensure(writes == 1, "injected interruption after ownership")?;
                os::set(&context.registry_prefix, key, name, value)
            })
            .is_err()
        );
        assert_eq!(
            super::super::windows::registry_string(
                &context.registry_prefix,
                key,
                "InstallLocation",
                false
            )
            .expect("ownership"),
            Some(root.display().to_string())
        );
        assert_eq!(
            super::super::windows::registry_string(
                &context.registry_prefix,
                key,
                "DisplayName",
                false
            )
            .expect("metadata absent"),
            None
        );
        write_registration_values(&root, "0.0.988", |name, value| {
            os::set(&context.registry_prefix, key, name, value)
        })
        .expect("retry partial projection");
        assert_eq!(
            super::super::windows::registry_string(
                &context.registry_prefix,
                key,
                "DisplayVersion",
                false
            )
            .expect("metadata"),
            Some("0.0.988".into())
        );
        os::delete_key(&context.registry_prefix, key).expect("remove owned QA key");
    }
    #[test]
    fn uninstall_uses_options_captured_before_metadata_changed() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let id = disk::id().expect("ID");
        let qa = parent.join("p5a-options-tests").join(&id);
        let root = qa.join("install");
        context::qa_path(&root).expect("QA guard");
        fs::create_dir_all(&root).expect("owned root");
        fs::write(root.join(".vantare-native"), b"offline-candidate-v1")
            .expect("recognized installation fixture");
        fs::write(root.join("Uninstall.exe"), b"owned fixture").expect("fixture");
        let previous = context::Options {
            schema: 1,
            kind: "rust-gpui".into(),
            uninstaller: "Uninstall.exe".into(),
            sha256: installation::hash_file(&root.join("Uninstall.exe")).expect("hash"),
            desktop: false,
            autostart: false,
        };
        fs::write(root.join("installer-ui.json"), b"{ changed metadata")
            .expect("changed after capture");
        let context = Context::isolated(
            qa.join("LocalAppData"),
            format!("Software\\VantareInstallerMatrix\\{id}"),
            qa.join("shell"),
        )
        .expect("isolated context");
        let request = super::super::Request::new(
            &crate::args::Args {
                root: Some(root.clone()),
                ..Default::default()
            },
            crate::engine::Operation::Uninstall,
        );
        let key = context::UNINSTALL_KEY.to_owned();
        os::set(&context.registry_prefix, &key, "Foreign", "preserve")
            .expect("foreign key without location");
        assert!(
            sync(
                &root,
                &context,
                None,
                &Options {
                    request: &request,
                    previous: Some(&previous),
                    payload: &root,
                    restoring: false
                },
                &mut |_| {},
                &mut |_| {}
            )
            .is_err()
        );
        assert_eq!(
            os::registry_string(&context.registry_prefix, &key, "Foreign", false)
                .expect("foreign value"),
            Some("preserve".into())
        );
        assert!(!root.join("installer-cleanup.json").exists());
        os::delete_key(&context.registry_prefix, &key).expect("remove owned QA fixture key");
        sync(
            &root,
            &context,
            None,
            &Options {
                request: &request,
                previous: Some(&previous),
                payload: &root,
                restoring: false,
            },
            &mut |_| {},
            &mut |_| {},
        )
        .expect("projection uses captured options");
        let marker = disk::read_json(&root.join("installer-cleanup.json"), Some(1024))
            .expect("cleanup marker");
        assert_eq!(marker["sha256"], previous.sha256);
        assert!(!root.join("installer-ui.json").exists());
    }
    #[test]
    fn invalid_uninstaller_payload_never_replaces_the_existing_owned_file() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let id = disk::id().expect("ID");
        let root = parent.join("p5-payload-tests").join(&id);
        context::qa_path(&root).expect("QA guard");
        let payload = root.join("payload");
        fs::create_dir_all(&payload).expect("owned payload");
        fs::write(payload.join("Uninstall.exe"), b"not a PE").expect("invalid incoming");
        fs::write(root.join("Uninstall.exe"), b"preserved original").expect("original");
        let request = super::super::Request::new(
            &crate::args::Args::default(),
            crate::engine::Operation::Install,
        );
        let options = Options {
            request: &request,
            previous: None,
            payload: &payload,
            restoring: false,
        };
        assert!(
            prepare_projection(&root, &root.join("shell/Programs/Vantare"), &options, false)
                .is_err()
        );
        assert_eq!(
            fs::read(root.join("Uninstall.exe")).expect("original remains"),
            b"preserved original"
        );
        assert!(!root.join("installer-ui.json").exists());
    }
    #[test]
    fn startup_uses_root_launcher_for_foreground_and_background() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent
            .join("p5-startup-tests")
            .join(disk::id().expect("ID"));
        context::qa_path(&root).expect("QA guard");
        let generation = "a".repeat(32);
        let folder = root.join("generations").join(&generation);
        fs::create_dir_all(folder.join("bin")).expect("owned generation");
        let target = folder.join("bin/vantare.exe");
        fs::write(&target, b"inert fixture").expect("target");
        let state = State {
            schema: 1,
            product: "vantare-native".into(),
            channel: "beta".into(),
            active: super::super::Generation {
                generation,
                manifest_sha256: Some("a".repeat(64)),
            },
            previous: None,
        };
        let launcher = root.join("Vantare.exe");
        fs::write(&launcher, b"inert launcher").expect("root launcher");
        let foreground = launch(&root, Some(&state), false).expect("Start menu");
        let background = launch(&root, Some(&state), true).expect("Startup");
        assert_eq!(foreground.target, launcher);
        assert_eq!(background.target, launcher);
        assert_eq!(
            foreground.arguments,
            format!("--root {}", argument_root(&root))
        );
        assert_eq!(
            background.arguments,
            format!("--root {} --background", argument_root(&root))
        );
    }
    #[test]
    fn shortcut_ownership_preserves_foreign_targets_and_accepts_legacy_forms() {
        let root = Path::new("D:/VantareServer/qa/isa-1840/ownership");
        let args = argument_root(root);
        for arguments in [
            format!("--beta {args}"),
            format!("--beta {args} --background"),
        ] {
            let target = root.join("generations/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bin/vantare.exe");
            assert!(
                owned(
                    &Link {
                        target,
                        arguments,
                        icon: PathBuf::new()
                    },
                    root
                )
                .expect("owned generation")
            );
        }
        let legacy = Link {
            target: powershell().expect("Windows"),
            arguments: format!(
                "-NoProfile -ExecutionPolicy Bypass -File \"{}\" {args}",
                root.join("beta.ps1").display()
            ),
            icon: PathBuf::new(),
        };
        assert!(owned(&legacy, root).expect("owned bootstrap"));
        let foreign = Link {
            target: root.join("foreign.exe"),
            arguments: legacy.arguments,
            icon: PathBuf::new(),
        };
        assert!(!owned(&foreign, root).expect("foreign target"));
        let foreign = Link {
            target: root.join("generations-old/bin/vantare.exe"),
            arguments: format!("--beta {args}"),
            icon: PathBuf::new(),
        };
        assert!(!owned(&foreign, root).expect("foreign prefix"));
    }
}
