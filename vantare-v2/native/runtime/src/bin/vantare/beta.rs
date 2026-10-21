//! Entrada GUI del acceso directo. El motor beta continúa en un proceso sin consola.
use std::os::windows::process::CommandExt;
use std::{
    io,
    path::Path,
    process::{Command, Stdio},
};

pub(super) fn start(args: &[String]) -> io::Result<()> {
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
    let logs = Path::new(root).join("logs");
    std::fs::create_dir_all(&logs)?;
    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("bootstrap.log"))?;
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
        .stderr(Stdio::from(log))
        .creation_flags(0x0800_0000)
        .spawn()?;
    Ok(())
}
