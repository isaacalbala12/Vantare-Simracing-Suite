//! Proyección de `InputTelemetryFunctional`: marcha, velocidad, RPM y pedales.
//! `Snapshot` no contiene `controls.history` ni estado/motivo de conexión:
//! no se reconstruyen series en el widget ni se inventa un estado de transporte.

use crate::format::{self, Language, Preferences, Units};
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
    pub status_text: Option<&'static str>,
    pub gear: String,
    pub speed: String,
    pub rpm: String,
    pub speed_label: &'static str,
    /// Embrague, freno y acelerador. Porcentaje redondeado como el CSS, o ausencia.
    pub pedals: [Option<f64>; 3],
    pub pedal_labels: [&'static str; 3],
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let telemetry = snapshot
        .state
        .player
        .map(|p| p.telemetry)
        .unwrap_or_default();
    let pedals = [telemetry.clutch, telemetry.brake, telemetry.throttle].map(|q| {
        displayed(&q)
            .filter(|v| v.is_finite())
            .map(|v| (v.clamp(0.0, 1.0) * 100.0).round())
    });
    let gear = displayed(&telemetry.gear);
    let speed_mps = nonnegative(&telemetry.speed_mps);
    let engine_speed = nonnegative(&telemetry.engine_speed_rad_s);
    let status = if pedals.iter().all(Option::is_none)
        && gear.is_none()
        && speed_mps.is_none()
        && engine_speed.is_none()
    {
        Status::Missing
    } else if matches!(telemetry.gear, Quality::Stale(_))
        || [
            telemetry.clutch,
            telemetry.brake,
            telemetry.throttle,
            telemetry.speed_mps,
            telemetry.engine_speed_rad_s,
        ]
        .iter()
        .any(|q| matches!(q, Quality::Stale(v) if v.is_finite()))
    {
        Status::Stale
    } else {
        Status::Ready
    };
    let (speed_label, pedal_labels, missing, stale) = match prefs.language {
        Language::Es => (
            "VELOCIDAD",
            ["EMBRAGUE", "FRENO", "ACELERADOR"],
            "SIN DATOS",
            "DATOS ANTIGUOS",
        ),
        Language::En => (
            "SPEED",
            ["CLUTCH", "BRAKE", "THROTTLE"],
            "NO DATA",
            "STALE DATA",
        ),
    };
    // El productivo usa Math.round, KPH y R1; el formateador común usa km/h y R.
    // Estas adaptaciones concretas permanecen aquí hasta tener otro consumidor.
    let speed_factor = match prefs.units {
        Units::Metric => 3.6,
        Units::Imperial => 2.236_936_292_054_4,
    };
    ViewModel {
        status,
        status_text: match status {
            Status::Ready => None,
            Status::Missing => Some(missing),
            Status::Stale => Some(stale),
        },
        gear: match gear {
            Some(g) if g < 0 => format!("R{}", i16::from(g).abs()),
            _ => format::gear(gear),
        },
        speed: format::speed(
            speed_mps.map(|v| (v * speed_factor).round() / speed_factor),
            prefs,
        )
        .replace("km/h", "KPH"),
        rpm: format::rpm(engine_speed.map(|v| {
            let factor = 30.0 / std::f64::consts::PI;
            (v * factor).round() / factor
        })),
        speed_label,
        pedals,
        pedal_labels,
    }
}

// El productivo conserva los valores stale, acompañados de su aviso visible.
fn displayed<T: Copy>(quality: &Quality<T>) -> Option<T> {
    match quality {
        Quality::Reliable(v) | Quality::Estimated(v) | Quality::Stale(v) => Some(*v),
        Quality::Unavailable => None,
    }
}

