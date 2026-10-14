//! Productor de UI sin disco: cola acotada; services persiste fuera del callback.
use super::{
    Privacy, QUEUE_LIMIT, Usage, configured, data_root, enqueue_authorized, enqueue_once_authorized,
};
use crate::{Error, Result};
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::Duration,
};

struct Observation {
    event: Usage,
    generation: u64,
    once: bool,
}

#[derive(Default)]
struct Pending {
    privacy: Option<Privacy>,
    queue: VecDeque<Observation>,
}
impl Pending {
    fn generation(&self) -> Option<u64> {
        self.privacy
            .filter(|value| value.usage && value.usage_decided)
            .map(|value| value.generation)
    }
    fn consent(&mut self, privacy: Privacy) {
        // Una lectura suspendida antes del store no puede deshacer una revocación.
        if self
            .privacy
            .is_some_and(|current| current.generation > privacy.generation)
        {
            return;
        }
        self.privacy = Some(privacy);
        let generation = self.generation();
        self.queue
            .retain(|event| Some(event.generation) == generation);
    }
}

/// Un dueño por proceso de UI; cancelar despierta el worker y lo reúne al cerrar.
pub struct Recorder {
    pending: Arc<Mutex<Pending>>,
    wake: Arc<Condvar>,
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

    fn start_at(root: PathBuf, before_write: impl FnMut() + Send + 'static) -> Result<Self> {
        Self::start_with(root, |_| {}, before_write)
    }

    fn start_with(
        root: PathBuf,
        mut before_publish: impl FnMut(Privacy) + Send + 'static,
        mut before_write: impl FnMut() + Send + 'static,
    ) -> Result<Self> {
        let pending = Arc::new(Mutex::new(Pending::default()));
        let current = Arc::clone(&pending);
        let wake = Arc::new(Condvar::new());
        let waiting = Arc::clone(&wake);
        let stopped = Arc::new(AtomicBool::new(false));
        let cancel = Arc::clone(&stopped);
        let thread = std::thread::Builder::new()
            .name("usage-persist".into())
            .spawn(move || {
                while !cancel.load(Ordering::Acquire) {
                    let privacy = Privacy::load(&root);
                    if let Ok(value) = privacy {
                        before_publish(value);
                    }
                    let Ok(mut state) = current.lock() else { break };
                    if let Ok(value) = privacy {
                        state.consent(value);
                    } else {
                        if let Some(value) = &mut state.privacy {
                            value.usage = false;
                        }
                        state.queue.clear();
                    }
                    if state.queue.is_empty() {
                        // Refresca decisiones de otros procesos incluso sin observaciones.
                        let _wait = waiting.wait_timeout(state, Duration::from_millis(250));
                        continue;
                    }
                    drop(state);
                    // La observación aún está en la cola revocable durante esta pausa.
                    before_write();
                    let observation = current
                        .lock()
                        .ok()
                        .and_then(|mut state| state.queue.pop_front());
                    if cancel.load(Ordering::Acquire) {
                        break;
                    }
                    if let Some(observation) = observation {
                        let result = if observation.once {
                            enqueue_once_authorized(
                                &root,
                                &observation.event,
                                observation.generation,
                            )
                        } else {
                            enqueue_authorized(&root, &observation.event, observation.generation)
                        };
                        if let Err(error) = result {
                            eprintln!("uso local: {error}");
                        }
                    }
                }
            })
            .map_err(|_| Error::Storage)?;
        Ok(Self {
            pending,
            wake,
            stopped,
            thread: Some(thread),
        })
    }

    pub fn generation(&self) -> Option<u64> {
        self.pending.try_lock().ok()?.generation()
    }
    /// Publicación monotónica y descarte en memoria tras guardar una decisión.
    pub fn consent(&self, privacy: Privacy) {
        if let Ok(mut state) = self.pending.lock() {
            state.consent(privacy);
        }
        self.wake.notify_one();
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
        // UI nunca espera: ocupado/lleno/envenenado descartan, sin I/O bajo el mutex.
        if let Ok(mut state) = self.pending.try_lock()
            && !self.stopped.load(Ordering::Acquire)
            && state.generation() == Some(generation)
            && state.queue.len() < QUEUE_LIMIT
        {
            state.queue.push_back(Observation {
                event: event.clone(),
                generation,
                once,
            });
            self.wake.notify_one();
        }
    }
}
impl Drop for Recorder {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if let Ok(mut state) = self.pending.lock() {
            state.queue.clear();
        }
        self.wake.notify_one();
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
    use std::sync::mpsc;

