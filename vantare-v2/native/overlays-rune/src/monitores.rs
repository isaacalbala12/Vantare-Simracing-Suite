//! Topología y vida de las superficies. No conoce diseño, fotos ni cadencias.
use rune::Waker;
use std::{
    collections::BTreeMap,
    io,
    sync::{Arc, Condvar, Mutex, PoisonError},
    thread::JoinHandle,
    time::Duration,
};

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Monitor {
    pub id: isize,
    pub position: (i32, i32),
    pub size: (u32, u32),
    pub scale: f64,
    pub primary: bool,
}
impl Monitor {
    fn valid(&self) -> bool {
        self.id != 0
            && self.size.0 > 0
            && self.size.1 > 0
            && self.scale.is_finite()
            && self.scale > 0.0
    }
    #[cfg(windows)]
    fn display(&self) -> rune::Display {
        rune::Display {
            id: None,
            name: None,
            position: self.position,
            size: self.size,
            scale: self.scale,
            primary: self.primary,
        }
    }
}

#[derive(Default)]
struct Topology {
    monitors: BTreeMap<isize, Monitor>,
    stopped: bool,
}
#[derive(Default, Debug)]
struct Changes {
    added: Vec<Monitor>,
    changed: Vec<Monitor>,
    removed: Vec<isize>,
}
impl Topology {
    fn reconcile(&mut self, snapshot: Vec<Monitor>, stop: bool) -> io::Result<Changes> {
        if stop {
            self.stopped = true;
        }
        let mut next = BTreeMap::new();
        if !self.stopped {
            for monitor in snapshot {
                if !monitor.valid() || next.insert(monitor.id, monitor).is_some() {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "topología inválida o identidad de monitor repetida",
                    ));
                }
            }
        }
        let mut changes = Changes::default();
        for (&id, monitor) in &next {
            match self.monitors.get(&id) {
                None => changes.added.push(monitor.clone()),
                Some(previous) if previous != monitor => changes.changed.push(monitor.clone()),
                _ => {}
            }
        }
        changes.removed = self
            .monitors
            .keys()
            .filter(|id| !next.contains_key(id))
            .copied()
            .collect();
        self.monitors = next;
        Ok(changes)
    }
}

struct Pending {
    version: u64,
    monitors: Vec<Monitor>,
    wake: Option<Waker>,
    stopped: bool,
}
struct Updates {
    pending: Mutex<Pending>,
    stop: Condvar,
}
impl Updates {
    fn new(mut monitors: Vec<Monitor>) -> Arc<Self> {
        monitors.sort_by_key(|m| m.id);
        Arc::new(Self {
            pending: Mutex::new(Pending {
                version: 1,
                monitors,
                wake: None,
                stopped: false,
            }),
            stop: Condvar::new(),
        })
    }
    fn publish(&self, mut monitors: Vec<Monitor>) {
        monitors.sort_by_key(|m| m.id);
        let wake = {
            let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            if pending.stopped || pending.monitors == monitors {
                return;
            }
            pending.monitors = monitors;
            pending.version = pending.version.wrapping_add(1);
            pending.wake.clone()
        };
        if let Some(wake) = wake {
            wake();
        }
    }
    fn install(&self, wake: Waker) {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .wake = Some(wake.clone());
        wake(); // No perder una topología recibida antes del setup.
    }
    fn snapshot(&self) -> (u64, Vec<Monitor>) {
        let pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        (pending.version, pending.monitors.clone())
    }
    fn wait_stop(&self, interval: Duration) -> bool {
        let pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        self.stop
            .wait_timeout_while(pending, interval, |p| !p.stopped)
            .unwrap_or_else(PoisonError::into_inner)
            .0
            .stopped
    }
    fn stop(&self) {
        let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        pending.stopped = true;
        pending.wake = None;
        self.stop.notify_all();
    }
}

