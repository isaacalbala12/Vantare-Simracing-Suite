//! Proyección Eficiencia: consumo e historial canónicos, requerido para la sesión.

use crate::format::{self, Language, Preferences};
use crate::{Capability, Quality, Snapshot, SourceState};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Config {
    pub history_rows: u8,
    pub show_projection: bool,
    pub virtual_energy: bool,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            history_rows: 4,
            show_projection: true,
            virtual_energy: false,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LapsBasis {
    Fuel,
    Session,
}

impl LapsBasis {
    pub fn label(self, language: Language) -> &'static str {
        match (self, language) {
            (Self::Fuel, Language::Es) => "combustible",
            (Self::Fuel, Language::En) => "fuel",
            (Self::Session, Language::Es) => "sesión",
            (Self::Session, Language::En) => "session",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryRow {
    pub lap: String,
    pub consumed: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub show_projection: bool,
    pub status: Option<&'static str>,
    pub labels: [&'static str; 5],
    pub fuel: String,
    pub average: String,
    pub minimum: String,
    pub maximum: String,
    pub stops: String,
    pub stops_label: &'static str,
    pub laps: String,
    pub required: String,
    pub laps_basis: Option<LapsBasis>,
    pub finish: String,
    /// Más reciente primero, como el renderer productivo; solo presentación.
    pub history: Vec<HistoryRow>,
    pub history_label: &'static str,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_with_config(snapshot, prefs, Config::default())
}
pub fn project_with_config(snapshot: &Snapshot, prefs: Preferences, config: Config) -> ViewModel {
    let state = &snapshot.state;
    let fuel = state.player.map(|player| player.fuel).unwrap_or_default();
    let status = if state.source_state == SourceState::Lost {
        Some(match prefs.language {
            Language::Es => "DESCONECTADO",
            Language::En => "DISCONNECTED",
        })
    } else if state.source_state == SourceState::Waiting
        || state.player.is_none()
        || state.capabilities.fuel < Capability::WithData
    {
        Some(match prefs.language {
            Language::Es => "SIN DATOS",
            Language::En => "NO DATA",
        })
    } else if state.source_state == SourceState::Stale
        || state.capabilities.fuel == Capability::WithData
    {
        Some(match prefs.language {
            Language::Es => "DATOS ANTIGUOS",
            Language::En => "DATA OUT OF DATE",
        })
    } else {
        None
    };
    let status = status.or_else(|| {
        config.virtual_energy.then_some(match prefs.language {
            Language::Es => "ENERGÍA VIRTUAL NO DISPONIBLE EN LA SEÑAL EN VIVO",
            Language::En => "VIRTUAL ENERGY SIGNAL UNAVAILABLE",
        })
    });
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
    let session_laps = state.session.laps_remaining.current().copied();
    let (laps, laps_basis) = if let Some(laps) = current(&fuel.laps_left) {
        (Some(laps), Some(LapsBasis::Fuel))
    } else if let Some(laps) = session_laps.filter(|_| status.is_none()) {
        (Some(f64::from(laps)), Some(LapsBasis::Session))
    } else {
        (None, None)
    };
    let required = liters(
        current(&required_fuel(fuel.per_lap_l, state.session.laps_remaining)),
        1,
    );
    let required_label = match prefs.language {
        Language::Es => "NEC.",
        Language::En => "REQ",
    };
    let history = history_rows(&fuel, config.history_rows, prefs.language, status.is_none());
    let extremes = consumption_extremes(&fuel);
    let stops = (status.is_none() && config.show_projection)
        .then(|| required_stops(&fuel, state.session.laps_remaining))
        .flatten();
    ViewModel {
        show_projection: config.show_projection,
        status,
        labels: match prefs.language {
            Language::Es => ["COMBUSTIBLE", "MED.", "VUELTAS", "NEC.", "EST. META:"],
            Language::En => ["FUEL", "AVG", "LAPS", "REQ", "EST. FINISH:"],
        },
        fuel: liters(current(&fuel.level_l), 1),
        average: liters(current(&fuel.per_lap_l), 2),
        minimum: liters(extremes.filter(|_| status.is_none()).map(|v| v.0), 2),
        maximum: liters(extremes.filter(|_| status.is_none()).map(|v| v.1), 2),
        stops: decimal(stops, 0),
        stops_label: if prefs.language == Language::Es {
            "PARADAS"
        } else {
            "STOPS"
        },
        laps: decimal(laps.filter(|_| config.show_projection), 1),
        laps_basis: laps_basis.filter(|_| config.show_projection),
        finish: if !config.show_projection {
            format::PLACEHOLDER.into()
        } else if required == format::PLACEHOLDER {
            required.clone()
        } else {
            format!("{required} {required_label}")
        },
        required: if config.show_projection {
            required
        } else {
            format::PLACEHOLDER.into()
        },
        history,
        history_label: if prefs.language == Language::Es {
            "HISTORIAL"
        } else {
            "HISTORY"
        },
    }
}

// Extremos sobre todo el historial valido, no solo las filas visibles.
fn consumption_extremes(fuel: &crate::Fuel) -> Option<(f64, f64)> {
    let mut consumption = fuel
        .history
        .into_iter()
        .flatten()
        .map(|(_, liters)| liters)
        .filter(|v| v.is_finite() && *v > 0.0);
    let first = consumption.next()?;
    Some(consumption.fold((first, first), |(min, max), value| {
        (min.min(value), max.max(value))
    }))
}

fn required_stops(fuel: &crate::Fuel, laps: Quality<u32>) -> Option<f64> {
    let required = *required_fuel(fuel.per_lap_l, laps).current()?;
    let level = *fuel.level_l.current()?;
    let capacity = *fuel.capacity_l.current()?;
    if !level.is_finite()
        || level < 0.0
        || !capacity.is_finite()
        || capacity <= 0.0
        || level > capacity
    {
        return None;
    }
    let stops = ((required - level).max(0.0) / capacity).ceil();
    stops.is_finite().then_some(stops)
}

fn history_rows(
    fuel: &crate::Fuel,
    rows: u8,
    language: Language,
    available: bool,
) -> Vec<HistoryRow> {
    if available {
        fuel.history
            .into_iter()
            .flatten()
            .rev()
            .take(usize::from(rows.clamp(1, 8)))
            .filter(|(_, liters)| liters.is_finite() && *liters >= 0.0)
            .map(|(lap, consumed)| HistoryRow {
                lap: format!(
                    "{} {lap}",
                    if language == Language::Es {
                        "VUELTA"
                    } else {
                        "LAP"
                    }
                ),
                consumed: liters(Some(consumed), 1),
            })
            .collect()
    } else {
        Vec::new()
    }
}

/// Conserva la peor calidad de los dos operandos; no usa la autonomía del tanque.
fn required_fuel(per_lap: Quality<f64>, session_laps: Quality<u32>) -> Quality<f64> {
    let (per_lap, estimated, stale) = match per_lap {
        Quality::Reliable(v) => (v, false, false),
        Quality::Estimated(v) => (v, true, false),
        Quality::Stale(v) => (v, false, true),
        Quality::Unavailable => return Quality::Unavailable,
    };
    let (laps, estimated_laps, stale_laps) = match session_laps {
        Quality::Reliable(v) => (v, false, false),
        Quality::Estimated(v) => (v, true, false),
        Quality::Stale(v) => (v, false, true),
        Quality::Unavailable => return Quality::Unavailable,
    };
    let required = per_lap * f64::from(laps);
    if !per_lap.is_finite() || per_lap <= 0.0 || !required.is_finite() {
        Quality::Unavailable
    } else if stale || stale_laps {
        Quality::Stale(required)
    } else if estimated || estimated_laps {
        Quality::Estimated(required)
    } else {
        Quality::Reliable(required)
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
    #[test]
    fn fuel_variants_clip_history_hide_projection_and_declare_virtual_energy() {
        let mut fuel = Fuel {
            level_l: Quality::Reliable(42.0),
            ..Fuel::default()
        };
        for (i, row) in fuel.history.iter_mut().enumerate() {
            *row = Some((u32::try_from(i).expect("index"), 2.0));
        }
        let data = snapshot(&fuel);
        for rows in [1, 4, 8] {
            let vm = project_with_config(
                &data,
                Preferences::default(),
                Config {
                    history_rows: rows,
                    ..Config::default()
                },
            );
            assert_eq!(vm.history.len(), usize::from(rows));
            assert_eq!(vm.history[0].lap, "VUELTA 9");
        }
        let hidden = project_with_config(
            &data,
            Preferences::default(),
            Config {
                show_projection: false,
                ..Config::default()
            },
        );
        assert!(!hidden.show_projection);
        assert_eq!(hidden.laps, "—");
        assert_eq!(hidden.required, "—");
        let energy = project_with_config(
            &data,
            Preferences::default(),
            Config {
                virtual_energy: true,
                ..Config::default()
            },
        );
        assert_eq!(
            energy.status,
            Some("ENERGÍA VIRTUAL NO DISPONIBLE EN LA SEÑAL EN VIVO")
        );
        assert_eq!(energy.fuel, "—");
        assert!(energy.history.is_empty());
    }

    use super::*;
    use crate::{Capabilities, Fuel, Player, State};

    #[test]
    fn extremes_use_all_valid_history_and_stops_round_up_missing_fuel() {
        let mut fuel = Fuel {
            level_l: Quality::Reliable(10.0),
            capacity_l: Quality::Reliable(75.0),
            per_lap_l: Quality::Estimated(2.0),
            ..Fuel::default()
        };
        fuel.history[..6].copy_from_slice(&[
            Some((1, 1.25)),
            Some((2, 4.5)),
            Some((3, f64::NAN)),
            Some((4, -1.0)),
            Some((5, 0.0)),
            Some((6, 2.0)),
        ]);
        let mut data = snapshot(&fuel);
        data.state.session.laps_remaining = Quality::Reliable(43);
        let vm = project_with_config(
            &data,
            Preferences::default(),
            Config {
                history_rows: 1,
                ..Config::default()
            },
        );
        assert_eq!(
            (vm.minimum.as_str(), vm.maximum.as_str(), vm.stops.as_str()),
            ("1.25 L", "4.50 L", "2")
        );
        for (laps, stops) in [(0, "0"), (5, "0"), (42, "1"), (43, "2")] {
            data.state.session.laps_remaining = Quality::Reliable(laps);
            assert_eq!(project(&data, Preferences::default()).stops, stops);
        }
        for capacity in [
            Quality::Unavailable,
            Quality::Stale(75.0),
            Quality::Reliable(0.0),
            Quality::Reliable(5.0),
        ] {
            data.state.player.as_mut().expect("jugador").fuel.capacity_l = capacity;
            assert_eq!(project(&data, Preferences::default()).stops, "—");
        }
        data.state.player.as_mut().expect("jugador").fuel.capacity_l = Quality::Reliable(75.0);
        data.state.session.laps_remaining = Quality::Unavailable;
        assert_eq!(project(&data, Preferences::default()).stops, "—");
        data.state.source_state = SourceState::Stale;
        let vm = project(&data, Preferences::default());
        assert_eq!(
            (vm.minimum.as_str(), vm.maximum.as_str(), vm.stops.as_str()),
            ("—", "—", "—")
        );
    }

    #[test]
    fn session_projection_is_independent_of_tank_range() {
        let mut data = snapshot(&Fuel {
            per_lap_l: Quality::Reliable(2.14),
            ..Fuel::default()
        });
        data.state.session.laps_remaining = Quality::Reliable(79);
        let vm = project(&data, Preferences::default());
        assert_eq!(vm.laps, "79.0");
        assert_eq!(vm.laps_basis, Some(LapsBasis::Session));
        assert_eq!(vm.required, "169.1 L");
        if let Some(player) = &mut data.state.player {
            player.fuel.laps_left = Quality::Estimated(19.6);
        }
        let vm = project(&data, Preferences::default());
        assert_eq!(vm.laps, "19.6");
        assert_eq!(vm.laps_basis, Some(LapsBasis::Fuel));
        assert_eq!(vm.required, "169.1 L");
    }

    #[test]
    fn required_quality_and_history_are_not_reconstructed_from_the_tank() {
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Reliable(4)),
            Quality::Reliable(8.0)
        );
        assert_eq!(
            required_fuel(Quality::Estimated(2.0), Quality::Reliable(4)),
            Quality::Estimated(8.0)
        );
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Stale(4)),
            Quality::Stale(8.0)
        );
        assert_eq!(
            required_fuel(Quality::Stale(2.0), Quality::Estimated(4)),
            Quality::Stale(8.0)
        );
        for per_lap in [
            Quality::Unavailable,
            Quality::Reliable(0.0),
            Quality::Reliable(-1.0),
            Quality::Reliable(f64::NAN),
            Quality::Reliable(f64::MAX),
        ] {
            assert_eq!(
                required_fuel(per_lap, Quality::Reliable(4)),
                Quality::Unavailable
            );
        }
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Unavailable),
            Quality::Unavailable
        );
        assert_eq!(
            required_fuel(Quality::Reliable(2.0), Quality::Reliable(0)),
            Quality::Reliable(0.0)
        );
        let mut fuel = Fuel::default();
        for (index, entry) in fuel.history.iter_mut().enumerate() {
            *entry = Some((u32::try_from(index).expect("diez filas"), 2.0));
        }
        let vm = project(&snapshot(&fuel), Preferences::default());
        assert_eq!(
            vm.history
                .iter()
                .map(|row| row.lap.as_str())
                .collect::<Vec<_>>(),
            ["VUELTA 9", "VUELTA 8", "VUELTA 7", "VUELTA 6"]
        );
        assert_eq!(LapsBasis::Fuel.label(Language::Es), "combustible");
        assert_eq!(LapsBasis::Session.label(Language::Es), "sesión");
    }

    fn snapshot(fuel: &Fuel) -> Snapshot {
        Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                capabilities: Capabilities {
                    fuel: Capability::Fresh,
                    ..Capabilities::default()
                },
                player: Some(Player {
                    fuel: *fuel,
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
            let mut data = snapshot(&Fuel {
                history: Default::default(),
                level_l: Quality::Reliable(level),
                capacity_l: Quality::Reliable(100.0),
                per_lap_l: Quality::Estimated(average),
                laps_left: Quality::Estimated(laps),
                ..Fuel::default()
            });
            data.state.session.laps_remaining = Quality::Reliable(79);
            let vm = project(&data, Preferences::default());
            assert_eq!(
                [vm.fuel.as_str(), vm.average.as_str(), vm.laps.as_str()],
                expected
            );
            assert_eq!(
                vm.required,
                if average > 0.0 {
                    liters(Some(average * 79.0), 1)
                } else {
                    format::PLACEHOLDER.into()
                }
            );
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
            let data = snapshot(&Fuel {
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
            let mut data = snapshot(&Fuel::default());
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
        let data = snapshot(&Fuel {
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
