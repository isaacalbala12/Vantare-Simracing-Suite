//! Consumidor de eventos: una entrega pendiente, ACK del dueño y reconexión.
use std::io;
use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_ipc::transport::{self, Event as Cancel, IO_TIMEOUT, Peer};

use super::{
    Cursor,
    wire::{self, Frame},
};

const RETRY: Duration = Duration::from_millis(250);
const POLL: Duration = Duration::from_millis(50);

pub struct EventClient {
    stop: Arc<Cancel>,
    frames: mpsc::Receiver<Frame>,
    acknowledgements: mpsc::SyncSender<Cursor>,
    worker: Option<JoinHandle<()>>,
}
impl EventClient {
    pub fn connect(
        name: &str,
        cursor: Option<Cursor>,
        accept_peer: impl Fn(&Peer) -> bool + Send + 'static,
    ) -> io::Result<Self> {
        let stop = Arc::new(Cancel::new()?);
        let (sender, frames) = mpsc::sync_channel(1);
        let (acknowledgements, receiver) = mpsc::sync_channel(1);
        let worker = {
            let stop = Arc::clone(&stop);
            let name = name.to_owned();
            thread::Builder::new()
                .name("engineer-events".into())
                .spawn(move || {
                    run(&name, cursor, &stop, &sender, &receiver, &accept_peer);
                })?
        };
        Ok(Self {
            stop,
            frames,
            acknowledgements,
            worker: Some(worker),
        })
    }
    pub fn next(&self, timeout: Duration) -> io::Result<Option<Frame>> {
        match self.frames.recv_timeout(timeout) {
            Ok(frame) => Ok(Some(frame)),
            Err(mpsc::RecvTimeoutError::Timeout) => Ok(None),
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err(io::Error::other("lector de eventos terminó"))
            }
        }
    }
    /// Llamar solo después de checkpointar/procesar: ni IO ni espera aquí.
    pub fn ack(&self, cursor: Cursor) -> io::Result<()> {
        self.acknowledgements.try_send(cursor).map_err(|_| {
            io::Error::new(io::ErrorKind::WouldBlock, "ACK inesperado o lector cerrado")
        })
    }
}
impl Drop for EventClient {
    fn drop(&mut self) {
        self.stop.set();
        if let Some(worker) = self.worker.take()
            && worker.join().is_err()
        {
            eprintln!("events: lector terminó con panic");
        }
    }
}
fn run(
    name: &str,
    mut cursor: Option<Cursor>,
    stop: &Arc<Cancel>,
    frames: &mpsc::SyncSender<Frame>,
    acks: &mpsc::Receiver<Cursor>,
    accept_peer: &impl Fn(&Peer) -> bool,
) {
    let mut reported = None;
    while !stop.is_set() {
        if let Err(error) = session(name, &mut cursor, stop, frames, acks, accept_peer)
            && !stop.is_set()
            && reported != Some(error.kind())
        {
            eprintln!("events: conexión no disponible: {error}");
            reported = Some(error.kind());
        }
        if stop.wait(RETRY) {
            return;
        }
    }
}
fn session(
    name: &str,
    cursor: &mut Option<Cursor>,
    stop: &Arc<Cancel>,
    frames: &mpsc::SyncSender<Frame>,
    acks: &mpsc::Receiver<Cursor>,
    accept_peer: &impl Fn(&Peer) -> bool,
) -> io::Result<()> {
    let mut pipe = transport::connect(name, Arc::clone(stop), IO_TIMEOUT)?;
    if !accept_peer(&pipe.server_peer()?) {
        return Err(io::Error::from(io::ErrorKind::PermissionDenied));
    }
    wire::write_hello(&mut pipe, *cursor)?;
    while !stop.is_set() {
        let mut frame = wire::read_frame(&mut pipe)?
            .ok_or_else(|| io::Error::from(io::ErrorKind::UnexpectedEof))?;
        let expected = match frame.delivery {
            Some(super::Delivery::Event(e)) => e.cursor,
            Some(super::Delivery::Fact(e)) => e.cursor,
            Some(super::Delivery::Gap { resume_at, .. }) => resume_at,
            None => frame.tail,
        };
        loop {
            match frames.try_send(frame) {
                Ok(()) => break,
                Err(mpsc::TrySendError::Full(pending)) => frame = pending,
                Err(mpsc::TrySendError::Disconnected(_)) => return Ok(()),
            }
            if stop.wait(POLL) {
                return Ok(());
            }
        }
        let acknowledged = loop {
            match acks.recv_timeout(POLL) {
                Ok(cursor) => break cursor,
                Err(mpsc::RecvTimeoutError::Timeout) if !stop.is_set() => {}
                Err(_) => return Ok(()),
            }
        };
        if acknowledged != expected {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "ACK no coincide con evento recibido",
            ));
        }
        // El dueño ya guardó este cursor. Si se pierde el write/pipe, presentarlo
        // al reconectar evita repetir un efecto ya confirmado localmente.
        *cursor = Some(acknowledged);
        wire::write_ack(&mut pipe, acknowledged)?;
    }
    Ok(())
}
