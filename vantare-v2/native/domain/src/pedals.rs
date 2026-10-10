//! ViewModel de pedales: entradas del jugador y estado del tren motriz.

use crate::format::{self, Language, Preferences, Units};
use crate::{Capability, Quality, Snapshot, SourceState};

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub transparent_background: bool,
    pub status_text: Option<&'static str>,
    pub inputs: Capability,
    pub powertrain: Capability,
    /// Fracciones 0–1 para las barras; `None` si no hay dato (barra vacía, no 0).
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
    pub clutch: Option<f64>,
    pub throttle_text: String,
    pub brake_text: String,
    pub clutch_text: String,
    pub gear: String,
    pub speed: String,
    pub rpm: String,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let state = &snapshot.state;
    let telemetry = state
        .player
        .filter(|_| !matches!(state.source_state, SourceState::Waiting | SourceState::Lost))
        .map(|p| p.telemetry)
        .unwrap_or_default();
    let throttle = fraction(&telemetry.throttle);
    let brake = fraction(&telemetry.brake);
    let clutch = fraction(&telemetry.clutch);
    let has_stale = state.source_state == SourceState::Stale
        || matches!(telemetry.gear, Quality::Stale(_))
        || [
            telemetry.throttle,
            telemetry.brake,
            telemetry.clutch,
            telemetry.speed_mps,
            telemetry.engine_speed_rad_s,
        ]
        .iter()
        .any(|v| matches!(v, Quality::Stale(_)));
    let missing = [throttle, brake, clutch].contains(&None);
    let status_text = match (state.source_state, has_stale, missing, prefs.language) {
        (SourceState::Waiting | SourceState::Lost, _, _, Language::Es) => Some("DESCONECTADO"),
        (SourceState::Waiting | SourceState::Lost, _, _, Language::En) => Some("DISCONNECTED"),
        (_, true, _, Language::Es) => Some("DATOS ANTIGUOS"),
        (_, true, _, Language::En) => Some("DATA OUT OF DATE"),
        (_, _, true, Language::Es) => Some("SIN DATOS"),
        (_, _, true, Language::En) => Some("NO DATA"),
        _ => None,
    };
    ViewModel {
        transparent_background: false,
        status_text,
        inputs: state.capabilities.driver_inputs,
        powertrain: state.capabilities.powertrain,
        throttle,
        brake,
        clutch,
        throttle_text: percent(throttle),
        brake_text: percent(brake),
        clutch_text: percent(clutch),
        gear: format::gear(telemetry.gear.current().copied()),
        // El productivo usa Math.round: se prerredondea en la unidad visible
        // para que el formato al par no deje 2,5 km/h en 2 (ver input_telemetry).
        speed: format::speed(
            telemetry.speed_mps.current().copied().map(|v| {
                let factor = match prefs.units {
                    Units::Metric => 3.6,
                    Units::Imperial => 2.236_936_292_054_4,
                };
                (v * factor).round() / factor
            }),
            prefs,
        ),
        rpm: format::rpm(telemetry.engine_speed_rad_s.current().copied().map(|v| {
            let factor = 30.0 / std::f64::consts::PI;
            (v * factor).round() / factor
        })),
    }
}

fn percent(value: Option<f64>) -> String {
    // Math.round del producto redondea los empates hacia arriba (entradas 0–1).
    format::percent(value.map(|value| (value * 100.0).round() / 100.0))
}

fn fraction(value: &Quality<f64>) -> Option<f64> {
    match value {
        Quality::Reliable(v) | Quality::Estimated(v) | Quality::Stale(v) => Some(*v),
        Quality::Unavailable => None,
    }
    .filter(|v| v.is_finite())
    .map(|v| v.clamp(0.0, 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format::{Language, Units};
    use crate::{Player, State, Telemetry};
    use Quality::{Reliable, Stale};

    #[test]
    fn projects_inputs_and_powertrain_with_preferences() {
        let snapshot = Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                player: Some(Player {
                    telemetry: Telemetry {
                        steering: Reliable(0.0),
                        throttle: Reliable(0.734),
                        brake: Reliable(1.2),
                        clutch: Stale(0.5),
                        gear: Reliable(3),
                        speed_mps: Reliable(50.0),
                        engine_speed_rad_s: Reliable(785.398_163_397),
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        };
        let prefs = Preferences {
            units: Units::Imperial,
            language: Language::En,
        };

        let vm = project(&snapshot, prefs);

        assert_eq!(vm.throttle, Some(0.734));
        assert_eq!(vm.brake, Some(1.0), "se recorta a 0–1");
        assert_eq!(
            vm.clutch,
            Some(0.5),
            "el productivo conserva el valor obsoleto con aviso"
        );
        assert_eq!(vm.status_text, Some("DATA OUT OF DATE"));
        assert_eq!(vm.clutch_text, "50%");
        assert_eq!((vm.throttle_text.as_str(), vm.gear.as_str()), ("73%", "3"));
        assert_eq!((vm.speed.as_str(), vm.rpm.as_str()), ("112 mph", "7500"));
    }

    #[test]
    fn pedal_percent_rounds_half_up_like_the_product_renderer() {
        let snapshot = Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                player: Some(Player {
                    telemetry: Telemetry {
                        throttle: Reliable(0.985),
                        brake: Reliable(0.125),
                        clutch: Reliable(0.065),
                        ..Telemetry::default()
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        };
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(
            (
                vm.throttle_text.as_str(),
                vm.brake_text.as_str(),
                vm.clutch_text.as_str()
            ),
            ("99%", "13%", "7%")
        );
    }

    #[test]
    fn without_a_player_everything_is_missing() {
        let vm = project(&Snapshot::default(), Preferences::default());
        assert_eq!(
            (vm.throttle, vm.gear.as_str(), vm.speed.as_str()),
            (None, format::PLACEHOLDER, format::PLACEHOLDER)
        );
    }

    #[test]
    fn stale_powertrain_warns_even_with_fresh_pedals() {
        let snapshot = Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                player: Some(Player {
                    telemetry: Telemetry {
                        throttle: Reliable(0.5),
                        brake: Reliable(0.0),
                        clutch: Reliable(0.0),
                        steering: Reliable(0.0),
                        gear: Stale(3),
                        speed_mps: Stale(50.0),
                        engine_speed_rad_s: Stale(785.398_163_397),
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        };
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(vm.gear.as_str(), format::PLACEHOLDER);
        assert_eq!(vm.status_text, Some("DATOS ANTIGUOS"));
    }

    #[test]
    fn regression_1549_half_speed_rounds_up_like_input_telemetry() {
        let snapshot = Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                player: Some(Player {
                    telemetry: Telemetry {
                        steering: Reliable(0.0),
                        throttle: Reliable(0.5),
                        brake: Reliable(0.5),
                        clutch: Reliable(0.5),
                        gear: Reliable(3),
                        speed_mps: Reliable(2.5 / 3.6),
                        engine_speed_rad_s: Reliable(2.5 * std::f64::consts::PI / 30.0),
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        };
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(vm.speed, "3 km/h");
        assert_eq!(vm.rpm, "3");
    }
}