struct Observer {
    updates: Arc<Updates>,
    worker: Option<JoinHandle<()>>,
}
impl Observer {
    fn start(
        initial: Vec<Monitor>,
        interval: Duration,
        mut read: impl FnMut() -> io::Result<Vec<Monitor>> + Send + 'static,
    ) -> io::Result<Self> {
        let updates = Updates::new(initial);
        let bus = updates.clone();
        let worker = std::thread::Builder::new()
            .name("rune-monitors".into())
            .spawn(move || {
                let mut failed = false;
                loop {
                    match read() {
                        Ok(monitors) => {
                            bus.publish(monitors);
                            failed = false;
                        }
                        Err(error) => {
                            // Una enumeración incompleta no equivale a desconectar todo.
                            if !failed {
                                eprintln!("overlays-rune: consultar monitores: {error}");
                            }
                            failed = true;
                        }
                    }
                    if bus.wait_stop(interval) {
                        break;
                    }
                }
            })?;
        Ok(Self {
            updates,
            worker: Some(worker),
        })
    }
}
impl Drop for Observer {
    fn drop(&mut self) {
        self.updates.stop();
        if let Some(worker) = self.worker.take()
            && worker.join().is_err()
        {
            eprintln!("overlays-rune: observador de monitores terminó con panic");
        }
    }
}

#[cfg(windows)]
mod controller {
    use super::*;
    use crate::host::{self, CloseReason, Shared};
    use rune::{App, AppSpec, Cx, El, Tx, WindowHandle, WindowSpec, el};
    use std::sync::atomic::{AtomicBool, Ordering};

