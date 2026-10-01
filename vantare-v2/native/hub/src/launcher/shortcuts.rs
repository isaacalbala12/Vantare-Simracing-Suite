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

fn gather(root: &Path, depth: u8, budget: &mut usize, paths: &mut Vec<PathBuf>) {
    if !is_local_path(root) || fs::symlink_metadata(root).is_ok_and(|m| m.file_type().is_symlink())
    {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    let mut entries: Vec<_> = entries.take(*budget).flatten().collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        if *budget == 0 || paths.len() == 128 {
            return;
        }
        *budget -= 1;
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() && depth > 0 {
            gather(&entry.path(), depth - 1, budget, paths);
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

#[cfg(windows)]
pub(super) fn resolve(links: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
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
    let executable = PathBuf::from(std::env::var_os("SystemRoot").ok_or("SystemRoot ausente")?)
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
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
    Ok(paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| is_local_path(path) && is_executable(path))
        .collect())
}
#[cfg(not(windows))]
pub(super) fn resolve(_links: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
    Ok(Vec::new())
}
