//! Proceso Rune y ventanas; los contratos de datos se comparten mediante domain/ipc.
use crate::scene::{FrameSet, Viewport};
use rune::{App, AppSpec, Cx, Display, El, Tx, Waker, WindowHandle, WindowOptions, WindowSpec};
use std::{
    collections::{BTreeMap, VecDeque},
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
const MAX_PENDING_FRAMES: usize = 256;

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
    queue: VecDeque<(u64, Arc<FrameSet>)>,
    published: u64,
    cursors: BTreeMap<u64, u64>,
    next_cursor: u64,
    windows: BTreeMap<String, WindowHandle>,
}
impl Pending {
    fn prune(&mut self) {
        let unread = self
            .cursors
            .values()
            .map(|cursor| self.published.wrapping_sub(*cursor))
            .max()
            .unwrap_or(0);
        while self
            .queue
            .front()
            .is_some_and(|(ordinal, _)| self.published.wrapping_sub(*ordinal) >= unread)
        {
            self.queue.pop_front();
        }
    }
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
                queue: VecDeque::new(),
                published: 0,
                cursors: BTreeMap::new(),
                next_cursor: 0,
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
    pub fn paint_counts(&self) -> crate::stats::Snapshot {
        self.counts.snapshot()
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
            state.published = state.published.wrapping_add(1);
            let ordinal = state.published;
            if !state.cursors.is_empty() {
                state.queue.push_back((ordinal, frames.clone()));
                if state.queue.len() > MAX_PENDING_FRAMES {
                    state.queue.pop_front();
                    self.counts.dropped_frame_set();
                }
            }
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
    cursor: u64,
    #[cfg(test)]
    deliveries: Vec<u64>,
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
        let (access, frames, cursor) = {
            let mut pending = shared
                .pending
                .lock()
                .unwrap_or_else(PoisonError::into_inner);
            let cursor = pending.next_cursor;
            pending.next_cursor = pending.next_cursor.wrapping_add(1);
            let published = pending.published;
            pending.cursors.insert(cursor, published);
            (pending.access.clone(), pending.frames.clone(), cursor)
        };
        Self {
            meter: crate::stats::Meter::new(shared.counts.clone()),
            painters: crate::renderer::Painters::default(),
            shared,
            seen: 0,
            cursor,
            #[cfg(test)]
            deliveries: Vec::new(),
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
        {
            let mut pending = self
                .shared
                .pending
                .lock()
                .unwrap_or_else(PoisonError::into_inner);
            pending.cursors.remove(&self.cursor);
            pending.prune();
        }
        if let Some(key) = self.window_key.take() {
            eprintln!("overlays-rune: ventana {key} {:?}", self.meter.snapshot());
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
    let (changed, backlog) = {
        let mut pending = state
            .shared
            .pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if pending.close.is_some() {
            tx.quit();
            return false;
        }
        if pending.revision == state.seen {
            (false, Vec::new())
        } else {
            let previous = pending
                .cursors
                .get(&state.cursor)
                .copied()
                .unwrap_or(pending.published);
            let unread = pending.published.wrapping_sub(previous);
            let count = usize::try_from(unread)
                .unwrap_or(MAX_PENDING_FRAMES)
                .min(pending.queue.len());
            // The last FrameSet already follows the original path below. A queue of one
            // allocates no backlog and still calls sync exactly once.
            let backlog = pending
                .queue
                .iter()
                .skip(pending.queue.len() - count)
                .take(count.saturating_sub(1))
                .map(|(_, frames)| frames.clone())
                .collect::<Vec<_>>();
            let published = pending.published;
            pending.cursors.insert(state.cursor, published);
            pending.prune();
            state.seen = pending.revision;
            state.access = pending.access.clone();
            state.frames = pending.frames.clone();
            (true, backlog)
        }
    };
    // Own finite curves update Live values. No implicit spring/presence on data.
    tx.instant();
    let mut build = false;
    if changed {
        for frames in backlog
            .iter()
            .map(|frames| Some(frames.as_ref()))
            .chain(std::iter::once(state.frames.as_deref()))
        {
            build |=
                state
                    .painters
                    .sync(frames, &state.access, state.viewport, clock, &state.meter);
            #[cfg(test)]
            if let Some(frames) = frames {
                // CPU probe of deliveries to the registry; no product counter or allocation.
                state.deliveries.extend(
                    frames
                        .visible_instances(&state.access)
                        .filter_map(|i| frames.photos.get(&i.id))
                        .map(|photo| photo.snapshot.sequence),
                );
            }
        }
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
pub fn view(state: &State, _: &mut Cx<State>) -> El {
    state.painters.view()
}

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
        families: ("Inter", "Inter"),
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
    let meter = crate::stats::Meter::new(shared.counts.clone());
    let initial_meter = meter.clone();
    let monitor = display.clone();
    let state_key = key.clone();
    WindowSpec::from_app(
        key.clone(),
        App::new(spec)
            .init({
                let shared = shared.clone();
                move || {
                    let mut state = State::on_display(shared, &monitor);
                    state.meter = initial_meter;
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
                    .collect::<Vec<_>>()
            }
        },
    );
    shared.close(CloseReason::Window);
    eprintln!("overlays-rune: proceso {:?}", shared.counts.snapshot());
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

    fn queued_scene() -> crate::scene::Scene {
        let mut layout = design();
        layout.performance.widgets.insert("r".into(), 0);
        crate::scene::Scene::new(
            layout,
            Access::LocalPreview,
            true,
            vantare_domain::motion_policy::MotionPolicy(true),
        )
    }

    fn publish_sequence(
        bus: &Shared,
        scene: &mut crate::scene::Scene,
        sequence: u64,
        at: std::time::Instant,
    ) {
        let mut photo = crate::testdata::snapshot();
        photo.sequence = sequence;
        assert!(scene.ingest(vantare_ipc::Photo::full(Arc::new(photo)), at));
        bus.publish_frames(Arc::new(scene.frames.clone()));
    }

    #[test]
    fn every_window_receives_the_batch_in_order_and_presents_once() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let mut first = live_runtime(bus.clone());
        let mut second = live_runtime(bus.clone());
        let builds = [first.stats.commits, second.stats.commits];
        let mut scene = queued_scene();
        let at = std::time::Instant::now();
        for sequence in 1..=3 {
            publish_sequence(&bus, &mut scene, sequence, at);
        }
        assert!(rendered_frame(&mut first, 0.0));
        assert_eq!(first.state.deliveries, [1, 2, 3]);
        assert_eq!(first.stats.commits, builds[0] + 1);
        assert_eq!(bus.paint_counts().frames, 1);
        assert_eq!(bus.pending.lock().unwrap().queue.len(), 3);
        assert!(rendered_frame(&mut second, 0.0));
        assert_eq!(second.state.deliveries, [1, 2, 3]);
        assert_eq!(second.stats.commits, builds[1] + 1);
        assert_eq!(bus.paint_counts().frames, 2);
        assert!(bus.pending.lock().unwrap().queue.is_empty());
        assert!(!rendered_frame(&mut first, 0.016));
        assert_eq!(bus.paint_counts().frames, 2);
        assert_eq!(first.state.deliveries, [1, 2, 3]);
    }

    #[test]
    fn the_limit_counts_each_discard_once_for_two_pending_windows() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let mut first = live_runtime(bus.clone());
        let mut second = live_runtime(bus.clone());
        let mut scene = queued_scene();
        let at = std::time::Instant::now();
        for sequence in 1..=257 {
            publish_sequence(&bus, &mut scene, sequence, at);
        }
        assert_eq!(bus.pending.lock().unwrap().queue.len(), MAX_PENDING_FRAMES);
        assert_eq!(bus.paint_counts().dropped_frame_sets, 1);
        let expected: Vec<_> = (2..=257).collect();
        first.update_if(|state, tx| poll(state, 0.0, tx));
        assert_eq!(first.state.deliveries, expected);
        assert_eq!(bus.pending.lock().unwrap().queue.len(), MAX_PENDING_FRAMES);
        second.update_if(|state, tx| poll(state, 0.0, tx));
        assert_eq!(second.state.deliveries, expected);
        assert!(bus.pending.lock().unwrap().queue.is_empty());
        assert_eq!(bus.paint_counts().dropped_frame_sets, 1);
        assert_eq!(bus.paint_counts().frames, 0);
    }

    #[test]
    fn rights_revisions_do_not_count_as_photo_publications() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let mut rt = live_runtime(bus.clone());
        let mut scene = queued_scene();
        let at = std::time::Instant::now();
        publish_sequence(&bus, &mut scene, 1, at);
        bus.publish_access(Access::at(&Policy::default(), 0));
        bus.publish_access(Access::LocalPreview);
        publish_sequence(&bus, &mut scene, 2, at);
        publish_sequence(&bus, &mut scene, 3, at);
        rt.update_if(|state, tx| poll(state, 0.0, tx));
        assert_eq!(rt.state.deliveries, [1, 2, 3]);
        assert_eq!(bus.pending.lock().unwrap().published, 3);
        assert!(bus.pending.lock().unwrap().queue.is_empty());
        assert_eq!(bus.paint_counts().dropped_frame_sets, 0);
    }

    #[test]
    fn closing_or_retiring_a_window_with_pending_photos_leaves_no_cursor_or_loss() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for retiring in [false, true] {
            let bus = Shared::new(true);
            let mut rt = live_runtime(bus.clone());
            let mut scene = queued_scene();
            let at = std::time::Instant::now();
            for sequence in 1..=3 {
                publish_sequence(&bus, &mut scene, sequence, at);
            }
            assert_eq!(bus.pending.lock().unwrap().queue.len(), 3);
            rt.state.retiring.store(retiring, Ordering::Release);
            rt.update(close);
            drop(rt);
            assert!(bus.pending.lock().unwrap().cursors.is_empty());
            assert!(bus.pending.lock().unwrap().queue.is_empty());
            assert_eq!(bus.paint_counts().dropped_frame_sets, 0);
        }
    }

    #[test]
    fn an_error_after_creating_the_state_also_unregisters_its_pending_cursor() {
        fn fail(bus: Arc<Shared>) -> Result<(), ()> {
            let _window = State::new(bus.clone());
            let mut scene = queued_scene();
            publish_sequence(&bus, &mut scene, 1, std::time::Instant::now());
            bus.close(CloseReason::NativeError);
            Err(())
        }
        let bus = Shared::new(true);
        assert!(fail(bus.clone()).is_err());
        assert_eq!(bus.close_reason(), Some(CloseReason::NativeError));
        assert!(bus.pending.lock().unwrap().cursors.is_empty());
        assert!(bus.pending.lock().unwrap().queue.is_empty());
        assert_eq!(bus.paint_counts().dropped_frame_sets, 0);
    }

    #[test]
    fn dropping_the_lagging_window_prunes_photos_already_consumed_by_the_other() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let mut first = live_runtime(bus.clone());
        let lagging = State::new(bus.clone());
        let mut scene = queued_scene();
        let at = std::time::Instant::now();
        publish_sequence(&bus, &mut scene, 1, at);
        publish_sequence(&bus, &mut scene, 2, at);
        first.update_if(|state, tx| poll(state, 0.0, tx));
        assert_eq!(first.state.deliveries, [1, 2]);
        assert_eq!(bus.pending.lock().unwrap().queue.len(), 2);
        drop(lagging);
        assert_eq!(bus.pending.lock().unwrap().cursors.len(), 1);
        assert!(bus.pending.lock().unwrap().queue.is_empty());
        assert_eq!(bus.paint_counts().dropped_frame_sets, 0);
    }

