//! Poll acotado y sin hilos: como máximo tres páginas y 256 datagramas por llamada.
use std::io;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::time::Duration;

use vantare_domain::{Adapter, AdapterError, Observation, SourceKind};

use super::{
    shm::{Page, config_path},
    translate::{PAGE_SIZES, Translator},
    udp,
};

/// Tope de `broadcasting.json`. La configuracion de ACC es diminuta; sin cota,
/// un fichero enorme en esa ruta agota la memoria del nucleo.
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;

/// Lectura acotada de un fichero de configuracion del usuario.
fn read_bounded(path: &std::path::Path) -> io::Result<Vec<u8>> {
    use std::io::Read;
    let file = std::fs::File::open(path)?;
    let mut bytes = Vec::new();
    file.take(MAX_CONFIG_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(io::Error::other("configuracion de ACC demasiado grande"));
    }
    Ok(bytes)
}

#[cfg(test)]
#[path = "../../../tests/acc/live.rs"]
mod tests;

pub struct Acc {
    translator: Translator,
    pages: [Option<Page>; 3],
    socket: Option<UdpSocket>,
    config: Option<PathBuf>,
    retry: Duration,
    next_read: Duration,
    next_register: Duration,
    next_entries: Duration,
    next_track: Duration,
    registration: Vec<u8>,
    buffer: Vec<u8>,
    last_udp: Option<Duration>,
    latest: Option<Observation>,
}

impl Acc {
    pub fn new() -> Self {
        Self {
            translator: Translator::new(SourceKind::Live),
            pages: [None, None, None],
            socket: None,
            config: None,
            retry: Duration::ZERO,
            next_read: Duration::ZERO,
            next_register: Duration::ZERO,
            next_entries: Duration::ZERO,
            next_track: Duration::ZERO,
            registration: Vec::new(),
            buffer: vec![0; 65_507],
            last_udp: None,
            latest: None,
        }
    }

    /// Variante con ubicación explícita (tests/Documentos redirigidos).
    pub fn with_config_path(path: PathBuf) -> Self {
        let mut acc = Self::new();
        acc.config = Some(path);
        acc
    }

