//! Supervisor de servicios: propietario del hijo; el Hub solo usa IPC.
use std::{
    io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, TryLockError},
    thread::{self, JoinHandle},
    time::Duration,
};
use vantare_ipc::{
    Peer,
    control::{self, CoreLink},
    transport::{Event, Listener, Pipe},
};
use vantare_services::{
    process::Client,
    protocol::{self, Command, Reply, Request, Response, SupervisorHello},
};

type Cancellation = Arc<Mutex<Option<Arc<Event>>>>;
pub fn pipe_name(photo: &str) -> String {
    format!("{photo}-hub-services")
}
struct State {
    client: Option<Client>,
}
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
        let state = Arc::new(Mutex::new(State { client: None }));
        let mut listener =
            Listener::new(&pipe_name(photo), Arc::clone(&stop), Duration::from_mins(5))?;
        let first = listener.instance()?;
        let timer = spawn_timer(
            Arc::clone(&state),
            Arc::clone(&stop),
            Arc::clone(&cancellation),
            options.core.clone(),
        )?;
        let server = {
            let state = Arc::clone(&state);
            let stop = Arc::clone(&stop);
            let cancellation = Arc::clone(&cancellation);
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
                        let _served = serve(&mut pipe, &state, &stop, &cancellation, &options);
                        if let Ok(mut state) = state.lock() {
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
        let reply = match state.lock() {
            Ok(mut state) => handle(&mut state, options, request.command, cancellation, stop),
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
fn handle(
    state: &mut State,
    options: &Options,
    command: Command,
    cancellation: &Cancellation,
    stop: &Arc<Event>,
) -> Reply {
    if matches!(command, Command::Shutdown) {
        finish(state);
        return Reply::Closed;
    }
    let policy = match control::request_cancelled(&options.core, control::Command::Read, stop) {
        Ok(p) if p.current() => p,
        _ => {
            finish(state);
            return failure("núcleo de derechos no disponible");
        }
    };
    if policy.live {
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
    if state.client.is_none() {
        let mut client =
            match Client::start_managed(&options.binary, options.root.as_deref(), &options.core) {
                Ok(client) => client,
                Err(error) => return failure(error),
            };
        if let Ok(mut slot) = cancellation.lock() {
            *slot = Some(client.cancellation());
        }
        // No se atiende al Hub antes del ACK durable del núcleo, incluso offline.
        if let Ok(Reply::License { .. }) = client.request(Command::TransferRights) {
            state.client = Some(client);
        } else {
            clear_cancellation(cancellation);
            return failure("transferencia de derechos sin confirmar");
        }
    }
    if let Some(Ok(reply)) = state.client.as_mut().map(|client| client.request(command)) {
        reply
    } else {
        state.client = None;
        clear_cancellation(cancellation);
        failure("servicios desconectados; operación sin reintento automático")
    }
}
fn finish(state: &mut State) {
    if let Some(mut client) = state.client.take() {
        // Solo transferencia local. La primera ya fue confirmada antes de servir al Hub.
        // Si se canceló E/S en vuelo, se conserva el candidate/intento durable.
        if !matches!(
            client.request(Command::TransferRights),
            Ok(Reply::License { .. })
        ) {
            eprintln!("vantare: transferencia final sin confirmar; estado local conservado");
        }
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
fn spawn_timer(
    state: Arc<Mutex<State>>,
    stop: Arc<Event>,
    cancellation: Cancellation,
    core: CoreLink,
) -> io::Result<JoinHandle<()>> {
    thread::Builder::new()
        .name("services-game-exit".into())
        .spawn(move || {
            while !stop.wait(Duration::from_millis(250)) {
                let running = state
                    .try_lock()
                    .map_or(true, |state| state.client.is_some());
                if !running {
                    continue;
                }
                let live = control::request_cancelled(&core, control::Command::Read, &stop)
                    .is_ok_and(|p| p.current() && p.live);
                if live {
                    match state.try_lock() {
                        Ok(mut state) => finish(&mut state),
                        Err(TryLockError::WouldBlock) => {
                            cancel(&cancellation);
                            if let Ok(mut state) = state.lock() {
                                finish(&mut state);
                            }
                        }
                        Err(TryLockError::Poisoned(_)) => break,
                    }
                    clear_cancellation(&cancellation);
                }
            }
        })
}
impl Drop for Host {
    fn drop(&mut self) {
        self.stop.set();
        // Si está libre, confirma transferencia antes del cierre. Si hay E/S
        // remota en vuelo, cancelación y cleanup conservan el intento durable.
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
