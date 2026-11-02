//! Idempotent Windows projection. No registry/link byte snapshots.
use super::{
    Installation, ReadProfile, State,
    context::{self, Context},
    installation,
    shell_windows::{self as os, Link},
    write_fs::{self as disk, Result, ensure},
};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};

const RUN: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
pub struct Options<'a> {
    pub request: &'a super::Request,
    pub previous: Option<&'a context::Options>,
    pub payload: &'a Path,
    pub restoring: bool,
}
fn powershell() -> Result<PathBuf> {
    Ok(PathBuf::from(
        std::env::var_os("WINDIR").ok_or_else(|| super::WriteError::new(1, "WINDIR ausente"))?,
    )
    .join("System32/WindowsPowerShell/v1.0/powershell.exe"))
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
    Ok(same(&link.target, &root.join("Uninstall.exe"))
        || (ps
            && link.arguments.contains(&root_arg)
            && (link
                .arguments
                .contains(&format!("-File \"{}\"", root.join("beta.ps1").display()))
                || (link.arguments.contains(&format!(
                    "-File \"{}\"",
                    root.join("uninstall-vantare.ps1").display()
                )) && link.arguments.contains("-Operation UninstallInstalled"))))
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
fn background(path: &Path) -> bool {
    use std::io::Read;
    let read = || -> std::io::Result<bool> {
        let mut bytes = [0; 128];
        let count = fs::File::open(path)?.read(&mut bytes)?;
        Ok(String::from_utf8_lossy(&bytes[..count])
            .trim_start_matches('\u{feff}')
            .lines()
            .next()
            == Some("# vantare-launch-capabilities: background-v1"))
    };
    read().unwrap_or(false)
}
fn launch(root: &Path, state: Option<&State>, startup: bool) -> Result<Link> {
    let state = if startup && !background(&root.join("candidate.ps1")) {
        None
    } else {
        state
    };
    let target = state
        .map(|state| {
            root.join("generations")
                .join(&state.active.generation)
                .join("bin/vantare.exe")
        })
        .filter(|p| p.is_file());
    if let Some(target) = target {
        let candidate = target
            .parent()
            .and_then(Path::parent)
            .expect("generation")
            .join("candidate.ps1");
        let extra = if startup && background(&candidate) {
            " --background"
        } else {
            ""
        };
        return Ok(Link {
            arguments: format!("--beta {}{extra}", argument_root(root)),
            icon: target.clone(),
            target,
        });
    }
    Ok(Link {
        target: powershell()?,
        arguments: format!(
            "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{}\" {}",
            root.join("beta.ps1").display(),
            argument_root(root)
        ),
        icon: PathBuf::new(),
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
fn remove_owned(path: &Path, root: &Path) -> Result<()> {
    super::reject_links(path).map_err(|e| super::WriteError::new(1, e))?;
    if path.try_exists()? && owned(&os::read_link(path)?, root)? {
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
    super::reject_links(path).map_err(|e| super::WriteError::new(1, e))?;
    if path.try_exists()? {
        ensure(
            owned(&os::read_link(path)?, root)?,
            "El acceso pertenece a otra instalación; se conserva",
        )?;
    }
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
    folder_name: &str,
    kind: &str,
    action: Option<OptionalAction>,
    state: Option<&State>,
    warning: &mut dyn FnMut(&str),
) {
    let Some(action) = action else {
        return;
    };
    let remove = action == OptionalAction::Remove;
    let existing_only = action == OptionalAction::Existing;
    let mut run = || -> Result<()> {
        let parent = folder(context, kind)?;
        let visible = if kind == "Startup" || folder_name != "Vantare" {
            folder_name
        } else {
            "Vantare Simracing Suite"
        };
        let path = parent.join(format!("{visible}.lnk"));
        let mut old = vec![parent.join(format!("{folder_name}.lnk"))];
        if folder_name == "Vantare" {
            old.push(parent.join("Vantare Native Beta.lnk"));
        }
        let old: Vec<_> = old
            .into_iter()
            .filter(|p| {
                p != &path
                    && p.is_file()
                    && os::read_link(p).is_ok_and(|l| owned(&l, root).unwrap_or(false))
            })
            .collect();
        let is_owned = path.is_file() && owned(&os::read_link(&path)?, root)?;
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
fn legacy_run(context: &Context, root: &Path, identity: &str) -> Result<Option<(String, String)>> {
    let name = if identity == "VantareNativeBeta" {
        "VantareNative.Hub".into()
    } else {
        format!("{identity}.Hub")
    };
    let value = super::platform::registry_string(&context.registry_prefix, RUN, &name, false)?;
    Ok(value
        .filter(|command| {
            if let Some((exe, rest)) = command
                .strip_prefix('"')
                .and_then(|value| value.split_once('"'))
                && let Some(tail) = rest.strip_prefix(
                    " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"",
                )
                && let Some((script, tail)) = tail.split_once("\" -Root \"")
                && let Some(directory) = tail.strip_suffix('"')
                && same(Path::new(exe), &powershell().unwrap_or_default())
                && same(Path::new(script), &root.join("beta.ps1"))
                && same(Path::new(directory), root)
            {
                return true;
            }
            if let Some(path) = command.strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
                let path = Path::new(path);
                return same(path, &root.join("bin/vantare-hub.exe"))
                    || path
                        .parent()
                        .filter(|bin| {
                            bin.file_name()
                                .is_some_and(|name| name.eq_ignore_ascii_case("bin"))
                        })
                        .and_then(Path::parent)
                        .is_some_and(|generation| {
                            path.file_name()
                                .is_some_and(|name| name.eq_ignore_ascii_case("vantare-hub.exe"))
                                && generation.file_name().is_some_and(|id| {
                                    super::validation::hex(
                                        &id.to_string_lossy().to_ascii_lowercase(),
                                        32,
                                    )
                                })
                                && generation
                                    .parent()
                                    .is_some_and(|parent| same(parent, &root.join("generations")))
                        });
            }
            false
        })
        .map(|value| (name, value)))
}

/// Rebuild from the resulting state, including after a failed Setup restores it.
/// Caller owns beta-session.lock throughout mutation and synchronization.
pub fn sync(
    root: &Path,
    context: &Context,
    state: Option<&State>,
    options: &Options<'_>,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    context.validate_root(root)?;
    disk::open_root(root, false)?;
    ensure(
        state.is_some() == root.join("state.json").try_exists()?,
        "La proyección no corresponde al estado resultante",
    )?;
    let request = options.request;
    let identity = context::identity(request)?;
    let folder_name = if request.qa {
        request
            .qa_shortcut_folder
            .as_deref()
            .expect("validated folder")
    } else {
        "Vantare"
    };
    let legacy = if request.qa {
        request
            .qa_legacy_shortcut_folder
            .as_deref()
            .expect("validated folder")
    } else {
        "Vantare Native Beta"
    };
    let key = format!("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{identity}");
    if let Some(registered) = context.registration(request, "InstallLocation")? {
        ensure(
            same(Path::new(&registered), root),
            "El registro pertenece a otra instalación",
        )?;
    }
    let _apartment = os::Apartment::new()?;
    let programs = folder(context, "Programs")?;
    let current = programs.join(folder_name);
    let old = programs.join(legacy);
    let projection = Projection {
        root,
        context,
        identity,
        folder_name,
        legacy,
        key,
        current,
        old,
    };
    let Some(state) = state else {
        return remove_projection(&projection, options, warning);
    };
    let view = Installation::read(root, ReadProfile::Probe)?;
    ensure(
        serde_json::to_value(view.state.as_ref())? == serde_json::to_value(Some(state))?,
        "La proyección no corresponde al estado resultante",
    )?;
    let version = view
        .installed_version()
        .ok_or_else(|| super::WriteError::new(1, "Falta versión instalada"))?;
    let run = legacy_run(context, root, identity)?;
    let ui = prepare_projection(&projection, options, run.is_some())?;
    project_links(&projection, state, warning)?;
    project_registration(&projection, options, version)?;
    project_preferences(&projection, state, options, &ui, run, warning)
}

struct Projection<'a> {
    root: &'a Path,
    context: &'a Context,
    identity: &'a str,
    folder_name: &'a str,
    legacy: &'a str,
    key: String,
    current: PathBuf,
    old: PathBuf,
}
fn remove_projection(
    projection: &Projection<'_>,
    options: &Options<'_>,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let root = projection.root;
    let context = projection.context;
    let identity = projection.identity;
    let folder_name = projection.folder_name;
    let key = &projection.key;
    let current = &projection.current;
    let old = &projection.old;
    let marker = root.join("installer-cleanup.json");
    if marker.try_exists()? {
        let value = disk::read_json(&marker, Some(1024))?;
        ensure(
            value["schema"] == 1
                && value["sha256"]
                    .as_str()
                    .is_some_and(|s| super::validation::hex(s, 64)),
            "Marker de limpieza inválido",
        )?;
        if root.join("Uninstall.exe").try_exists()? {
            ensure(
                value["sha256"] == installation::hash_file(&root.join("Uninstall.exe"))?,
                "El desinstalador cambió; se conserva",
            )?;
        }
    }
    for directory in [&current, &old] {
        for name in [
            "Vantare Simracing Suite.lnk",
            "Vantare Native Beta.lnk",
            "Vantare.lnk",
            "Desinstalar.lnk",
        ] {
            remove_owned(&directory.join(name), root)?;
        }
        remove_empty(directory)?;
    }
    for kind in ["DesktopDirectory", "Startup"] {
        optional(
            context,
            root,
            folder_name,
            kind,
            Some(OptionalAction::Remove),
            None,
            warning,
        );
    }
    if !options.restoring {
        let ui = context::options(root, true)?;
        if let Some(ui) = ui
            && !marker.try_exists()?
        {
            disk::write_json(&marker, &json!({"schema":1,"sha256":ui.sha256}))?;
        }
    }
    let run = legacy_run(context, root, identity)?;
    os::delete_key(&context.registry_prefix, key)?;
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
    projection: &Projection<'_>,
    options: &Options<'_>,
    has_run: bool,
) -> Result<context::Options> {
    let request = options.request;
    let root = projection.root;
    let current = &projection.current;
    let previous = options.previous;
    let autostart = if options.restoring {
        previous.is_some_and(|ui| ui.autostart)
    } else if has_run {
        previous
            .map(|ui| ui.autostart)
            .or(context::startup_preference(root)?)
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
    for name in [
        "Vantare Simracing Suite.lnk",
        "Vantare.lnk",
        "Desinstalar.lnk",
    ] {
        let path = current.join(name);
        if path.try_exists()? {
            ensure(
                owned(&os::read_link(&path)?, root)?,
                "El acceso pertenece a otra instalación; se conserva",
            )?;
        }
    }
    fs::copy(
        options.payload.join("Uninstall.exe"),
        root.join("Uninstall.exe"),
    )?;
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
    let temporary = root.join(format!("beta-{}.tmp", disk::id()?));
    disk::write_json(&temporary, &ui)?;
    disk::replace_temporary(&temporary, &root.join("installer-ui.json"))?;
    // Preserve the frozen generation's existing uninstall bootstrap until p7.
    fs::write(
        root.join("uninstall-vantare.ps1"),
        crate::payload::CANDIDATE,
    )?;
    Ok(ui)
}
fn project_links(
    projection: &Projection<'_>,
    state: &State,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let root = projection.root;
    let current = &projection.current;
    let old = &projection.old;
    save(
        &current.join("Vantare Simracing Suite.lnk"),
        root,
        &launch(root, Some(state), false)?,
        true,
        warning,
    )?;
    disk::remove_file(&current.join("Vantare.lnk"))?;
    let uninstaller = root.join("Uninstall.exe");
    save(
        &current.join("Desinstalar.lnk"),
        root,
        &Link {
            target: uninstaller.clone(),
            arguments: format!("/D=\"{}\"", root.display()),
            icon: uninstaller.clone(),
        },
        false,
        warning,
    )?;
    for name in ["Vantare Native Beta.lnk", "Vantare.lnk", "Desinstalar.lnk"] {
        remove_owned(&old.join(name), root)?;
    }
    remove_empty(old)?;
    Ok(())
}
fn project_registration(
    projection: &Projection<'_>,
    options: &Options<'_>,
    version: &str,
) -> Result<()> {
    let request = options.request;
    let uninstaller = projection.root.join("Uninstall.exe");
    let root = projection.root;
    let context = projection.context;
    let identity = projection.identity;
    let folder_name = projection.folder_name;
    let legacy = projection.legacy;
    let key = &projection.key;
    for (name, value) in [
        ("DisplayName", "Vantare Simracing Suite".to_owned()),
        ("DisplayVersion", version.to_owned()),
        ("InstallLocation", root.display().to_string()),
        ("DisplayIcon", format!("\"{}\",0", uninstaller.display())),
        (
            "UninstallString",
            format!("\"{}\" /D=\"{}\"", uninstaller.display(), root.display()),
        ),
    ] {
        os::set(&context.registry_prefix, key, name, &value)?;
    }
    for name in ["NoModify", "NoRepair"] {
        os::dword(&context.registry_prefix, key, name, 1)?;
    }
    if request.qa {
        fs::write(root.join("registration-identity.txt"), identity)?;
        os::set(&context.registry_prefix, key, "ShortcutFolder", folder_name)?;
        os::set(
            &context.registry_prefix,
            key,
            "LegacyShortcutFolder",
            legacy,
        )?;
    }
    Ok(())
}
fn project_preferences(
    projection: &Projection<'_>,
    state: &State,
    options: &Options<'_>,
    ui: &context::Options,
    run: Option<(String, String)>,
    warning: &mut dyn FnMut(&str),
) -> Result<()> {
    let previous = options.previous;
    let desktop = ui.desktop;
    let autostart = ui.autostart;
    let root = projection.root;
    let context = projection.context;
    let folder_name = projection.folder_name;
    let suppress = run.as_ref().is_some_and(|(name, _)| {
        if let Err(cause) = os::delete_value(&context.registry_prefix, RUN, name) {
            warning(&cause.to_string());
            true
        } else {
            false
        }
    });
    for (kind, enabled, old_enabled) in [
        (
            "DesktopDirectory",
            desktop,
            previous.is_some_and(|ui| ui.desktop),
        ),
        (
            "Startup",
            autostart,
            previous.is_some_and(|ui| ui.autostart),
        ),
    ] {
        optional(
            context,
            root,
            folder_name,
            kind,
            ((old_enabled && !enabled) || (kind == "Startup" && (!autostart || suppress)))
                .then_some(OptionalAction::Remove),
            Some(state),
            warning,
        );
        optional(
            context,
            root,
            folder_name,
            kind,
            (enabled && !(kind == "Startup" && suppress)).then_some(OptionalAction::Create),
            Some(state),
            warning,
        );
    }
    if !desktop {
        optional(
            context,
            root,
            folder_name,
            "DesktopDirectory",
            Some(OptionalAction::Existing),
            Some(state),
            warning,
        );
    }
    if let Some((name, command)) = run.filter(|_| !suppress && autostart) {
        let path = folder(context, "Startup")?.join(format!("{folder_name}.lnk"));
        if !path.is_file() || !owned(&os::read_link(&path)?, root)? {
            os::set(&context.registry_prefix, RUN, &name, &command)?;
            return Err(super::WriteError::new(
                1,
                "No se creó Startup; se conserva Run. Vuelve a intentarlo",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_preserves_frozen_root_and_generation_capabilities() {
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
        let capability = b"# vantare-launch-capabilities: background-v1\n";
        fs::write(folder.join("candidate.ps1"), capability).expect("generation capability");
        fs::write(root.join("candidate.ps1"), b"# frozen legacy root\n").expect("frozen root");
        assert!(same(
            &launch(&root, Some(&state), true)
                .expect("legacy Startup")
                .target,
            &powershell().expect("Windows")
        ));
        assert_eq!(
            launch(&root, Some(&state), false)
                .expect("Start menu")
                .target,
            target
        );
        fs::write(root.join("candidate.ps1"), capability).expect("capable root");
        assert!(
            launch(&root, Some(&state), true)
                .expect("background")
                .arguments
                .ends_with(" --background")
        );
        fs::write(folder.join("candidate.ps1"), b"# frozen generation\n")
            .expect("frozen generation");
        assert!(
            !launch(&root, Some(&state), true)
                .expect("foreground legacy")
                .arguments
                .ends_with(" --background")
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
