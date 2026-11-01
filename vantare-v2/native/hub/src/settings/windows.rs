//! Preferencias de Windows: movimiento y acceso Startup del instalador.
#![allow(unsafe_code)]
/// Consulta de solo lectura de «Efectos de animación» de Windows.
pub(in crate::shell) fn reduced_motion() -> bool {
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        unsafe extern "system" {
            fn SystemParametersInfoW(
                action: u32,
                parameter: u32,
                value: *mut i32,
                flags: u32,
            ) -> i32;
        }
        let mut enabled = 0;
        // SAFETY: SPI_GETCLIENTAREAANIMATION escribe un BOOL en un buffer válido.
        // Ante fallo, reducir movimiento; jamás modifica la preferencia del SO.
        unsafe { SystemParametersInfoW(0x1042, 0, &raw mut enabled, 0) == 0 || enabled == 0 }
    }
    #[cfg(not(windows))]
    {
        false
    }
}
/// Owns the bounded installer command while the UI stays responsive.
pub(super) struct StartupChange {
    child: std::process::Child,
    deadline: std::time::Instant,
    diagnostic: std::fs::File,
    diagnostic_path: std::path::PathBuf,
}
impl StartupChange {
    pub(super) fn start(enabled: bool) -> Result<Self, String> {
        #[cfg(windows)]
        {
            use std::{
                os::windows::process::CommandExt,
                path::PathBuf,
                process::{Command, Stdio},
            };
            let root = PathBuf::from(
                std::env::var_os("VANTARE_BETA_ROOT")
                    .ok_or("Instala Vantare con Setup para iniciar con Windows")?,
            );
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            let script = crate::installation::installed_script(&executable, &root)?;
            let windows = std::env::var_os("WINDIR").ok_or("Windows no disponible")?;
            let mut command = Command::new(
                PathBuf::from(windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
            );
            command
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                ])
                .arg(script)
                .args(["-Operation", "SetStartup", "-Root"])
                .arg(&root)
                .args(["-Startup", if enabled { "On" } else { "Off" }])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .creation_flags(0x0800_0000);
            Self::spawn(&mut command, &root)
        }
        #[cfg(not(windows))]
        {
            let _ = enabled;
            Err("Inicio automático disponible solo en Windows".into())
        }
    }
    #[cfg(any(windows, test))]
    fn spawn(command: &mut std::process::Command, root: &std::path::Path) -> Result<Self, String> {
        // A file avoids a full stderr pipe blocking the child. Own and remove it
        // with the process; only a bounded diagnostic is shown after failure.
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos();
        let diagnostic_path = root.join(format!(
            "startup-command-{}-{nonce}.log",
            std::process::id()
        ));
        let diagnostic = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&diagnostic_path)
            .map_err(|error| format!("Inicio con Windows: {error}. Vuelve a intentarlo."))?;
        let stderr = match diagnostic.try_clone() {
            Ok(stderr) => stderr,
            Err(error) => {
                drop(diagnostic);
                let _ = std::fs::remove_file(&diagnostic_path);
                return Err(format!("Inicio con Windows: {error}. Vuelve a intentarlo."));
            }
        };
        command.stderr(stderr);
        let child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                drop(diagnostic);
                let _ = std::fs::remove_file(&diagnostic_path);
                return Err(format!("Inicio con Windows: {error}. Vuelve a intentarlo."));
            }
        };
        Ok(Self {
            child,
            deadline: std::time::Instant::now() + std::time::Duration::from_secs(30),
            diagnostic,
            diagnostic_path,
        })
    }
    fn failure(&mut self) -> String {
        use std::io::{Read, Seek, SeekFrom};
        let mut bytes = Vec::new();
        let _ = self.diagnostic.seek(SeekFrom::Start(0));
        let _ = (&mut self.diagnostic).take(4096).read_to_end(&mut bytes);
        let detail = String::from_utf8_lossy(&bytes);
        format!(
            "No se pudo cambiar el inicio con Windows. {} Vuelve a intentarlo.",
            detail.trim()
        )
    }
    fn poll(&mut self) -> Result<bool, String> {
        match self.child.try_wait().map_err(|error| error.to_string())? {
            Some(status) if status.success() => Ok(true),
            Some(_) => Err(self.failure()),
            None if std::time::Instant::now() >= self.deadline => {
                Err("El cambio de inicio con Windows agotó su plazo. Vuelve a intentarlo.".into())
            }
            None => Ok(false),
        }
    }
    pub(super) async fn complete(
        mut self,
        executor: gpui::BackgroundExecutor,
    ) -> Result<(), String> {
        while !self.poll()? {
            executor.timer(std::time::Duration::from_millis(50)).await;
        }
        Ok(())
    }
}
impl Drop for StartupChange {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.diagnostic_path);
    }
}

