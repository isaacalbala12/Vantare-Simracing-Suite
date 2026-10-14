//! Productor de UI sin disco: cola acotada; services persiste fuera del callback.
use super::{
    Privacy, QUEUE_LIMIT, Usage, configured, data_root, enqueue_authorized, enqueue_once_authorized,
};
use crate::{Error, Result};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Duration,
};

const DISABLED: u64 = u64::MAX;
struct Observation {
    event: Usage,
    generation: u64,
    once: bool,
}

/// Un dueño por proceso de UI; cancelar despierta el worker y lo reúne al cerrar.
pub struct Recorder {
    sender: mpsc::SyncSender<Option<Observation>>,
    consent: Arc<AtomicU64>,
    stopped: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}
impl Recorder {
    pub fn start() -> Result<Option<Self>> {
        if !configured() {
            return Ok(None);
        }
        Self::start_at(data_root()?, || {}).map(Some)
    }

    fn start_at(root: PathBuf, mut before_write: impl FnMut() + Send + 'static) -> Result<Self> {
        let (sender, receiver) = mpsc::sync_channel::<Option<Observation>>(QUEUE_LIMIT);
        let consent = Arc::new(AtomicU64::new(DISABLED));
        let current = Arc::clone(&consent);
        let stopped = Arc::new(AtomicBool::new(false));
        let cancel = Arc::clone(&stopped);
        let thread = std::thread::Builder::new()
            .name("usage-persist".into())
            .spawn(move || {
                while !cancel.load(Ordering::Acquire) {
                    let generation = Privacy::load(&root)
                        .ok()
                        .filter(|privacy| privacy.usage)
                        .map_or(DISABLED, |privacy| privacy.generation);
                    current.store(generation, Ordering::Release);
                    match receiver.recv_timeout(Duration::from_millis(250)) {
                        Ok(Some(observation)) => {
                            if cancel.load(Ordering::Acquire) {
                                break;
                            }
                            before_write();
                            let result = if observation.once {
                                enqueue_once_authorized(
                                    &root,
                                    &observation.event,
                                    observation.generation,
                                )
                            } else {
                                enqueue_authorized(
                                    &root,
                                    &observation.event,
                                    observation.generation,
                                )
                            };
                            if let Err(error) = result {
                                eprintln!("uso local: {error}");
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Ok(None) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
            })
            .map_err(|_| Error::Storage)?;
        Ok(Self {
            sender,
            consent,
            stopped,
            thread: Some(thread),
        })
    }

    pub fn generation(&self) -> Option<u64> {
        let generation = self.consent.load(Ordering::Acquire);
        (generation != DISABLED).then_some(generation)
    }
    /// Publicación en memoria tras guardar una decisión; el disco sigue siendo autoridad.
    pub fn consent(&self, privacy: Privacy) {
        self.consent.store(
            if privacy.usage && privacy.usage_decided {
                privacy.generation
            } else {
                DISABLED
            },
            Ordering::Release,
        );
    }
    pub fn record(&self, event: &Usage) {
        if let Some(generation) = self.generation() {
            self.record_in_generation(event, generation, false);
        }
    }
    pub fn record_once(&self, event: &Usage) {
        if let Some(generation) = self.generation() {
            self.record_in_generation(event, generation, true);
        }
    }
    pub fn record_in_generation(&self, event: &Usage, generation: u64, once: bool) {
        if !event.valid() || self.stopped.load(Ordering::Acquire) {
            return;
        }
        // Full/Disconnected descartan; nunca send, escritura, mutex ni espera en UI.
        let _discarded = self.sender.try_send(Some(Observation {
            event: event.clone(),
            generation,
            once,
        }));
    }
}
impl Drop for Recorder {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        let _wake = self.sender.try_send(None);
        if let Some(thread) = self.thread.take()
            && thread.join().is_err()
        {
            eprintln!("uso local: worker terminado con panic");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::{consent_tests::choice, tests::root};

    #[test]
    fn isa1609_ui_callback_returns_and_drops_full_queue_while_write_is_blocked() {
        let root = root();
        let privacy = choice(&root, true);
        let (writing, entered) = mpsc::channel();
        let (release, blocked) = mpsc::channel();
        let mut first = true;
        let recorder = Recorder::start_at(root.clone(), move || {
            if first {
                first = false;
                writing.send(()).expect("writing blocked");
                blocked.recv().expect("release write");
            }
        })
        .expect("worker");
        recorder.consent(privacy);
        let event = Usage::PageViewed {
            page: "home".into(),
        };
        recorder.record(&event);
        entered
            .recv_timeout(Duration::from_secs(5))
            .expect("writer reached");
        let (done, returned) = mpsc::channel();
        let completed = std::thread::scope(|scope| {
            let recorder = &recorder;
            scope.spawn(|| {
                for _ in 0..QUEUE_LIMIT * 4 {
                    recorder.record(&event);
                }
                done.send(()).expect("callback returned");
            });
            // Plazo de fallo, no sleep: debe retornar con el writer todavía detenido.
            let completed = returned.recv_timeout(Duration::from_secs(5)).is_ok();
            release.send(()).expect("release before assertion");
            completed
        });
        assert!(completed, "UI callback waited on disk or full channel");
        drop(recorder);
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn isa1609_memory_event_keeps_its_generation_across_revocation_and_reacceptance() {
        let root = root();
        let privacy = choice(&root, true);
        let (writing, entered) = mpsc::channel();
        let (release, blocked) = mpsc::channel();
        let (done, persisted) = mpsc::channel();
        let recorder = Recorder::start_at(root.clone(), move || {
            writing.send(()).expect("writing");
            blocked.recv().expect("release write");
            done.send(()).expect("reached final consent check");
        })
        .expect("worker");
        recorder.consent(privacy);
        recorder.record(&Usage::PageViewed {
            page: "home".into(),
        });
        entered
            .recv_timeout(Duration::from_secs(5))
            .expect("paused");
        choice(&root, false);
        choice(&root, true);
        release.send(()).expect("release");
        persisted
            .recv_timeout(Duration::from_secs(5))
            .expect("worker resumed");
        // Drop reúne el writer: no se consulta la cola antes de su comprobación final.
        drop(recorder);
        assert!(!root.join("usage/00.json").exists());
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