    fn connect(&mut self, now: Duration) -> io::Result<()> {
        if now < self.retry {
            return Ok(());
        }
        self.retry = now + Duration::from_secs(1);
        for (i, name) in [
            r"Local\acpmf_physics",
            r"Local\acpmf_graphics",
            r"Local\acpmf_static",
        ]
        .iter()
        .enumerate()
        {
            if self.pages[i].is_none() {
                self.pages[i] = Page::open(name, PAGE_SIZES[i]).ok();
            }
        }
        if self.config.is_none() {
            self.config = Some(config_path()?);
        }
        if self.socket.is_none()
            && let Some(path) = &self.config
        {
            match read_bounded(path) {
                Ok(bytes) if !bytes.iter().all(u8::is_ascii_whitespace) => {
                    let c = udp::config(&bytes)?;
                    let socket = UdpSocket::bind("127.0.0.1:0")?;
                    socket.connect((std::net::Ipv4Addr::LOCALHOST, c.port))?;
                    socket.set_nonblocking(true)?;
                    self.registration = udp::registration(&c)?;
                    socket.send(&self.registration)?;
                    self.next_register = now + Duration::from_secs(2);
                    self.socket = Some(socket);
                }
                Ok(_) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }

    fn receive(&mut self, now: Duration) -> io::Result<bool> {
        let Some(socket) = &self.socket else {
            return Ok(false);
        };
        let mut changed = false;
        let mut rejected = 0;
        for _ in 0..256 {
            match socket.recv(&mut self.buffer) {
                Ok(n) => {
                    let connection = self.translator.connection;
                    match self.translator.udp(&self.buffer[..n], now) {
                        Ok(received) => {
                            self.last_udp = Some(now);
                            changed |= received;
                            // Otro registro retira velocidades aunque no sea una muestra.
                            changed |= connection != self.translator.connection;
                        }
                        Err(error) if error.kind() == io::ErrorKind::InvalidData => {
                            rejected += 1;
                        }
                        Err(error) => return Err(error),
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => break,
                Err(e) => return Err(e),
            }
        }
        if rejected > 0 {
            eprintln!("broadcasting ACC: {rejected} datagramas inválidos descartados");
        }
        if now >= self.next_register {
            if self.translator.connection.is_none() {
                // La respuesta puede llegar tarde: conservar el puerto hasta el ACK.
                socket.send(&self.registration)?;
                self.next_register = now + Duration::from_secs(2);
            } else if self
                .last_udp
                .is_none_or(|at| now.saturating_sub(at) >= Duration::from_secs(2))
            {
                self.disconnect();
                return Ok(changed);
            }
        }
        if let Some(id) = self.translator.connection {
            if self.translator.request_entries && now >= self.next_entries {
                socket.send(&udp::request(10, id))?;
                self.next_entries = now + Duration::from_secs(1);
                self.translator.request_entries = false;
            }
            if self.translator.request_track && now >= self.next_track {
                socket.send(&udp::request(11, id))?;
                self.next_track = now + Duration::from_secs(1);
            }
        }
        Ok(changed)
    }

    fn disconnect(&mut self) {
        if let Some(socket) = self.socket.take() {
            // SDK v4: UNREGISTER sin payload. Mejor esfuerzo en cierre/reconexión.
            if let Err(e) = socket.send(&[9]) {
                eprintln!("cierre broadcasting ACC: {e}");
            }
        }
        self.translator.connection = None;
    }
}

impl Default for Acc {
    fn default() -> Self {
        Self::new()
    }
}

impl Adapter for Acc {
    fn poll(&mut self, now: Duration) -> Result<Option<Observation>, AdapterError> {
        if now < self.next_read {
            return Ok(None);
        }
        self.next_read = now + Duration::from_millis(5);
        if let Err(error) = self.connect(now) {
            // Config/socket son una fuente opcional: nunca omitir SHM por UDP.
            // udp::config/registration sanitizan causas; no se registra su contenido.
            eprintln!("broadcasting ACC: {error}; reconectando");
            self.disconnect();
        }
        let mut changed = false;
        let mut rejected_page = false;
        // static primero en vivo: no publicar una página sin versión inicializada.
        for i in [2, 0, 1] {
            if let Some(page) = &self.pages[i] {
                match page.stable(i != 2) {
                    Ok(bytes) => {
                        if let Ok(updated) = self.translator.shm(
                            u8::try_from(i).map_err(|_| AdapterError::Disconnected)?,
                            bytes,
                            now,
                        ) {
                            changed |= updated;
                        } else {
                            rejected_page = true;
                            break; // Static desconocida: no interpretar physics/graphics.
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                    Err(_) => self.pages[i] = None,
                }
            }
        }
        let mut receive_failed = false;
        match self.receive(now) {
            Ok(received) => changed |= received,
            Err(error) => {
                eprintln!("broadcasting ACC: {error}; reconectando");
                self.disconnect(); // SHM sigue operativa y UDP envejece por señal.
                receive_failed = true; // Puede haber cambios aceptados antes del error.
            }
        }
        if rejected_page {
            self.latest = None; // La recuperación debe publicar también UDP recibido aquí.
            return Err(AdapterError::Rejected(
                "página ACC sin layout admitido".into(),
            ));
        }
        if !changed
            && !receive_failed
            && self
                .latest
                .as_ref()
                .is_some_and(|old| !self.translator.needs_refresh(old.origin.received_at, now))
        {
            return Ok(None);
        }
        let Some(observation) = self.translator.observe(now) else {
            return Err(AdapterError::Disconnected);
        };
        // Caducidad también publica con packetId quieto, pero una sola vez.
        let differs = self
            .latest
            .as_ref()
            .is_none_or(|old| old.state != observation.state);
        if changed || differs {
            self.latest = Some(observation.clone());
            Ok(Some(observation))
        } else {
            // Se cruzó una caducidad sin efecto visible (p. ej. una fuente no
            // usada). Confirmarla también evita reconstruir en cada poll futuro.
            if let Some(latest) = &mut self.latest {
                latest.origin.received_at = now;
            }
            Ok(None)
        }
    }
}

impl Drop for Acc {
    fn drop(&mut self) {
        self.disconnect();
    }
}
