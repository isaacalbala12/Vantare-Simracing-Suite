//! Hilos ya poseídos por la sesión: cancelar y recoger sin sumar plazos.
use std::io;

#[derive(Default)]
pub(super) struct Workers {
    #[cfg(windows)]
    pub resident: Option<super::resident::Resident>,
    #[cfg(windows)]
    pub host: Option<vantare_runtime::services::Host>,
    #[cfg(test)]
    pub fixture: Option<TestWorker>,
}

#[cfg(test)]
pub(super) struct TestWorker {
    pub cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub thread: std::thread::JoinHandle<()>,
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
        }
        #[cfg(test)]
        if let Some(worker) = self.fixture.take() {
            std::mem::forget(worker);
        }
    }
}

#[cfg(test)]
mod tests;
