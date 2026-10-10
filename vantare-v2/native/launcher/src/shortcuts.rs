//! Lectura local de shortcuts: solo `TargetPath`, nunca ejecutar ni guardar el enlace.
use super::{CATALOG, is_executable, is_local_path};
use std::{
    fs,
    path::{Path, PathBuf},
};

fn hint(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    CATALOG
        .iter()
        .filter(|app| app.steam_id.is_none())
        .any(|app| {
            app.matchers.iter().any(|matcher| name.contains(matcher))
                || app
                    .executables
                    .iter()
                    .filter_map(|exe| Path::new(exe).file_stem().and_then(|v| v.to_str()))
                    .any(|stem| {
                        !matches!(stem.to_ascii_lowercase().as_str(), "app" | "update")
                            && name.contains(&stem.to_ascii_lowercase())
                    })
        })
}

fn gather(
    root: &Path,
    depth: u8,
    budget: &mut usize,
    paths: &mut Vec<PathBuf>,
    warnings: &mut Vec<String>,
) {
    if !is_local_path(root) || fs::symlink_metadata(root).is_ok_and(|m| m.file_type().is_symlink())
    {
        return;
    }
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(error) => {
            warnings.push(format!(
                "leer accesos directos de {}: {error}",
                root.display()
            ));
            return;
        }
    };
    let mut entries: Vec<_> = entries
        .take(*budget)
        .filter_map(|entry| match entry {
            Ok(entry) => Some(entry),
            Err(error) => {
                warnings.push(format!(
                    "entrada de accesos directos de {}: {error}",
                    root.display()
                ));
                None
            }
        })
        .collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        if *budget == 0 || paths.len() == 128 {
            return;
        }
        *budget -= 1;
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(error) => {
                warnings.push(format!(
                    "tipo de acceso directo {}: {error}",
                    entry.path().display()
                ));
                continue;
            }
        };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() && depth > 0 {
            gather(&entry.path(), depth - 1, budget, paths, warnings);
        }
        if kind.is_file()
            && entry
                .path()
                .extension()
                .is_some_and(|v| v.eq_ignore_ascii_case("lnk"))
            && hint(&entry.file_name().to_string_lossy())
        {
            paths.push(entry.path());
        }
    }
}

pub fn system(warnings: &mut Vec<String>) -> Vec<PathBuf> {
    let mut links = Vec::new();
    let mut budget = 20_000;
    for (var, relative, depth) in [
        ("USERPROFILE", "Desktop", 0),
        ("PUBLIC", "Desktop", 0),
        ("APPDATA", "Microsoft/Windows/Start Menu/Programs", 2),
        ("PROGRAMDATA", "Microsoft/Windows/Start Menu/Programs", 2),
    ] {
        if let Some(root) = std::env::var_os(var) {
            gather(
                &PathBuf::from(root).join(relative),
                depth,
                &mut budget,
                &mut links,
                warnings,
            );
        }
    }
    let mut result = Vec::new();
    for group in links.chunks(16) {
        match resolve(group) {
            Ok(paths) => result.extend(paths),
            Err(error) => warnings.push(error),
        }
    }
    result
}

#[cfg(test)]
mod warning_tests {
    use super::*;

    #[test]
    fn isa1548_unreadable_shortcut_directory_reports_cause() {
        let root = std::env::temp_dir().join(format!(
            "shortcut-read-error-{}",
            vantare_services::random_id().expect("test id")
        ));
        fs::write(&root, b"not a directory").expect("fixture");
        let mut warnings = Vec::new();
        let mut links = Vec::new();
        gather(&root, 2, &mut 20_000, &mut links, &mut warnings);
        fs::remove_file(&root).expect("cleanup");
        assert!(links.is_empty());
        assert!(
            warnings
                .iter()
                .any(|warning| warning.contains(&root.display().to_string()))
        );
    }
}

#[cfg(windows)]
fn accepts_target(link: &Path, target: &Path, shared_roots: &[PathBuf]) -> bool {
    let Ok(real_link) = fs::canonicalize(link) else {
        return false;
    };
    !shared_roots.iter().any(|root| {
        super::under_ascii_case(link, root)
            || fs::canonicalize(root)
                .is_ok_and(|real_root| super::under_ascii_case(&real_link, &real_root))
    }) || super::is_trusted_install_path(target)
}

