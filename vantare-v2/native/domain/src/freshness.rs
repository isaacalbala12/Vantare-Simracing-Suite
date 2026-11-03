//! Vocabulario de frescura compartido. No decide capacidades ni conoce simuladores.
use crate::{Capability, Snapshot, SourceState};
use std::time::Duration;

pub const STALL_LIMIT: Duration = Duration::from_millis(500);
pub const SITUATION_CONFIRM: Duration = Duration::from_millis(250);

/// Estado común de presentación; Fuel conserva su caso de energía virtual.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
    Disconnected,
    VirtualUnavailable,
}

/// Hechos validados por la proyección, con su prioridad de ausencia/caducidad.
/// No calcula capacidades ni normaliza señales.
#[derive(Clone, Copy)]
pub struct Signals {
    pub disconnected: bool,
    pub stale: bool,
    pub missing: bool,
}

impl Status {
    #[must_use]
    pub fn of(snapshot: &Snapshot, signals: Signals) -> Self {
        Self::of_source(snapshot.state.source_state, signals)
    }

    pub(crate) fn of_source(source: SourceState, signals: Signals) -> Self {
        if source == SourceState::Lost || signals.disconnected {
            Self::Disconnected
        } else if signals.stale {
            Self::Stale
        } else if signals.missing {
            Self::Missing
        } else {
            Self::Ready
        }
    }

    #[must_use]
    pub fn text(self, language: crate::format::Language) -> Option<&'static str> {
        use crate::format::Language::{En, Es};
        Some(match (self, language) {
            (Self::Ready, _) => return None,
            (Self::Missing, Es) => "SIN DATOS",
            (Self::Missing, En) => "NO DATA",
            (Self::Stale, Es) => "DATOS ANTIGUOS",
            (Self::Stale, En) => "DATA OUT OF DATE",
            (Self::Disconnected, Es) => "DESCONECTADO",
            (Self::Disconnected, En) => "DISCONNECTED",
            (Self::VirtualUnavailable, Es) => "ENERGÍA VIRTUAL NO DISPONIBLE EN LA SEÑAL EN VIVO",
            (Self::VirtualUnavailable, En) => "VIRTUAL ENERGY SIGNAL UNAVAILABLE",
        })
    }
}

/// Motivo neutral de una transición; el adaptador puede añadir su diagnóstico.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Reason {
    Waiting,
    Advancing,
    Paused,
    AdapterStale,
    AdapterStaleWithAdvance,
    Lost,
    Silence,
    PauseSilence,
    Disconnected,
    PlayerClockFrozen,
}

impl Reason {
    pub const fn of_source(state: SourceState) -> Self {
        match state {
            SourceState::Waiting => Self::Waiting,
            SourceState::Live => Self::Advancing,
            SourceState::Paused => Self::Paused,
            SourceState::Stale => Self::AdapterStale,
            SourceState::Lost => Self::Lost,
        }
    }

    pub const fn text(self) -> &'static str {
        match self {
            Self::Waiting => "sin sesión admitida",
            Self::Advancing => "reloj de fuente avanzando",
            Self::Paused => "adaptador: pausa confirmada",
            Self::AdapterStale => "adaptador: fuente caducada",
            Self::AdapterStaleWithAdvance => {
                "adaptador: fuente caducada pese a un nuevo reloj de origen"
            }
            Self::Lost => "pipe sin actividad >=5000ms",
            Self::Silence => "núcleo: origin.source_time sin avance >=500ms",
            Self::PauseSilence => "núcleo: confirmación de pausa ausente >=500ms",
            Self::Disconnected => "adaptador desconectado; degradación inmediata",
            Self::PlayerClockFrozen => "adaptador: reloj del jugador sin avance >=500ms",
        }
    }
}

/// Convención vigente del adaptador: conserva datos del jugador, ya caducados.
/// No deduce capacidades ni hace que sus señales se publiquen como frescas.
pub fn player_clock_frozen(snapshot: &Snapshot) -> bool {
    snapshot.state.capabilities.driver_inputs == Capability::WithData
}

