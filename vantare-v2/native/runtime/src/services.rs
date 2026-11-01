//! Supervisor de servicios: propietario del hijo; el Hub solo usa IPC.
use std::{
    io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, TryLockError},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use vantare_ipc::{
    Peer,
    control::{self, CoreLink},
    transport::{Event, Listener, Pipe},
};
use vantare_services::{
    process::{Client, ConnectionError},
    protocol::{self, Command, Reply, Request, Response, SupervisorHello},
};
mod renewal;
use renewal::Renewal;

type Cancellation = Arc<Mutex<Option<Arc<Event>>>>;
/// Hasta cuándo hay un inicio de sesión o renovación en curso (#1464).
type SigningIn = Arc<Mutex<Option<Instant>>>;
/// Un OAuth abandonado no retiene los servicios en carrera para siempre.
const SIGN_IN_WINDOW: Duration = Duration::from_mins(10);
const PURCHASE_CONFIRMATION_WINDOW: Duration = Duration::from_mins(10);

/// Huella mínima en carrera, salvo que cerrar deje al usuario sin acceso:
/// sin licencia válida guardada o con un acceso a medias se sigue sirviendo.
fn closes_for_game(policy: &control::Policy, signing_in: bool) -> bool {
    policy.live && policy.state.permits_access() && !signing_in
}
fn signing_in(slot: &SigningIn) -> bool {
    slot.lock()
        .is_ok_and(|until| until.is_some_and(|until| Instant::now() < until))
}
fn set_signing_in(slot: &SigningIn, active: bool) {
    if let Ok(mut until) = slot.lock() {
        *until = active.then(|| Instant::now() + SIGN_IN_WINDOW);
    }
}
pub fn pipe_name(photo: &str) -> String {
    format!("{photo}-hub-services")
}
#[derive(Default)]
struct State {
    client: Option<Client>,
    renewal: Renewal,
    notice: Option<protocol::LicenseNotice>,
    connected: bool,
    core_retry_at: Option<Instant>,
    purchase_until: Option<Instant>,
}
impl State {
    fn renewal_origin(&self, now: Instant) -> renewal::Origin {
        if self.purchase_until.is_some_and(|until| now < until) {
            renewal::Origin::Purchase
        } else {
            renewal::Origin::Automatic
        }
    }
}
#[derive(Clone)]
pub struct Options {
    pub binary: PathBuf,
    pub hub: PathBuf,
    pub core: CoreLink,
    pub root: Option<PathBuf>,
}
pub struct Host {
    state: Arc<Mutex<State>>,
    stop: Arc<Event>,
    cancellation: Cancellation,
    server: Option<JoinHandle<()>>,
    timer: Option<JoinHandle<()>>,
}
impl Host {
    pub fn start(photo: &str, options: Options) -> io::Result<Self> {
        Self::start_with_peer(photo, options, Peer::is_image)
    }
    pub fn start_with_peer(
        photo: &str,
        options: Options,
        accept: impl Fn(&Peer, &Path) -> bool + Send + 'static,
    ) -> io::Result<Self> {
        let stop = Arc::new(Event::new()?);
        let cancellation = Arc::new(Mutex::new(None));
        let signing = Arc::new(Mutex::new(None));
        let state = Arc::new(Mutex::new(State::default()));
        let mut listener =
            Listener::new(&pipe_name(photo), Arc::clone(&stop), Duration::from_mins(5))?;
        let first = listener.instance()?;
        let timer = spawn_timer(
            Arc::clone(&state),
            Arc::clone(&stop),
            Arc::clone(&cancellation),
            Arc::clone(&signing),
            options.clone(),
        )?;
        let server = {
            let state = Arc::clone(&state);
            let stop = Arc::clone(&stop);
            let cancellation = Arc::clone(&cancellation);
            let signing = Arc::clone(&signing);
            thread::Builder::new()
                .name("services-supervisor".into())
                .spawn(move || {
                    let mut first = Some(first);
                    while !stop.is_set() {
                        let Ok(mut pipe) = first.take().map_or_else(|| listener.instance(), Ok)
                        else {
                            break;
                        };
                        if pipe.accept().is_err() {
                            continue;
                        }
                        if !pipe
                            .client_peer()
                            .is_ok_and(|peer| accept(&peer, &options.hub))
                        {
                            continue;
                        }
                        if let Err(error) =
                            serve(&mut pipe, &state, &stop, &cancellation, &signing, &options)
                        {
                            // No imprimir nonce, comandos ni datos del Hub.
                            eprintln!("vantare: canal de servicios cerrado: {:?}", error.kind());
                        }
                        set_signing_in(&signing, false);
                        if let Ok(mut state) = state.lock() {
                            state.connected = false;
                            finish(&mut state);
                        }
                        clear_cancellation(&cancellation);
                    }
                    if let Ok(mut state) = state.lock() {
                        finish(&mut state);
                    }
                })
        };
        match server {
            Ok(server) => Ok(Self {
                state,
                stop,
                cancellation,
                server: Some(server),
                timer: Some(timer),
            }),
            Err(error) => {
                stop.set();
                let _joined = timer.join();
                Err(error)
            }
        }
    }
}
fn serve(
    pipe: &mut Pipe,
    state: &Mutex<State>,
    stop: &Arc<Event>,
    cancellation: &Cancellation,
    signing: &SigningIn,
    options: &Options,
) -> io::Result<()> {
    let nonce =
        vantare_services::random_id().map_err(|_| io::Error::other("bootstrap no disponible"))?;
    protocol::write(
        pipe,
        &SupervisorHello {
            version: protocol::VERSION,
            nonce: nonce.clone(),
        },
    )?;
    if let Ok(mut state) = state.lock() {
        state.connected = true;
    }
    let mut sequence: u64 = 0;
    while !stop.is_set() {
        let request: Request = protocol::read(pipe)?;
        if request.version != protocol::VERSION
            || request.nonce != nonce
            || Some(request.sequence) != sequence.checked_add(1)
        {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        sequence = request.sequence;
        let closed = matches!(request.command, Command::Shutdown);
        // Protect admission before waiting for the state held by the game timer.
        if access_command(&request.command)
            && !matches!(request.command, Command::LicenseRenewAutomatic)
        {
            set_signing_in(signing, true);
        }
        let reply = match state.lock() {
            Ok(mut state) => handle(
                &mut state,
                options,
                request.command,
                cancellation,
                signing,
                stop,
            ),
            Err(_) => failure("supervisor de servicios no disponible"),
        };
        protocol::write(
            pipe,
            &Response {
                version: protocol::VERSION,
                sequence,
                reply,
            },
        )?;
        if closed {
            break;
        }
    }
    Ok(())
}
fn failure(message: &str) -> Reply {
    Reply::Error {
        message: message.into(),
    }
}
fn access_command(command: &Command) -> bool {
    matches!(
        command,
        Command::Status
            | Command::AccountBegin
            | Command::AccountCancel
            | Command::AccountEmail { .. }
            | Command::AccountPoll
            | Command::AccountRenew
            | Command::LicenseRenew
            | Command::LicenseRenewAutomatic
            | Command::DeviceReset
    )
}
fn handle(
    state: &mut State,
    options: &Options,
    command: Command,
    cancellation: &Cancellation,
    signing: &SigningIn,
    stop: &Arc<Event>,
) -> Reply {
    if matches!(command, Command::LicenseRenewAutomatic) {
        let reply = match (
            control::request_cancelled(&options.core, control::Command::Read, stop),
            control::wall_ms(),
        ) {
            (Ok(policy), Ok(wall)) => {
                // Protect only an explicitly permitted live operation from a
                // concurrent game-exit cancellation; this does not grant entry.
                if policy.live
                    && renewal::live_allowed(&policy, wall, state.renewal_origin(Instant::now()))
                {
                    set_signing_in(signing, true);
                }
                let reply = run_renewal(state, &policy, wall, Instant::now(), |state, command| {
                    serve_command(state, options, command, cancellation, signing, stop)
                })
                .unwrap_or_else(|| {
                    serve_command(
                        state,
                        options,
                        Command::LicenseStatus,
                        cancellation,
                        signing,
                        stop,
                    )
                });
                if policy.live {
                    finish(state);
                    clear_cancellation(cancellation);
                }
                reply
            }
            _ => failure("núcleo de derechos no disponible"),
        };
        // This is the admitted server request, not the concurrent game timer.
        set_signing_in(signing, false);
        return reply;
    }
    handle_with(state, command, signing, |state, command| {
        serve_command(state, options, command, cancellation, signing, stop)
    })
}
fn handle_with(
    state: &mut State,
    command: Command,
    signing: &SigningIn,
    dispatch: impl FnOnce(&mut State, Command) -> Reply,
) -> Reply {
    let access = access_command(&command);
    let manual_renewal = matches!(command, Command::LicenseRenew);
    let reset = matches!(command, Command::DeviceReset);
    let purchase = matches!(command, Command::Purchase { .. });
    let renewing = matches!(
        command,
        Command::LicenseRenew | Command::LicenseRenewAutomatic
    );
    if matches!(
        command,
        Command::Logout
            | Command::AccountBegin
            | Command::AccountEmail {
                action: protocol::EmailAction::Begin { .. }
            }
    ) {
        state.renewal = Renewal::default();
        state.purchase_until = None;
    }
    if matches!(command, Command::DeviceReset | Command::Purchase { .. }) {
        state.renewal.user_recovery();
    }
    if renewing {
        state.renewal.attempted(Instant::now());
    }
    let confirming_login = matches!(command, Command::AccountPoll)
        && matches!(
            state.renewal.session(),
            Some(protocol::Session::Pending | protocol::Session::NeedsSignIn)
        )
        || matches!(&command, Command::AccountEmail { action } if !matches!(action, protocol::EmailAction::Cancel {}));
    let reply = dispatch(state, command);
    if purchase && matches!(reply, Reply::Checkout { .. }) {
        state.purchase_until = Some(Instant::now() + PURCHASE_CONFIRMATION_WINDOW);
    }
    state.renewal.observe(&reply);
    if matches!(
        &reply,
        Reply::Account {
            session: protocol::Session::SignedOut,
            error: None,
            ..
        }
    ) {
        state.notice = None;
    } else if confirming_login
        && matches!(
            &reply,
            Reply::Account {
                session: protocol::Session::SignedIn,
                error: None,
                ..
            }
        )
    {
        state.notice = None;
        state.renewal.confirmed_login();
    }
    if renewing {
        state.renewal.completed(renewal_outcome(&reply));
    }
    if manual_renewal || reset {
        remember_notice(state, &reply);
    }
    if reset && matches!(reply, Reply::License { .. }) {
        state.notice = None;
    }
    if access {
        // OAuth esperando callback o email esperando una acción conservan servicios.
        set_signing_in(
            signing,
            matches!(
                reply,
                Reply::Account {
                    session: protocol::Session::Pending,
                    ..
                } | Reply::Email {
                    stage: protocol::EmailStage::Code
                        | protocol::EmailStage::NewPassword
                        | protocol::EmailStage::Consent
                        | protocol::EmailStage::Authorizing,
                    ..
                }
            ),
        );
    }
    reply
}
fn core_status_reply(policy: control::Policy) -> Reply {
    let message = vantare_services::outcome::policy_message(&policy)
        .unwrap_or_else(|| "Política vigente del núcleo".into());
    Reply::License { policy, message }
}

// An authenticated core observation is enough for Logout and recovery commands.
// Fresh NoCredential/RecoveryRequired/ClockBehind observations also admit ordinary
// queries: no rights are granted by starting the helper. Logout always remains usable.
fn helper_command_allowed(policy: &control::Policy, command: &Command) -> bool {
    matches!(command, Command::Logout) || access_command(command) || policy.current()
}
fn serve_command(
    state: &mut State,
    options: &Options,
    command: Command,
    cancellation: &Cancellation,
    signing: &SigningIn,
    stop: &Arc<Event>,
) -> Reply {
    if matches!(command, Command::Shutdown) {
        finish(state);
        return Reply::Closed;
    }
    let policy = match control::request_cancelled(&options.core, control::Command::Read, stop) {
        // Heartbeat: entregar también revocación/caducidad explícitas. El Hub
        // distingue esta política definitiva de un fallo temporal del transporte.
        Ok(policy) if matches!(command, Command::LicenseStatus | Command::Probe) => {
            if matches!(command, Command::LicenseStatus) {
                return Reply::LicenseStatus {
                    session: state.renewal.session(),
                    notice: state.notice.clone(),
                    policy,
                };
            }
            return core_status_reply(policy);
        }
        // Recovering account/license commands must also work after expiry or a
        // durable logout denial. They still need the authenticated core channel.
        Ok(p) if helper_command_allowed(&p, &command) => p,
        Err(error)
            if error.get_ref().is_some_and(
                <dyn std::error::Error + Send + Sync>::is::<control::VersionMismatch>,
            ) =>
        {
            finish(state);
            return failure(control::VERSION_ERROR);
        }
        _ => {
            finish(state);
            return failure("núcleo de derechos no disponible");
        }
    };
    let automatic = matches!(command, Command::LicenseRenewAutomatic);
    let live_renewal = policy.live
        && automatic
        && control::wall_ms().is_ok_and(|wall| {
            renewal::live_allowed(&policy, wall, state.renewal_origin(Instant::now()))
        });
    if (policy.live && automatic && !live_renewal)
        || (closes_for_game(&policy, access_command(&command) && signing_in(signing)) && !automatic)
    {
        finish(state);
        return failure("servicios cerrados durante el juego");
    }
    if state
        .client
        .as_mut()
        .is_some_and(|client| !client.is_running())
    {
        state.client = None;
    }
    if let Some(client) = &mut state.client {
        background_helper(client, policy.live);
        match client.probe() {
            Ok(()) => {}
            Err(ConnectionError::Disconnected(
                io::ErrorKind::BrokenPipe
                | io::ErrorKind::UnexpectedEof
                | io::ErrorKind::ConnectionAborted
                | io::ErrorKind::ConnectionReset
                | io::ErrorKind::NotConnected
                | io::ErrorKind::TimedOut,
            )) => {
                state.client = None;
                clear_cancellation(cancellation);
            }
            Err(error) => {
                state.client = None;
                clear_cancellation(cancellation);
                eprintln!("{}", error.diagnostic());
                return failure(error.message());
            }
        }
    }
    if state.client.is_none() {
        let client =
            match Client::start_managed(&options.binary, options.root.as_deref(), &options.core) {
                Ok(client) => client,
                Err(error) => return failure(error),
            };
        background_helper(&client, policy.live);
        if let Ok(mut slot) = cancellation.lock() {
            *slot = Some(client.cancellation());
        }
        // The authenticated Policy read above admits the helper. Starting it
        // grants nothing; only InstallOnline's durable core ACK installs rights.
        state.client = Some(client);
    }
    dispatch_observing_session(state, command, |state, command| {
        dispatch_helper(state, command, cancellation)
    })
}

fn dispatch_observing_session(
    state: &mut State,
    command: Command,
    mut dispatch: impl FnMut(&mut State, Command) -> Reply,
) -> Reply {
    let renewing = matches!(
        command,
        Command::LicenseRenew | Command::LicenseRenewAutomatic
    );
    let reply = dispatch(state, command);
    if renewing && !matches!(reply, Reply::Error { .. }) {
        // Refresh may have changed Session even when renewal returns a failure.
        // AccountPoll reads services' state; never infer it from a license error.
        let account = dispatch(state, Command::AccountPoll);
        state.renewal.observe(&account);
    }
    reply
}

fn dispatch_helper(state: &mut State, command: Command, cancellation: &Cancellation) -> Reply {
    match state
        .client
        .as_mut()
        .map(|client| client.request_typed(command))
    {
        Some(Ok(reply)) => reply,
        result => {
            if let Some(Err(error)) = result {
                eprintln!("{}", error.diagnostic());
            }
            state.client = None;
            clear_cancellation(cancellation);
            failure("servicios desconectados; operación sin reintento automático")
        }
    }
}
fn background_helper(client: &Client, live: bool) {
    if live && client.set_background().is_err() {
        eprintln!("services-priority-unavailable");
    }
}
fn renewal_outcome(reply: &Reply) -> protocol::RenewalOutcome {
    vantare_services::outcome::outcome(vantare_services::outcome::Observation::Reply(reply)).renewal
}
fn run_renewal(
    state: &mut State,
    policy: &control::Policy,
    wall: u64,
    now: Instant,
    dispatch: impl FnOnce(&mut State, Command) -> Reply,
) -> Option<Reply> {
    let origin = state.renewal_origin(now);
    state.renewal.claim_from(policy, wall, now, origin).ok()?;
    let reply = dispatch(state, Command::LicenseRenewAutomatic);
    // Classify at the authenticated core ACK's effective clock, not the wall
    // clock sampled before HTTP. Consumers retain their independent 2s TTL.
    let outcome = renewal_outcome(&reply);
    state.renewal.completed(outcome);
    eprintln!("license-auto-result={outcome:?}");
    remember_notice(state, &reply);
    Some(reply)
}
// Reading or losing a response never consumes the last actionable result.
// A verified renewal supersedes it; transport failures cannot resolve it.
fn remember_notice(state: &mut State, reply: &Reply) {
    match reply {
        Reply::DeviceLimit { message } => {
            state.notice = vantare_services::outcome::notice_after(
                state.notice.take(),
                protocol::LicenseNotice::DeviceLimit {
                    message: message.clone(),
                },
            );
        }
        Reply::LicenseFailure { outcome, message } => {
            state.notice = vantare_services::outcome::notice_after(
                state.notice.take(),
                protocol::LicenseNotice::Failure {
                    outcome: *outcome,
                    message: message.clone(),
                },
            );
        }
        Reply::License { .. } if renewal_outcome(reply) == protocol::RenewalOutcome::Verified => {
            state.notice = None;
        }
        _ => {}
    }
}
fn finish(state: &mut State) {
    if let Some(mut client) = state.client.take() {
        let _closed = client.request(Command::Shutdown);
        drop(client); // kill/reap: jamás huérfano ni residencia en carrera.
    }
}
fn clear_cancellation(cancellation: &Cancellation) {
    if let Ok(mut slot) = cancellation.lock() {
        *slot = None;
    }
}
fn cancel(cancellation: &Cancellation) {
    if let Ok(slot) = cancellation.lock()
        && let Some(event) = &*slot
    {
        event.set();
    }
}
/// The game decision can precede a new access request. Protect cancellation
/// with the admission lock, then recheck after acquiring the supervisor state.
fn finish_for_game(state: &Mutex<State>, cancellation: &Cancellation, signing: &SigningIn) -> bool {
    let mut state = match state.try_lock() {
        Ok(state) => state,
        Err(TryLockError::WouldBlock) => {
            {
                let Ok(until) = signing.lock() else {
                    return false;
                };
                if until.is_some_and(|until| Instant::now() < until) {
                    return false;
                }
                // Access admission cannot race this cancellation. Other remote
                // operations still stop on game entry, preserving their durable intent.
                cancel(cancellation);
            }
            let Ok(state) = state.lock() else {
                return false;
            };
            state
        }
        Err(TryLockError::Poisoned(_)) => return false,
    };
    if signing_in(signing) {
        return false;
    }
    finish(&mut state);
    clear_cancellation(cancellation);
    true
}
fn spawn_timer(
    state: Arc<Mutex<State>>,
    stop: Arc<Event>,
    cancellation: Cancellation,
    signing: SigningIn,
    options: Options,
) -> io::Result<JoinHandle<()>> {
    thread::Builder::new()
        .name("services-game-exit".into())
        .spawn(move || {
            while !stop.wait(Duration::from_millis(250)) {
                let now = Instant::now();
                let check = state.try_lock().is_ok_and(|state| {
                    (state.client.is_some() || state.renewal.signed_in())
                        && state.core_retry_at.is_none_or(|until| now >= until)
                        && state.renewal.should_check(state.connected, now)
                });
                if !check {
                    continue;
                }
                if let Ok(mut state) = state.try_lock() {
                    state.renewal.checked(now);
                }
                let policy =
                    control::request_cancelled(&options.core, control::Command::Read, &stop);
                let Ok(policy) = policy else {
                    let error = policy.expect_err("failed core request");
                    if let Ok(mut state) = state.try_lock() {
                        state.core_retry_at = Some(now + Duration::from_secs(30));
                    }
                    eprintln!(
                        "license-auto-core-unavailable code={}",
                        control::Failure::classify(&error).diagnostic()
                    );
                    continue;
                };
                if let Ok(mut state) = state.try_lock() {
                    state.core_retry_at = None;
                }
                let Ok(wall) = control::wall_ms() else {
                    eprintln!("license-auto-wall-unavailable");
                    continue;
                };
                if policy.current()
                    && closes_for_game(&policy, signing_in(&signing))
                    && !state.try_lock().is_ok_and(|state| {
                        renewal::live_allowed(&policy, wall, state.renewal_origin(now))
                    })
                {
                    finish_for_game(&state, &cancellation, &signing);
                } else if let Ok(mut state) = state.try_lock() {
                    state.renewal.checked(now);
                    let _renewed = run_renewal(&mut state, &policy, wall, now, |state, command| {
                        // The timer never clears the admission window set by a
                        // concurrent user request waiting for this state lock.
                        serve_command(state, &options, command, &cancellation, &signing, &stop)
                    });
                    if !state.connected || policy.live {
                        finish(&mut state);
                        clear_cancellation(&cancellation);
                    }
                }
            }
        })
}
impl Drop for Host {
    fn drop(&mut self) {
        self.stop.set();
        // Si está libre, coordina el cierre del helper. Si hay E/S
        // remota en vuelo, cancelación y cleanup conservan los derechos del núcleo. La respuesta
        // HTTP sin ACK se descarta y la renovación posterior solicita otra.
        if let Ok(mut state) = self.state.try_lock() {
            finish(&mut state);
        } else {
            cancel(&self.cancellation);
        }
        if let Some(thread) = self.timer.take() {
            let _joined = thread.join();
        }
        if let Some(thread) = self.server.take() {
            let _joined = thread.join();
        }
    }
}

#[cfg(test)]
mod tests;
