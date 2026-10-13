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
    if crate::QA {
        return Err(
            "Abrir el Hub QA requiere la cuenta/VM de pruebas; usa su bootstrap allí.".into(),
        );
    }
    let windows = std::env::var_os("WINDIR").ok_or("Windows no está disponible")?;
    let mut command = std::process::Command::new(
        PathBuf::from(windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    );
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