/// La proyección actual puede conservarse al entrar en pausa. Una foto Live
/// con scoring o jugador caducado no reemplaza la última proyección viva.
pub fn shows_last_live(snapshot: &Snapshot) -> bool {
    snapshot.state.source_state == SourceState::Paused
        || (snapshot.state.source_state == SourceState::Live
            && !player_clock_frozen(snapshot)
            && snapshot.state.capabilities.positions != Capability::WithData)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn widget_photo() -> Snapshot {
        use crate::{Car, CarId, Player, Quality, Telemetry};
        let mut full = Snapshot::default();
        full.state.cars.push(Car {
            id: CarId(1),
            position: Quality::Reliable(1),
            ..Car::default()
        });
        full.state.player = Some(Player {
            car: CarId(1),
            delta_best_s: Quality::Reliable(0.1),
            telemetry: Telemetry {
                clutch: Quality::Reliable(0.0),
                brake: Quality::Reliable(0.0),
                throttle: Quality::Reliable(0.8),
                steering: Quality::Reliable(0.1),
                gear: Quality::Reliable(2),
                speed_mps: Quality::Reliable(20.0),
                engine_speed_rad_s: Quality::Reliable(100.0),
            },
            ..Player::default()
        });
        full.state.session.weather.air_temperature_k = Quality::Reliable(293.0);
        for capability in [
            &mut full.state.capabilities.positions,
            &mut full.state.capabilities.delta,
            &mut full.state.capabilities.fuel,
            &mut full.state.capabilities.weather,
        ] {
            *capability = Capability::Fresh;
        }
        full
    }

    fn widget_statuses(photo: &Snapshot) -> [String; 7] {
        let prefs = crate::format::Preferences::default();
        let board = crate::standings::project(photo, prefs);
        [
            format!(
                "{:?}",
                crate::standings::Plan::new(std::sync::Arc::new(board), String::new(), 0).status
            ),
            format!("{:?}", crate::broadcast_tower::project(photo, prefs).status),
            format!("{:?}", crate::delta::project(photo, prefs).status),
            format!("{:?}", crate::input_telemetry::project(photo, prefs).status),
            format!(
                "{:?}",
                crate::pedals_telemetry::project(photo, prefs).status
            ),
            format!("{:?}", crate::track_weather::project(photo, prefs).status),
            crate::fuel_strategy::project(photo, prefs)
                .status
                .map_or_else(|| "Ready".into(), |status| format!("{status:?}")),
        ]
    }

    #[test]
    fn widget_status_characterization_keeps_missing_stale_and_waiting_distinct() {
        let full = widget_photo();
        // Order: Standings, Broadcast, Delta, Input, Pedals, Weather, Fuel.
        for (filled, source, expected) in [
            (
                false,
                SourceState::Live,
                [
                    "Disconnected",
                    "Missing",
                    "Missing",
                    "Missing",
                    "Missing",
                    "Missing",
                    "Missing",
                ],
            ),
            (
                false,
                SourceState::Waiting,
                [
                    "Disconnected",
                    "Disconnected",
                    "Disconnected",
                    "Missing",
                    "Disconnected",
                    "Missing",
                    "Missing",
                ],
            ),
            (
                false,
                SourceState::Stale,
                [
                    "Stale", "Stale", "Stale", "Stale", "Stale", "Missing", "Missing",
                ],
            ),
            (false, SourceState::Lost, ["Disconnected"; 7]),
            (true, SourceState::Live, ["Ready"; 7]),
            (true, SourceState::Paused, ["Ready"; 7]),
            (true, SourceState::Stale, ["Stale"; 7]),
            (
                true,
                SourceState::Waiting,
                [
                    "Disconnected",
                    "Disconnected",
                    "Disconnected",
                    "Missing",
                    "Disconnected",
                    "Ready",
                    "Missing",
                ],
            ),
            (true, SourceState::Lost, ["Disconnected"; 7]),
        ] {
            let mut photo = if filled {
                full.clone()
            } else {
                Snapshot::default()
            };
            photo.state.source_state = source;
            assert_eq!(
                widget_statuses(&photo),
                expected,
                "filled={filled}, source={source:?}"
            );
        }
    }

    #[test]
    fn retained_projection_table_preserves_all_source_and_capability_states() {
        let mut s = Snapshot::default();
        for source in [
            SourceState::Waiting,
            SourceState::Live,
            SourceState::Paused,
            SourceState::Stale,
            SourceState::Lost,
        ] {
            s.state.source_state = source;
            for inputs in [
                Capability::Unsupported,
                Capability::Supported,
                Capability::WithData,
                Capability::Fresh,
            ] {
                s.state.capabilities.driver_inputs = inputs;
                for positions in [
                    Capability::Unsupported,
                    Capability::Supported,
                    Capability::WithData,
                    Capability::Fresh,
                ] {
                    s.state.capabilities.positions = positions;
                    assert_eq!(player_clock_frozen(&s), inputs == Capability::WithData);
                    let expected = match source {
                        SourceState::Paused => true,
                        SourceState::Live => {
                            inputs != Capability::WithData && positions != Capability::WithData
                        }
                        _ => false,
                    };
                    assert_eq!(
                        shows_last_live(&s),
                        expected,
                        "{source:?} {inputs:?} {positions:?}"
                    );
                }
            }
        }
    }
}
