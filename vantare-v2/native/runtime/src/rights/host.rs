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
        // Sin trust roots no se abre ni se lee el almacén de credenciales.
        let opened = open_owner(
            &options.root,
            options.keys.as_deref(),
            options.devices,
            options.epoch,
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
fn open_owner(
    root: &std::path::Path,
    keys: Option<&str>,
    devices: Devices,
    epoch: u64,
) -> vantare_services::Result<Owner> {
    let keys = keys.ok_or(vantare_services::Error::Unconfigured)?;
    Owner::open(root, Some(keys), devices, epoch, super::wall_now())
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
            state.policy.strategy = false;
            state.policy.analysis = false;
            state.policy.calendar = false;
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
    respond(request, state, latest, start, |response| {
        control::write(pipe, response)
    })
}

fn respond(
    request: Request,
    state: &Mutex<State>,
    latest: &ArcSwap<Observed>,
    start: Instant,
    write: impl FnOnce(&Response) -> io::Result<()>,
) -> io::Result<()> {
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
    let response = Response {
        version: control::VERSION,
        sequence: request.sequence,
        policy: state.policy.clone(),
        error: result.err().map(|e| e.to_string()),
    };
    drop(state);
    write(&response)
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

fn new_usage_session(
    snapshot: &Snapshot,
    previous: &mut Option<(u64, u64)>,
) -> Option<&'static str> {
    if !is_live(snapshot) {
        if snapshot.state.source_state != SourceState::Stale {
            *previous = None;
        }
        return None;
    }
    if !matches!(snapshot.origin.source.simulator, "lmu" | "acc") {
        return None;
    }
    let key = (snapshot.epoch, snapshot.state.session.id.0);
    if *previous == Some(key) {
        return None;
    }
    *previous = Some(key);
    Some(snapshot.origin.source.simulator)
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
            let mut usage_session = None;
            while !stop.is_set() {
                let observed = latest.load();
                if let Some(simulator) = new_usage_session(&observed.snapshot, &mut usage_session) {
                    // Este hilo ya posee I/O; nunca persistir en publish/adquisición.
                    vantare_services::diagnostics::record_usage(
                        &vantare_services::diagnostics::Usage::LiveSessionStarted {
                            simulator: simulator.into(),
                        },
                    );
                }
                if let Ok(mut state) = state.lock() {
                    let _advanced = advance(&mut state, &latest.load(), start.elapsed(), false);
                }
                if stop.wait(Duration::from_millis(250)) {
                    break;
                }
            }
        })
}

#[cfg(test)]
mod response_tests {
    use super::*;

    #[test]
    fn usage_session_is_once_per_live_session_without_replay_or_stale_events() {
        let mut snapshot = Snapshot::default();
        let mut previous = None;
        assert_eq!(new_usage_session(&snapshot, &mut previous), None);
        snapshot.origin.source.simulator = "lmu";
        snapshot.state.source_state = SourceState::Live;
        assert_eq!(new_usage_session(&snapshot, &mut previous), Some("lmu"));
        assert_eq!(new_usage_session(&snapshot, &mut previous), None);
        snapshot.state.source_state = SourceState::Stale;
        assert_eq!(new_usage_session(&snapshot, &mut previous), None);
        snapshot.state.source_state = SourceState::Live;
        assert_eq!(new_usage_session(&snapshot, &mut previous), None);
        snapshot.state.session.id.0 += 1;
        assert_eq!(new_usage_session(&snapshot, &mut previous), Some("lmu"));
        snapshot.origin.source.kind = SourceKind::Replay;
        assert_eq!(new_usage_session(&snapshot, &mut previous), None);
    }

    #[test]
    fn response_write_does_not_hold_the_policy_mutex() {
        let state = Mutex::new(State {
            owner: None,
            policy: Policy::default(),
            session: None,
        });
        let latest = ArcSwap::from_pointee(Observed {
            snapshot: Arc::new(Snapshot::default()),
            entered_at: None,
        });
        for command in [
            Command::Read,
            Command::Invalidate,
            Command::Install {
                credential: "test-only-invalid".into(),
            },
        ] {
            let read = matches!(command, Command::Read);
            respond(
                Request {
                    version: control::VERSION,
                    sequence: 1,
                    nonce: String::new(),
                    command,
                },
                &state,
                &latest,
                Instant::now(),
                |response| {
                    // Un escritor detenido permite renovar la política; sin sleeps ni reloj real.
                    let mut timer = state
                        .try_lock()
                        .expect("timer libre durante la escritura IPC");
                    assert_eq!(response.version, control::VERSION);
                    assert_eq!(response.sequence, 1);
                    assert_eq!(response.error.is_none(), read);
                    assert_eq!(response.policy.revision, timer.policy.revision);
                    timer.policy.revision += 1;
                    Ok(())
                },
            )
            .expect("respuesta");
        }
    }
}
