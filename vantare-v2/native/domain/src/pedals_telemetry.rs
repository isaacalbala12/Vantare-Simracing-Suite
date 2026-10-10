//! Instrumentos de `PedalsAdvancedEfficiency`: valores presentes, incluso
//! obsoletos (con aviso), y barras redondeadas como el renderer productivo.
//! Steering ausente no invalida los pedales; conserva el volante neutro.

use crate::format::{self, Language, Preferences};
use crate::{Quality, Snapshot, SourceState};

pub const WHEELS: &[&str] = &[
    "generic",
    "alpine-a424",
    "aston-martin-valkyrie",
    "bmw-m-hybrid-v8-pre-le-mans",
    "bmw-m-hybrid-v8",
    "cadillac-v-series-r",
    "ferrari-499p",
    "genesis-gmr-001",
    "glickenhaus-scg007",
    "isotta-fraschini-tipo6",
    "lamborghini-sc63",
    "peugeot-9x8",
    "peugeot-9x8-2024",
    "porsche-963",
    "toyota-gr010",
    "toyota-tr010",
    "vanwall-vandervell-680",
    "aston-martin-vantage-gt3",
    "bmw-m4-gt3",
    "corvette-z06-gt3",
    "ferrari-296-gt3",
    "ford-mustang-gt3",
    "lamborghini-huracan-gt3",
    "lexus-rc-f-gt3",
    "mclaren-720s-gt3",
    "mercedes-amg-gt3",
    "porsche-911-gt3-r",
    "oreca-07",
    "adess-ad25",
    "duqueine-d09",
    "ginetta-g61-lt-p3-evo",
    "ligier-js-p325",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
    Disconnected,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub steering_wheel: &'static str,
    pub show_clutch: bool,
    pub status: Status,
    pub status_text: &'static str,
    /// C, B, T; fracciones redondeadas a porcentaje entero. Ausencia ≠ cero.
    pub pedals: [Option<f64>; 3],
    /// Entrada normalizada −1..1; ausencia ≠ centro medido.
    pub steering: Option<f64>,
    pub gear: String,
    pub speed: String,
    pub speed_unit: String,
    pub rpm: String,
}

// El productivo conserva valores stale y atenúa el grupo, a diferencia del
// widget de pedales básico. No convertir Unavailable a cero.
fn displayed<T: Copy>(value: Quality<T>) -> Option<T> {
    match value {
        Quality::Reliable(value) | Quality::Estimated(value) | Quality::Stale(value) => Some(value),
        Quality::Unavailable => None,
    }
}

fn pedal(value: Quality<f64>) -> Option<f64> {
    displayed(value)
        .filter(|v| v.is_finite())
        .map(|v| (v.clamp(0.0, 1.0) * 100.0).round() / 100.0)
}

