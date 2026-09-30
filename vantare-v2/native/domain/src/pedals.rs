//! ViewModel de pedales: entradas del jugador y estado del tren motriz.

use crate::format::{self, Preferences};
use crate::{Capability, Quality, Snapshot};

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
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
    let telemetry = state.player.map(|p| p.telemetry).unwrap_or_default();
    let throttle = fraction(&telemetry.throttle);
    let brake = fraction(&telemetry.brake);
    let clutch = fraction(&telemetry.clutch);
    ViewModel {
        inputs: state.capabilities.driver_inputs,
        powertrain: state.capabilities.powertrain,
        throttle,
        brake,
        clutch,
        throttle_text: percent(throttle),
        brake_text: percent(brake),
        clutch_text: percent(clutch),
        gear: format::gear(telemetry.gear.current().copied()),
        speed: format::speed(telemetry.speed_mps.current().copied(), prefs),
        rpm: format::rpm(telemetry.engine_speed_rad_s.current().copied()),
    }
}

fn percent(value: Option<f64>) -> String {
    // Math.round del producto redondea los empates hacia arriba (entradas 0–1).
    format::percent(value.map(|value| (value * 100.0).round() / 100.0))
}

fn fraction(value: &Quality<f64>) -> Option<f64> {
    value
        .current()
        .copied()
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
        assert_eq!(vm.clutch, None, "un dato obsoleto no dibuja la barra");
        assert_eq!(vm.clutch_text, format::PLACEHOLDER);
        assert_eq!((vm.throttle_text.as_str(), vm.gear.as_str()), ("73%", "3"));
        assert_eq!((vm.speed.as_str(), vm.rpm.as_str()), ("112 mph", "7500"));
    }

    #[test]
    fn pedal_percent_rounds_half_up_like_the_product_renderer() {
        let snapshot = Snapshot {
            state: State {
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
}
