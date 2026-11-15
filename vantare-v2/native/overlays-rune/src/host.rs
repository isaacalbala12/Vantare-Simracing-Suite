//! Marco de proceso. Sin tipos de UI duplicados: diseño/fotos/cadencias esperan PR 3.
use rune::{App, AppSpec, Cx, Display, El, Tx, Waker, WindowOptions, WindowSpec, el};
use std::{
    io,
    sync::{Arc, Condvar, Mutex, PoisonError},
    thread::JoinHandle,
    time::Duration,
};
use vantare_ipc::control::{AccessState, CatalogAccess, Feed, Policy};

pub(crate) const OBSERVE_INTERVAL: Duration = Duration::from_millis(250);

/// Misma decisión de ui::rights::allowed_at, sin refrescar por renovar el TTL.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Access {
    LocalPreview,
    Core {
        current: bool,
        state: AccessState,
        catalog: CatalogAccess,
    },
}
impl Access {
    pub fn at(policy: &Policy, now_ms: u64) -> Self {
        Self::Core {
            current: policy.current_at(now_ms),
            state: policy.state,
            catalog: policy.catalog,
        }
    }
    pub fn allows_widget(&self, name: &str) -> bool {
        match self {
            Self::LocalPreview => true,
            Self::Core {
                current,
                state,
                catalog,
            } => *current && state.permits_access() && catalog.allows_widget(name),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CloseReason {
    Window,
    SupervisorEof,
    SupervisorError,
    NativeError,
}

struct Pending {
    access: Access,
    revision: u64,
    close: Option<CloseReason>,
    wakers: Vec<Waker>,
}
pub struct Shared {
    pending: Mutex<Pending>,
    stop: Condvar,
}
impl Shared {
    pub fn new(local_preview: bool) -> Arc<Self> {
        Arc::new(Self {
            pending: Mutex::new(Pending {
                access: if local_preview {
                    Access::LocalPreview
                } else {
                    Access::at(&Policy::default(), 0)
                },
                revision: 1,
                close: None,
                wakers: Vec::new(),
            }),
            stop: Condvar::new(),
        })
    }
    pub fn close(&self, reason: CloseReason) {
        let wakes = {
            let mut state = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            if state.close.is_some() {
                return;
            }
            state.close = Some(reason);
            state.wakers.clone()
        };
        self.stop.notify_all();
        for wake in wakes {
            wake();
        }
    }
    pub fn close_reason(&self) -> Option<CloseReason> {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .close
    }
    pub(crate) fn wait_stop(&self, timeout: Duration) -> bool {
        let state = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        let (state, _) = self
            .stop
            .wait_timeout_while(state, timeout, |s| s.close.is_none())
            .unwrap_or_else(PoisonError::into_inner);
        state.close.is_some()
    }
    pub fn publish_access(&self, access: Access) {
        let wakes = {
            let mut state = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            if state.access == access || state.close.is_some() {
                return;
            }
            state.access = access;
            state.revision = state.revision.wrapping_add(1);
            state.wakers.clone()
        };
        for wake in wakes {
            wake();
        }
    }
    pub(crate) fn install_waker(&self, wake: Waker) {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .wakers
            .push(wake.clone());
        // Incluye EOF/derechos recibidos antes del setup, también con ventana oculta.
        wake();
    }
}

pub struct Rights {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}
impl Rights {
    pub fn start(feed: Feed, shared: Arc<Shared>) -> io::Result<Self> {
        let bus = shared.clone();
        let worker = std::thread::Builder::new()
            .name("rune-rights".into())
            .spawn(move || {
                loop {
                    let access = vantare_ipc::control::wall_ms().map_or_else(
                        |_| Access::at(&Policy::default(), 0),
                        |now| Access::at(&feed.policy(), now),
                    );
                    bus.publish_access(access);
                    if bus.wait_stop(OBSERVE_INTERVAL) {
                        break;
                    }
                }
                // Feed cancela su E/S y une sus propios lectores al destruirse.
            })?;
        Ok(Self {
            shared,
            worker: Some(worker),
        })
    }
}
impl Drop for Rights {
    fn drop(&mut self) {
        self.shared.close(CloseReason::Window);
        if let Some(worker) = self.worker.take()
            && worker.join().is_err()
        {
            eprintln!("overlays-rune: lector de derechos terminó con panic");
        }
    }
}

pub struct State {
    shared: Arc<Shared>,
    seen: u64,
    pub access: Access,
}
impl State {
    pub fn new(shared: Arc<Shared>) -> Self {
        let access = shared
            .pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .access
            .clone();
        Self {
            shared,
            seen: 0,
            access,
        }
    }
}
fn init() -> State {
    State::new(Shared::new(false))
}
fn setup(state: &mut State, wake: Waker) {
    state.shared.install_waker(wake);
}
pub fn poll(state: &mut State, _: f64, tx: &mut Tx) -> bool {
    let pending = state
        .shared
        .pending
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    if pending.close.is_some() {
        tx.quit();
        return false;
    }
    if pending.revision == state.seen {
        return false;
    }
    state.seen = pending.revision;
    state.access = pending.access.clone();
    true
}
fn close(state: &mut State, tx: &mut Tx) {
    state.shared.close(CloseReason::Window);
    tx.quit();
}
pub fn view(_: &State, _: &mut Cx<State>) -> El {
    // Contenedor transparente; los widgets de PR 6/7 usarán los tipos de PR 3.
    el().key("overlay-root").w_full().h_full()
}

/// Solo describe ventanas. No crea dispositivos: también se usa desde tests CPU.
pub fn windows(displays: &[Display], shared: Arc<Shared>, hidden: bool) -> Vec<WindowSpec<State>> {
    displays
        .iter()
        .enumerate()
        .filter(|(_, d)| d.size.0 > 0 && d.size.1 > 0 && d.scale.is_finite() && d.scale > 0.0)
        .map(|(index, display)| {
            let mut options = WindowOptions::overlay(display);
            options.visible = !hidden;
            options.resizable = false;
            let spec = AppSpec {
                setup: Some(setup),
                poll: Some(poll),
                ..AppSpec::new(
                    "Vantare · Overlays Rune",
                    (
                        display.size.0 as f32 / display.scale as f32,
                        display.size.1 as f32 / display.scale as f32,
                    ),
                    init,
                    view,
                )
            };
            let bus = shared.clone();
            WindowSpec::from_app(
                format!("monitor-{index}"),
                App::new(spec)
                    .init({
                        let shared = shared.clone();
                        move || State::new(shared)
                    })
                    .args(Vec::<String>::new())
                    .on_close(close)
                    .on_quit(close),
            )
            .options(options)
            .inactive()
            .on_created(move |window| {
                if let Err(error) = crate::native_window::configure(&window) {
                    eprintln!("overlays-rune: ventana no segura: {error}");
                    bus.close(CloseReason::NativeError);
                }
            })
        })
        .collect()
}

pub fn run(shared: Arc<Shared>, hidden: bool) -> Result<(), String> {
    let bus = shared.clone();
    let result = rune::try_run_windows_with_args(
        rune::RunOptions { accessory: true },
        Vec::<String>::new(),
        move |displays| windows(displays, bus, hidden),
    );
    shared.close(CloseReason::Window);
    result?;
    match shared.close_reason() {
        Some(CloseReason::SupervisorError | CloseReason::NativeError) => {
            Err("falló el canal del supervisor o la ventana nativa".into())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime, Shell};
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn runtime(bus: Arc<Shared>) -> Runtime<State> {
        let mut runtime = Runtime::new(State::new(bus), view, (1280.0, 720.0), Env::new(true, 1.0));
        runtime.poll = Some(poll);
        runtime
    }
    fn policy() -> Policy {
        Policy {
            version: vantare_ipc::control::VERSION,
            revision: 1,
            epoch: 1,
            checked_at_ms: 1000,
            state: AccessState::Active,
            catalog: CatalogAccess::Free,
            ..Policy::default()
        }
    }

    #[test]
    fn monitor_factory_preserves_origins_sizes_and_unique_keys_without_creating_windows() {
        let displays = vec![
            Display {
                id: None,
                name: Some("igual".into()),
                position: (-2560, -100),
                size: (2560, 1440),
                scale: 1.25,
                primary: false,
            },
            Display {
                id: None,
                name: Some("igual".into()),
                position: (0, 0),
                size: (3840, 2160),
                scale: 1.5,
                primary: true,
            },
        ];
        let specs = windows(&displays, Shared::new(false), false);
        assert_eq!(specs.len(), 2);
        assert_ne!(specs[0].key, specs[1].key);
        for (spec, display) in specs.iter().zip(&displays) {
            let opts = &spec.options;
            assert_eq!(opts.position, Some(display.position));
            assert_eq!(opts.physical_size, Some(display.size));
            assert!(
                opts.transparent && opts.borderless && opts.click_through && opts.always_on_top
            );
            assert!(opts.visible);
            assert!(!opts.resizable);
        }
        assert!(
            windows(&displays, Shared::new(false), true)
                .iter()
                .all(|s| !s.options.visible)
        );
        assert!(windows(&[], Shared::new(false), false).is_empty());
        let mut invalid = displays[0].clone();
        invalid.scale = f64::NAN;
        assert!(windows(&[invalid], Shared::new(false), false).is_empty());
    }

    #[test]
    fn rights_follow_expiry_catalog_revocation_and_core_restart_without_real_accounts() {
        let base = policy();
        let free = Access::at(&base, 1000);
        assert!(free.allows_widget("relative"));
        assert!(!free.allows_widget("radar"));
        assert!(!Access::at(&base, 3000).allows_widget("relative"));
        assert!(!Access::at(&base, 999).allows_widget("relative"));
        for state in [
            AccessState::Revoked,
            AccessState::Unavailable,
            AccessState::NoCredential,
            AccessState::Expired,
            AccessState::Unconfigured,
            AccessState::RecoveryRequired,
            AccessState::ClockBehind { until_ms: 9000 },
            AccessState::UpdateRequired,
        ] {
            assert!(
                !Access::at(
                    &Policy {
                        state,
                        ..base.clone()
                    },
                    1000
                )
                .allows_widget("relative")
            );
        }
        assert!(
            Access::at(
                &Policy {
                    catalog: CatalogAccess::Pro,
                    ..base.clone()
                },
                1000
            )
            .allows_widget("radar")
        );
        assert!(
            Access::at(
                &Policy {
                    state: AccessState::Grace,
                    ..base
                },
                1000
            )
            .allows_widget("relative")
        );
        assert!(!Access::at(&Policy::default(), 0).allows_widget("relative"));
        assert!(Access::LocalPreview.allows_widget("relative"));
    }

    #[test]
    fn late_setup_wakes_once_and_parent_eof_quits_every_retained_tree() {
        let bus = Shared::new(false);
        bus.close(CloseReason::SupervisorEof);
        let count = Arc::new(AtomicUsize::new(0));
        let seen = count.clone();
        let check_bus = Arc::downgrade(&bus);
        bus.install_waker(Arc::new(move || {
            assert!(
                check_bus
                    .upgrade()
                    .expect("host vivo")
                    .pending
                    .try_lock()
                    .is_ok(),
                "no invocar bajo el lock"
            );
            seen.fetch_add(1, Ordering::SeqCst);
        }));
        assert_eq!(count.load(Ordering::SeqCst), 1);
        for _ in 0..2 {
            let mut window = runtime(bus.clone());
            window.frame(0.0);
            assert_eq!(window.shell_request, Some(Shell::Quit));
        }
        bus.close(CloseReason::Window);
        assert_eq!(bus.close_reason(), Some(CloseReason::SupervisorEof));
    }

    #[test]
    fn quiet_host_and_renewed_observations_do_not_request_frames_or_wake_the_gui() {
        let bus = Shared::new(false);
        let wakes = Arc::new(AtomicUsize::new(0));
        for _ in 0..2 {
            let count = wakes.clone();
            bus.install_waker(Arc::new(move || {
                count.fetch_add(1, Ordering::SeqCst);
            }));
        }
        let mut runtime = runtime(bus.clone());
        runtime.frame(0.0);
        for _ in 0..5 {
            runtime.frame(0.1);
        }
        for _ in 0..300 {
            assert!(!runtime.frame(0.1), "30 segundos virtuales sin cambios");
        }
        wakes.store(0, Ordering::SeqCst);
        bus.publish_access(Access::at(&policy(), 1000));
        assert_eq!(wakes.load(Ordering::SeqCst), 2);
        runtime.frame(0.1);
        wakes.store(0, Ordering::SeqCst);
        let renewed = Policy {
            revision: 2,
            checked_at_ms: 1100,
            ..policy()
        };
        bus.publish_access(Access::at(&renewed, 1100));
        assert_eq!(wakes.load(Ordering::SeqCst), 0);
        assert!(!runtime.frame(0.1));
        bus.publish_access(Access::at(&renewed, 3100));
        assert_eq!(wakes.load(Ordering::SeqCst), 2);
        runtime.frame(0.1);
        assert!(!runtime.state.access.allows_widget("relative"));
    }
}
