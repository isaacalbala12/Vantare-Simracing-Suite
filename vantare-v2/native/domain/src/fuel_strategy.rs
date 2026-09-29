//! Proyección Eficiencia de `FuelStrategyFunctional.tsx`, sin derivar consumo.
//!
//! `Fuel.laps_left` es autonomía, no vueltas de sesión. El modelo todavía no
//! representa `fuel.requiredFuel`, `fuel.history` ni la base de `estimatedLaps`.
//! Se muestran guiones y se omite el historial, nunca se reconstruyen en la UI.

use crate::format::{self, Language, Preferences};
use crate::{Capability, Quality, Snapshot};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub status: Option<&'static str>,
    pub labels: [&'static str; 5],
    pub fuel: String,
    pub average: String,
    pub laps: String,
    pub required: String,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let state = &snapshot.state;
    let fuel = state.player.map(|player| player.fuel).unwrap_or_default();
    let status = if state.player.is_none() || state.capabilities.fuel < Capability::WithData {
        Some(match prefs.language {
            Language::Es => "SIN DATOS",
            Language::En => "NO DATA",
        })
    } else if state.capabilities.fuel == Capability::WithData {
        Some(match prefs.language {
            Language::Es => "DATOS ANTIGUOS",
            Language::En => "DATA OUT OF DATE",
        })
    } else {
        None
    };
    let current = |value: &Quality<f64>| {
        if status.is_some() {
            None
        } else {
            value
                .current()
                .copied()
                .filter(|v| v.is_finite() && *v >= 0.0)
        }
    };
    ViewModel {
        status,
        labels: match prefs.language {
            Language::Es => ["COMBUSTIBLE", "MED.", "VUELTAS", "NEC.", "EST. META:"],
            Language::En => ["FUEL", "AVG", "LAPS", "REQ", "EST. FINISH:"],
        },
        fuel: liters(current(&fuel.level_l), 1),
        average: liters(current(&fuel.per_lap_l), 2),
        laps: decimal(current(&fuel.laps_left), 1),
        required: format::PLACEHOLDER.into(),
    }
}

fn liters(value: Option<f64>, decimals: u8) -> String {
    match value {
        Some(value) => format!("{} L", decimal(Some(value), decimals)),
        None => format::PLACEHOLDER.into(),
    }
}

// `format::to_fixed` es privado. Mantener aquí el desempate de JS hasta que el
// formateador compartido exponga decimales (2.25 → 2.3, no el empate al par).
#[allow(clippy::float_cmp)] // La igualdad exacta identifica el empate binario.
fn decimal(value: Option<f64>, decimals: u8) -> String {
    let Some(value) = value else {
        return format::PLACEHOLDER.into();
    };
    let scale = 10_f64.powi(i32::from(decimals));
    let scaled = value * scale;
    let tie = scaled.fract() == 0.5 && scaled / scale == value;
    let rounded = if tie {
        (scaled.floor() + 1.0) / scale
    } else {
        value
    };
    format!("{:.*}", usize::from(decimals), rounded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Capabilities, Fuel, Player, State};

    fn snapshot(fuel: Fuel) -> Snapshot {
        Snapshot {
            state: State {
                capabilities: Capabilities {
                    fuel: Capability::Fresh,
                    ..Capabilities::default()
                },
                player: Some(Player {
                    fuel,
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn canonical_values_and_zero_are_not_recomputed() {
        for (level, average, laps, expected) in [
            (42.0, 2.14, 19.625, ["42.0 L", "2.14 L", "19.6"]),
            (0.0, 0.0, 0.0, ["0.0 L", "0.00 L", "0.0"]),
            (2.25, 0.125, 2.25, ["2.3 L", "0.13 L", "2.3"]),
        ] {
            let mut data = snapshot(Fuel {
                level_l: Quality::Reliable(level),
                capacity_l: Quality::Reliable(100.0),
                per_lap_l: Quality::Estimated(average),
                laps_left: Quality::Estimated(laps),
            });
            data.state.session.laps_remaining = Quality::Reliable(79);
            let vm = project(&data, Preferences::default());
            assert_eq!(
                [vm.fuel.as_str(), vm.average.as_str(), vm.laps.as_str()],
                expected
            );
            assert_eq!(vm.required, format::PLACEHOLDER);
            assert_eq!(vm.status, None);
        }
    }

    #[test]
    fn missing_stale_and_invalid_values_never_become_zero() {
        for value in [
            Quality::Unavailable,
            Quality::Stale(42.0),
            Quality::Reliable(-1.0),
            Quality::Reliable(f64::NAN),
            Quality::Estimated(f64::INFINITY),
        ] {
            let data = snapshot(Fuel {
                level_l: value,
                per_lap_l: value,
                laps_left: value,
                ..Fuel::default()
            });
            let vm = project(&data, Preferences::default());
            assert_eq!(
                [vm.fuel.as_str(), vm.average.as_str(), vm.laps.as_str()],
                [format::PLACEHOLDER; 3]
            );
        }
    }

    #[test]
    fn empty_and_capability_states_have_translated_status() {
        for (capability, expected) in [
            (Capability::Unsupported, Some("SIN DATOS")),
            (Capability::Supported, Some("SIN DATOS")),
            (Capability::WithData, Some("DATOS ANTIGUOS")),
            (Capability::Fresh, None),
        ] {
            let mut data = snapshot(Fuel::default());
            data.state.capabilities.fuel = capability;
            assert_eq!(project(&data, Preferences::default()).status, expected);
        }
        let prefs = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        assert_eq!(project(&Snapshot::default(), prefs).status, Some("NO DATA"));
    }

    #[test]
    fn widget_contract_keeps_liters_in_imperial_preferences() {
        let data = snapshot(Fuel {
            level_l: Quality::Reliable(42.0),
            ..Fuel::default()
        });
        let prefs = Preferences {
            language: Language::En,
            units: format::Units::Imperial,
        };
        let vm = project(&data, prefs);
        assert_eq!(vm.fuel, "42.0 L");
        assert_eq!(vm.labels, ["FUEL", "AVG", "LAPS", "REQ", "EST. FINISH:"]);
    }
}