    struct Surface {
        window: WindowHandle,
        app: rune::AppHandle<host::State>,
        retiring: Arc<AtomicBool>,
    }
    struct Controller {
        shared: Arc<Shared>,
        observer: Option<Observer>,
        topology: Topology,
        surfaces: BTreeMap<isize, Surface>,
        generation: u64,
        seen: u64,
        hidden: bool,
        wake: Option<Waker>,
        check_at: Option<f64>,
    }
    impl Drop for Controller {
        fn drop(&mut self) {
            if let Some(wake) = self.wake.take() {
                self.shared.remove_waker(&wake);
            }
            // Observer cancela su espera antes del join; no queda un lector huérfano.
        }
    }
    fn init() -> Controller {
        create(Shared::new(false), None, false)
    }
    fn create(shared: Arc<Shared>, observer: Option<Observer>, hidden: bool) -> Controller {
        Controller {
            shared,
            observer,
            topology: Topology::default(),
            surfaces: BTreeMap::new(),
            generation: 0,
            seen: 0,
            hidden,
            wake: None,
            check_at: None,
        }
    }
    fn view(_: &Controller, _: &mut Cx<Controller>) -> El {
        el()
    }
    fn setup(state: &mut Controller, wake: Waker) {
        state.wake = Some(wake.clone());
        state.shared.install_waker(wake.clone());
        if let Some(observer) = &state.observer {
            observer.updates.install(wake);
        }
    }
    fn poll(state: &mut Controller, now: f64, tx: &mut Tx) -> bool {
        if state.shared.close_reason().is_some() {
            state.topology.stopped = true;
            if let Some(observer) = &state.observer {
                observer.updates.stop();
            }
            tx.quit();
            return false;
        }
        if state.check_at.is_some_and(|due| now >= due) {
            state.check_at = None;
            for surface in state.surfaces.values() {
                if let Some(error) = surface.app.window_error() {
                    eprintln!("overlays-rune: crear ventana de monitor: {error}");
                    state.shared.close(CloseReason::NativeError);
                    tx.quit();
                    return false;
                }
            }
        }
        let Some(observer) = &state.observer else {
            tx.quit();
            return false;
        };
        let (version, monitors) = observer.updates.snapshot();
        if version == state.seen {
            return false;
        }
        state.seen = version;
        let changes = match state.topology.reconcile(monitors, false) {
            Ok(changes) => changes,
            Err(error) => {
                eprintln!("overlays-rune: {error}");
                state.shared.close(CloseReason::NativeError);
                tx.quit();
                return false;
            }
        };
        for id in changes.removed {
            if let Some(surface) = state.surfaces.remove(&id) {
                // Publicar antes de solicitar Close: ese cierre no es del usuario.
                surface.retiring.store(true, Ordering::Release);
                surface.window.close();
            }
        }
        for monitor in changes.changed {
            if let Some(surface) = state.surfaces.get(&monitor.id) {
                let display = monitor.display();
                surface
                    .app
                    .update_if(move |state, _| state.set_monitor(display));
                surface.window.place(
                    rune::DisplayTarget::Native(rune::NativeDisplayId::Windows(monitor.id)),
                    rune::OverlayPlacement::FullScreen,
                );
            }
        }
        for monitor in changes.added {
            if state.shared.close_reason().is_some() {
                tx.quit();
                break;
            }
            state.generation = state.generation.wrapping_add(1);
            let retiring = Arc::new(AtomicBool::new(false));
            let spec = host::window(
                &monitor.display(),
                format!("monitor-{:x}-{}", monitor.id, state.generation),
                state.shared.clone(),
                state.hidden,
                retiring.clone(),
            );
            let app = spec.app.handle();
            let window = rune::open_window(spec);
            state.surfaces.insert(
                monitor.id,
                Surface {
                    window,
                    app,
                    retiring,
                },
            );
            // Una única comprobación tras abrir; no es un reloj en reposo.
            state.check_at = Some(now + 1.0);
            tx.wake_at(now + 1.0);
        }
        false // El controlador no pinta; solo las ventanas cambiadas se recolocan.
    }
    pub(super) fn spec(
        displays: &[rune::Display],
        shared: Arc<Shared>,
        hidden: bool,
    ) -> rune::AnyWindowSpec {
        let initial = displays
            .iter()
            .filter_map(|d| match d.native_id() {
                Some(rune::NativeDisplayId::Windows(id)) => Some(Monitor {
                    id,
                    position: d.position,
                    size: d.size,
                    scale: d.scale,
                    primary: d.primary,
                }),
                _ => None,
            })
            .collect();
        let observer = Observer::start(
            initial,
            Duration::from_secs(1),
            crate::topologia_windows::read,
        )
        .map_err(|error| {
            shared.close(CloseReason::NativeError);
            eprintln!("overlays-rune: crear observador de monitores: {error}");
        })
        .ok();
        let state = create(shared, observer, hidden);
        let spec = AppSpec {
            setup: Some(setup),
            poll: Some(poll),
            ..AppSpec::new("Vantare · Control de monitores", (1.0, 1.0), init, view)
        };
        WindowSpec::from_app(
            "monitor-controller",
            App::new(spec)
                .args(Vec::<String>::new())
                .init(move || state)
                .windowless(),
        )
        .into()
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn eof_wins_over_a_concurrent_topology_without_opening_any_window() {
            let shared = Shared::new(false);
            let updates = Updates::new(Vec::new());
            let barrier = Arc::new(std::sync::Barrier::new(2));
            let publisher = {
                let barrier = barrier.clone();
                let updates = updates.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    updates.publish(vec![Monitor {
                        id: 3,
                        position: (0, 0),
                        size: (1920, 1080),
                        scale: 1.0,
                        primary: true,
                    }]);
                })
            };
            barrier.wait();
            shared.close(CloseReason::SupervisorEof);
            publisher.join().unwrap();
            let observer = Observer {
                updates,
                worker: None,
            };
            let mut rt = rune::Runtime::new(
                create(shared.clone(), Some(observer), false),
                view,
                (1.0, 1.0),
                rune::Env::new(true, 1.0),
            );
            rt.poll = Some(poll);
            rt.frame(0.0);
            assert_eq!(rt.shell_request, Some(rune::Shell::Quit));
            assert!(rt.state.surfaces.is_empty());
            assert!(rt.state.topology.stopped);
            assert!(
                rt.state
                    .observer
                    .as_ref()
                    .unwrap()
                    .updates
                    .pending
                    .lock()
                    .unwrap()
                    .stopped
            );
            assert_eq!(shared.close_reason(), Some(CloseReason::SupervisorEof));
        }
    }
}

