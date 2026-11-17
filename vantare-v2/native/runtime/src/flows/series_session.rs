//! Captura pura de metadatos; el reloj de pared lo inyecta el propietario.
use serde_json::{Value, json};
use std::time::Duration;
use vantare_domain::{Car, Quality, SessionKind, Snapshot};

#[derive(Clone, Debug)]
pub enum SessionEvent {
    Open {
        epoch: u64,
        session: u64,
        kind: &'static str,
        kind_text: String,
        track_name: String,
        vehicle: String,
        class_name: String,
        started_at_ms: u64,
    },
    Lap {
        epoch: u64,
        session: u64,
        car: u32,
        lap: u32,
        official_ms: Option<u32>,
        sector_ms: Option<Vec<u32>>,
    },
    Close {
        epoch: u64,
        session: u64,
        ended_at_ms: u64,
        sim_elapsed_s: Option<f64>,
        final_position: Option<u32>,
        final_class_position: Option<u32>,
        laps_completed: Option<u32>,
        best_lap_ms: Option<u32>,
        end_reason: &'static str,
    },
}

impl SessionEvent {
    /// Serializar solo en el pump: nunca en el bucle de adquisición.
    pub fn command(&self) -> Value {
        match self {
            Self::Open {
                epoch,
                session,
                kind,
                kind_text,
                track_name,
                vehicle,
                class_name,
                started_at_ms,
            } => json!(["session-open", {"epoch":epoch,"session":session,"kind":kind,
                    "kindText":kind_text,"trackName":track_name,"vehicle":vehicle,
                    "className":class_name,"startedAtMs":started_at_ms}]),
            Self::Lap {
                epoch,
                session,
                car,
                lap,
                official_ms,
                sector_ms,
            } => json!(["lap", {"epoch":epoch,"session":session,"car":car,"lap":lap,
                    "officialMs":official_ms,"sectorMs":sector_ms}]),
            Self::Close {
                epoch,
                session,
                ended_at_ms,
                sim_elapsed_s,
                final_position,
                final_class_position,
                laps_completed,
                best_lap_ms,
                end_reason,
            } => json!(["session-close", {"epoch":epoch,"session":session,"endedAtMs":ended_at_ms,
                    "simElapsedS":sim_elapsed_s,"finalPosition":final_position,
                    "finalClassPosition":final_class_position,"lapsCompleted":laps_completed,
                    "bestLapMs":best_lap_ms,"endReason":end_reason}]),
        }
    }

    pub(super) fn acknowledgment(&self) -> Value {
        match self {
            Self::Open { epoch, session, .. } => json!(["ack-session", "open", epoch, session]),
            Self::Lap {
                epoch,
                session,
                car,
                lap,
                ..
            } => json!(["ack-lap", epoch, session, car, lap]),
            Self::Close { epoch, session, .. } => json!(["ack-session", "close", epoch, session]),
        }
    }
}

#[derive(Default)]
pub struct SessionTracker {
    active: Option<Active>,
}

struct Active {
    epoch: u64,
    session: u64,
    car: u32,
    wall_ms: u64,
    laps: Option<u32>,
    last_lap: Option<f64>,
    pending: Option<(u32, Duration)>,
    position: Option<u32>,
    class_position: Option<u32>,
    best_lap: Option<u32>,
    elapsed: Option<f64>,
}

impl SessionTracker {
    pub fn observe(&mut self, snapshot: &Snapshot, wall_ms: u64) -> Vec<SessionEvent> {
        let mut events = Vec::new();
        let identity = (snapshot.epoch, snapshot.state.session.id.0);
        if self
            .active
            .as_ref()
            .is_some_and(|active| (active.epoch, active.session) != identity)
            && let Some(mut active) = self.active.take()
        {
            active.flush_pending(&mut events);
            events.push(active.close(active.wall_ms, "sessionChanged"));
        }
        let Some(car) = snapshot.state.player_car() else {
            if let Some(active) = self.active.as_mut() {
                active.update_session(snapshot, wall_ms);
            }
            return events;
        };
        let source = snapshot
            .origin
            .source_time
            .unwrap_or(snapshot.origin.received_at);
        if self.active.is_none() {
            let (kind, kind_text) = match &snapshot.state.session.kind {
                Quality::Reliable(SessionKind::Practice) => ("practice", String::new()),
                Quality::Reliable(SessionKind::Qualifying) => ("qualifying", String::new()),
                Quality::Reliable(SessionKind::Race) => ("race", String::new()),
                Quality::Reliable(SessionKind::Other(text)) => ("other", bounded(text)),
                _ => ("unknown", String::new()),
            };
            events.push(SessionEvent::Open {
                epoch: identity.0,
                session: identity.1,
                kind,
                kind_text,
                track_name: snapshot
                    .state
                    .session
                    .track_name
                    .last_known()
                    .map_or_else(String::new, |s| bounded(s)),
                vehicle: bounded(&car.vehicle),
                class_name: car
                    .class
                    .as_ref()
                    .map_or_else(String::new, |c| bounded(&c.name)),
                started_at_ms: wall_ms,
            });
            self.active = Some(Active::new(identity, car, wall_ms));
        }
        if let Some(active) = self.active.as_mut() {
            if active.car != car.id.0 {
                active.flush_pending(&mut events);
                // El resumen sigue abierto y conserva el primer coche. El cierre
                // y las líneas base pertenecen ahora al último coche observado.
                *active = Active::new(identity, car, wall_ms);
            }
            active.observe(car, source, &mut events);
            active.update_session(snapshot, wall_ms);
        }
        events
    }

