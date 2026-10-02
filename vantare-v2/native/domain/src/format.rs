//! Formateador puro. Las preferencias del usuario entran como parámetro; ningún
//! widget decide unidades, redondeo ni idioma. Las reglas de tiempo y gap son
//! las de `standings-formatting.ts` de producción (`to_fixed` viene del port de
//! paridad de ISA-1410).

use crate::{Gap, SessionKind};

pub const PLACEHOLDER: &str = "—";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Units {
    #[default]
    Metric,
    Imperial,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Language {
    #[default]
    Es,
    En,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Preferences {
    pub units: Units,
    pub language: Language,
}

/// Parte entera de un número finito y no negativo.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn whole(value: f64) -> u64 {
    value as u64
}

/// `Number.prototype.toFixed`: ante un empate exacto redondea hacia arriba
/// (Rust lo haría al par: 0.125 → "0.12").
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap,
    clippy::float_cmp
)] // la igualdad exacta es la regla
fn to_fixed(value: f64, decimals: usize) -> String {
    let scale = 10f64.powi(decimals as i32);
    let scaled = value.abs() * scale;
    let tie = (scaled.fract() - 0.5).abs() == 0.0 && scaled / scale == value.abs();
    let text = if tie {
        format!("{:.*}", decimals, (scaled.floor() + 1.0) / scale)
    } else {
        format!("{:.*}", decimals, value.abs())
    };
    // JS conserva el signo aunque el resultado redondee a cero (-0.00).
    if value < 0.0 {
        format!("-{text}")
    } else {
        text
    }
}

/// `m:ss.mmm`.
pub fn lap_time(seconds: Option<f64>) -> String {
    let Some(seconds) = seconds.filter(|s| s.is_finite() && *s > 0.0) else {
        return PLACEHOLDER.into();
    };
    let mut minutes = (seconds / 60.0).floor();
    let remaining = seconds - minutes * 60.0;
    let mut rounded: f64 = to_fixed(remaining, 3).parse().unwrap_or(remaining);
    if rounded >= 60.0 {
        minutes += 1.0;
        rounded -= 60.0;
    }
    format!("{}:{:0>6}", whole(minutes), to_fixed(rounded, 3))
}

