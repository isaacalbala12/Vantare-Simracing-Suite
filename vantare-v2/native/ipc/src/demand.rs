//! Demanda neutral por señal. La cadencia limita el cable, nunca la adquisición.
use std::collections::BTreeMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::Error;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Signal {
    Cars,
    SessionInfo,
    SessionClock,
    TrackName,
    TrackLength,
    LapsRemaining,
    Positions,
    LapCount,
    LapTimes,
    Gaps,
    ClassGaps,
    Relative,
    PitStatus,
    Flags,
    Spatial,
    Velocity,
    Pedals,
    Clutch,
    Steering,
    Powertrain,
    FuelLevel,
    FuelEstimate,
    Delta,
    Sectors,
    LapProgress,
    Weather,
    Damage,
    Penalties,
}

impl Signal {
    pub const ALL: &[Self] = &[
        Self::Cars,
        Self::SessionInfo,
        Self::SessionClock,
        Self::TrackName,
        Self::TrackLength,
        Self::LapsRemaining,
        Self::Positions,
        Self::LapCount,
        Self::LapTimes,
        Self::Gaps,
        Self::ClassGaps,
        Self::Relative,
        Self::PitStatus,
        Self::Flags,
        Self::Spatial,
        Self::Velocity,
        Self::Pedals,
        Self::Clutch,
        Self::Steering,
        Self::Powertrain,
        Self::FuelLevel,
        Self::FuelEstimate,
        Self::Delta,
        Self::Sectors,
        Self::LapProgress,
        Self::Weather,
        Self::Damage,
        Self::Penalties,
    ];

    fn car_data(self) -> bool {
        matches!(
            self,
            Self::Cars
                | Self::Positions
                | Self::LapCount
                | Self::LapTimes
                | Self::Gaps
                | Self::ClassGaps
                | Self::Relative
                | Self::PitStatus
                | Self::Spatial
                | Self::Velocity
                | Self::Sectors
                | Self::LapProgress
                | Self::Penalties
        )
    }
    fn player_data(self) -> bool {
        matches!(
            self,
            Self::Pedals
                | Self::Clutch
                | Self::Steering
                | Self::Powertrain
                | Self::FuelLevel
                | Self::FuelEstimate
                | Self::Delta
                | Self::PitStatus
                | Self::Damage
        )
    }

    pub(crate) const fn bit(self) -> u64 {
        1 << (self as u8)
    }
}

/// Milisegundos mínimos entre entregas; cero pide cada foto. Una señal ausente
/// del mapa es NO PEDIDO, aunque el simulador la soporte y tenga datos.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Demand(BTreeMap<Signal, u16>);

impl Demand {
    pub fn all() -> Self {
        Self::from_mask(u64::MAX)
    }

    pub fn request(&mut self, signal: Signal, interval_ms: u16) {
        // Las señales por coche necesitan IDs y la identidad del jugador.
        if signal != Signal::Cars && signal.car_data() {
            self.request(Signal::Cars, interval_ms);
        }
        self.0
            .entry(signal)
            .and_modify(|old| *old = (*old).min(interval_ms))
            .or_insert(interval_ms.min(5000));
    }

    pub fn union(&mut self, other: &Self) {
        for (&signal, &interval) in &other.0 {
            self.request(signal, interval);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn contains(&self, signal: Signal) -> bool {
        self.0.contains_key(&signal)
    }

    pub fn covers(&self, other: &Self) -> bool {
        other.0.keys().all(|signal| self.contains(*signal))
    }

    pub(crate) fn car_data(&self) -> bool {
        self.0.keys().any(|signal| signal.car_data())
    }
    pub(crate) fn player_data(&self) -> bool {
        self.car_data() || self.0.keys().any(|signal| signal.player_data())
    }

    pub(crate) fn validate(&self) -> Result<(), Error> {
        if self.car_data() && !self.contains(Signal::Cars) {
            return Err(Error::Protocol("señales por coche sin identidad"));
        }
        if self.0.values().any(|ms| *ms > 5000) {
            return Err(Error::Protocol("cadencia de demanda supera 5 s"));
        }
        Ok(())
    }

    pub fn mask(&self) -> u64 {
        self.0.keys().fold(0, |mask, signal| mask | signal.bit())
    }

    pub fn from_mask(mask: u64) -> Self {
        Self(
            Signal::ALL
                .iter()
                .filter(|s| mask & s.bit() != 0)
                .map(|s| (*s, 0))
                .collect(),
        )
    }
}

/// Reloj inyectado: la primera entrega (también tras reconectar/cambiar layout)
/// contiene todas las señales pedidas, independientemente de su cadencia.
#[derive(Default)]
pub(crate) struct Cadence(BTreeMap<Signal, Duration>);

impl Cadence {
    pub fn due(&mut self, demand: &Demand, now: Duration, reset: bool) -> Demand {
        if reset {
            self.0.clear();
        }
        self.0.retain(|signal, _| demand.contains(*signal));
        let mut due = Demand::default();
        for (&signal, &interval) in &demand.0 {
            if self.0.get(&signal).is_none_or(|last| {
                now.saturating_sub(*last) >= Duration::from_millis(u64::from(interval))
            }) {
                due.0.insert(signal, interval);
                self.0.insert(signal, now);
            }
        }
        due
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignalState {
    NotRequested,
    Requested,
}

/// Calidad y demanda son ejes distintos: `Requested + Quality::Unavailable`
/// significa dato ausente; `NotRequested` nunca afirma ausencia del simulador.
#[derive(Clone, Debug)]
pub struct Photo {
    pub snapshot: std::sync::Arc<vantare_domain::Snapshot>,
    pub demand: Demand,
}

impl Photo {
    pub fn full(snapshot: std::sync::Arc<vantare_domain::Snapshot>) -> Self {
        Self {
            snapshot,
            demand: Demand::all(),
        }
    }

    pub fn signal_state(&self, signal: Signal) -> SignalState {
        if self.demand.contains(signal) {
            SignalState::Requested
        } else {
            SignalState::NotRequested
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn union_uses_the_fastest_consumer_and_cadence_hydrates_new_signals() {
        let mut a = Demand::default();
        a.request(Signal::Gaps, 250);
        let mut b = Demand::default();
        b.request(Signal::Gaps, 100);
        b.request(Signal::Pedals, 16);
        a.union(&b);
        let mut clock = Cadence::default();
        assert_eq!(clock.due(&a, Duration::ZERO, false), a);
        assert!(
            !clock
                .due(&a, Duration::from_millis(99), false)
                .contains(Signal::Gaps)
        );
        assert!(
            clock
                .due(&a, Duration::from_millis(100), false)
                .contains(Signal::Gaps)
        );
        a.request(Signal::Weather, 500);
        assert!(
            clock
                .due(&a, Duration::from_millis(101), false)
                .contains(Signal::Weather)
        );
        assert_eq!(clock.due(&a, Duration::from_millis(102), true), a);
    }

    #[test]
    fn not_requested_is_not_unavailable() {
        let mut photo = Photo {
            snapshot: std::sync::Arc::default(),
            demand: Demand::default(),
        };
        assert_eq!(photo.signal_state(Signal::Delta), SignalState::NotRequested);
        photo.demand.request(Signal::Delta, 16);
        assert_eq!(photo.signal_state(Signal::Delta), SignalState::Requested);
        assert!(photo.snapshot.state.player.is_none());
        assert!(serde_json::from_str::<Demand>(r#"{"inventada":0}"#).is_err());
        assert!(
            serde_json::from_str::<Demand>(r#"{"delta":5001}"#)
                .expect("mapa")
                .validate()
                .is_err()
        );
    }
}
