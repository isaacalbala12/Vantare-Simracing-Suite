//! El Hub conecta con vantare; jamás arranca ni posee el proceso de servicios.
use super::protocol::{self, Command, Reply, Request, Response, SupervisorHello};
use std::{path::Path, sync::Arc, time::Duration};
use vantare_ipc::{
    control,
    transport::{Event, Pipe},
};

pub struct Client {
    pipe: Pipe,
    stop: Arc<Event>,
    nonce: String,
    sequence: u64,
}
impl Client {
    /// El propietario publica este evento antes de iniciar el worker y lo señala al cerrar.
    pub fn start(binary: &Path, photo_pipe: &str, stop: Arc<Event>) -> Result<Self, &'static str> {
        let mut pipe = control::connect_ready(
            &format!("{photo_pipe}-hub-services"),
            &stop,
            Duration::from_secs(30),
        )
        .map_err(|_| "supervisor vantare no disponible")?;
        if !pipe.server_peer().is_ok_and(|peer| peer.is_image(binary)) {
            return Err("supervisor no admitido");
        }
        let hello: SupervisorHello =
            control::read(&mut pipe).map_err(|_| "saludo del supervisor inválido")?;
        if hello.version != protocol::VERSION {
            return Err(vantare_ipc::INCOMPATIBLE_COMPONENTS);
        }
        if hello.nonce.len() != 64
            || !hello
                .nonce
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return Err("saludo del supervisor inválido");
        }
        Ok(Self {
            pipe,
            stop,
            nonce: hello.nonce,
            sequence: 0,
        })
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
        .map_err(|_| "servicios desconectados")?;
        let response: Response =
            protocol::read(&mut self.pipe).map_err(|_| "servicios desconectados")?;
        if response.version != protocol::VERSION {
            return Err(vantare_ipc::INCOMPATIBLE_COMPONENTS);
        }
        if response.sequence != self.sequence {
            return Err("respuesta del supervisor inválida");
        }
        Ok(response.reply)
    }
    pub fn is_running(&self) -> bool {
        !self.stop.is_set()
    }
}
pub fn default_binary() -> Result<std::path::PathBuf, &'static str> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("vantare.exe")))
        .ok_or("supervisor no instalado")
}
pub const REQUEST_POLL: Duration = Duration::from_millis(250);

#[cfg(test)]
#[path = "client_tests.rs"]
mod tests;
