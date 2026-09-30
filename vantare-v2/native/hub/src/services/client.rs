use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command as Process, Stdio};
use std::sync::{Arc, mpsc};
use std::time::Duration;

use vantare_ipc::transport::{Event, IO_TIMEOUT, Pipe, connect};

use super::protocol::{self, Command, Reply, Request, Response};

/// Propiedad de un worker I/O, nunca del hilo de render. EOF/Drop cierra hijo.
pub struct Client {
    child: Child,
    pipe: Pipe,
    stop: Arc<Event>,
    nonce: String,
    sequence: u64,
}

impl Client {
    pub fn start(binary: &Path) -> Result<Self, &'static str> {
        use std::os::windows::process::CommandExt;
        let parent = std::env::current_exe().map_err(|_| "proceso Hub no identificado")?;
        let name = format!(
            "{}-services",
            vantare_ipc::default_pipe_name().map_err(|_| "IPC no disponible")?
        );
        let mut child = Process::new(binary)
            .arg(&name)
            .arg(std::process::id().to_string())
            .arg(&parent)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW; helper sin ventana.
            .spawn()
            .map_err(|_| "proceso de servicios no instalado")?;
        match Self::connect(&mut child, binary, &name) {
            Ok((pipe, stop, nonce)) => Ok(Self {
                child,
                pipe,
                stop,
                nonce,
                sequence: 0,
            }),
            Err(error) => {
                // Puede haber salido entre el fallo y kill: cleanup best effort,
                // no ocultamos el error que impidió iniciar el servicio.
                let _cleanup = child.kill();
                let _reaped = child.wait();
                Err(error)
            }
        }
    }

    fn connect(
        child: &mut Child,
        binary: &Path,
        name: &str,
    ) -> Result<(Pipe, Arc<Event>, String), &'static str> {
        let output = child.stdout.take().ok_or("bootstrap no disponible")?;
        let (send, receive) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut nonce = String::new();
            let result = BufReader::new(output.take(65))
                .read_line(&mut nonce)
                .map(|_| nonce);
            let _receiver_closed = send.send(result);
        });
        let nonce = receive
            .recv_timeout(IO_TIMEOUT)
            .map_err(|_| "bootstrap agotado")?
            .map_err(|_| "bootstrap no disponible")?;
        let nonce = nonce.trim_end_matches('\n').to_owned();
        if nonce.len() != 64
            || !nonce
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("bootstrap inválido");
        }
        let stop = Arc::new(Event::new().map_err(|_| "IPC no disponible")?);
        let pipe = connect(name, Arc::clone(&stop), IO_TIMEOUT).map_err(|_| "IPC no disponible")?;
        let peer = pipe.server_peer().map_err(|_| "servicio no identificado")?;
        if peer.pid != child.id()
            || !peer.is_image(binary)
            || child
                .try_wait()
                .map_err(|_| "estado de servicios no disponible")?
                .is_some()
        {
            return Err("servicio no admitido");
        }
        Ok((pipe, stop, nonce))
    }

    pub fn request(&mut self, command: Command) -> Result<Reply, &'static str> {
        self.sequence = self.sequence.checked_add(1).ok_or("revisión agotada")?;
        protocol::write(
            &mut self.pipe,
            &Request {
                version: protocol::VERSION,
                sequence: self.sequence,
                nonce: self.nonce.clone(),
                command,
            },
        )
        .map_err(|_| "servicios desconectado")?;
        let response: Response =
            protocol::read(&mut self.pipe).map_err(|_| "servicios desconectado")?;
        if response.version != protocol::VERSION || response.sequence != self.sequence {
            return Err("respuesta de servicios inválida");
        }
        Ok(response.reply)
    }

    pub fn cancellation(&self) -> Arc<Event> {
        Arc::clone(&self.stop)
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        self.stop.set();
        drop(self.child.stdin.take());
        // Destructor best effort: salida entre kill/wait es normal; ningún
        // dato ni token se registra. El dueño I/O espera, no el hilo UI.
        let _killed_or_already_closed = self.child.kill();
        let _reaped = self.child.wait();
    }
}

pub fn default_binary() -> Result<std::path::PathBuf, &'static str> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("vantare-services.exe")))
        .ok_or("proceso de servicios no instalado")
}

pub const REQUEST_POLL: Duration = Duration::from_millis(250);
