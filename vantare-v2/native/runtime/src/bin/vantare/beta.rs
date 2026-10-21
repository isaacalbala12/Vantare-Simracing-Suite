//! Entrada GUI del acceso directo. El motor beta continúa en un proceso sin consola.
use std::os::windows::process::CommandExt;
use std::{
    io::{self, Write},
    path::Path,
    process::{Command, Stdio},
};

pub(super) fn start(args: &[String]) -> io::Result<()> {
    let root = args.get(2).map(Path::new).filter(|path| path.is_absolute());
    // Validar antes de crear una ventana: errores CLI y tareas de fondo no la abren.
    let background = validate(args);
    let capable = background.as_ref().is_ok_and(|background| !background)
        && root.is_some_and(supports_indicator);
    let indicator = if capable {
        Some(super::beta_indicator::Indicator::show())
    } else {
        None
    };
    let mut log = open_log(root)?;
    let indicator = match indicator {
        Some(Ok(indicator)) => Some(indicator),
        Some(Err(error)) => {
            let _ = writeln!(log, "bootstrap: crear indicador: {error}");
            None
        }
        None => None,
    };
    let result =
        background.and_then(|background| start_logged(args, &log, indicator.as_ref(), background));
    match result {
        Ok(engine) => {
            if let Some(indicator) = indicator {
                indicator.wait(&engine, &mut log);
            }
            Ok(())
        }
        Err(error) => {
            let _written = writeln!(log, "bootstrap: {error}");
            Err(error)
        }
    }
}

const CAPABILITY: &[u8] = b"# vantare-boot-capabilities: indicator-handshake-v1";

// An exact, versioned first-line contract, never a heuristic PowerShell parser.
// Frozen root scripts delivered before this contract must release the EXE as RC4 did.
fn supports_indicator(root: &Path) -> bool {
    use std::io::Read;
    let Ok(script) = std::fs::File::open(root.join("beta.ps1")) else {
        return false;
    };
    let mut header = Vec::with_capacity(256);
    if script.take(256).read_to_end(&mut header).is_err() {
        return false;
    }
    let header = header.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&header);
    let first = header.split(|byte| *byte == b'\n').next().unwrap_or_default();
    first.strip_suffix(b"\r").unwrap_or(first) == CAPABILITY
}

fn validate(args: &[String]) -> io::Result<bool> {
    let valid = matches!(args.len(), 3 | 4)
        && args[0] == "--beta"
        && args[1] == "-Root"
        && Path::new(&args[2]).is_absolute()
        && (args.len() == 3 || args[3] == "--background");
    if !valid {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "--beta -Root requiere una ruta y admite --background",
        ));
    }
    Ok(args.len() == 4)
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

fn start_logged(
    args: &[String],
    log: &std::fs::File,
    indicator: Option<&super::beta_indicator::Indicator>,
    background: bool,
) -> io::Result<std::process::Child> {
    let root = &args[2];
    let windows =
        std::env::var_os("WINDIR").ok_or_else(|| io::Error::other("Windows no disponible"))?;
    // La activación procede del acceso del usuario. El motor PowerShell crea
    // después el Hub: permitir esa cadena hasta la siguiente entrada del usuario.
    // Un arranque automático puede carecer del permiso; no debe fallar por ello.
    // SAFETY: ASFW_ANY es la constante DWORD de Win32; no se comparten punteros.
    if !background
        && unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::AllowSetForegroundWindow(u32::MAX)
        } == 0
    {
        let mut log = log.try_clone()?;
        let _written = writeln!(
            log,
            "bootstrap: permiso de primer plano: {}",
            io::Error::last_os_error()
        );
    }
    let mut command =
        Command::new(Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"));
    if background {
        command
            .env_remove("VANTARE_STARTUP_WINDOW")
            .env_remove("VANTARE_STARTUP_PID")
            .env_remove("VANTARE_INTERACTIVE_STARTUP")
            .env("VANTARE_BACKGROUND_STARTUP", "1");
    } else {
        command
            .env("VANTARE_INTERACTIVE_STARTUP", "1")
            .env_remove("VANTARE_BACKGROUND_STARTUP");
        if let Some(indicator) = indicator {
            command
                .env("VANTARE_STARTUP_WINDOW", indicator.handle())
                .env("VANTARE_STARTUP_PID", std::process::id().to_string());
        } else {
            command
                .env_remove("VANTARE_STARTUP_WINDOW")
                .env_remove("VANTARE_STARTUP_PID");
        }
    }
    command
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
        .spawn()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn indicator_requires_the_exact_versioned_header_in_the_root_script() {
        let root = std::env::temp_dir().join(format!(
            "vantare-bootstrap-capabilities-{}-{}",
            std::process::id(),
            vantare_services::random_id().unwrap()
        ));
        std::fs::create_dir_all(&root).unwrap();
        assert!(!supports_indicator(&root));
        for header in [
            "param($Root)\n# vantare-boot-capabilities: indicator-handshake-v1\n",
            "# vantare-boot-capabilities: indicator-handshake-v2\n",
            "# vantare-boot-capabilities: indicator-handshake-v1-extra\n",
        ] {
            std::fs::write(root.join("beta.ps1"), header).unwrap();
            assert!(!supports_indicator(&root));
        }
        for header in [
            "# vantare-boot-capabilities: indicator-handshake-v1\nparam($Root)",
            "\u{feff}# vantare-boot-capabilities: indicator-handshake-v1\r\nparam($Root)",
        ] {
            std::fs::write(root.join("beta.ps1"), header).unwrap();
            assert!(supports_indicator(&root));
        }
        std::fs::remove_file(root.join("beta.ps1")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn startup_shortcuts_opt_out_but_legacy_shortcuts_remain_interactive() {
        let mut args = vec!["--beta".into(), "-Root".into(), "C:/Vantare".into()];
        assert!(!validate(&args).unwrap());
        args.push("--background".into());
        assert!(validate(&args).unwrap());
        args.push("--background".into());
        assert!(validate(&args).is_err());
    }
    #[test]
    fn unknown_bootstrap_arguments_are_rejected() {
        for args in [
            vec!["--beta", "-Root", "C:/Vantare", "--unknown"],
            vec!["--beta", "-Root", "relative"],
            vec!["--beta", "-Root"],
        ] {
            let args = args.into_iter().map(str::to_owned).collect::<Vec<_>>();
            assert!(validate(&args).is_err());
        }
    }
}