    pub fn finish(&mut self, wall_ms: u64) -> Vec<SessionEvent> {
        let mut events = Vec::new();
        if let Some(mut active) = self.active.take() {
            active.flush_pending(&mut events);
            events.push(active.close(wall_ms, "coreStopped"));
        }
        events
    }
}

impl Active {
    fn update_session(&mut self, snapshot: &Snapshot, wall_ms: u64) {
        self.wall_ms = wall_ms;
        if let Some(value) = snapshot
            .state
            .session
            .elapsed_s
            .last_known()
            .copied()
            .filter(|s| s.is_finite() && *s >= 0.0)
        {
            self.elapsed = Some(value);
        }
    }

    fn new(identity: (u64, u64), car: &Car, wall_ms: u64) -> Self {
        Self {
            epoch: identity.0,
            session: identity.1,
            car: car.id.0,
            wall_ms,
            laps: car.laps.last_known().copied(),
            last_lap: reliable_time(&car.last_lap_s),
            pending: None,
            position: None,
            class_position: None,
            best_lap: None,
            elapsed: None,
        }
    }

    fn observe(&mut self, car: &Car, source: Duration, events: &mut Vec<SessionEvent>) {
        if let Some(laps) = car.laps.last_known().copied() {
            if self.laps.is_some_and(|previous| laps > previous) {
                // Un salto del contador no inventa las vueltas no observadas.
                self.flush_pending(events);
                self.pending = Some((laps - 1, source));
            }
            self.laps = Some(laps);
        }
        let last = reliable_time(&car.last_lap_s);
        if let Some((lap, since)) = self.pending {
            if last.is_some() && last != self.last_lap {
                events.push(SessionEvent::Lap {
                    epoch: self.epoch,
                    session: self.session,
                    car: self.car,
                    lap,
                    official_ms: last.and_then(milliseconds),
                    sector_ms: sectors(car),
                });
                self.pending = None;
            } else if source.saturating_sub(since) >= Duration::from_secs(3) {
                self.flush_pending(events);
            }
        }
        if last.is_some() {
            self.last_lap = last;
        }
        if let Some(value) = car.position.last_known() {
            self.position = Some(*value);
        }
        if let Some(value) = car.class_position.last_known() {
            self.class_position = Some(*value);
        }
        if let Some(value) = car.best_lap_s.last_known() {
            self.best_lap = if *value > 0.0 {
                milliseconds(*value)
            } else {
                None
            };
        }
    }

    fn flush_pending(&mut self, events: &mut Vec<SessionEvent>) {
        if let Some((lap, _)) = self.pending.take() {
            events.push(SessionEvent::Lap {
                epoch: self.epoch,
                session: self.session,
                car: self.car,
                lap,
                official_ms: None,
                sector_ms: None,
            });
        }
    }

    fn close(&self, wall_ms: u64, end_reason: &'static str) -> SessionEvent {
        SessionEvent::Close {
            epoch: self.epoch,
            session: self.session,
            ended_at_ms: wall_ms,
            sim_elapsed_s: self.elapsed,
            final_position: self.position,
            final_class_position: self.class_position,
            laps_completed: self.laps,
            best_lap_ms: self.best_lap,
            end_reason,
        }
    }
}

fn reliable_time(value: &Quality<f64>) -> Option<f64> {
    match value {
        Quality::Reliable(seconds) if milliseconds(*seconds).is_some() => Some(*seconds),
        _ => None,
    }
}

// El cast está acotado antes de convertir; los tiempos oficiales son enteros ms.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn milliseconds(seconds: f64) -> Option<u32> {
    let ms = (seconds * 1000.0).round();
    (seconds >= 0.0 && ms.is_finite() && (0.0..=f64::from(u32::MAX)).contains(&ms))
        .then(|| ms as u32)
}

fn sectors(car: &Car) -> Option<Vec<u32>> {
    if car.last_sectors_s.is_empty() || car.last_sectors_s.len() > 16 {
        return None;
    }
    car.last_sectors_s
        .iter()
        .map(|value| reliable_time(value).and_then(milliseconds))
        .collect()
}

fn bounded(text: &str) -> String {
    let mut end = text.len().min(256);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_owned()
}
