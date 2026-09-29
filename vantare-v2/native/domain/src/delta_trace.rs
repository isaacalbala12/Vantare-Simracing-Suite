//! Delta-trace Eficiencia: valor actual y tendencia del renderer productivo.
//!
//! `Snapshot` solo contiene `player.delta_best_s`, no `delta.history` del wire
//! V2 (instantes Unix en ms y deltas en segundos, calidad propia, tope 120).
//! Por ello no se reconstruye una serie con el reloj ni entre proyecciones:
//! la traza queda vacía y la tendencia es desconocida, incluso con delta actual.
//! `sectorDeltas`, `trackPath` y `turnInsight` también son gaps del productivo.

use crate::Snapshot;
use crate::format::{self, Language, Preferences};

/// Solo los valores dibujados: revisiones y cambios bajo el redondeo no repintan.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub current_text: String,
    pub trend_text: &'static str,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let current = snapshot
        .state
        .player
        .and_then(|player| player.delta_best_s.current().copied());
    ViewModel {
        current_text: delta_text(current),
        trend_text: match prefs.language {
            Language::Es => "DESCONOCIDO",
            Language::En => "UNKNOWN",
        },
    }
}

/// El kit `format` no tiene delta con signo, tres decimales y cero válido.
/// Mantener aquí hasta compartirlo con otro consumidor; empate como JS toFixed.
#[allow(clippy::float_cmp)] // La igualdad exacta distingue el empate de toFixed.
fn delta_text(seconds: Option<f64>) -> String {
    let Some(seconds) = seconds.filter(|value| value.is_finite()) else {
        return format::PLACEHOLDER.into();
    };
    let magnitude = seconds.abs();
    let scaled = magnitude * 1000.0;
    let rounded = if scaled.fract() == 0.5 && scaled / 1000.0 == magnitude {
        (scaled.floor() + 1.0) / 1000.0
    } else {
        magnitude
    };
    format!("{}{rounded:.3}", if seconds < 0.0 { "-" } else { "+" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Player, Quality, Source, State};

    #[test]
    fn projects_quality_without_inventing_a_value_or_a_trend() {
        for (quality, expected) in [
            (Quality::Reliable(0.214), "+0.214"),
            (Quality::Estimated(-0.08), "-0.080"),
            (Quality::Reliable(0.0), "+0.000"),
            (Quality::Stale(0.214), format::PLACEHOLDER),
            (Quality::Unavailable, format::PLACEHOLDER),
            (Quality::Reliable(f64::NAN), format::PLACEHOLDER),
            (Quality::Estimated(f64::INFINITY), format::PLACEHOLDER),
        ] {
            let snapshot = Snapshot {
                state: State {
                    player: Some(Player {
                        delta_best_s: quality,
                        ..Player::default()
                    }),
                    ..State::default()
                },
                ..Snapshot::default()
            };
            for (language, trend) in [(Language::Es, "DESCONOCIDO"), (Language::En, "UNKNOWN")] {
                let vm = project(
                    &snapshot,
                    Preferences {
                        language,
                        ..Preferences::default()
                    },
                );
                assert_eq!(vm.current_text, expected, "{quality:?}");
                assert_eq!(vm.trend_text, trend, "no hay historia canónica");
            }
        }
    }

    #[test]
    fn delta_format_matches_the_renderer_including_zero_and_ties() {
        for (value, expected) in [
            (0.256_957_161_625_497_4, "+0.257"),
            (-0.08, "-0.080"),
            (-0.0, "+0.000"),
            (-0.000_1, "-0.000"),
            (0.062_5, "+0.063"),
            (-0.062_5, "-0.063"),
            (f64::NEG_INFINITY, format::PLACEHOLDER),
        ] {
            assert_eq!(delta_text(Some(value)), expected);
        }
        assert_eq!(delta_text(None), format::PLACEHOLDER);
    }

    #[test]
    fn no_player_is_empty_and_revisions_do_not_create_history() {
        let mut snapshot = Snapshot::default();
        let expected = project(&snapshot, Preferences::default());
        assert_eq!(expected.current_text, format::PLACEHOLDER);
        for simulator in ["lmu", "acc", "unknown"] {
            snapshot.origin.source = Source {
                simulator,
                ..Source::default()
            };
            snapshot.epoch += 1;
            snapshot.sequence += 1;
            assert_eq!(project(&snapshot, Preferences::default()), expected);
        }
    }
}
