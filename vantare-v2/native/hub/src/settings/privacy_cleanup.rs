//! Reintento cancelable de limpieza/importación; la UI solo recibe el resultado.
use std::{
    path::{Path, PathBuf},
    sync::mpsc,
    thread::JoinHandle,
    time::Duration,
};
use vantare_services::diagnostics::{ConsentSaveError, Privacy};

type Snapshot = (Privacy, Option<Vec<u8>>);

pub(super) struct Cleanup {
    cancel: mpsc::Sender<()>,
    result: mpsc::Receiver<Result<Snapshot, String>>,
    observed: Option<Vec<u8>>,
    thread: Option<JoinHandle<()>>,
}
impl Cleanup {
    pub fn unchanged(&self, observed: Option<&[u8]>) -> bool {
        self.observed.as_deref() == observed
    }
    #[cfg(test)]
    pub fn finish(&mut self) {
        if let Some(thread) = self.thread.take() {
            thread.join().expect("background privacy completed");
        }
    }
    pub fn poll(&self) -> Option<Result<Snapshot, String>> {
        match self.result.try_recv() {
            Ok(result) => Some(result),
            Err(mpsc::TryRecvError::Empty) => None,
            Err(mpsc::TryRecvError::Disconnected) => {
                Some(Err("reintento de privacidad interrumpido".into()))
            }
        }
    }
    fn attempt(root: &Path, import: Option<bool>) -> Result<Snapshot, ConsentSaveError> {
        let mut store = super::Store::read(root).map_err(ConsentSaveError::Failed)?;
        store
            .value
            .discard_disabled(root)
            .map_err(ConsentSaveError::from)?;
        if !store.value.usage_decided
            && let Some(usage) = import
        {
            let mut next = store.value;
            next.usage = usage;
            next.usage_decided = true;
            store.save_typed(next)?;
        }
        Ok((store.value, store.observed.take()))
    }
    pub fn start(
        root: PathBuf,
        import: Option<bool>,
        observed: Option<Vec<u8>>,
    ) -> Result<Self, String> {
        let (cancel, stopped) = mpsc::channel();
        let (reply, result) = mpsc::channel();
        let thread = std::thread::Builder::new()
            .name("privacy-cleanup".into())
            .spawn(move || {
                loop {
                    // Espera cancelable: ni I/O ni espera en el heartbeat del Hub.
                    match stopped.recv_timeout(Duration::from_millis(250)) {
                        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    match Self::attempt(&root, import) {
                        Ok(snapshot) => {
                            let _returned = reply.send(Ok(snapshot));
                            break;
                        }
                        Err(ConsentSaveError::Busy) => {}
                        Err(error) => {
                            let _returned = reply.send(Err(error.to_string()));
                            break;
                        }
                    }
                }
            })
            .map_err(|_| "no se pudo iniciar reintento de privacidad".to_owned())?;
        Ok(Self {
            cancel,
            result,
            observed,
            thread: Some(thread),
        })
    }
}
impl Drop for Cleanup {
    fn drop(&mut self) {
        let _cancel = self.cancel.send(());
        if let Some(thread) = self.thread.take()
            && thread.join().is_err()
        {
            eprintln!("privacidad: worker terminado con panic");
        }
    }
}
