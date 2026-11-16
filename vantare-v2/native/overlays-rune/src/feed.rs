//! Un lector cancelable para documentos y fotos. Nunca inicializa Rune.
use crate::{
    host::{CloseReason, Shared},
    options::Source,
    scene::Scene,
};
use std::{
    path::PathBuf,
    sync::Arc,
    thread::JoinHandle,
    time::{Duration, Instant},
};
use vantare_domain::motion_policy::MotionPolicy;
use vantare_ipc::{
    Photo,
    layout::{Document, Presentation},
    source::DemandHandle,
};
const DOCUMENT_INTERVAL: Duration = Duration::from_millis(500);
const RECEIVE_INTERVAL: Duration = Duration::from_millis(50);

struct Watched {
    document: Document,
    presentation: Presentation,
    appearance_path: Option<PathBuf>,
    appearance: MotionPolicy,
}
impl Watched {
    fn poll(&mut self, scene: &mut Scene, now: Instant) -> bool {
        if let Err(error) = self.document.poll() {
            eprintln!("overlays-rune: diseño protegido: {error}");
        }
        if let Some(path) = &self.appearance_path {
            match vantare_ipc::motion_policy::load(path) {
                Ok(policy) => self.appearance = policy,
                Err(error) => eprintln!("overlays-rune: apariencia protegida: {error}"),
            }
        }
        let mut changed = scene.set_layout(self.document.layout().clone(), self.appearance, now);
        match self.presentation.poll() {
            Ok(Some(shown)) => changed |= scene.set_shown(shown, now),
            Ok(None) => {}
            Err(error) => eprintln!("overlays-rune: presentación protegida: {error}"),
        }
        changed
    }
}