    #[test]
    fn one_accepted_photo_keeps_the_current_build_and_present_counts() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let mut rt = live_runtime(bus.clone());
        let initial_builds = rt.stats.commits;
        let mut scene = crate::scene::Scene::new(
            design(),
            Access::LocalPreview,
            true,
            vantare_domain::motion_policy::MotionPolicy(true),
        );
        let start = std::time::Instant::now();
        let mut photo = crate::testdata::snapshot();
        for step in 0..3 {
            photo.sequence = step + 1;
            if step == 1 {
                photo.state.cars[2].relative_s = vantare_domain::Quality::Reliable(1.25);
            }
            assert!(scene.ingest(
                vantare_ipc::Photo::full(Arc::new(photo.clone())),
                start + Duration::from_secs(step)
            ));
            bus.publish_frames(Arc::new(scene.frames.clone()));
            assert_eq!(
                rendered_frame(&mut rt, if step == 0 { 0.0 } else { 1.0 }),
                step < 2
            );
            assert_eq!(rt.stats.commits, initial_builds + 1);
            assert_eq!(bus.paint_counts().frames, if step == 0 { 1 } else { 2 });
            assert!(bus.pending.lock().unwrap().queue.is_empty());
        }
    }

    #[test]
    fn accepted_photo_delivery_measurement() {
        use crate::scene::Scene;
        use std::{collections::BTreeSet, time::Instant};
        use vantare_domain::{Snapshot, motion_policy::MotionPolicy, widget_settings::Kind};

        fn observed(rt: &mut Runtime<State>, at: Duration, delivered: &mut BTreeSet<u64>) {
            rt.update_if(|state, tx| poll(state, at.as_secs_f64(), tx));
            delivered.extend(rt.state.deliveries.drain(..));
        }
        fn measure(photos: &[Snapshot], hz: Option<u16>, interval: Duration) -> (usize, usize) {
            // Radar has the same non-table cadence as DeltaTrace; the latter is not migrated yet.
            let mut layout = vantare_ipc::layout::Layout::from_json(
                br#"{"version":2,"reducedMotion":true,"instances":[{"id":"r","x":0,"y":0,"settings":{"kind":"radar"}}]}"#,
            ).expect("layout");
            if let Some(hz) = hz {
                layout.performance.widgets.insert("r".into(), hz);
            }
            assert_eq!(
                layout.performance.hz("r", Kind::Radar),
                layout.performance.hz("r", Kind::DeltaTrace)
            );
            let bus = Shared::new(true);
            let mut rt = live_runtime(bus.clone());
            let mut scene = Scene::new(layout, Access::LocalPreview, true, MotionPolicy(true));
            let start = Instant::now();
            let origin = photos[0].origin.received_at;
            let mut next_poll = Duration::ZERO;
            let mut accepted = BTreeSet::new();
            let mut delivered = BTreeSet::new();
            for photo in photos {
                let at = photo.origin.received_at - origin;
                while next_poll < at {
                    observed(&mut rt, next_poll, &mut delivered);
                    next_poll += interval;
                }
                if scene.ingest(
                    vantare_ipc::Photo::full(Arc::new(photo.clone())),
                    start + at,
                ) {
                    let stored = &scene.frames.photos["r"];
                    assert_eq!(stored.snapshot.sequence, photo.sequence);
                    accepted.insert(photo.sequence);
                    // Same publication as DataFeed, after the real Scene cadence has accepted it.
                    bus.publish_frames(Arc::new(scene.frames.clone()));
                }
            }
            observed(&mut rt, next_poll, &mut delivered);
            assert!(delivered.is_subset(&accepted));
            assert!(bus.pending.lock().unwrap().queue.is_empty());
            assert_eq!(bus.paint_counts().dropped_frame_sets, 0);
            (accepted.len(), delivered.len())
        }

        let _fonts = rune::text::with_families("Inter", "Inter");
        let fixture = vantare_ipc::snapshots_from_json(include_str!(
            "../../ui/fixtures/delta-trace-design-system.sequence.json"
        ))
        .expect("canonical delta trace sequence");
        // The local source sleeps 1000/30 = 33 ms. Preserve its normal arrival period.
        let local: Vec<_> = (0..=300)
            .map(|tick| {
                let mut photo = vantare_ipc::source::realistic(tick);
                photo.sequence = tick + 1;
                photo.origin.received_at = Duration::from_millis(tick * 33);
                photo
            })
            .collect();
        // Same integer period as runtime::adapter::lmu::live::READ_INTERVAL.
        let lmu: Vec<_> = (0..=600)
            .map(|tick| {
                let mut photo = vantare_ipc::source::realistic(tick);
                photo.sequence = tick + 1;
                photo.origin.received_at = Duration::from_nanos(tick * (1_000_000_000 / 60));
                photo
            })
            .collect();
        assert_eq!(fixture.len(), 197);
        assert_eq!(local.len(), 301);
        for (name, photos) in [
            ("fixture20Hz", &fixture),
            ("local30Hz", &local),
            ("lmu60Hz", &lmu),
        ] {
            for hz in [None, Some(0), Some(60)] {
                let admitted = if name == "lmu60Hz" && hz != Some(0) {
                    301
                } else {
                    photos.len()
                };
                for millis in [16, 100] {
                    let (accepted, delivered) = measure(photos, hz, Duration::from_millis(millis));
                    println!(
                        "delivery {name} hz={hz:?} poll={millis}ms accepted={accepted} delivered={delivered} lost={}",
                        accepted - delivered
                    );
                    assert_eq!(accepted, admitted);
                    assert_eq!(delivered, admitted);
                }
            }
        }
    }

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
    #[cfg(windows)]
    #[test]
    fn monitor_changes_reposition_retained_widgets_and_primary_only_is_quiet() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let bus = Shared::new(true);
        let mut layout = design();
        layout.instances[0].x = -200.0;
        let mut scene = crate::scene::Scene::new(
            layout,
            Access::LocalPreview,
            true,
            vantare_domain::motion_policy::MotionPolicy(false),
        );
        scene.ingest(
            vantare_ipc::Photo::full(Arc::new(crate::testdata::snapshot())),
            std::time::Instant::now(),
        );
        let frames = Arc::new(scene.frames.clone());
        bus.publish_frames(frames.clone());
        let mut display = Display {
            id: None,
            name: None,
            position: (-2560, 0),
            size: (2560, 1440),
            scale: 1.25,
            primary: false,
        };
        let state = State::on_display(bus, &display);
        let mut runtime = Runtime::with_text(
            state,
            view,
            (2048.0, 1152.0),
            Env::new(true, 1.25),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        rendered_frame(&mut runtime, 0.0);
        let before = runtime.state.meter.snapshot();
        display.position = (0, 0);
        display.scale = 1.5;
        assert!(runtime.state.set_monitor(display.clone()));
        assert!(rendered_frame(&mut runtime, 0.1));
        let placed = runtime
            .elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some("widget-r"))
            .expect("retained widget");
        assert_eq!(placed.target[0], -200.0);
        assert!(Arc::ptr_eq(
            runtime.state.frames.as_ref().expect("retained photos"),
            &frames
        ));
        assert_eq!(runtime.state.meter.snapshot().design, before.design + 1);
        display.primary = true;
        assert!(!runtime.state.set_monitor(display));
        assert!(!rendered_frame(&mut runtime, 0.1));
    }
}
