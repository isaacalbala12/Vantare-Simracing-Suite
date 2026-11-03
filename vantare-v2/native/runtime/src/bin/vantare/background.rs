//! Hilos ya poseídos por la sesión: cancelar y recoger sin sumar plazos.
use std::io;

#[derive(Default)]
pub(super) struct Workers {
    #[cfg(windows)]
    pub resident: Option<super::resident::Resident>,
    #[cfg(windows)]
    pub host: Option<vantare_runtime::services::Host>,
    #[cfg(windows)]
    pub feed: Option<Feed>,
    #[cfg(windows)]
    pub open_hub: Option<super::win::OpenHub>,
    #[cfg(test)]
    pub fixture: Option<TestWorker>,
}

#[cfg(test)]
pub(super) struct TestWorker {
    pub cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub thread: std::thread::JoinHandle<()>,
}

#[cfg(windows)]
pub(super) struct Feed {
    cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    thread: std::thread::JoinHandle<()>,
}

#[cfg(windows)]
impl Feed {
    pub fn start(root: std::path::PathBuf) -> io::Result<Self> {
        let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let token = cancel.clone();
        let thread = std::thread::Builder::new()
            .name("vantare-beta-feed".into())
            .spawn(move || {
                loop {
                    if token.load(std::sync::atomic::Ordering::Acquire) {
                        break;
                    }
                    if let Err(error) = super::installed::stage(&root, &token) {
                        super::log(format_args!("feed beta: {error}"));
                    }
                    std::thread::park_timeout(std::time::Duration::from_secs(6 * 60 * 60));
                }
            })?;
        Ok(Self { cancel, thread })
    }
    fn request_shutdown(&self) {
        self.cancel
            .store(true, std::sync::atomic::Ordering::Release);
        self.thread.thread().unpark();
    }
}

impl Workers {
    pub fn request_shutdown(&self) {
        #[cfg(test)]
        if let Some(worker) = &self.fixture {
            worker
                .cancel
                .store(true, std::sync::atomic::Ordering::Release);
        }
        #[cfg(windows)]
        {
            if let Some(resident) = &self.resident {
                resident.request_shutdown();
            }
            if let Some(host) = &self.host {
                host.request_shutdown();
            }
            if let Some(feed) = &self.feed {
                feed.request_shutdown();
            }
        }
    }

    pub fn poll_shutdown(&mut self) -> io::Result<bool> {
        #[cfg(any(windows, test))]
        let mut done = true;
        #[cfg(not(any(windows, test)))]
        let done = true;
        #[cfg(windows)]
        {
            if let Some(resident) = &mut self.resident {
                if resident.poll_shutdown()? {
                    self.resident.take();
                } else {
                    done = false;
                }
            }
            if let Some(host) = &mut self.host {
                if host.poll_shutdown()? {
                    self.host.take();
                } else {
                    done = false;
                }
            }
            if self
                .feed
                .as_ref()
                .is_some_and(|feed| feed.thread.is_finished())
            {
                self.feed
                    .take()
                    .expect("feed finished")
                    .thread
                    .join()
                    .map_err(|_| io::Error::other("Feed terminó con panic"))?;
            } else if self.feed.is_some() {
                done = false;
            }
        }
        #[cfg(test)]
        if let Some(worker) = &self.fixture {
            if worker.thread.is_finished() {
                self.fixture
                    .take()
                    .expect("worker observado")
                    .thread
                    .join()
                    .map_err(|_| io::Error::other("fixture worker panic"))?;
            } else {
                done = false;
            }
        }
        Ok(done)
    }

    /// Sólo al salir inmediatamente del proceso por plazo vencido. No vuelve
    /// a ejecutar destructores bloqueantes: el SO termina los hilos cancelados
    /// y libera sus handles/locks al salir main. El llamador devuelve fallo.
    pub fn force_on_exit(&mut self) {
        self.request_shutdown();
        #[cfg(windows)]
        {
            if let Some(resident) = self.resident.take() {
                if let Err(error) = resident.force_cleanup() {
                    super::log(format_args!("cierre forzado de apps del Launcher: {error}"));
                }
                std::mem::forget(resident);
            }
            if let Some(host) = self.host.take() {
                // El cleanup del residente puede haber dejado libre un slot
                // ocupado: último intento idempotente antes de salir.
                host.request_shutdown();
                std::mem::forget(host);
            }
            if let Some(feed) = self.feed.take() {
                feed.request_shutdown();
                std::mem::forget(feed);
            }
        }
        #[cfg(test)]
        if let Some(worker) = self.fixture.take() {
            std::mem::forget(worker);
        }
    }
}

#[cfg(test)]
mod tests;
