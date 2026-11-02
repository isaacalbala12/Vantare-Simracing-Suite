//! Emisor de secuencias controladas, inactivo sin `test-support`.
//! Usa el codec real; el test elige las máscaras y espera cada revisión recibida
//! antes de avanzar. No depende del reloj de cadencia del publicador productivo.

use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_domain::Snapshot;

use crate::codec::{Message, negotiate, read_message, write_message};
use crate::dto::SnapshotDto;
use crate::pipe::{Event, IO_TIMEOUT, Listener};
use crate::{Demand, Error, Subscriber};

/// Vista estructurada del DTO productivo, sin pasar por texto intermedio.
///
/// # Errors
/// Si el DTO no se puede serializar como JSON.
pub fn snapshot_value(snapshot: &Snapshot) -> Result<serde_json::Value, Error> {
    Ok(serde_json::to_value(SnapshotDto::from(snapshot))?)
}

struct Delivery {
    snapshot: Snapshot,
    delivered: Demand,
}

pub struct ScriptedPhotos {
    sender: Option<mpsc::SyncSender<Delivery>>,
    stop: Arc<Event>,
    worker: Option<JoinHandle<Result<(), Error>>>,
}

impl ScriptedPhotos {
    /// Abre un pipe privado y un suscriptor real. La recepción de cada foto
    /// sirve de barrera al test; el emisor solo admite una entrega pendiente.
    ///
    /// # Errors
    /// Si no se puede abrir el pipe, el evento, el hilo o el suscriptor.
    pub fn connect(name: &str, requested: Demand) -> Result<(Self, Subscriber), Error> {
        let stop = Arc::new(Event::new()?);
        let mut listener = Listener::new(name, Arc::clone(&stop), IO_TIMEOUT)?;
        let mut pipe = listener.instance()?;
        let (sender, receiver) = mpsc::sync_channel::<Delivery>(1);
        let wanted = requested.clone();
        let worker = thread::Builder::new()
            .name("ipc-scripted-photos".into())
            .spawn(move || {
                let _listener = listener;
                pipe.accept()?;
                let Message::Hello {
                    min_version,
                    max_version,
                    demand: Some(demand),
                    ..
                } = read_message(&mut pipe)?
                else {
                    return Err(Error::Protocol("saludo de fixture sin demanda"));
                };
                if demand != wanted {
                    return Err(Error::Protocol("demanda de fixture distinta"));
                }
                let version = negotiate(min_version, max_version)
                    .ok_or(Error::Version { got: max_version })?;
                write_message(&mut pipe, &Message::Welcome { version })?;
                loop {
                    let delivery = match receiver.recv_timeout(Duration::from_secs(1)) {
                        Ok(delivery) => delivery,
                        // Conserva vivo el pipe si el consumidor prepara sus widgets.
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            write_message(&mut pipe, &Message::Ping)?;
                            continue;
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    };
                    write_message(
                        &mut pipe,
                        &Message::DemandSnapshot {
                            snapshot: SnapshotDto::selected(
                                &delivery.snapshot,
                                &delivery.delivered,
                            )?,
                            requested: wanted.clone(),
                            delivered: delivery.delivered,
                        },
                    )?;
                }
                Ok(())
            })?;
        let fixture = Self {
            sender: Some(sender),
            stop,
            worker: Some(worker),
        };
        let subscriber = Subscriber::connect_requested(name, requested, |_| true)?;
        Ok((fixture, subscriber))
    }

    /// Programa una entrega; esperar su revisión en `Subscriber` antes de
    /// enviar la siguiente evita saltarse fotos por latest-wins.
    ///
    /// # Errors
    /// Si el emisor ya terminó o se perdió el canal de la fixture.
    pub fn publish(&self, snapshot: &Snapshot, delivered: &Demand) -> Result<(), Error> {
        self.sender
            .as_ref()
            .ok_or(Error::Protocol("fixture cerrada"))?
            .send(Delivery {
                snapshot: snapshot.clone(),
                delivered: delivered.clone(),
            })
            .map_err(|_| std::io::Error::from(std::io::ErrorKind::BrokenPipe).into())
    }
}

impl Drop for ScriptedPhotos {
    fn drop(&mut self) {
        self.stop.set();
        drop(self.sender.take());
        if let Some(worker) = self.worker.take()
            && let Err(panic) = worker.join()
            && !thread::panicking()
        {
            std::panic::resume_unwind(panic);
        }
    }
}