#[cfg(windows)]
pub(crate) fn specs(
    displays: &[rune::Display],
    shared: Arc<crate::host::Shared>,
    hidden: bool,
) -> Vec<rune::AnyWindowSpec> {
    vec![controller::spec(displays, shared, hidden)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    };
    fn monitor(id: isize) -> Monitor {
        Monitor {
            id,
            position: (0, 0),
            size: (1920, 1080),
            scale: 1.0,
            primary: id == 1,
        }
    }
    #[test]
    fn additions_removals_reorder_bounds_dpi_and_empty_desktop_are_reconciled() {
        let mut topology = Topology::default();
        assert_eq!(
            topology
                .reconcile(vec![monitor(1), monitor(2)], false)
                .unwrap()
                .added
                .len(),
            2
        );
        let reorder = topology
            .reconcile(vec![monitor(2), monitor(1)], false)
            .unwrap();
        assert!(
            reorder.added.is_empty() && reorder.changed.is_empty() && reorder.removed.is_empty()
        );
        let mut changed = monitor(1);
        changed.position = (-2560, -120);
        changed.size = (2560, 1440);
        changed.scale = 1.5;
        let delta = topology
            .reconcile(vec![changed.clone(), monitor(3)], false)
            .unwrap();
        assert_eq!(delta.changed, [changed]);
        assert_eq!(delta.added, [monitor(3)]);
        assert_eq!(delta.removed, [2]);
        assert_eq!(
            topology.reconcile(Vec::new(), false).unwrap().removed,
            [1, 3]
        );
        assert_eq!(
            topology.reconcile(vec![monitor(2)], false).unwrap().added,
            [monitor(2)]
        );
    }
    #[test]
    fn invalid_snapshot_preserves_previous_topology_and_eof_permanently_stops_creation() {
        let mut topology = Topology::default();
        topology.reconcile(vec![monitor(1)], false).unwrap();
        assert!(
            topology
                .reconcile(vec![monitor(2), monitor(2)], false)
                .is_err()
        );
        let mut invalid = monitor(1);
        invalid.scale = f64::NAN;
        assert!(topology.reconcile(vec![invalid], false).is_err());
        assert_eq!(
            topology.reconcile(vec![monitor(3)], true).unwrap().removed,
            [1]
        );
        assert!(
            topology
                .reconcile(vec![monitor(3)], false)
                .unwrap()
                .added
                .is_empty()
        );
    }
    #[test]
    fn quiet_and_reordered_snapshots_do_not_wake_and_late_setup_is_not_lost() {
        let updates = Updates::new(vec![monitor(1), monitor(2)]);
        let calls = Arc::new(AtomicUsize::new(0));
        updates.publish(vec![monitor(2), monitor(1)]);
        let count = calls.clone();
        updates.install(Arc::new(move || {
            count.fetch_add(1, Ordering::SeqCst);
        }));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        for _ in 0..30 {
            updates.publish(vec![monitor(2), monitor(1)]);
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(updates.snapshot().1, vec![monitor(1), monitor(2)]);
        updates.publish(vec![monitor(1)]);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        updates.stop();
        updates.publish(vec![monitor(3)]);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
    #[test]
    fn cancellation_joins_worker_without_waiting_for_the_hour_long_interval() {
        struct Finished(Arc<AtomicBool>);
        impl Drop for Finished {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }
        let finished = Arc::new(AtomicBool::new(false));
        let guard = Finished(finished.clone());
        let (tx, rx) = mpsc::channel();
        let observer = Observer::start(Vec::new(), Duration::from_secs(3600), move || {
            let _keep = &guard;
            let _ = tx.send(());
            Ok(Vec::new())
        })
        .unwrap();
        rx.recv_timeout(Duration::from_secs(5))
            .expect("sincronización, no sleep");
        drop(observer);
        assert!(finished.load(Ordering::SeqCst));
    }
}