/// Reloj de sesión: `mm:ss`, o `hh:mm:ss` si hay horas.
pub fn clock(seconds: Option<f64>) -> String {
    let Some(seconds) = seconds.filter(|s| s.is_finite() && *s >= 0.0) else {
        return PLACEHOLDER.into();
    };
    let h = whole(seconds / 3600.0);
    let m = whole((seconds % 3600.0) / 60.0);
    let s = whole(seconds % 60.0);
    if h > 0 {
        format!("{h:02}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

/// `+1.23s` / `-0.80s`; el cero no es una diferencia.
pub fn seconds_difference(seconds: Option<f64>) -> String {
    match seconds {
        Some(s) if s.is_finite() && s != 0.0 => {
            format!("{}{}s", if s > 0.0 { "+" } else { "" }, to_fixed(s, 2))
        }
        _ => PLACEHOLDER.into(),
    }
}

/// `LÍDER`, `+1.23s` o `+N V`. `leader` lo decide quien conoce la clasificación.
pub fn gap(gap: Option<Gap>, leader: bool, prefs: Preferences) -> String {
    if leader {
        return match prefs.language {
            Language::Es => "LÍDER",
            Language::En => "LEADER",
        }
        .into();
    }
    match gap {
        Some(Gap::Time { seconds }) => seconds_difference(Some(seconds)),
        Some(Gap::Laps { count }) if count > 0 => {
            let unit = match prefs.language {
                Language::Es => "V",
                Language::En => "L",
            };
            format!("+{count} {unit}")
        }
        _ => PLACEHOLDER.into(),
    }
}

/// `183 km/h` o `114 mph`.
pub fn speed(mps: Option<f64>, prefs: Preferences) -> String {
    let Some(mps) = mps.filter(|v| v.is_finite()) else {
        return PLACEHOLDER.into();
    };
    let (value, unit) = match prefs.units {
        Units::Metric => (mps * 3.6, "km/h"),
        Units::Imperial => (mps * 2.236_936_292_054_4, "mph"),
    };
    format!("{value:.0} {unit}")
}

/// Régimen del motor en rpm, desde rad/s.
pub fn rpm(rad_per_s: Option<f64>) -> String {
    match rad_per_s.filter(|v| v.is_finite() && *v >= 0.0) {
        Some(v) => format!("{:.0}", v * 30.0 / std::f64::consts::PI),
        None => PLACEHOLDER.into(),
    }
}

/// `R`, `N` o el número de marcha.
pub fn gear(gear: Option<i8>) -> String {
    match gear {
        Some(-1) => "R".into(),
        Some(0) => "N".into(),
        Some(g) => g.to_string(),
        None => PLACEHOLDER.into(),
    }
}

/// Fracción 0–1 como porcentaje.
pub fn percent(fraction: Option<f64>) -> String {
    match fraction.filter(|v| v.is_finite()) {
        Some(v) => format!("{:.0}%", v.clamp(0.0, 1.0) * 100.0),
        None => PLACEHOLDER.into(),
    }
}

pub fn session_kind(kind: &SessionKind, prefs: Preferences) -> String {
    match (kind, prefs.language) {
        (SessionKind::Race, Language::Es) => "CARRERA".into(),
        (SessionKind::Race, Language::En) => "RACE".into(),
        (SessionKind::Practice, Language::Es) => "PRÁCTICA".into(),
        (SessionKind::Practice, Language::En) => "PRACTICE".into(),
        (SessionKind::Qualifying, Language::Es) => "CLASIFICACIÓN".into(),
        (SessionKind::Qualifying, Language::En) => "QUALIFYING".into(),
        (SessionKind::Other(original), _) => original.to_uppercase(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ES: Preferences = Preferences {
        units: Units::Metric,
        language: Language::Es,
    };
    const EN_IMPERIAL: Preferences = Preferences {
        units: Units::Imperial,
        language: Language::En,
    };

    #[test]
    fn to_fixed_rounds_ties_up_like_javascript() {
        assert_eq!(to_fixed(0.125, 2), "0.13");
        assert_eq!(to_fixed(2.5, 0), "3");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(-2.5, 2), "-2.50");
    }

    #[test]
    fn lap_time_and_clock_match_production() {
        assert_eq!(lap_time(Some(102.198)), "1:42.198");
        assert_eq!(lap_time(Some(119.9995)), "2:00.000");
        assert_eq!(lap_time(Some(59.5)), "0:59.500");
        assert_eq!(lap_time(Some(0.0)), PLACEHOLDER);
        assert_eq!(lap_time(None), PLACEHOLDER);
        assert_eq!(clock(Some(3492.4)), "58:12");
        assert_eq!(clock(Some(7325.0)), "02:02:05");
        assert_eq!(clock(Some(-1.0)), PLACEHOLDER);
    }

    #[test]
    fn gap_is_leader_seconds_or_laps() {
        let time = Some(Gap::Time { seconds: 1.234 });
        assert_eq!(gap(time, true, ES), "LÍDER");
        assert_eq!(gap(time, true, EN_IMPERIAL), "LEADER");
        assert_eq!(gap(time, false, ES), "+1.23s");
        assert_eq!(gap(Some(Gap::Time { seconds: -0.8 }), false, ES), "-0.80s");
        assert_eq!(
            gap(Some(Gap::Time { seconds: 0.0 }), false, ES),
            PLACEHOLDER
        );
        assert_eq!(gap(Some(Gap::Laps { count: 2 }), false, ES), "+2 V");
        assert_eq!(
            gap(Some(Gap::Laps { count: 2 }), false, EN_IMPERIAL),
            "+2 L"
        );
        assert_eq!(gap(None, false, ES), PLACEHOLDER);
    }

    #[test]
    fn units_follow_preferences() {
        assert_eq!(speed(Some(50.0), ES), "180 km/h");
        assert_eq!(speed(Some(50.0), EN_IMPERIAL), "112 mph");
        assert_eq!(rpm(Some(785.398_163_397)), "7500");
        assert_eq!(gear(Some(-1)), "R");
        assert_eq!(gear(Some(0)), "N");
        assert_eq!(gear(Some(4)), "4");
        assert_eq!(percent(Some(0.734)), "73%");
        assert_eq!(percent(Some(1.4)), "100%");
        assert_eq!(speed(None, ES), PLACEHOLDER);
    }

    #[test]
    fn unknown_session_kind_keeps_the_original() {
        assert_eq!(
            session_kind(&SessionKind::Other("warmup".into()), ES),
            "WARMUP"
        );
        assert_eq!(session_kind(&SessionKind::Practice, ES), "PRÁCTICA");
        assert_eq!(
            session_kind(&SessionKind::Qualifying, EN_IMPERIAL),
            "QUALIFYING"
        );
    }
}