/// Installer UI wins; legacy migrations persist a small root preference.
pub(super) fn installed_startup() -> Option<bool> {
    installed_startup_at(std::path::Path::new(&std::env::var_os(
        "VANTARE_BETA_ROOT",
    )?))
}
pub(super) fn installed_startup_at(root: &std::path::Path) -> Option<bool> {
    let ui = root.join("installer-ui.json");
    if ui.try_exists().ok()? {
        return startup_option(&crate::files::read(&ui, 4096).ok()?);
    }
    let bytes = crate::files::read(&root.join("startup-options.json"), 1024).ok()?;
    let option: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    (option.as_object()?.len() == 2 && option["schema"] == 1).then_some(())?;
    option["autostart"].as_bool()
}
fn startup_option(bytes: &[u8]) -> Option<bool> {
    let options: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    (options["schema"] == 1 && options["kind"] == "rust-gpui").then_some(())?;
    options["autostart"].as_bool()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installer_options_keep_setup_and_hub_startup_preferences_in_sync() {
        for enabled in [false, true] {
            let value = serde_json::json!({"schema":1,"kind":"rust-gpui","autostart":enabled});
            assert_eq!(
                startup_option(&serde_json::to_vec(&value).unwrap()),
                Some(enabled)
            );
        }
        for bytes in [
            b"{}".as_slice(),
            br#"{"schema":1,"kind":"rust-gpui","autostart":"true"}"#,
            br#"{"schema":2,"kind":"rust-gpui","autostart":true}"#,
            b"invalid",
        ] {
            assert_eq!(startup_option(bytes), None);
        }
    }
    #[cfg(windows)]
    #[test]
    fn startup_command_failure_timeout_and_drop_never_claim_success() {
        use std::{
            os::windows::process::CommandExt,
            process::{Command, Stdio},
        };
        let root =
            std::env::temp_dir().join(format!("vantare-startup-child-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let mut command = Command::new("cmd.exe");
        command
            .args([
                "/D",
                "/C",
                "echo Synthetic operation lock contention 1>&2 & exit /B 7",
            ])
            .creation_flags(0x0800_0000);
        let mut change = StartupChange::spawn(&mut command, &root).unwrap();
        change.child.wait().unwrap();
        let error = change.poll().unwrap_err();
        assert!(
            error.contains("Synthetic operation lock contention")
                && error.contains("Vuelve a intentarlo")
        );
        drop(change);
        drop(command);
        let mut command = Command::new("powershell.exe");
        command
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::Error.Write(('x'*100000));exit 7",
            ])
            .creation_flags(0x0800_0000);
        let mut change = StartupChange::spawn(&mut command, &root).unwrap();
        change.child.wait().unwrap();
        let error = change.poll().unwrap_err();
        assert!(error.contains("Vuelve a intentarlo") && error.len() < 4200);
        drop(change);
        drop(command);
        let mut command = Command::new("cmd.exe");
        command
            .args(["/D", "/C", "more > nul"])
            .stdin(Stdio::piped())
            .creation_flags(0x0800_0000);
        let mut change = StartupChange::spawn(&mut command, &root).unwrap();
        assert!(!change.poll().unwrap());
        change.deadline = std::time::Instant::now();
        assert!(change.poll().is_err());
        drop(change); // Owns cancellation and reaps the blocked child.
        drop(command);
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 0);
        std::fs::remove_dir(root).unwrap();
    }
}
