//! Reintento local cancelable: una limpieza ocupada no elimina los controles.
use std::{path::PathBuf, sync::mpsc, thread::JoinHandle, time::Duration};
use vantare_services::{Error, diagnostics::Privacy};

pub(super) struct Cleanup {
    cancel: mpsc::Sender<()>,
    thread: Option<JoinHandle<()>>,
}
impl Cleanup {
    #[cfg(test)]
    pub fn finish(mut self) {
        if let Some(thread) = self.thread.take() {
            thread.join().expect("background cleanup completed");
        }
    }
    pub fn start(root: PathBuf) -> Result<Self, String> {
        let (cancel, stopped) = mpsc::channel();
        let thread = std::thread::Builder::new()
            .name("privacy-cleanup".into())
            .spawn(move || {
                loop {
                    // Espera cancelable: no duerme el hilo UI ni se solapa con otra limpieza.
                    match stopped.recv_timeout(Duration::from_millis(250)) {
                        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    match Privacy::load(&root).and_then(|value| value.discard_disabled(&root)) {
                        Ok(()) => break,
                        Err(Error::Busy) => {}
                        Err(error) => {
                            eprintln!("borrar informes pendientes: {error}");
                            break;
                        }
                    }
                }
            })
            .map_err(|_| "no se pudo iniciar limpieza de privacidad".to_owned())?;
        Ok(Self {
            cancel,
            thread: Some(thread),
        })
    }
}
impl Drop for Cleanup {
    fn drop(&mut self) {
        let _cancel = self.cancel.send(());
        if let Some(thread) = self.thread.take() {
            let _joined = thread.join();
        }
    }
}