#[allow(clippy::float_cmp)] // El empate exacto es parte de toFixed, no una tolerancia.
fn compact_rpm(rad_s: Option<f64>) -> String {
    let Some(rad_s) = rad_s.filter(|v| v.is_finite() && *v >= 0.0) else {
        return format::PLACEHOLDER.into();
    };
    // Dividir por la unidad evita desplazar 1000 rpm bajo el umbral al
    // multiplicar primero por 30 (error de representación binaria).
    let rpm = rad_s / (std::f64::consts::PI / 30.0);
    if !rpm.is_finite() {
        return format::PLACEHOLDER.into();
    }
    if rpm < 1000.0 {
        // El productivo usa Math.round: se prerredondea para que el formato
        // al par no deje 2,5 rpm en 2 (ver input_telemetry).
        let factor = 30.0 / std::f64::consts::PI;
        return format::rpm(Some((rad_s * factor).round() / factor));
    }
    // toFixed(1) de JS: empate exacto hacia arriba, resto al más cercano.
    // Candidato a domain::format cuando haya un segundo consumidor nativo.
    let thousands = rpm / 1000.0;
    let scaled = thousands * 10.0;
    let tie = scaled.fract() == 0.5 && scaled / 10.0 == thousands;
    let rounded = if tie {
        (scaled.floor() + 1.0) / 10.0
    } else {
        thousands
    };
    format!("{rounded:.1}k")
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let telemetry = snapshot
        .state
        .player
        .filter(|_| {
            !matches!(
                snapshot.state.source_state,
                SourceState::Waiting | SourceState::Lost
            )
        })
        .map(|p| p.telemetry)
        .unwrap_or_default();
    let pedals = [
        pedal(telemetry.clutch),
        pedal(telemetry.brake),
        pedal(telemetry.throttle),
    ];
    let steering = displayed(telemetry.steering)
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(-1.0, 1.0));
    let speed = displayed(telemetry.speed_mps).filter(|v| v.is_finite() && *v >= 0.0);
    let rpm = displayed(telemetry.engine_speed_rad_s).filter(|v| v.is_finite() && *v >= 0.0);
    let gear = displayed(telemetry.gear).filter(|gear| *gear >= -1);
    let stale = matches!(telemetry.gear, Quality::Stale(_))
        || [
            telemetry.clutch,
            telemetry.brake,
            telemetry.throttle,
            telemetry.speed_mps,
            telemetry.engine_speed_rad_s,
        ]
        .iter()
        .any(|v| matches!(v, Quality::Stale(_)));
    let status = if matches!(
        snapshot.state.source_state,
        SourceState::Waiting | SourceState::Lost
    ) {
        Status::Disconnected
    } else if snapshot.state.source_state == SourceState::Stale || stale {
        Status::Stale
    } else if pedals.contains(&None) || speed.is_none() || rpm.is_none() || gear.is_none() {
        Status::Missing
    } else {
        Status::Ready
    };
    let status_text = match (status, prefs.language) {
        (Status::Ready, _) => "",
        (Status::Missing, Language::Es) => "SIN DATOS",
        (Status::Missing, Language::En) => "NO DATA",
        (Status::Stale, Language::Es) => "DATOS ANTIGUOS",
        (Status::Stale, Language::En) => "DATA OUT OF DATE",
        (Status::Disconnected, Language::Es) => "DESCONECTADO",
        (Status::Disconnected, Language::En) => "DISCONNECTED",
    };
    // La conversión y las unidades siguen perteneciendo al formateador común.
    // El productivo usa Math.round: se prerredondea en la unidad visible
    // para que el formato al par no deje 2,5 km/h en 2 (ver input_telemetry).
    let speed_factor = match prefs.units {
        format::Units::Metric => 3.6,
        format::Units::Imperial => 2.236_936_292_054_4,
    };
    let formatted_speed = format::speed(
        speed.map(|v| (v * speed_factor).round() / speed_factor),
        prefs,
    );
    let unit = match prefs.units {
        format::Units::Metric => "km/h",
        format::Units::Imperial => "mph",
    };
    let (speed, speed_unit) = formatted_speed
        .split_once(' ')
        .unwrap_or((&formatted_speed, unit));
    ViewModel {
        steering_wheel: "generic",
        show_clutch: true,
        status,
        status_text,
        pedals,
        steering,
        gear: format::gear(gear),
        speed: speed.into(),
        speed_unit: speed_unit.into(),
        rpm: compact_rpm(rpm),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Player, Telemetry};

    #[test]
    fn steering_changes_the_visible_projection() {
        let mut data = snapshot();
        let neutral = project(&data, Preferences::default());
        if let Some(player) = &mut data.state.player {
            player.telemetry.steering = Quality::Reliable(0.08);
        }
        assert_ne!(project(&data, Preferences::default()), neutral);
    }

    #[test]
    #[allow(clippy::too_many_lines)] // Matriz única de los trece renderers y dos idiomas.
    fn source_states_follow_each_productive_renderer_even_with_fresh_fields() {
        let mut data = snapshot();
        data.state.capabilities.positions = crate::Capability::Fresh;
        data.state.capabilities.spatial = crate::Capability::Fresh;
        data.state.capabilities.lap_times = crate::Capability::Fresh;
        data.state.capabilities.fuel = crate::Capability::Fresh;
        data.state.capabilities.damage = crate::Capability::Fresh;
        data.state.capabilities.weather = crate::Capability::Fresh;
        data.state.session.track_name = Quality::Reliable("test".into());
        data.state.session.weather.air_temperature_k = Quality::Reliable(295.15);
        data.state.flags = Quality::Reliable(vec![crate::Flag {
            kind: crate::FlagKind::Green,
            scope: crate::FlagScope::Session,
        }]);
        let player = data.state.player.as_mut().expect("jugador del test");
        player.car = crate::CarId(1);
        player.delta_best_s = Quality::Reliable(0.1);
        player.damage.aero = Quality::Reliable(0.9);
        player.fuel.laps_left = Quality::Reliable(2.0);
        data.state.cars.push(crate::Car {
            id: crate::CarId(1),
            position: Quality::Reliable(1),
            pose: Quality::Reliable(crate::Pose::default()),
            ..crate::Car::default()
        });
        let geometry = crate::track_map::Geometry {
            track_name: "test",
            label: "test",
            points_m: &[(0.0, 0.0), (10.0, 10.0), (10.0, 0.0)],
            synthetic: false,
        };
        for (source, es, en) in [
            (SourceState::Waiting, "SIN DATOS", "NO DATA"),
            (SourceState::Live, "", ""),
            (SourceState::Stale, "DATOS ANTIGUOS", "DATA OUT OF DATE"),
            (SourceState::Lost, "DESCONECTADO", "DISCONNECTED"),
        ] {
            data.state.source_state = source;
            for (language, expected) in [(Language::Es, es), (Language::En, en)] {
                let prefs = Preferences {
                    language,
                    ..Preferences::default()
                };
                let disconnected = if source == SourceState::Waiting {
                    if language == Language::Es {
                        "DESCONECTADO"
                    } else {
                        "DISCONNECTED"
                    }
                } else {
                    expected
                };
                assert_eq!(project(&data, prefs).status_text, disconnected);
                assert_eq!(
                    crate::fuel_strategy::project(&data, prefs)
                        .status
                        .unwrap_or(""),
                    expected
                );
                let tower = crate::broadcast_tower::project(&data, prefs);
                assert_eq!(
                    crate::broadcast_tower::status_text(tower.status, language),
                    disconnected
                );
                assert_eq!(
                    crate::pedals::project(&data, prefs)
                        .status_text
                        .unwrap_or(""),
                    disconnected
                );
                assert_eq!(
                    crate::delta::project(&data, prefs)
                        .status_text
                        .unwrap_or(""),
                    disconnected
                );
                assert_eq!(
                    crate::car_damage_visual::project(&data, prefs)
                        .status
                        .unwrap_or(""),
                    expected
                );
                assert_eq!(
                    crate::car_damage_numbers::project(&data, prefs, true)
                        .status_text
                        .unwrap_or(""),
                    expected
                );
                assert_eq!(
                    crate::track_weather::project(&data, prefs).status_text,
                    if source == SourceState::Waiting {
                        ""
                    } else {
                        expected
                    }
                );
                let available = matches!(source, SourceState::Live | SourceState::Stale);
                assert_eq!(
                    !crate::standings::project(&data, prefs).rows.is_empty(),
                    available
                );
                assert_eq!(
                    crate::radar::project(&data).available,
                    source == SourceState::Live
                );
                assert_eq!(
                    crate::fastest_lap::project(&data, prefs).ready,
                    source == SourceState::Live
                );
                assert_eq!(
                    crate::racing_flags::project(&data, prefs).flag.is_some(),
                    source != SourceState::Lost
                );
                let map = crate::track_map::project_with_geometry(&data, prefs, Some(&geometry));
                assert_eq!(!map.outline.is_empty(), available);
                if !available {
                    assert_eq!(
                        map.empty_text,
                        if language == Language::Es {
                            "SIN TELEMETRÍA"
                        } else {
                            "NO TELEMETRY"
                        }
                    );
                    assert_eq!(project(&data, prefs).steering, None);
                    assert!(crate::radar::project(&data).cars.is_empty());
                    assert_eq!(crate::pedals::project(&data, prefs).throttle, None);
                    assert_eq!(crate::delta::project(&data, prefs).progress, None);
                }
            }
        }
    }

    #[test]
    fn steering_clamps_and_preserves_absence_and_stale_values() {
        for (quality, expected) in [
            (Quality::Reliable(-2.0), Some(-1.0)),
            (Quality::Estimated(2.0), Some(1.0)),
            (Quality::Reliable(0.0), Some(0.0)),
            (Quality::Stale(0.08), Some(0.08)),
            (Quality::Reliable(f64::NAN), None),
            (Quality::Unavailable, None),
        ] {
            let mut data = snapshot();
            data.state
                .player
                .as_mut()
                .expect("jugador")
                .telemetry
                .steering = quality;
            assert_eq!(project(&data, Preferences::default()).steering, expected);
        }
    }

    fn snapshot() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.player = Some(Player {
            telemetry: Telemetry {
                steering: Quality::Unavailable,
                clutch: Quality::Reliable(0.06),
                brake: Quality::Reliable(0.125),
                throttle: Quality::Reliable(0.75),
                gear: Quality::Reliable(4),
                speed_mps: Quality::Reliable(50.0),
                engine_speed_rad_s: Quality::Reliable(7200.0 * std::f64::consts::PI / 30.0),
            },
            ..Player::default()
        });
        snapshot
    }

    #[test]
    fn quality_clamps_rounding_and_status_are_observable() {
        for (quality, expected, status) in [
            (Quality::Reliable(0.0), Some(0.0), Status::Ready),
            (Quality::Reliable(0.125), Some(0.13), Status::Ready),
            (Quality::Estimated(1.4), Some(1.0), Status::Ready),
            (Quality::Reliable(-0.2), Some(0.0), Status::Ready),
            (Quality::Stale(0.2), Some(0.2), Status::Stale),
            (Quality::Unavailable, None, Status::Missing),
            (Quality::Reliable(f64::NAN), None, Status::Missing),
            (Quality::Reliable(f64::INFINITY), None, Status::Missing),
        ] {
            let mut snapshot = snapshot();
            if let Some(player) = &mut snapshot.state.player {
                player.telemetry.brake = quality;
            }
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(vm.pedals[1], expected);
            assert_eq!(vm.status, status);
        }
    }

    #[test]
    fn regression_1549_half_speed_rounds_up_like_input_telemetry() {
        let mut data = snapshot();
        let player = data.state.player.as_mut().expect("jugador");
        player.telemetry.speed_mps = Quality::Reliable(2.5 / 3.6);
        player.telemetry.engine_speed_rad_s = Quality::Reliable(2.5 * std::f64::consts::PI / 30.0);
        let vm = project(&data, Preferences::default());
        assert_eq!((vm.speed.as_str(), vm.speed_unit.as_str()), ("3", "km/h"));
        assert_eq!(vm.rpm, "3");
    }

    #[test]
    fn fixture_instruments_units_and_missing_values() {
        for (units, speed, unit) in [
            (format::Units::Metric, "180", "km/h"),
            (format::Units::Imperial, "112", "mph"),
        ] {
            let vm = project(
                &snapshot(),
                Preferences {
                    units,
                    language: Language::Es,
                },
            );
            assert_eq!((vm.gear.as_str(), vm.rpm.as_str()), ("4", "7.2k"));
            assert_eq!((vm.speed.as_str(), vm.speed_unit.as_str()), (speed, unit));
            assert_eq!(vm.status, Status::Ready);
        }
        let vm = project(&Snapshot::default(), Preferences::default());
        assert_eq!(vm.pedals, [None; 3]);
        assert_eq!(vm.status_text, "DESCONECTADO");
        assert_eq!(
            (vm.gear.as_str(), vm.speed.as_str(), vm.rpm.as_str()),
            ("—", "—", "—")
        );
    }

    #[test]
    fn compact_rpm_and_gears_match_the_product() {
        for (rpm, expected) in [
            (0.0, "0"),
            (999.0, "999"),
            (1000.0, "1.0k"),
            (1250.0, "1.3k"),
            (7200.0, "7.2k"),
            (-1.0, "—"),
            (f64::NAN, "—"),
        ] {
            assert_eq!(
                compact_rpm(Some(rpm * std::f64::consts::PI / 30.0)),
                expected
            );
        }
        for (gear, expected) in [
            (Quality::Reliable(-1), "R"),
            (Quality::Reliable(-2), "—"),
            (Quality::Reliable(0), "N"),
            (Quality::Stale(3), "3"),
            (Quality::Unavailable, "—"),
        ] {
            let mut snapshot = snapshot();
            if let Some(player) = &mut snapshot.state.player {
                player.telemetry.gear = gear;
            }
            assert_eq!(project(&snapshot, Preferences::default()).gear, expected);
        }
    }
}
