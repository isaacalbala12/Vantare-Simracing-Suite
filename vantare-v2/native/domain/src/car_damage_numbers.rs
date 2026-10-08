//! Daño Eficiencia: integridad invertida y máximo desgaste de las cuatro ruedas.
//! Los valores obsoletos se conservan con aviso, como el renderer productivo.

use crate::format::{self, Language, Preferences};
use crate::{Capability, Damage, Quality, Snapshot, SourceState};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub labels: [&'static str; 4],
    pub values: [String; 4],
    pub status_text: Option<&'static str>,
    pub show_tyres: bool,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences, show_tyres: bool) -> ViewModel {
    let damage = match snapshot.state.player {
        Some(player)
            if !matches!(
                snapshot.state.source_state,
                SourceState::Waiting | SourceState::Lost
            ) && snapshot.state.capabilities.damage >= Capability::WithData =>
        {
            player.damage
        }
        _ => Damage::default(),
    };
    let structural = [damage.aero, damage.body, damage.suspension];
    let values = structural.map(loss);
    // No se puede afirmar el máximo si falta una de las cuatro ruedas.
    let tyres = match damage.tyre_wear.map(loss) {
        [Some(a), Some(b), Some(c), Some(d)] => Some(a.max(b).max(c).max(d)),
        _ => None,
    };
    let missing = values.iter().all(Option::is_none);
    let stale = !missing
        && (snapshot.state.capabilities.damage == Capability::WithData
            || structural
                .iter()
                .chain(damage.tyre_wear.iter())
                .any(|value| matches!(value, Quality::Stale(_))));
    let status_text = match (snapshot.state.source_state, missing, stale, prefs.language) {
        (SourceState::Lost, _, _, Language::Es) => Some("DESCONECTADO"),
        (SourceState::Lost, _, _, Language::En) => Some("DISCONNECTED"),
        (SourceState::Stale, _, _, Language::Es) => Some("DATOS ANTIGUOS"),
        (SourceState::Stale, _, _, Language::En) => Some("DATA OUT OF DATE"),
        (_, true, _, Language::Es) => Some("SIN DATOS"),
        (_, true, _, Language::En) => Some("NO DATA"),
        (_, _, true, Language::Es) => Some("DATOS ANTIGUOS"),
        (_, _, true, Language::En) => Some("DATA OUT OF DATE"),
        _ => None,
    };
    ViewModel {
        labels: match prefs.language {
            Language::Es => ["AERO", "CARROC.", "SUSP", "NEUM."],
            Language::En => ["AERO", "BODY", "SUSP", "TYRE"],
        },
        values: [
            percent(values[0]),
            percent(values[1]),
            percent(values[2]),
            percent(tyres),
        ],
        status_text,
        show_tyres,
    }
}

fn loss(value: Quality<f64>) -> Option<f64> {
    match value {
        Quality::Reliable(v) | Quality::Estimated(v) | Quality::Stale(v)
            if v.is_finite() && (0.0..=1.0).contains(&v) =>
        {
            Some(1.0 - v)
        }
        _ => None,
    }
}

fn percent(value: Option<f64>) -> String {
    // toFixed(0) redondea los empates hacia arriba; el formatter común usa al par.
    format::percent(value.map(|v| (v * 100.0).round() / 100.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Player, State};
    use Quality::{Estimated, Reliable, Stale, Unavailable};

    fn snapshot(damage: Damage) -> Snapshot {
        let mut state = State {
            source_state: crate::SourceState::Live,
            player: Some(Player {
                damage,
                ..Player::default()
            }),
            ..State::default()
        };
        state.capabilities.damage = Capability::Fresh;
        Snapshot {
            state,
            ..Snapshot::default()
        }
    }

    #[test]
    fn projects_integrity_and_javascript_percentage_rounding() {
        for (input, expected) in [
            (Reliable(1.0), "0%"),
            (Reliable(0.0), "100%"),
            (Estimated(0.875), "13%"),
            (Reliable(0.4), "60%"),
            (Unavailable, "—"),
            (Reliable(f64::NAN), "—"),
            (Reliable(f64::INFINITY), "—"),
            (Reliable(-0.1), "—"),
            (Reliable(1.1), "—"),
            (Stale(0.75), "25%"),
        ] {
            let vm = project(
                &snapshot(Damage {
                    aero: input,
                    ..Damage::default()
                }),
                Preferences::default(),
                true,
            );
            assert_eq!(vm.values[0], expected, "{input:?}");
            assert_eq!(vm.values[1], format::PLACEHOLDER);
        }
    }

    #[test]
    fn tyre_maximum_requires_all_four_valid_wheels() {
        for (wear, expected) in [
            (
                [
                    Reliable(0.98),
                    Reliable(0.91),
                    Reliable(0.87),
                    Reliable(0.93),
                ],
                "13%",
            ),
            ([Reliable(1.0); 4], "0%"),
            ([Reliable(0.0); 4], "100%"),
            (
                [Reliable(1.0), Unavailable, Reliable(0.8), Reliable(0.7)],
                "—",
            ),
            (
                [
                    Reliable(1.0),
                    Reliable(f64::NAN),
                    Reliable(0.8),
                    Reliable(0.7),
                ],
                "—",
            ),
            (
                [Reliable(1.0), Reliable(1.1), Reliable(0.8), Reliable(0.7)],
                "—",
            ),
            (
                [Reliable(1.0), Stale(0.6), Reliable(0.8), Reliable(0.7)],
                "40%",
            ),
        ] {
            let vm = project(
                &snapshot(Damage {
                    aero: Reliable(1.0),
                    tyre_wear: wear,
                    ..Damage::default()
                }),
                Preferences::default(),
                true,
            );
            assert_eq!(vm.values[3], expected);
        }
    }

    #[test]
    fn status_quality_capability_language_and_hidden_tyres() {
        let prefs = Preferences::default();
        let empty = project(&Snapshot::default(), prefs, true);
        assert_eq!(empty.values, [format::PLACEHOLDER; 4]);
        assert_eq!(empty.status_text, Some("SIN DATOS"));
        for (capability, quality, status, value) in [
            (
                Capability::Unsupported,
                Reliable(0.0),
                Some("SIN DATOS"),
                "—",
            ),
            (Capability::Supported, Reliable(0.0), Some("SIN DATOS"), "—"),
            (Capability::Fresh, Reliable(0.0), None, "100%"),
            (Capability::Fresh, Estimated(0.0), None, "100%"),
            (
                Capability::WithData,
                Stale(0.0),
                Some("DATOS ANTIGUOS"),
                "100%",
            ),
            (
                Capability::Fresh,
                Stale(0.0),
                Some("DATOS ANTIGUOS"),
                "100%",
            ),
        ] {
            let mut snapshot = snapshot(Damage {
                aero: quality,
                ..Damage::default()
            });
            snapshot.state.capabilities.damage = capability;
            let vm = project(&snapshot, prefs, false);
            assert_eq!(vm.status_text, status);
            assert_eq!(vm.values[0], value);
            assert!(!vm.show_tyres);
        }
        let en = Preferences {
            language: Language::En,
            ..prefs
        };
        let vm = project(&Snapshot::default(), en, true);
        assert_eq!(vm.labels, ["AERO", "BODY", "SUSP", "TYRE"]);
        assert_eq!(vm.status_text, Some("NO DATA"));
        let vm = project(
            &snapshot(Damage {
                aero: Stale(0.0),
                ..Damage::default()
            }),
            en,
            true,
        );
        assert_eq!(vm.status_text, Some("DATA OUT OF DATE"));
    }
}
