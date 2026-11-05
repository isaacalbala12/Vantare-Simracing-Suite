use vantare_domain::{Quality, Snapshot};

use super::{LapBlock, LapSample};

/// Ventana diagnóstica máxima; nunca limita el número de muestras del feed.
pub const MAX_LAP_SAMPLES: usize = 18_000;

/// Prueba mínima de frontera: un bloque en curso y el último sellado, sin I/O.
#[derive(Default)]
pub struct Series {
    pub(super) active: Option<LapBlock>,
    sealed: Option<LapBlock>,
    active_offset: usize,
    sealed_offset: usize,
    pub(super) publication: Option<super::series_feed::Publisher>,
    /// Distancia/tiempo ya se reiniciaron pero el contador aún no avanzó.
    waiting_for_lap: bool,
}

impl Series {
    pub fn active(&self) -> Option<&LapBlock> {
        self.active.as_ref()
    }

    pub fn sealed(&self) -> Option<&LapBlock> {
        self.sealed.as_ref()
    }

    /// Prefijo descartado de la ventana diagnóstica, no de la grabación.
    pub fn active_offset(&self) -> usize {
        self.active_offset
    }

    pub fn sealed_offset(&self) -> usize {
        self.sealed_offset
    }

    pub(crate) fn observe(&mut self, snapshot: &Snapshot) {
        let (Some(player), Some(car)) =
            (snapshot.state.player.as_ref(), snapshot.state.player_car())
        else {
            self.mark_gap();
            return;
        };
        let identity = (snapshot.epoch, snapshot.state.session.id, car.id);
        if self
            .active
            .as_ref()
            .is_some_and(|block| (block.epoch, block.session, block.car) != identity)
        {
            // Conservar el índice del feed entre identidades; la vuelta anterior
            // queda incompleta. Nunca mezclar sesión, época o jugador.
            self.mark_gap();
            self.flush();
            self.active = None;
            self.sealed = None;
            self.active_offset = 0;
            self.sealed_offset = 0;
            self.waiting_for_lap = false;
            if let Some(publisher) = &mut self.publication {
                publisher.reset_lap();
            }
        }
        let Quality::Reliable(lap) = car.laps else {
            self.mark_gap();
            return;
        };
        if self.active.as_ref().is_some_and(|block| block.lap != lap) {
            if let Some(mut block) = self.active.take() {
                let closed = block.lap.checked_add(1) == Some(lap);
                if closed {
                    block.sealed_at = Some(snapshot.sequence);
                } else {
                    block.gap = true;
                }
                if let Some(publisher) = &mut self.publication {
                    publisher.publish(&block, self.active_offset);
                    publisher.reset_lap();
                }
                if closed {
                    self.sealed = Some(block);
                    self.sealed_offset = self.active_offset;
                }
            }
            self.active_offset = 0;
            // Un salto/retroceso descarta la vuelta abierta, no inventa cierres.
            self.waiting_for_lap = false;
        }
        let block = self.active.get_or_insert_with(|| LapBlock {
            epoch: identity.0,
            session: identity.1,
            car: identity.2,
            lap,
            sealed_at: None,
            gap: false,
            samples: Vec::new(),
        });
        let (Quality::Reliable(distance), Quality::Reliable(elapsed)) =
            (car.lap_distance_m, car.lap_elapsed_s)
        else {
            block.gap = true;
            return;
        };
        if let Some(last) = block.samples.last() {
            if last.elapsed_s.current().is_some_and(|v| elapsed < *v) {
                block.gap = true;
                self.waiting_for_lap = true;
            }
            if last.distance_m.current().is_some_and(|v| distance < *v) {
                // Maniobra con reloj creciente: omitir hasta recuperar el
                // último progreso retenido, sin perder el resto de la vuelta.
                block.gap = true;
                return;
            }
        }
        if self.waiting_for_lap {
            return;
        }
        if block.samples.len() == MAX_LAP_SAMPLES {
            let Some(offset) = self.active_offset.checked_add(block.samples.len()) else {
                block.gap = true;
                return;
            };
            // Publicar el resto ANTES de reciclar. Vec::clear conserva capacidad:
            // sin desplazar 18.000 muestras ni asignar otra ventana en el hot path.
            if let Some(publisher) = &mut self.publication {
                publisher.publish(block, self.active_offset);
                publisher.rebase();
            }
            self.active_offset = offset;
            block.samples.clear();
        }
        block.samples.push(LapSample {
            sequence: snapshot.sequence,
            distance_m: car.lap_distance_m,
            elapsed_s: car.lap_elapsed_s,
            speed_mps: player.telemetry.speed_mps,
            throttle: player.telemetry.throttle,
            brake: player.telemetry.brake,
        });
        if let Some(publisher) = &mut self.publication
            && publisher.ready(block)
        {
            publisher.publish(block, self.active_offset);
        }
    }

    fn mark_gap(&mut self) {
        if let Some(block) = &mut self.active {
            block.gap = true;
        }
    }
}
