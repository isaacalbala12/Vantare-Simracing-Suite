use super::{Devices, Owner};
use arc_swap::ArcSwap;
use chrono::{DateTime, Utc};
use std::{
    io,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use vantare_domain::{Snapshot, SourceKind, SourceState};
use vantare_ipc::{
    Peer,
    control::{self, Command, Policy, Request, Response},
    transport::{Event, IO_TIMEOUT, Listener, Pipe},
};

struct Observed {
    snapshot: Arc<Snapshot>,
    entered_at: Option<DateTime<Utc>>,
}
struct State {
    owner: Option<Owner>,
    policy: Policy,
    session: Option<u64>,
}
pub struct Host {
    latest: Arc<ArcSwap<Observed>>,
    stop: Arc<Event>,
    timer: Option<JoinHandle<()>>,
    server: Option<JoinHandle<()>>,
}
pub struct Options {
    pub root: PathBuf,
    pub keys: Option<String>,
    pub devices: Devices,
    pub epoch: u64,
    pub nonce: Option<String>,
}
impl Host {
    pub fn start(
        photo: &str,
        options: Options,
        accept: impl Fn(&Peer, bool) -> bool + Send + Sync + 'static,
    ) -> io::Result<Self> {
        let latest = Arc::new(ArcSwap::from_pointee(Observed {
            snapshot: Arc::new(Snapshot::default()),
            entered_at: None,
        }));
        let opened = Owner::open(
            &options.root,
            options.keys.as_deref(),
            options.devices,
            options.epoch,
            super::wall_now(),
        );
        let failure = opened.as_ref().err().map(ToString::to_string);
        let owner = opened.ok();
        // Fallo de disco/configuración nunca impide telemetría ni concede acceso.
        let state = Arc::new(Mutex::new(State {
            owner,
            policy: Policy {
                version: control::VERSION,
                epoch: options.epoch,
                error: failure,
                ..Policy::default()
            },
            session: None,
        }));
        let stop = Arc::new(Event::new()?);
        let mut listener =
            Listener::new(&control::pipe_name(photo), Arc::clone(&stop), IO_TIMEOUT)?;
        let first = listener.instance()?;
        let start = Instant::now();
        let timer = spawn_timer(
            Arc::clone(&state),
            Arc::clone(&latest),
            Arc::clone(&stop),
            start,
        )?;
        let server = {
            let state = Arc::clone(&state);
            let latest = Arc::clone(&latest);
            let stop = Arc::clone(&stop);
            thread::Builder::new()
                .name("rights-control".into())
                .spawn(move || {
                    let mut pending = Some(first);
                    let mut workers: Vec<JoinHandle<()>> = Vec::new();
                    while !stop.is_set() {
                        let Ok(mut pipe) = pending.take().map_or_else(|| listener.instance(), Ok)
                        else {
                            break;
                        };
                        if pipe.accept().is_err() {
                            continue;
                        }
                        workers.retain(|worker| !worker.is_finished());
                        if workers.len() >= 8 {
                            continue;
                        }
                        let Ok(peer) = pipe.client_peer() else {
                            continue;
                        };
                        let mutator = accept(&peer, true);
                        if !mutator && !accept(&peer, false) {
                            continue;
                        }
                        let state = Arc::clone(&state);
                        let latest = Arc::clone(&latest);
                        let nonce = options.nonce.clone();
                        if let Ok(worker) = thread::Builder::new()
                            .name("rights-request".into())
                            .spawn(move || {
                                let _served = serve(
                                    &mut pipe,
                                    &state,
                                    &latest,
                                    nonce.as_deref(),
                                    mutator,
                                    start,
                                );
                            })
                        {
                            workers.push(worker);
                        }
                    }
                    for worker in workers {
                        let _joined = worker.join();
                    }
                })
        };
        match server {
            Ok(server) => Ok(Self {
                latest,
                stop,
                timer: Some(timer),
                server: Some(server),
            }),
            Err(error) => {
                stop.set();
                let _joined = timer.join();
                Err(error)
            }
        }
    }
    pub fn publish(&self, snapshot: Arc<Snapshot>) {
        let previous = self.latest.load();
        let live = is_live(&snapshot);
        let same_session = previous.snapshot.state.session.id == snapshot.state.session.id;
        let entered_at = if live {
            if same_session {
                previous.entered_at.or_else(|| Some(super::wall_now()))
            } else {
                Some(super::wall_now())
            }
        } else if snapshot.state.source_state == SourceState::Stale && same_session {
            previous.entered_at
        } else {
            None
        };
        self.latest.store(Arc::new(Observed {
            snapshot,
            entered_at,
        }));
    }
}
fn is_live(snapshot: &Snapshot) -> bool {
    snapshot.origin.source.kind == SourceKind::Live
        && snapshot.state.source_state == SourceState::Live
}
fn advance(
    state: &mut State,
    seen: &Observed,
    tick: Duration,
    force: bool,
) -> vantare_services::Result<()> {
    let now = super::wall_now();
    let session = seen.entered_at.map(|_| seen.snapshot.state.session.id.0);
    let now_ms = u64::try_from(now.timestamp_millis()).unwrap_or(0);
    if !force
        && state.policy.revision > 0
        && now_ms >= state.policy.checked_at_ms
        && now_ms - state.policy.checked_at_ms < 1_000
        && state.policy.live == is_live(&seen.snapshot)
        && state.session == session
    {
        return Ok(());
    }
    state.session = session;
    if let Some(owner) = &mut state.owner {
        let result =
            owner.advance_observed(&seen.snapshot, seen.entered_at.unwrap_or(now), now, tick);
        state.policy = owner.policy();
        if let Err(error) = result {
            state.policy.overlays_advanced = false;
            state.policy.engineer = false;
            state.policy.error = Some(error.to_string());
            state.policy.checked_at_ms = now_ms;
            state.policy.live = is_live(&seen.snapshot);
            return Err(error);
        }
    } else {
        state.policy.revision = state.policy.revision.saturating_add(1);
        state.policy.checked_at_ms = u64::try_from(now.timestamp_millis()).unwrap_or(0);
        state.policy.live = is_live(&seen.snapshot);
    }
    Ok(())
}
fn serve(
    pipe: &mut Pipe,
    state: &Mutex<State>,
    latest: &ArcSwap<Observed>,
    nonce: Option<&str>,
    mutator: bool,
    start: Instant,
) -> io::Result<()> {
    let request: Request = control::read(pipe)?;
    if request.version != control::VERSION || request.sequence != 1 {
        return Err(io::ErrorKind::InvalidData.into());
    }
    if !matches!(request.command, Command::Read)
        && (!mutator || nonce.is_none_or(|n| n.is_empty() || n != request.nonce))
    {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let mut state = state
        .lock()
        .map_err(|_| io::Error::other("derechos no disponibles"))?;
    let tick = start.elapsed();
    let force = !matches!(request.command, Command::Read);
    let result = match request.command {
        Command::Read => Ok(()),
        Command::Install { credential } => state
            .owner
            .as_mut()
            .ok_or(vantare_services::Error::Unconfigured)
            .and_then(|owner| owner.install(credential, super::wall_now(), tick)),
        Command::Invalidate => state
            .owner
            .as_mut()
            .ok_or(vantare_services::Error::Unconfigured)
            .and_then(|owner| owner.invalidate(super::wall_now(), tick)),
    };
    let advanced = advance(&mut state, &latest.load(), tick, force);
    let result = if force { result.and(advanced) } else { result };
    control::write(
        pipe,
        &Response {
            version: control::VERSION,
            sequence: request.sequence,
            policy: state.policy.clone(),
            error: result.err().map(|e| e.to_string()),
        },
    )
}
impl Drop for Host {
    fn drop(&mut self) {
        self.stop.set();
        if let Some(thread) = self.timer.take() {
            let _joined = thread.join();
        }
        if let Some(thread) = self.server.take() {
            let _joined = thread.join();
        }
    }
}

fn spawn_timer(
    state: Arc<Mutex<State>>,
    latest: Arc<ArcSwap<Observed>>,
    stop: Arc<Event>,
    start: Instant,
) -> io::Result<JoinHandle<()>> {
    thread::Builder::new()
        .name("rights-owner".into())
        .spawn(move || {
            while !stop.is_set() {
                if let Ok(mut state) = state.lock() {
                    let _advanced = advance(&mut state, &latest.load(), start.elapsed(), false);
                }
                if stop.wait(Duration::from_millis(250)) {
                    break;
                }
            }
        })
}