#[cfg(windows)]
pub(crate) fn resolve(links: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
    use std::{
        io::{BufReader, Read},
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    if links.iter().any(|path| !is_local_path(path)) {
        return Err("accesos directos requieren disco local".into());
    }
    let data = serde_json::to_string(links).map_err(|e| format!("rutas de shortcuts: {e}"))?;
    if data.len() > 16_000 {
        return Err("rutas de shortcuts demasiado largas".into());
    }
    let executable = crate::files::windows_powershell()?;
    let script = r"$ErrorActionPreference='Stop'; $out=@(); $shell=New-Object -ComObject WScript.Shell; try { foreach($path in ($env:VANTARE_SHORTCUT_PATHS | ConvertFrom-Json)) { try { $link=$shell.CreateShortcut($path); $out+= [string]$link.TargetPath; [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) } catch { $out+=''; } } [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ConvertTo-Json -InputObject @($out) -Compress } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }";
    let mut child = Command::new(executable)
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("VANTARE_SHORTCUT_PATHS", data)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(0x0800_0000)
        .spawn()
        .map_err(|e| format!("lector local de shortcuts: {e}"))?;
    let stdout = child.stdout.take().ok_or("lector sin stdout")?;
    let reader = match std::thread::Builder::new()
        .name("launcher-shortcuts-output".into())
        .spawn(move || {
            let mut bytes = Vec::new();
            BufReader::new(stdout)
                .take(131_073)
                .read_to_end(&mut bytes)
                .map(|_| bytes)
        }) {
        Ok(reader) => reader,
        Err(error) => {
            let cleanup = child.kill().and_then(|()| child.wait());
            return Err(format!(
                "lector de shortcuts: {error}; limpieza: {cleanup:?}"
            ));
        }
    };
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Err(error) => break Err(format!("observar shortcuts: {error}")),
            Ok(None) => {}
        }
        if start.elapsed() > Duration::from_secs(20) {
            break Err("lector de shortcuts supero 20 segundos".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let cleanup = if status.is_err() {
        child
            .kill()
            .and_then(|()| child.wait())
            .map(|_| ())
            .map_err(|e| format!("cancelar y recoger shortcuts: {e}"))
    } else {
        Ok(())
    };
    let bytes = reader
        .join()
        .map_err(|_| "lector de shortcuts panico")?
        .map_err(|e| format!("leer shortcuts: {e}"))?;
    cleanup?;
    if !status?.success() || bytes.len() > 131_072 {
        return Err("lectura de shortcuts fallida o demasiado grande".into());
    }
    let paths: Vec<String> =
        serde_json::from_slice(&bytes).map_err(|e| format!("respuesta de shortcuts: {e}"))?;
    if paths.len() != links.len() {
        return Err("respuesta de shortcuts incompleta".into());
    }
    let shared_roots: Vec<_> = ["PUBLIC", "ProgramData"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .collect();
    Ok(links
        .iter()
        .zip(paths)
        .filter_map(|(link, target)| {
            let target = PathBuf::from(target);
            (is_local_path(&target)
                && is_executable(&target)
                && accepts_target(link, &target, &shared_roots))
            .then_some(target)
        })
        .collect())
}
#[cfg(not(windows))]
pub(crate) fn resolve(_links: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
    Ok(Vec::new())
}

#[cfg(all(test, windows))]
mod trust_tests {
    use super::*;

    #[test]
    fn shared_shortcuts_resolve_junctions_and_private_shortcuts_allow_other_roots() {
        use std::os::windows::process::CommandExt;
        let root = PathBuf::from(std::env::var_os("LOCALAPPDATA").expect("Windows"))
            .join(format!("shortcut-real-{}", std::process::id()));
        let outside = PathBuf::from(format!(r"C:\tmp\shortcut-outside-{}", std::process::id()));
        fs::create_dir_all(root.join("shared")).expect("shared");
        fs::create_dir_all(&outside).expect("outside");
        let shared_link = root.join("shared/obs.lnk");
        let private_link = root.join("private.lnk");
        fs::write(&shared_link, b"fixture").expect("link");
        fs::write(&private_link, b"fixture").expect("link");
        let target = outside.join("obs64.exe");
        fs::write(&target, b"fixture").expect("target");
        let junction = root.join("escape");
        let status = std::process::Command::new("cmd.exe")
            .args(["/c", "mklink", "/J"])
            .arg(&junction)
            .arg(&outside)
            .creation_flags(0x0800_0000)
            .status()
            .expect("junction");
        assert!(status.success());
        let roots = [root.join("shared")];
        let escaped = accepts_target(&shared_link, &junction.join("obs64.exe"), &roots);
        let private = accepts_target(&private_link, &target, &roots);
        let other_drive = accepts_target(&private_link, Path::new(r"D:\Games\obs64.exe"), &roots);
        let trusted = root.join("trusted.exe");
        fs::write(&trusted, b"fixture").expect("trusted");
        let allowed = accepts_target(&shared_link, &trusted, &roots);
        fs::remove_dir(&junction).expect("unlink junction only");
        fs::remove_dir_all(&root).expect("cleanup trusted fixture");
        fs::remove_dir_all(&outside).expect("cleanup outside fixture");
        assert!(!escaped);
        assert!(private && other_drive && allowed);
    }
}
