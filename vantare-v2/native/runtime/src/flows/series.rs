use vantare_domain::{CarId, Quality, SessionId, Snapshot};

/// Tope por vuelta; también se conserva únicamente el último bloque sellado.
pub const MAX_LAP_SAMPLES: usize = 18_000;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LapSample {
    pub sequence: u64,
    pub distance_m: Quality<f64>,
    pub elapsed_s: Quality<f64>,
    pub speed_mps: Quality<f64>,
    pub throttle: Quality<f64>,
    pub brake: Quality<f64>,
}

/// Solo las muestras observadas: nunca interpola ni promete una vuelta entera.
#[derive(Debug, PartialEq)]
pub struct LapBlock {
    pub epoch: u64,
    pub session: SessionId,
    pub car: CarId,
    /// Contador de vueltas completadas al abrir la vuelta, como `Car::laps`.
    pub lap: u32,
    pub sealed_at: Option<u64>,
    /// Hubo datos ausentes/obsoletos, retroceso o saturación durante el bloque.
    pub gap: bool,
    pub samples: Vec<LapSample>,
}

impl LapBlock {
    /// JSON compacto de esquema v1 (ver README), sin mapas ni reloj de pared.
    /// Serializar fuera de adquisición; no persiste ni toca el bloque original.
    pub fn to_bytes(&self) -> serde_json::Result<Vec<u8>> {
        serde_json::to_vec(&self.to_value())
    }

    pub(super) fn to_value(&self) -> serde_json::Value {
        let samples: Vec<_> = self
            .samples
            .iter()
            .map(|sample| {
                serde_json::json!([
                    sample.sequence,
                    signal(sample.distance_m),
                    signal(sample.elapsed_s),
                    signal(sample.speed_mps),
                    signal(sample.throttle),
                    signal(sample.brake)
                ])
            })
            .collect();
        serde_json::json!([
            "vantare.player-lap.v1",
            self.epoch,
            self.session.0,
            self.car.0,
            self.lap,
            self.sealed_at,
            self.gap,
            samples
        ])
    }
}

fn signal(value: Quality<f64>) -> serde_json::Value {
    match value {
        Quality::Unavailable => serde_json::json!([0, null]),
        Quality::Reliable(value) => serde_json::json!([1, value]),
        Quality::Estimated(value) => serde_json::json!([2, value]),
        Quality::Stale(value) => serde_json::json!([3, value]),
    }
}

/// Prueba mínima de frontera: un bloque en curso y el último sellado, sin I/O.
#[derive(Default)]
pub struct Series {
    pub(super) active: Option<LapBlock>,
    sealed: Option<LapBlock>,
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
                    publisher.publish(&block);
                    publisher.reset_lap();
                }
                if closed {
                    self.sealed = Some(block);
                }
            }
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
        if let Some(last) = block.samples.last()
            && (last.distance_m.current().is_some_and(|v| distance < *v)
                || last.elapsed_s.current().is_some_and(|v| elapsed < *v))
        {
            block.gap = true;
            self.waiting_for_lap = true;
        }
        if self.waiting_for_lap {
            return;
        }
        if block.samples.len() == MAX_LAP_SAMPLES {
            block.gap = true;
            return;
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
            publisher.publish(block);
        }
    }

    fn mark_gap(&mut self) {
        if let Some(block) = &mut self.active {
            block.gap = true;
        }
    }
}
