//! Proceso Rune y ventanas; los contratos de datos se comparten mediante domain/ipc.
use crate::scene::{FrameSet, Viewport};
use rune::{App, AppSpec, Cx, Display, El, Tx, Waker, WindowHandle, WindowOptions, WindowSpec};
use std::{
    collections::BTreeMap,
    io,
    sync::{
        Arc, Condvar, Mutex, PoisonError,
        atomic::{AtomicBool, Ordering},
    },
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
            Self::LocalPreview => crate::options::LOCAL_PREVIEW_ENABLED,
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
    SourceError,
}

struct Pending {
    access: Access,
    revision: u64,
    close: Option<CloseReason>,
    wakers: Vec<Waker>,
    frames: Option<Arc<FrameSet>>,
    windows: BTreeMap<String, WindowHandle>,
}
pub struct Shared {
    counts: Arc<crate::stats::Counts>,
    pending: Mutex<Pending>,
    stop: Condvar,
}
impl Shared {
    pub fn new(local_preview: bool) -> Arc<Self> {
        Arc::new(Self {
            counts: Arc::default(),
            pending: Mutex::new(Pending {
                access: if local_preview {
                    Access::LocalPreview
                } else {
                    Access::at(&Policy::default(), 0)
                },
                revision: 1,
                close: None,
                wakers: Vec::new(),
                frames: None,
                windows: BTreeMap::new(),
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
    pub fn paint_counts(&self) -> crate::stats::Snapshot {self.counts.snapshot()}
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
    pub(crate) fn access(&self) -> Access {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .access
            .clone()
    }
    pub(crate) fn publish_frames(&self, frames: Arc<FrameSet>) {
        let (wakes, windows, shown) = {
            let mut state = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            if state.close.is_some()
                || state
                    .frames
                    .as_ref()
                    .is_some_and(|old| Arc::ptr_eq(old, &frames))
            {
                return;
            }
            let changed_visibility = state
                .frames
                .as_ref()
                .is_none_or(|old| old.shown != frames.shown);
            let shown = frames.shown;
            state.frames = Some(frames);
            state.revision = state.revision.wrapping_add(1);
            (
                state.wakers.clone(),
                if changed_visibility {
                    state.windows.values().cloned().collect::<Vec<_>>()
                } else {
                    Vec::new()
                },
                shown,
            )
        };
        // Las solicitudes nativas y los wakes nunca ocurren bajo el mutex.
        for window in windows {
            window.set_visible(shown);
        }
        for wake in wakes {
            wake();
        }
    }
    fn install_window(&self, key: String, window: WindowHandle, fallback: bool) {
        let shown = {
            let mut state = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            let shown =
                state.close.is_none() && state.frames.as_ref().map_or(fallback, |f| f.shown);
            state.windows.insert(key, window.clone());
            shown
        };
        window.set_visible(shown);
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
    pub(crate) fn remove_waker(&self, wake: &Waker) {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .wakers
            .retain(|registered| !Arc::ptr_eq(registered, wake));
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
    painters: crate::renderer::Painters,
    pub meter: crate::stats::Meter,
    pub access: Access,
    pub monitor: Option<Display>,
    retiring: Arc<AtomicBool>,
    wake: Option<Waker>,
    window_key: Option<String>,
    pub frames: Option<Arc<FrameSet>>,
    pub viewport: Viewport,
}
impl State {
    pub fn new(shared: Arc<Shared>) -> Self {
        let (access, frames) = {
            let pending = shared
                .pending
                .lock()
                .unwrap_or_else(PoisonError::into_inner);
            (pending.access.clone(), pending.frames.clone())
        };
        Self {
            meter: crate::stats::Meter::new(shared.counts.clone()),
            painters: crate::renderer::Painters::default(),
            shared,
            seen: 0,
            access,
            monitor: None,
            retiring: Arc::new(AtomicBool::new(false)),
            wake: None,
            window_key: None,
            frames,
            viewport: Viewport {
                origin: (0.0, 0.0),
                size: vantare_domain::geometry::Size {
                    width: 1280.0,
                    height: 720.0,
                },
            },
        }
    }
    #[cfg(windows)]
    pub(crate) fn set_monitor(&mut self, display: Display) -> bool {
        if self.monitor.as_ref() == Some(&display) {
            return false;
        }
        let viewport = Viewport::of(&display);
        let changed = self.viewport != viewport;
        self.monitor = Some(display);
        if changed {
            self.viewport = viewport;
            self.seen = 0;
            self.meter.mark(crate::stats::Cause::Design);
        }
        changed
    }
    pub fn on_display(shared: Arc<Shared>, display: &Display) -> Self {
        let mut state = Self::new(shared);
        state.viewport = Viewport::of(display);
        state.monitor = Some(display.clone());
        state
    }
}
impl Drop for State {
    fn drop(&mut self) {
        if let Some(wake) = self.wake.take() {
            self.shared.remove_waker(&wake);
        }
        if let Some(key) = self.window_key.take() {
            eprintln!("overlays-rune: ventana {key} {:?}",self.meter.snapshot());
            self.shared
                .pending
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .windows
                .remove(&key);
        }
    }
}
fn init() -> State {
    State::new(Shared::new(false))
}
fn setup(state: &mut State, wake: Waker) {
    if let Some(previous) = state.wake.replace(wake.clone()) {
        state.shared.remove_waker(&previous);
    }
    state.shared.install_waker(wake);
}
pub fn poll(state: &mut State, clock: f64, tx: &mut Tx) -> bool {
    let changed = {
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
            false
        } else {
            state.seen = pending.revision;
            state.access = pending.access.clone();
            state.frames = pending.frames.clone();
            true
        }
    };
    // Own finite curves update Live values. No implicit spring/presence on data.
    tx.instant();
    let mut build = false;
    if changed {
        build = state.painters.sync(
            state.frames.as_deref(),
            &state.access,
            state.viewport,
            clock,
            &state.meter,
        );
    }
    build |= state.painters.animate(clock, tx, &state.meter);
    build
}
fn visibility(state: &mut State, visible: bool, _: &mut Tx) {
    if visible {
        state.meter.mark(crate::stats::Cause::Design);
    }
}
fn close(state: &mut State, tx: &mut Tx) {
    // WindowHandle::close ya está cerrando esta superficie. Devolver sin Quit
    // permite a Rune retirarla; otro Close aquí repetiría el callback.
    if state.retiring.load(Ordering::Acquire) {
        return;
    }
    state.shared.close(CloseReason::Window);
    tx.quit();
}
pub fn view(state: &State, _: &mut Cx<State>) -> El {state.painters.view()}

/// Solo describe ventanas. No crea dispositivos: también se usa desde tests CPU.
pub fn windows(displays: &[Display], shared: Arc<Shared>, hidden: bool) -> Vec<WindowSpec<State>> {
    displays
        .iter()
        .enumerate()
        .filter(|(_, d)| d.size.0 > 0 && d.size.1 > 0 && d.scale.is_finite() && d.scale > 0.0)
        .map(|(index, display)| {
            window(
                display,
                format!("monitor-{index}"),
                shared.clone(),
                hidden,
                Arc::new(AtomicBool::new(false)),
            )
        })
        .collect()
}

pub(crate) fn window(
    display: &Display,
    key: String,
    shared: Arc<Shared>,
    hidden: bool,
    retiring: Arc<AtomicBool>,
) -> WindowSpec<State> {
    let mut options = WindowOptions::overlay(display);
    options.visible = shared
        .pending
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .frames
        .as_ref()
        .map_or(!hidden, |f| f.shown);
    options.resizable = false;
    let spec = AppSpec {
        fonts: crate::vantare::FONTS,
        families: ("Inter","Inter"),
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
    let meter=crate::stats::Meter::new(shared.counts.clone());
    let initial_meter=meter.clone();
    let monitor = display.clone();
    let state_key = key.clone();
    WindowSpec::from_app(
        key.clone(),
        App::new(spec)
            .init({
                let shared = shared.clone();
                move || {
                    let mut state = State::on_display(shared, &monitor);
                    state.meter=initial_meter;
                    state.window_key = Some(state_key);
                    state.retiring = retiring;
                    state
                }
            })
            .args(Vec::<String>::new())
                    .on_visibility(visibility)
                    .on_frame_drawn(|runtime| runtime.state.meter.presented())
                    .on_frame_encoded({
                        // The callback has no state argument: share the same per-window meter.
                        let meter = meter.clone();
                        move |frame| {
                            if frame.outcome() == rune::FrameOutcome::Unchanged {
                                meter.unchanged();
                            }
                        }
                    })
            .on_close(close)
            .on_quit(close),
    )
    .options(options)
    .inactive()
    .on_created(move |window| {
        if let Err(error) = crate::native_window::configure(&window) {
            eprintln!("overlays-rune: ventana no segura: {error}");
            bus.close(CloseReason::NativeError);
        } else {
            bus.install_window(key, window, !hidden);
        }
    })
}

pub fn run(shared: Arc<Shared>, hidden: bool) -> Result<(), String> {
    let bus = shared.clone();
    let result = rune::try_run_windows_with_args(
        rune::RunOptions { accessory: true },
        Vec::<String>::new(),
        move |displays| {
            #[cfg(windows)]
            {
                crate::monitores::specs(displays, bus, hidden)
            }
            #[cfg(not(windows))]
            {
                windows(displays, bus, hidden)
                    .into_iter()
                    .map(rune::AnyWindowSpec::from)
                    .collect()
            }
        },
    );
    shared.close(CloseReason::Window);
    eprintln!("overlays-rune: proceso {:?}",shared.counts.snapshot());
    result?;
    match shared.close_reason() {
        Some(
            CloseReason::SupervisorError | CloseReason::NativeError | CloseReason::SourceError,
        ) => Err("falló el canal del supervisor, la fuente o la ventana nativa".into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime, Shell};
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn retiring_one_surface_does_not_quit_the_process_but_user_close_does() {
        let bus = Shared::new(false);
        let mut rt = runtime(bus.clone());
        rt.state.retiring.store(true, Ordering::Release);
        rt.update(close);
        assert_eq!(bus.close_reason(), None);
        assert_eq!(rt.shell_request.take(), None);
        rt.state.retiring.store(false, Ordering::Release);
        rt.update(close);
        assert_eq!(bus.close_reason(), Some(CloseReason::Window));
        assert_eq!(rt.shell_request.take(), Some(Shell::Quit));
    }

    #[test]
    fn retired_wakers_are_removed_and_eof_reaches_only_live_states() {
        let bus = Shared::new(false);
        let calls = Arc::new(AtomicUsize::new(0));
        for _ in 0..100 {
            let mut state = State::new(bus.clone());
            let calls = calls.clone();
            setup(
                &mut state,
                Arc::new(move || {
                    calls.fetch_add(1, Ordering::SeqCst);
                }),
            );
            assert_eq!(bus.pending.lock().unwrap().wakers.len(), 1);
        }
        assert_eq!(bus.pending.lock().unwrap().wakers.len(), 0);
        assert_eq!(calls.load(Ordering::SeqCst), 100);
        let mut live = State::new(bus.clone());
        let counter = calls.clone();
        setup(
            &mut live,
            Arc::new(move || {
                counter.fetch_add(1, Ordering::SeqCst);
            }),
        );
        bus.close(CloseReason::SupervisorEof);
        assert_eq!(calls.load(Ordering::SeqCst), 102);
        let mut rt = Runtime::new(live, view, (100.0, 100.0), Env::new(true, 1.0));
        rt.poll = Some(poll);
        rt.frame(0.0);
        assert_eq!(rt.shell_request.take(), Some(Shell::Quit));
        drop(rt);
        assert_eq!(bus.pending.lock().unwrap().wakers.len(), 0);
    }

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
        #[cfg(debug_assertions)]
        assert!(Access::LocalPreview.allows_widget("relative"));
        #[cfg(not(debug_assertions))]
        assert!(!Access::LocalPreview.allows_widget("relative"));
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
    #[cfg(windows)]
    #[test]
    fn monitor_geometry_refreshes_logical_viewport_without_losing_the_current_photo() {
        let mut display = Display {
            id: None,
            name: None,
            position: (-2560, 0),
            size: (2560, 1440),
            scale: 1.25,
            primary: false,
        };
        let bus = Shared::new(true);
        let mut state = State::on_display(bus, &display);
        let frames = Arc::new(FrameSet {
            layout: Arc::default(),
            photos: Default::default(),
            visible: Default::default(),
            shown: true,
            reduced_motion: false,
        });
        state.frames = Some(frames.clone());
        state.seen = 10;
        assert_eq!(state.viewport.origin, (-2048.0, 0.0));
        display.position = (0, 0);
        display.scale = 1.5;
        assert!(state.set_monitor(display.clone()));
        assert_eq!(state.viewport.origin, (0.0, 0.0));
        assert_eq!(state.seen, 0);
        assert!(Arc::ptr_eq(
            state.frames.as_ref().expect("photo state"),
            &frames
        ));
        state.seen = 10;
        display.primary = true;
        assert!(!state.set_monitor(display));
        assert_eq!(state.seen, 10);
    }
    fn paint_payload(i: &rune::render::Instance) -> [[u32; 4]; 8] {
        [
            i.rect.map(f32::to_bits),
            i.radii.map(f32::to_bits),
            i.fill.map(f32::to_bits),
            i.border.map(f32::to_bits),
            i.params.map(f32::to_bits),
            i.uv.map(f32::to_bits),
            i.clip.map(f32::to_bits),
            i.fade,
        ]
    }
    fn rendered_frame(runtime: &mut Runtime<State>, dt: f64) -> bool {
        // Runtime::frame returns "still animating", not "image changed". Compare every
        // field of the actual CPU painter stream; only then simulate on_frame_drawn.
        // No renderer, device, surface, native window or product binary is created.
        let before = runtime.instances.clone();
        runtime.frame(dt);
        let changed = before.len() != runtime.instances.len()
            || before
                .iter()
                .map(paint_payload)
                .ne(runtime.instances.iter().map(paint_payload));
        if changed {
            runtime.state.meter.presented();
        } else {
            runtime.state.meter.unchanged();
        }
        changed
    }
    fn live_runtime(bus: Arc<Shared>) -> Runtime<State> {
        let mut runtime = Runtime::with_text(
            State::new(bus),
            view,
            (1280.0, 720.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        runtime
    }
    fn design() -> vantare_ipc::layout::Layout {
        vantare_ipc::layout::Layout::from_json(br#"{"version":2,"reducedMotion":true,"instances":[{"id":"r","x":0,"y":0,"settings":{"kind":"relative"}}]}"#).expect("design")
    }
    #[test]
    fn unchanged_photos_and_hidden_fields_produce_no_image_for_thirty_seconds() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        use crate::scene::Scene;
        use vantare_domain::motion_policy::MotionPolicy;
        for reduced in [false, true] {
            let bus = Shared::new(true);
            let start = std::time::Instant::now();
            let mut layout = design();
            layout.reduced_motion = Some(reduced);
            let mut scene = Scene::new(layout, Access::LocalPreview, true, MotionPolicy(false));
            let snapshot = crate::testdata::snapshot();
            scene.ingest(vantare_ipc::Photo::full(Arc::new(snapshot.clone())), start);
            bus.publish_frames(Arc::new(scene.frames.clone()));
            let mut runtime = live_runtime(bus.clone());
            assert!(rendered_frame(&mut runtime, 0.0));
            let before = runtime.state.meter.snapshot();
            let commits = runtime.stats.commits;
            for step in 1..=300 {
                let mut incoming = snapshot.clone();
                incoming.sequence += step;
                incoming
                    .state
                    .player
                    .as_mut()
                    .expect("player")
                    .telemetry
                    .throttle = vantare_domain::Quality::Reliable(f64::from(step as u32) / 300.0);
                scene.ingest(
                    vantare_ipc::Photo::full(Arc::new(incoming)),
                    start + Duration::from_millis(step * 100),
                );
                bus.publish_frames(Arc::new(scene.frames.clone()));
                assert!(
                    !rendered_frame(&mut runtime, 0.1),
                    "sequence/hidden telemetry should not redraw"
                );
            }
            assert_eq!(runtime.state.meter.snapshot(), before);
            assert_eq!(runtime.stats.commits, commits, "no view rebuild either");
            assert!(
                runtime.wake_deadline().is_none(),
                "quiet renderer has no timer"
            );
        }
    }
    #[test]
    fn live_gap_updates_without_rebuilding_and_revocation_removes_stale_widgets() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        use crate::scene::Scene;
        let bus = Shared::new(true);
        let start = std::time::Instant::now();
        let mut scene = Scene::new(
            design(),
            Access::LocalPreview,
            true,
            vantare_domain::motion_policy::MotionPolicy(false),
        );
        let mut snapshot = crate::testdata::snapshot();
        scene.ingest(vantare_ipc::Photo::full(Arc::new(snapshot.clone())), start);
        bus.publish_frames(Arc::new(scene.frames.clone()));
        let mut runtime = live_runtime(bus.clone());
        rendered_frame(&mut runtime, 0.0);
        let commits = runtime.stats.commits;
        snapshot.state.cars[2].relative_s = vantare_domain::Quality::Reliable(1.25);
        scene.ingest(
            vantare_ipc::Photo::full(Arc::new(snapshot)),
            start + Duration::from_secs(1),
        );
        bus.publish_frames(Arc::new(scene.frames.clone()));
        assert!(rendered_frame(&mut runtime, 1.0));
        assert_eq!(
            runtime.stats.commits, commits,
            "fixed-width gap is a retained LiveText"
        );
        assert!(
            runtime
                .elements()
                .iter()
                .any(|e| e.text.as_deref().is_some_and(|s| s.contains("1.2")))
        );
        bus.publish_access(Access::at(&Policy::default(), 0));
        assert!(rendered_frame(&mut runtime, 0.1));
        assert!(runtime.find("widget-r").is_none());
        assert!(!rendered_frame(&mut runtime, 1.0));
    }
    #[test]
    fn ten_widgets_coalesce_into_one_image_at_five_fifteen_and_twenty_hz() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        use crate::scene::Scene;
        let start = std::time::Instant::now();
        for hz in [5, 15, 20] {
            let bus = Shared::new(true);
            let mut design = design();
            let prototype = design.instances[0].clone();
            for n in 1..10 {
                let mut i = prototype.clone();
                i.id = format!("r{n}");
                i.x = (n % 3) as f32 * 400.0;
                i.y = (n / 3) as f32 * 150.0;
                design.instances.push(i);
            }
            for i in &design.instances {
                design.performance.widgets.insert(i.id.clone(), hz);
            }
            let mut scene = Scene::new(
                design,
                Access::LocalPreview,
                true,
                vantare_domain::motion_policy::MotionPolicy(false),
            );
            let mut runtime = live_runtime(bus.clone());
            let source = crate::testdata::snapshot();
            let mut frames = 0;
            for ms in 0..1000 {
                let mut snapshot = source.clone();
                snapshot.sequence = ms;
                snapshot.state.cars[2].number = format!("{ms:04}");
                if scene.ingest(
                    vantare_ipc::Photo::full(Arc::new(snapshot)),
                    start + Duration::from_millis(ms),
                ) {
                    bus.publish_frames(Arc::new(scene.frames.clone()));
                }
                frames += u16::from(rendered_frame(&mut runtime, 0.001));
            }
            assert_eq!(frames, hz, "one image per window, despite ten widgets");
            assert_eq!(runtime.state.meter.snapshot().unattributed, 0);
        }
    }
    #[test]
    fn off_monitor_changes_do_not_redraw_and_spanning_widgets_keep_logical_origin() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let mut design = design();
        design.instances[0].x = -200.0;
        let mut frames = FrameSet {
            layout: Arc::new(design),
            photos: Default::default(),
            visible: std::collections::BTreeSet::from(["r".into()]),
            shown: true,
            reduced_motion: true,
        };
        let display = Display {
            id: None,
            name: None,
            position: (-2560, 0),
            size: (2560, 1440),
            scale: 1.25,
            primary: false,
        };
        let mut state = State::on_display(bus.clone(), &display);
        state.viewport.size.width = 2048.0;
        let mut runtime = Runtime::with_text(
            state,
            view,
            (2048.0, 1152.0),
            Env::new(true, 1.25),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        bus.publish_frames(Arc::new(frames.clone()));
        rendered_frame(&mut runtime, 0.0);
        let info = runtime
            .elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some("widget-r"))
            .expect("spanning widget");
        assert_eq!(info.target[0], 1848.0);
        Arc::make_mut(&mut frames.layout).instances[0].x = 0.0;
        bus.publish_frames(Arc::new(frames.clone()));
        rendered_frame(&mut runtime, 0.1);
        assert!(runtime.find("widget-r").is_none());
        frames.photos.insert(
            "r".into(),
            vantare_ipc::Photo::full(Arc::new(crate::testdata::snapshot())),
        );
        bus.publish_frames(Arc::new(frames));
        assert!(!rendered_frame(&mut runtime, 1.0));
    }
    #[test]
    fn driver_name_growth_reflows_its_box_instead_of_clipping_to_the_old_name() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let start = std::time::Instant::now();
        let mut scene = crate::scene::Scene::new(
            design(),
            Access::LocalPreview,
            true,
            vantare_domain::motion_policy::MotionPolicy(false),
        );
        let mut snapshot = crate::testdata::snapshot();
        snapshot.state.cars[2].driver.name = "A".into();
        scene.ingest(vantare_ipc::Photo::full(Arc::new(snapshot.clone())), start);
        bus.publish_frames(Arc::new(scene.frames.clone()));
        let mut runtime = live_runtime(bus.clone());
        rendered_frame(&mut runtime, 0.0);
        let width = |runtime: &Runtime<State>| {
            runtime
                .elements()
                .iter()
                .find(|e| e.key.as_deref() == Some("cell-3-driverName"))
                .expect("driver cell")
                .rect[2]
        };
        let before = width(&runtime);
        snapshot.state.cars[2].driver.name = "LONGER DRIVER".into();
        scene.ingest(
            vantare_ipc::Photo::full(Arc::new(snapshot)),
            start + Duration::from_secs(1),
        );
        bus.publish_frames(Arc::new(scene.frames.clone()));
        assert!(rendered_frame(&mut runtime, 1.0));
        assert!(width(&runtime) > before);
    }
    #[test]
    fn actual_retained_animation_stops_and_reduced_motion_draws_no_animation_frames() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for reduced in [false, true] {
            let bus = Shared::new(true);
            let start = std::time::Instant::now();
            let mut layout = design();
            layout.reduced_motion = Some(reduced);
            let mut scene = crate::scene::Scene::new(
                layout,
                Access::LocalPreview,
                true,
                vantare_domain::motion_policy::MotionPolicy(false),
            );
            let mut snapshot = crate::testdata::snapshot();
            scene.ingest(vantare_ipc::Photo::full(Arc::new(snapshot.clone())), start);
            bus.publish_frames(Arc::new(scene.frames.clone()));
            let mut runtime = live_runtime(bus.clone());
            rendered_frame(&mut runtime, 0.0);
            snapshot.state.cars[2].relative_s = vantare_domain::Quality::Reliable(-0.5);
            scene.ingest(
                vantare_ipc::Photo::full(Arc::new(snapshot)),
                start + Duration::from_secs(1),
            );
            bus.publish_frames(Arc::new(scene.frames.clone()));
            rendered_frame(&mut runtime, 1.0);
            for _ in 0..200 {
                rendered_frame(&mut runtime, 0.01);
            }
            let before = runtime.state.meter.snapshot();
            if reduced {
                assert_eq!(before.animation, 0);
            } else {
                assert!(before.animation > 0);
            }
            for _ in 0..300 {
                assert!(
                    !rendered_frame(&mut runtime, 0.1),
                    "motion must stop after the finite transition"
                );
            }
            assert_eq!(runtime.state.meter.snapshot(), before);
            assert!(
                runtime.wake_deadline().is_none(),
                "no timer after motion settles"
            );
        }
    }
}
