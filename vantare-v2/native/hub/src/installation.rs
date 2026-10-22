//! Sincroniza el nombre visible incluso con el bootstrap del feed anterior.
use std::path::Path;

pub(crate) fn initial_window(minimized: bool, interactive: bool, background: bool) -> (bool, bool) {
    let minimized = minimized && (!interactive || background);
    (minimized, !minimized && !background)
}

#[cfg(windows)]
fn installed_script(executable: &Path, root: &Path) -> Result<std::path::PathBuf, String> {
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

/// La confirmación no bloquea el hilo de UI. Posee su hijo hasta terminar;
/// Un cierre voluntario espera oculto a que termine y el supervisor lo confirme.
pub(crate) struct BootConfirmation {
    child: Option<std::process::Child>,
    root: std::path::PathBuf,
    deadline: std::time::Instant,
    registered: bool,
}

impl BootConfirmation {
    pub(crate) fn start(root: &Path) -> Result<Self, String> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            let script = installed_script(&executable, root)?;
            let windows = std::env::var_os("WINDIR").ok_or("Windows no disponible")?;
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
        Ok(Self {
            child: None,
            root: root.into(),
            deadline: std::time::Instant::now(),
            registered: false,
        })
    }

    #[cfg(windows)]
    fn spawn(root: &Path, command: &mut std::process::Command) -> Result<Self, String> {
        let child = command
            .spawn()
            .map_err(|error| format!("actualizar nombre instalado: {error}"))?;
        Ok(Self {
            child: Some(child),
            root: root.into(),
            deadline: std::time::Instant::now() + std::time::Duration::from_secs(30),
            registered: false,
        })
    }

    /// true solo tras Register correcto y marcador escrito; nunca anticipa readiness.
    pub(crate) fn poll(&mut self) -> Result<bool, String> {
        if let Some(child) = self.child.as_mut() {
            match child.try_wait().map_err(|error| error.to_string())? {
                Some(status) => {
                    self.child = None;
                    if !status.success() {
                        return Err("no se pudo actualizar el nombre instalado de Vantare".into());
                    }
                }
                None if std::time::Instant::now() >= self.deadline => {
                    return Err("el registro de arranque agotó su plazo".into());
                }
                None => return Ok(false),
            }
        }
        if !self.registered {
            std::fs::write(self.root.join("hub-ready"), std::process::id().to_string())
                .map_err(|error| format!("confirmar arranque: {error}"))?;
            self.registered = true;
            self.deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        }
        // El motor anterior también borra este marker al aceptar hub-ready.
        // Conservar el proceso vivo hasta ese acuse evita la carrera de cierre.
        if self
            .root
            .join("boot-pending.json")
            .try_exists()
            .map_err(|error| error.to_string())?
        {
            if std::time::Instant::now() >= self.deadline {
                return Err("el supervisor no confirmó el arranque dentro del plazo".into());
            }
            return Ok(false);
        }
        Ok(true)
    }
}

/// La ventana desaparece, pero Register sigue poseído hasta confirmar o fallar.
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

    #[test]
    fn slow_registration_returns_pending_without_claiming_readiness() {
        let root = root();
        let mut confirmation = waiting(&root);
        assert!(!confirmation.poll().expect("UI remains available"));
        assert!(!root.join("hub-ready").exists());
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
    fn failed_or_timed_out_registration_never_confirms_boot() {
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
        assert!(confirmation.poll().is_err());
        assert!(!root.join("hub-ready").exists());
        let mut confirmation = waiting(&root);
        confirmation.deadline = std::time::Instant::now();
        assert!(confirmation.poll().is_err());
        drop(confirmation); // cancela y recoge el hijo todavía bloqueado.
        assert!(!root.join("hub-ready").exists());
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
        assert!(!root.join("hub-ready").exists());
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

/// Run y toasts usan la identidad del instalador, también en QA aislada.
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