fn nonnegative(quality: &Quality<f64>) -> Option<f64> {
    displayed(quality).filter(|v| v.is_finite() && *v >= 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Player, Telemetry};

    fn snapshot(telemetry: Telemetry) -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.player = Some(Player {
            telemetry,
            ..Player::default()
        });
        snapshot
    }

    #[test]
    fn quality_and_rounding_never_replace_missing_with_zero() {
        for (input, expected, status) in [
            (Quality::Unavailable, None, Status::Missing),
            (Quality::Reliable(f64::NAN), None, Status::Missing),
            (Quality::Reliable(f64::INFINITY), None, Status::Missing),
            (Quality::Reliable(0.0), Some(0.0), Status::Ready),
            (Quality::Reliable(0.125), Some(13.0), Status::Ready),
            (Quality::Estimated(0.75), Some(75.0), Status::Ready),
            (Quality::Stale(0.75), Some(75.0), Status::Stale),
            (Quality::Reliable(-0.1), Some(0.0), Status::Ready),
            (Quality::Reliable(1.2), Some(100.0), Status::Ready),
        ] {
            let vm = project(
                &snapshot(Telemetry {
                    throttle: input,
                    ..Telemetry::default()
                }),
                Preferences::default(),
            );
            assert_eq!(vm.pedals, [None, None, expected]);
            assert_eq!(vm.status, status);
        }
        let vm = project(&Snapshot::default(), Preferences::default());
        assert_eq!(vm.status_text, Some("SIN DATOS"));
        assert_eq!(
            (vm.gear.as_str(), vm.speed.as_str(), vm.rpm.as_str()),
            ("—", "—", "—")
        );
    }

    #[test]
    fn readouts_follow_production_and_preferences() {
        for (gear, text) in [
            (None, "—"),
            (Some(-1), "R1"),
            (Some(-2), "R2"),
            (Some(0), "N"),
            (Some(4), "4"),
        ] {
            let vm = project(
                &snapshot(Telemetry {
                    gear: gear.map_or(Quality::Unavailable, Quality::Reliable),
                    ..Telemetry::default()
                }),
                Preferences::default(),
            );
            assert_eq!(vm.gear, text);
        }
        for (units, speed) in [(Units::Metric, "180 KPH"), (Units::Imperial, "112 mph")] {
            let vm = project(
                &snapshot(Telemetry {
                    speed_mps: Quality::Reliable(50.0),
                    engine_speed_rad_s: Quality::Reliable(240.0 * std::f64::consts::PI),
                    ..Telemetry::default()
                }),
                Preferences {
                    units,
                    language: Language::En,
                },
            );
            assert_eq!(vm.speed, speed);
            assert_eq!(vm.rpm, "7200");
            assert_eq!(vm.speed_label, "SPEED");
            assert_eq!(vm.pedal_labels, ["CLUTCH", "BRAKE", "THROTTLE"]);
        }
        let vm = project(
            &snapshot(Telemetry {
                speed_mps: Quality::Reliable(2.5 / 3.6),
                engine_speed_rad_s: Quality::Reliable(2.5 * std::f64::consts::PI / 30.0),
                ..Telemetry::default()
            }),
            Preferences::default(),
        );
        assert_eq!(vm.speed, "3 KPH");
        assert_eq!(vm.rpm, "3");
    }

    #[test]
    fn invalid_powertrain_and_stale_readouts() {
        for value in [f64::NAN, f64::INFINITY, -1.0] {
            let vm = project(
                &snapshot(Telemetry {
                    speed_mps: Quality::Reliable(value),
                    engine_speed_rad_s: Quality::Reliable(value),
                    ..Telemetry::default()
                }),
                Preferences::default(),
            );
            assert_eq!((vm.speed.as_str(), vm.rpm.as_str()), ("—", "—"));
            assert_eq!(vm.status, Status::Missing);
        }
        let vm = project(
            &snapshot(Telemetry {
                gear: Quality::Stale(4),
                ..Telemetry::default()
            }),
            Preferences::default(),
        );
        assert_eq!(vm.status_text, Some("DATOS ANTIGUOS"));
        assert_eq!(vm.gear, "4");
    }
}