    #[test]
    fn isa1609_a_loaded_permission_cannot_overwrite_completed_revocation() {
        let root = root();
        choice(&root, true);
        let (loaded, reached) = mpsc::channel();
        let (resume, paused) = mpsc::channel();
        let mut reads = 0;
        let recorder = Recorder::start_with(
            root.clone(),
            move |privacy| {
                reads += 1;
                if reads <= 2 {
                    loaded.send(privacy).expect("loaded");
                    paused.recv().expect("release publication");
                }
            },
            || {},
        )
        .expect("worker");
        let old = reached
            .recv_timeout(Duration::from_secs(5))
            .expect("load before store");
        assert!(old.usage);
        recorder.consent(choice(&root, false));
        resume.send(()).expect("publish stale read");
        reached
            .recv_timeout(Duration::from_secs(5))
            .expect("next read after store");
        let generation = recorder.generation();
        resume.send(()).expect("release before assertion");
        drop(recorder);
        assert_eq!(generation, None, "stale worker restored revoked permission");
        assert!(!root.join("usage/00.json").exists());
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn isa1609_b_revocation_empties_memory_and_rejects_close_in_old_generation() {
        let root = root();
        let privacy = choice(&root, true);
        let recorder = Recorder {
            pending: Arc::new(Mutex::new(Pending::default())),
            wake: Arc::new(Condvar::new()),
            stopped: Arc::new(AtomicBool::new(false)),
            thread: None,
        };
        recorder.consent(privacy);
        let event = Usage::PageUsage {
            page: "home".into(),
            duration_seconds: 1,
        };
        recorder.record(&event);
        recorder.consent(choice(&root, false));
        recorder.record_in_generation(&event, privacy.generation, false);
        let queued = recorder.pending.lock().expect("queue").queue.len();
        drop(recorder);
        assert_eq!(
            queued, 0,
            "revoked observations retained/admitted in memory"
        );
        assert!(!root.join("usage/00.json").exists());
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn isa1609_external_revocation_clears_memory_when_worker_refreshes() {
        let root = root();
        let privacy = choice(&root, true);
        let (loaded, reached) = mpsc::channel();
        let (resume, paused) = mpsc::channel();
        let mut reads = 0;
        let recorder = Recorder::start_with(
            root.clone(),
            move |_| {
                reads += 1;
                if reads <= 3 {
                    loaded.send(()).expect("read");
                    paused.recv().expect("resume");
                }
            },
            || {},
        )
        .expect("worker");
        reached
            .recv_timeout(Duration::from_secs(5))
            .expect("initial load");
        recorder.consent(privacy);
        for _ in 0..2 {
            recorder.record(&Usage::PageViewed {
                page: "home".into(),
            });
        }
        // Otro dueño cambia el disco; no llama Recorder::consent de esta UI.
        choice(&root, false);
        resume.send(()).expect("stale first read");
        reached
            .recv_timeout(Duration::from_secs(5))
            .expect("revoked read");
        resume.send(()).expect("publish revoked read");
        reached
            .recv_timeout(Duration::from_secs(5))
            .expect("after refresh");
        let generation = recorder.generation();
        recorder.record_in_generation(
            &Usage::PageViewed {
                page: "studio".into(),
            },
            privacy.generation,
            false,
        );
        let queued = recorder.pending.lock().expect("pending").queue.len();
        resume.send(()).expect("release before assertion");
        drop(recorder);
        assert_eq!(generation, None);
        assert_eq!(queued, 0);
        assert!(!root.join("usage/00.json").exists());
        std::fs::remove_dir_all(root).expect("cleanup");
    }

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
        let mut reads = 0;
        let recorder = Recorder::start_with(
            root.clone(),
            move |_| {
                reads += 1;
                if reads == 2 {
                    done.send(()).expect("after final consent check");
                }
            },
            move || {
                writing.send(()).expect("writing");
                blocked.recv().expect("release write");
            },
        )
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
            .expect("writer checked consent before next refresh");
        // La comprobación final ya ocurrió; Drop no puede hacer pasar el test cancelándola.
        drop(recorder);
        assert!(!root.join("usage/00.json").exists());
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
