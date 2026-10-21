//! Entrada GUI del acceso directo. El motor beta continúa en un proceso sin consola.
use std::os::windows::process::CommandExt;
use std::{
    io::{self, Write},
    path::Path,
    process::{Command, Stdio},
};

pub(super) fn start(args: &[String]) -> io::Result<()> {
    let root = args.get(2).map(Path::new).filter(|path| path.is_absolute());
    let mut log = open_log(root)?;
    let result = start_logged(args, &log);
    if let Err(error) = &result {
        let _written = writeln!(log, "bootstrap: {error}");
    }
    result
}

fn open_log(root: Option<&Path>) -> io::Result<std::fs::File> {
    let mut directories = Vec::new();
    if let Some(root) = root {
        directories.push(root.join("logs"));
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        directories.push(Path::new(&local).join("Vantare/native/logs"));
    }
    directories.push(std::env::temp_dir().join("Vantare"));
    let mut first_error = None;
    for directory in directories {
        let opened = std::fs::create_dir_all(&directory).and_then(|()| {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(directory.join("bootstrap.log"))
        });
        match opened {
            Ok(mut log) => {
                if let Some(error) = first_error {
                    writeln!(
                        log,
                        "bootstrap: registro de instalación no disponible: {error}"
                    )?;
                }
                return Ok(log);
            }
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }
    Err(first_error.unwrap_or_else(|| io::Error::other("registro de arranque no disponible")))
}

fn start_logged(args: &[String], log: &std::fs::File) -> io::Result<()> {
    let [flag, root_flag, root] = args else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "--beta -Root requiere una ruta",
        ));
    };
    if flag != "--beta" || root_flag != "-Root" || !Path::new(root).is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "raíz beta inválida",
        ));
    }
    let windows =
        std::env::var_os("WINDIR").ok_or_else(|| io::Error::other("Windows no disponible"))?;
    Command::new(Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"))
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(Path::new(root).join("beta.ps1"))
        .arg("-Root")
        .arg(root)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log.try_clone()?))
        .creation_flags(0x0800_0000)
        .spawn()?;
    Ok(())
}
