//! Sincroniza el nombre visible incluso con el bootstrap del feed anterior.
use std::path::Path;

pub(crate) fn initial_window(minimized: bool, interactive: bool, background: bool) -> (bool, bool) {
    let minimized = minimized && (!interactive || background);
    (minimized, !minimized && !background)
}

#[cfg(windows)]
pub(crate) fn installed_script(
    executable: &Path,
    root: &Path,
) -> Result<std::path::PathBuf, String> {
    let bin = executable.parent().ok_or("falta la carpeta bin")?;
    let generation = bin.parent().ok_or("falta la generación")?;
    let generations = generation.parent().ok_or("faltan las generaciones")?;
    let id = generation.file_name().and_then(|name| name.to_str());
    if executable.file_name().and_then(|name| name.to_str()) != Some("vantare-hub.exe")
        || bin.file_name().and_then(|name| name.to_str()) != Some("bin")
        || generations != root.join("generations")
        || !id.is_some_and(|id| {
            id.len() == 32
                && id
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
    {
        return Err("el Hub no pertenece a esta instalación".into());
    }
    Ok(generation.join("candidate.ps1"))
}

/// Readiness precede al mantenimiento de registro. El hijo sigue poseído y
/// acotado, pero su fallo nunca invalida un arranque confirmado.
pub(crate) struct BootConfirmation {
    child: Option<std::process::Child>,
    root: std::path::PathBuf,
    registration_deadline: std::time::Instant,
    ack_deadline: std::time::Instant,
    warning: Option<String>,
}

impl BootConfirmation {
    pub(crate) fn start(root: &Path) -> Result<Self, String> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            let script = installed_script(&executable, root)?;
            let Some(windows) = std::env::var_os("WINDIR") else {
                std::fs::write(root.join("hub-ready"), std::process::id().to_string())
                    .map_err(|error| format!("confirmar arranque: {error}"))?;
                return Ok(Self::ready(
                    root,
                    None,
                    Some("No se pudo actualizar el registro de Vantare: falta WINDIR".into()),
                ));
            };
            let mut command = std::process::Command::new(
                Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
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
                .args(["-Operation", "Register", "-Root"])
                .arg(root)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .creation_flags(0x0800_0000);
            Self::spawn(root, &mut command)
        }
        #[cfg(not(windows))]
        {
            std::fs::write(root.join("hub-ready"), std::process::id().to_string())
                .map_err(|error| format!("confirmar arranque: {error}"))?;
            Ok(Self::ready(root, None, None))
        }
    }

    fn ready(root: &Path, child: Option<std::process::Child>, warning: Option<String>) -> Self {
        Self {
            child,
            root: root.into(),
            registration_deadline: std::time::Instant::now() + std::time::Duration::from_secs(30),
            ack_deadline: std::time::Instant::now() + std::time::Duration::from_secs(10),
            warning,
        }
    }

    #[cfg(windows)]
    fn spawn(root: &Path, command: &mut std::process::Command) -> Result<Self, String> {
        // This must finish before even creating Register: its exit/latency is cosmetic.
        std::fs::write(root.join("hub-ready"), std::process::id().to_string())
            .map_err(|error| format!("confirmar arranque: {error}"))?;
        let (child, warning) = match command.spawn() {
            Ok(child) => (Some(child), None),
            Err(error) => (
                None,
                Some(format!(
                    "No se pudo actualizar el registro de Vantare: {error}"
                )),
            ),
        };
        Ok(Self::ready(root, child, warning))
    }

    pub(crate) fn poll(&mut self) -> Result<bool, String> {
        if let Some(child) = self.child.as_mut() {
            let failure = match child.try_wait() {
                Ok(Some(status)) if status.success() => {
                    self.child = None;
                    None
                }
                Ok(Some(_)) => Some("No se pudo actualizar el registro de Vantare".to_owned()),
                Ok(None) if std::time::Instant::now() >= self.registration_deadline => {
                    Some("El registro de Vantare agotó su plazo".to_owned())
                }
                Ok(None) => None,
                Err(error) => Some(format!(
                    "No se pudo comprobar el registro de Vantare: {error}"
                )),
            };
            if let Some(warning) = failure {
                if let Some(mut child) = self.child.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                self.warning = Some(warning);
            }
        }
        // ACK still bounds real boot confirmation; registration owns a separate file.
        if self
            .root
            .join("boot-pending.json")
            .try_exists()
            .map_err(|error| error.to_string())?
        {
            if std::time::Instant::now() >= self.ack_deadline {
                return Err("el supervisor no confirmó el arranque dentro del plazo".into());
            }
            return Ok(false);
        }
        if self.child.is_some() {
            return Ok(false);
        }
        if let Err(error) = write_registration_status(&self.root, self.warning.as_deref()) {
            // Maintenance cannot invalidate readiness, even when its status cannot be saved.
            eprintln!("No se pudo guardar el estado del registro: {error}");
        }
        Ok(true)
    }
}

fn write_registration_status(root: &Path, warning: Option<&str>) -> std::io::Result<()> {
    use std::io::Write;
    let path = root.join("registration-status.json");
    // This writer never reads or modifies update-status.json. In particular a
    // Stage running concurrently keeps its ready/error and update notification.
    let status = serde_json::json!({"schema":1,
        "state":if warning.is_some() {"warning"} else {"current"},
        "message":warning.unwrap_or("")});
    let temporary = root.join(format!("registration-{}.tmp", std::process::id()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| {
        file.write_all(&serde_json::to_vec(&status)?)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, &path)
    })();
    let _ = std::fs::remove_file(temporary);
    result
}

/// La ventana desaparece, pero el hijo sigue poseído hasta terminar o vencer.
pub(crate) fn defer_close(
    confirmation: &std::cell::RefCell<Option<BootConfirmation>>,
    hide: impl FnOnce(),
) -> bool {
    if confirmation.borrow().is_none() {
        return false;
    }
    hide();
    true
}

impl Drop for BootConfirmation {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::os::windows::io::{AsHandle, AsRawHandle, BorrowedHandle};

    fn root() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("vantare-boot-{}-{}", std::process::id(), {
            static SERIAL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            SERIAL.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        }));
        std::fs::create_dir_all(&root).expect("isolated boot root");
        root
    }

    fn waiting(root: &Path) -> BootConfirmation {
        use std::{
            os::windows::process::CommandExt,
            process::{Command, Stdio},
        };
        // more espera EOF en un pipe propio: sincronización explícita, sin sleeps.
        let mut command = Command::new("cmd.exe");
        command
            .args(["/D", "/C", "more > nul"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000);
        BootConfirmation::spawn(root, &mut command).expect("registration fixture")
    }

    #[allow(unsafe_code)] // Test-only Win32 boundary: query the owned process object.
    fn process_exited(handle: BorrowedHandle<'_>) -> std::io::Result<bool> {
        #[link(name = "kernel32")]
        // SAFETY: DWORD WaitForSingleObject(HANDLE, DWORD), Windows SDK signature.
        unsafe extern "system" {
            #[link_name = "WaitForSingleObject"]
            fn wait_for_single_object(handle: *mut std::ffi::c_void, milliseconds: u32) -> u32;
        }
        // SAFETY: the borrowed duplicate stays owned for this call. Zero checks
        // immediately: production kill/wait must already have reaped this child.
        match unsafe { wait_for_single_object(handle.as_raw_handle(), 0) } {
            0 => Ok(true),     // WAIT_OBJECT_0
            0x102 => Ok(false), // WAIT_TIMEOUT: the same process is still running.
            u32::MAX => Err(std::io::Error::last_os_error()), // WAIT_FAILED
            _ => Err(std::io::Error::other("unexpected process wait result")),
        }
    }

    #[test]
    fn dropping_confirmation_reaps_the_blocked_registration_child() {
        let root = root();
        let confirmation = waiting(&root);
        let handle = confirmation.child.as_ref().unwrap().as_handle()
            .try_clone_to_owned().expect("retain owned registration process");
        assert!(!process_exited(handle.as_handle()).expect("blocked child"));
        drop(confirmation);
        assert!(process_exited(handle.as_handle()).expect("reaped child"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn slow_registration_claims_readiness_before_finishing() {
        let root = root();
        let mut confirmation = waiting(&root);
        assert!(!confirmation.poll().expect("UI remains available"));
        assert!(root.join("hub-ready").exists());
        drop(confirmation.child.as_mut().unwrap().stdin.take());
        assert!(
            confirmation
                .child
                .as_mut()
                .unwrap()
                .wait()
                .unwrap()
                .success()
        );
        assert!(confirmation.poll().expect("finished registration"));
        assert_eq!(
            std::fs::read_to_string(root.join("hub-ready")).unwrap(),
            std::process::id().to_string()
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_or_timed_out_registration_warns_without_rejecting_boot() {
        use std::{
            os::windows::process::CommandExt,
            process::{Command, Stdio},
        };
        let root = root();
        let mut command = Command::new("cmd.exe");
        command
            .args(["/D", "/C", "exit /B 7"])
            .stdout(Stdio::null())
            .creation_flags(0x0800_0000);
        let mut confirmation = BootConfirmation::spawn(&root, &mut command).unwrap();
        assert!(
            !confirmation
                .child
                .as_mut()
                .unwrap()
                .wait()
                .unwrap()
                .success()
        );
        assert!(confirmation.poll().expect("registration is cosmetic"));
        assert!(
            std::fs::read_to_string(root.join("registration-status.json"))
                .unwrap()
                .contains("warning")
        );
        assert!(root.join("hub-ready").exists());
        let mut confirmation = waiting(&root);
        let handle = confirmation.child.as_ref().unwrap().as_handle()
            .try_clone_to_owned().expect("retain owned registration process");
        assert!(!process_exited(handle.as_handle()).expect("blocked child"));
        confirmation.registration_deadline = std::time::Instant::now();
        assert!(confirmation.poll().expect("registration is cosmetic"));
        assert!(confirmation.child.is_none());
        assert!(process_exited(handle.as_handle()).expect("reaped child"));
        assert!(
            std::fs::read_to_string(root.join("registration-status.json"))
                .unwrap()
                .contains("warning")
        );
        drop(confirmation); // cancela y recoge el hijo todavía bloqueado.
        assert!(root.join("hub-ready").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn closing_early_hides_but_waits_for_registration_and_the_supervisor_ack() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = root();
        std::fs::write(root.join("boot-pending.json"), "pending").unwrap();
        let confirmation = std::cell::RefCell::new(Some(waiting(&root)));
        let mut hidden = false;
        assert!(defer_close(&confirmation, || hidden = true));
        assert!(hidden);
        assert!(!confirmation.borrow_mut().as_mut().unwrap().poll().unwrap());
        assert!(root.join("hub-ready").exists());
        {
            let mut value = confirmation.borrow_mut();
            let child = value.as_mut().unwrap().child.as_mut().unwrap();
            drop(child.stdin.take());
            assert!(child.wait().unwrap().success());
        }
        assert!(!confirmation.borrow_mut().as_mut().unwrap().poll().unwrap());
        // An exclusive handle proves further polls never rewrite readiness.
        let marker = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(root.join("hub-ready"))
            .unwrap();
        assert!(!confirmation.borrow_mut().as_mut().unwrap().poll().unwrap());
        std::fs::remove_file(root.join("boot-pending.json")).unwrap();
        assert!(confirmation.borrow_mut().as_mut().unwrap().poll().unwrap());
        drop(marker);
        confirmation.borrow_mut().take();
        assert!(!defer_close(&confirmation, || panic!("already confirmed")));
        assert_eq!(
            std::fs::read_to_string(root.join("hub-ready")).unwrap(),
            std::process::id().to_string()
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn readiness_precedes_the_registration_process_and_spawn_failure_is_a_warning() {
        use std::{os::windows::process::CommandExt, process::Command};
        let root = root();
        let mut command = Command::new("cmd.exe");
        command
            .args([
                "/D",
                "/C",
                "if not exist hub-ready (exit /B 9) else (exit /B 0)",
            ])
            .current_dir(&root)
            .creation_flags(0x0800_0000);
        let mut confirmation = BootConfirmation::spawn(&root, &mut command).unwrap();
        assert!(
            confirmation
                .child
                .as_mut()
                .unwrap()
                .wait()
                .unwrap()
                .success()
        );
        assert!(confirmation.poll().unwrap());
        let mut confirmation =
            BootConfirmation::spawn(&root, &mut Command::new(root.join("missing.exe"))).unwrap();
        assert!(confirmation.poll().unwrap());
        assert!(
            std::fs::read_to_string(root.join("registration-status.json"))
                .unwrap()
                .contains("warning")
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn registration_document_waits_for_ack_and_never_modifies_update_status() {
        let root = root();
        std::fs::write(root.join("boot-pending.json"), "pending").unwrap();
        let mut confirmation = waiting(&root);
        confirmation.registration_deadline = std::time::Instant::now();
        assert!(!confirmation.poll().unwrap());
        assert!(!root.join("registration-status.json").exists());
        let ready = br#"{"schema":1,"state":"ready","message":"update","version":"0.0.990","notes":"next release"}"#;
        std::fs::write(root.join("update-status.json"), ready).unwrap();
        std::fs::remove_file(root.join("boot-pending.json")).unwrap();
        assert!(confirmation.poll().unwrap());
        assert_eq!(
            std::fs::read(root.join("update-status.json")).unwrap(),
            ready
        );
        let status: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("registration-status.json")).unwrap())
                .unwrap();
        assert_eq!(status["state"], "warning");
        write_registration_status(&root, None).unwrap();
        let status: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("registration-status.json")).unwrap())
                .unwrap();
        assert_eq!(status["state"], "current");
        assert_eq!(
            std::fs::read(root.join("update-status.json")).unwrap(),
            ready
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn feed_uses_its_generation_and_rejects_another_installation() {
        let root = Path::new("C:/qa/Vantare Native Beta");
        let generation = root.join("generations/0123456789abcdef0123456789abcdef");
        let executable = generation.join("bin/vantare-hub.exe");
        assert_eq!(
            installed_script(&executable, root).unwrap(),
            generation.join("candidate.ps1")
        );
        assert!(installed_script(&executable, Path::new("C:/another installation")).is_err());
        assert!(installed_script(&root.join("bin/vantare-hub.exe"), root).is_err());
        assert!(installed_script(&generation.join("bin/another.exe"), root).is_err());
        assert!(
            installed_script(&root.join("generations/invalid/bin/vantare-hub.exe"), root).is_err()
        );
    }
}

/// Toasts y el valor Run legado usan la identidad del instalador, también en QA.
pub(crate) fn hub_identity() -> Result<String, String> {
    hub_identity_at(
        std::env::var_os("VANTARE_BETA_ROOT")
            .as_deref()
            .map(Path::new),
    )
}

fn hub_identity_at(root: Option<&Path>) -> Result<String, String> {
    let Some(root) = root else {
        return Ok("VantareNative.Hub".into());
    };
    let identity = match std::fs::read_to_string(root.join("registration-identity.txt")) {
        Ok(identity) => identity,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok("VantareNative.Hub".into());
        }
        Err(error) => return Err(format!("leer identidad instalada: {error}")),
    };
    let identity = identity.trim();
    if identity.is_empty()
        || identity.len() > 64
        || !identity.bytes().all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err("Identidad de registro inválida".into());
    }
    Ok(if identity == "VantareNativeBeta" {
        "VantareNative.Hub".into()
    } else {
        format!("{identity}.Hub")
    })
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn background_preserves_minimized_and_never_activates_the_hub() {
        assert_eq!(initial_window(true, false, true), (true, false));
        assert_eq!(initial_window(true, true, true), (true, false));
        assert_eq!(initial_window(false, false, true), (false, false));
        assert_eq!(initial_window(true, false, false), (true, false));
        assert_eq!(initial_window(true, true, false), (false, true));
    }
    #[test]
    fn isolated_installation_does_not_use_the_real_run_or_toast_identity() {
        let root = std::env::temp_dir().join(format!("vantare-identity-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("raíz propia");
        assert_eq!(hub_identity_at(None).unwrap(), "VantareNative.Hub");
        assert_eq!(hub_identity_at(Some(&root)).unwrap(), "VantareNative.Hub");
        for (marker, expected) in [
            ("VantareNativeBeta", "VantareNative.Hub"),
            ("VantareQAIntegration", "VantareQAIntegration.Hub"),
        ] {
            std::fs::write(root.join("registration-identity.txt"), marker).unwrap();
            assert_eq!(hub_identity_at(Some(&root)).unwrap(), expected);
        }
        std::fs::write(root.join("registration-identity.txt"), "invalid/identity").unwrap();
        assert!(hub_identity_at(Some(&root)).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