pub struct DataFeed {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}
impl DataFeed {
    pub fn start(
        source: Source,
        path: PathBuf,
        appearance_path: Option<PathBuf>,
        hidden: bool,
        shared: Arc<Shared>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let document = Document::open(path.clone())?;
        let presentation = Presentation::watch(&path)?;
        let appearance = appearance_path
            .as_ref()
            .map_or(MotionPolicy(false), |path| {
                vantare_ipc::motion_policy::load(path).unwrap_or_else(|error| {
                    eprintln!("overlays-rune: apariencia protegida: {error}");
                    MotionPolicy(false)
                })
            });
        let mut scene = Scene::new(
            document.layout().clone(),
            shared.access(),
            !hidden,
            appearance,
        );
        scene.refresh(Instant::now());
        let watched = Watched {
            document,
            presentation,
            appearance_path,
            appearance,
        };
        let demand = DemandHandle::new(scene.required());
        // Publicar antes del setup también respeta inicio oculto y EOF temprano.
        shared.publish_frames(Arc::new(scene.frames.clone()));
        match source {
            Source::Local => {
                let receiver = vantare_ipc::source::local_feed();
                Self::launch(
                    shared,
                    scene,
                    watched,
                    demand,
                    move |timeout| match receiver.recv_timeout(timeout) {
                        Ok(snapshot) => Ok(Some(Photo::full(snapshot))),
                        Err(_) if receiver.is_disconnected() => Err(()),
                        Err(_) => Ok(None),
                    },
                )
            }
            Source::Pipe(name) => {
                let name = name.map_or_else(vantare_ipc::default_pipe_name, Ok)?;
                let receiver = vantare_ipc::source::layout_feed(&name, demand.clone())?;
                Self::launch(
                    shared,
                    scene,
                    watched,
                    demand,
                    move |timeout| match receiver.recv_timeout(timeout) {
                        Ok(photo) => Ok(Some(photo)),
                        Err(_) if receiver.is_disconnected() => Err(()),
                        Err(_) => Ok(None),
                    },
                )
            }
        }
    }
    fn launch(
        shared: Arc<Shared>,
        mut scene: Scene,
        mut watched: Watched,
        demand: DemandHandle,
        mut next: impl FnMut(Duration) -> Result<Option<Photo>, ()> + Send + 'static,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let bus = shared.clone();
        let worker = std::thread::Builder::new()
            .name("rune-data".into())
            .spawn(move || {
                let mut observed = Instant::now();
                let mut requested = scene.required();
                while bus.close_reason().is_none() {
                    let photo = match next(RECEIVE_INTERVAL) {
                        Ok(photo) => photo,
                        Err(()) => {
                            bus.close(CloseReason::SourceError);
                            break;
                        }
                    };
                    let now = Instant::now();
                    let mut changed = scene.set_access(bus.access(), now);
                    if now.saturating_duration_since(observed) >= DOCUMENT_INTERVAL {
                        observed = now;
                        changed |= watched.poll(&mut scene, now);
                    }
                    let required = scene.required();
                    if required != requested {
                        demand.set(required.clone());
                        requested = required;
                    }
                    if let Some(photo) = photo {
                        changed |= scene.ingest(photo, now);
                    }
                    if changed {
                        bus.publish_frames(Arc::new(scene.frames.clone()));
                    }
                }
                // El receptor se destruye aquí: el transporte IPC cancela su propia E/S.
            })?;
        Ok(Self {
            shared,
            worker: Some(worker),
        })
    }
}
impl Drop for DataFeed {
    fn drop(&mut self) {
        self.shared.close(CloseReason::Window);
        if let Some(worker) = self.worker.take()
            && worker.join().is_err()
        {
            eprintln!("overlays-rune: lector de datos terminó con panic");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };
    fn directory() -> PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "rune-watch-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir).expect("own directory");
        dir
    }
    fn set_stamp(path: &std::path::Path, seconds: u64) {
        fs::File::options()
            .write(true)
            .open(path)
            .expect("fixture file")
            .set_modified(std::time::SystemTime::UNIX_EPOCH + Duration::from_secs(seconds))
            .expect("explicit stamp");
    }
    #[test]
    fn watching_preserves_bytes_and_explicit_empty_layout_and_recovers_after_invalid_edits() {
        let dir = directory();
        let path = dir.join("layout.json");
        let bytes = br#"{ "version": 1, "instances": [] }"#;
        fs::write(&path, bytes).expect("fixture");
        set_stamp(&path, 1);
        Presentation::show(&path).expect("old request");
        let document = Document::open(path.clone()).expect("document");
        let mut watched = Watched {
            document,
            presentation: Presentation::watch(&path).expect("presentation"),
            appearance_path: None,
            appearance: MotionPolicy(false),
        };
        let now = Instant::now();
        let mut scene = Scene::new(
            watched.document.layout().clone(),
            crate::host::Access::LocalPreview,
            false,
            MotionPolicy(false),
        );
        assert!(!watched.poll(&mut scene, now));
        assert!(!scene.frames.shown, "do not replay an old show request");
        assert_eq!(fs::read(&path).expect("unchanged"), bytes);
        Presentation::show(&path).expect("new request");
        assert!(watched.poll(&mut scene, now));
        assert!(scene.frames.shown);
        fs::write(&path, b"{").expect("partial edit");
        set_stamp(&path, 2);
        assert!(!watched.poll(&mut scene, now));
        assert!(scene.frames.layout.instances.is_empty());
        let complete = br#"{"version":1,"instances":[{"id":"relative","x":10,"y":20,"settings":{"kind":"relative"}}]}"#;
        fs::write(&path, complete).expect("completed edit");
        set_stamp(&path, 2);
        // Documento reintenta tras error aunque el FS conserve la misma marca.
        assert!(watched.poll(&mut scene, now));
        assert_eq!(scene.frames.layout.instances.len(), 1);
        assert_eq!(fs::read(&path).expect("preserved"), complete);
        Presentation::hide(&path).expect("hide");
        assert!(watched.poll(&mut scene, now));
        assert!(!scene.frames.shown);
        fs::remove_dir_all(dir).expect("cleanup own fixture");
    }
    #[test]
    fn dropping_the_reader_joins_it_with_a_live_source_and_without_a_window() {
        let dir = directory();
        let path = dir.join("layout.json");
        let shared = Shared::new(true);
        let feed = DataFeed::start(Source::Local, path, None, true, shared.clone()).expect("feed");
        drop(feed);
        assert_eq!(shared.close_reason(), Some(CloseReason::Window));
        fs::remove_dir_all(dir).expect("cleanup own fixture");
    }
    #[test]
    fn invalid_appearance_at_start_uses_default_motion_without_aborting() {
        for bytes in [
            br#"{"reducedMotion":"invalid"}"#.to_vec(),
            br#"{"reducedMotion":true"#.to_vec(),
            format!(
                r#"{{"reducedMotion":true,"padding":"{}"}}"#,
                " ".repeat(16 * 1024)
            )
            .into_bytes(),
        ] {
            let dir = directory();
            let appearance = dir.join("appearance.json");
            fs::write(&appearance, bytes).expect("invalid appearance fixture");
            let bus = Shared::new(true);
            let feed = DataFeed::start(
                Source::Local,
                dir.join("layout.json"),
                Some(appearance),
                false,
                bus.clone(),
            )
            .expect("invalid appearance must not abort startup");
            let state = crate::host::State::new(bus.clone());
            let frames = state.frames.as_ref().expect("initial frames");
            assert!(!frames.reduced_motion);
            assert_eq!(bus.close_reason(), None);
            drop(feed);
            fs::remove_dir_all(dir).expect("cleanup own fixture");
        }
    }
    #[test]
    fn requested_pipe_photos_reach_the_retained_runtime_without_a_window() {
        let dir = directory();
        let path = dir.join("layout.json");
        fs::write(&path, br#"{"version":1,"instances":[{"id":"relative","x":10,"y":20,"settings":{"kind":"relative"}}]}"#).expect("layout");
        let name = format!("rune-data-test-{}", std::process::id());
        let mut publisher = vantare_ipc::Publisher::new(&name, |_| true).expect("test publisher");
        let bus = Shared::new(true);
        let (sent, wakes) = std::sync::mpsc::channel();
        bus.install_waker(Arc::new(move || {
            let _ = sent.send(());
        }));
        let feed = DataFeed::start(Source::Pipe(Some(name)), path, None, false, bus.clone())
            .expect("data feed");
        let deadline = Instant::now() + Duration::from_secs(3);
        while publisher.demand_source().mask() == 0 {
            assert!(Instant::now() < deadline, "requested handshake");
            // DemandSource no ofrece evento de cambio; sondeo del handshake a 5 ms en este test.
            std::thread::sleep(Duration::from_millis(5));
        }
        publisher
            .publish(Arc::new(vantare_ipc::source::fixed()))
            .expect("test photo");
        let mut runtime = rune::Runtime::new(
            crate::host::State::new(bus),
            crate::host::view,
            (1280.0, 720.0),
            rune::Env::new(true, 1.0),
        );
        runtime.poll = Some(crate::host::poll);
        loop {
            runtime.frame(0.0);
            if let Some(photo) = runtime
                .state
                .frames
                .as_ref()
                .and_then(|f| f.photos.get("relative"))
                .filter(|p| {
                    p.snapshot.state.source_state == vantare_domain::SourceState::Live
                        && !p.snapshot.state.cars.is_empty()
                })
            {
                assert_eq!(
                    photo.snapshot.state.source_state,
                    vantare_domain::SourceState::Live
                );
                assert!(photo.demand.contains(vantare_ipc::Signal::Cars));
                assert!(!photo.snapshot.state.cars.is_empty());
                break;
            }
            wakes
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .expect("explicit data wake");
        }
        drop(feed);
        drop(publisher);
        fs::remove_dir_all(dir).expect("cleanup own fixture");
    }
}
