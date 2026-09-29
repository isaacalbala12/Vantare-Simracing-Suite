//! Instrumentos de `PedalsAdvancedEfficiency`: valores presentes, incluso
//! obsoletos (con aviso), y barras redondeadas como el renderer productivo.
//! `Snapshot` no representa steering; su ausencia no invalida los pedales.

use crate::format::{self, Language, Preferences};
use crate::{Quality, Snapshot};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub status: Status,
    pub status_text: &'static str,
    /// C, B, T; fracciones redondeadas a porcentaje entero. Ausencia ≠ cero.
    pub pedals: [Option<f64>; 3],
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
        return format::rpm(Some(rad_s));
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
        .map(|p| p.telemetry)
        .unwrap_or_default();
    let pedals = [
        pedal(telemetry.clutch),
        pedal(telemetry.brake),
        pedal(telemetry.throttle),
    ];
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
    let status = if stale {
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
    };
    // La conversión y las unidades siguen perteneciendo al formateador común.
    let formatted_speed = format::speed(speed, prefs);
    let unit = match prefs.units {
        format::Units::Metric => "km/h",
        format::Units::Imperial => "mph",
    };
    let (speed, speed_unit) = formatted_speed
        .split_once(' ')
        .unwrap_or((&formatted_speed, unit));
    ViewModel {
        status,
        status_text,
        pedals,
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

    fn snapshot() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.player = Some(Player {
            telemetry: Telemetry {
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
        assert_eq!(vm.status_text, "SIN DATOS");
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
