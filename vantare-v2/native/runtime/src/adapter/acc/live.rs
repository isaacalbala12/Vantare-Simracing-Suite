//! Poll acotado y sin hilos: como máximo tres páginas y 256 datagramas por llamada.
use std::io;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::time::Duration;

use vantare_domain::{Adapter, AdapterError, Observation, SourceKind};

use super::shm::{Page, config_path};
use super::translate::{PAGE_SIZES, Translator};
use super::udp;

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
            match std::fs::read(path) {
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
        for _ in 0..256 {
            match socket.recv(&mut self.buffer) {
                Ok(n) => {
                    self.last_udp = Some(now);
                    changed |= self.translator.udp(&self.buffer[..n], now)?;
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => break,
                Err(e) => return Err(e),
            }
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
        self.connect(now).map_err(|_| {
            AdapterError::Rejected("no se pudo abrir broadcasting.json/socket ACC".into())
        })?;
        let mut changed = false;
        // static primero en vivo: no publicar una página sin versión inicializada.
        for i in [2, 0, 1] {
            if let Some(page) = &self.pages[i] {
                match page.stable(i != 2) {
                    Ok(bytes) => {
                        changed |= self
                            .translator
                            .shm(
                                u8::try_from(i).map_err(|_| AdapterError::Disconnected)?,
                                bytes,
                                now,
                            )
                            .map_err(|_| {
                                AdapterError::Rejected("página ACC sin layout admitido".into())
                            })?;
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                    Err(_) => self.pages[i] = None,
                }
            }
        }
        match self.receive(now) {
            Ok(received) => changed |= received,
            Err(error) => {
                eprintln!("broadcasting ACC: {error}; reconectando");
                self.disconnect(); // SHM sigue operativa y UDP envejece por señal.
            }
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
            Ok(None)
        }
    }
}

impl Drop for Acc {
    fn drop(&mut self) {
        self.disconnect();
    }
}
