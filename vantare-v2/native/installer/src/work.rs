//! One owned I/O worker; cancellation is observed before the installation transaction.
use crate::{
    args::Args,
    engine::{Request, Session},
    model::Progress,
};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver},
    },
    thread::{self, JoinHandle},
};

pub enum Event {
    Progress(Progress),
    Finished(Result<u8, String>),
}
pub struct Work {
    pub events: Receiver<Event>,
    pub cancel: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}
impl Work {
    pub fn start(request: Request) -> Self {
        let (send, events) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let token = cancel.clone();
        let thread = thread::spawn(move || {
            let result = Session::new().and_then(|session| {
                session.run(&request, &token, |event| {
                    let _ = send.send(Event::Progress(event));
                })
            });
            let _ = send.send(Event::Finished(result));
        });
        Self {
            events,
            cancel,
            thread: Some(thread),
        }
    }
    pub fn stop_before_transaction(&self) {
        self.cancel.store(true, Ordering::Release);
    }
}
impl Drop for Work {
    fn drop(&mut self) {
        self.stop_before_transaction();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

pub fn open(root: PathBuf) -> Result<(), String> {
    // CreateProcess can accept PowerShell even when its -File does not exist.
    // Keep Setup open for that launch error instead of reporting a false success.
    if !root.join("beta.ps1").is_file() {
        return Err(
            "No se encuentra el lanzador de Vantare. Vuelve a ejecutar el instalador.".into(),
        );
    }
    let windows = std::env::var_os("WINDIR").ok_or("Windows no está disponible")?;
    let host = PathBuf::from(windows).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    if crate::QA {
        let owner = env!("VANTARE_INSTALLER_QA_OWNER_SID");
        let mut probe = std::process::Command::new(&host);
        probe.args([
            "-NoProfile",
            "-Command",
            "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
        ]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            probe.creation_flags(0x0800_0000);
        }
        let output = probe.output().map_err(|e| e.to_string())?;
        let current = String::from_utf8_lossy(&output.stdout);
        if owner.is_empty()
            || !output.status.success()
            || !current.trim().starts_with("S-1-")
            || current.trim() == owner
        {
            return Err(
                "Abrir el Hub QA requiere una cuenta/VM con SID distinto al de origen del paquete."
                    .into(),
            );
        }
    }
    let mut command = std::process::Command::new(host);
    command
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
        ])
        .arg(root.join("beta.ps1"))
        .arg("-Root")
        .arg(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn cleanup(root: PathBuf) -> Result<(), String> {
    Session::schedule_cleanup(&Args {
        silent: true,
        uninstall: true,
        root: Some(root),
        ..Args::default()
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn missing_bootstrap_is_a_launch_failure_without_starting_powershell() {
        let root =
            std::env::temp_dir().join(format!("vantare-missing-bootstrap-{}", std::process::id()));
        assert!(!root.exists());
        assert!(super::open(root).is_err());
    }
}
