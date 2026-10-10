//! Daño visual Eficiencia: el modelo guarda integridad, la vista muestra daño.

use crate::format::{self, Language, Preferences};
use crate::{Capability, Quality, Snapshot, SourceState};

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub show_aero: bool,
    pub status: Option<&'static str>,
    /// Aero, carrocería, suspensión. `None` conserva la ausencia del dato.
    pub damage: [Option<f64>; 3],
    pub labels: [&'static str; 3],
    pub percentages: [String; 3],
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let player = snapshot.state.player;
    let status = match (
        snapshot.state.source_state,
        player,
        snapshot.state.capabilities.damage,
        prefs.language,
    ) {
        (SourceState::Lost, _, _, Language::Es) => Some("DESCONECTADO"),
        (SourceState::Lost, _, _, Language::En) => Some("DISCONNECTED"),
        (SourceState::Waiting, _, _, Language::Es) => Some("SIN DATOS"),
        (SourceState::Waiting, _, _, Language::En) => Some("NO DATA"),
        (SourceState::Stale, _, _, Language::Es)
        | (_, Some(_), Capability::WithData, Language::Es) => Some("DATOS ANTIGUOS"),
        (SourceState::Stale, _, _, Language::En)
        | (_, Some(_), Capability::WithData, Language::En) => Some("DATA OUT OF DATE"),
        (_, Some(_), Capability::Fresh, _) => None,
        (_, _, _, Language::Es) => Some("SIN DATOS"),
        (_, _, _, Language::En) => Some("NO DATA"),
    };
    let damage = if status.is_none() {
        player.map_or([None; 3], |p| {
            [p.damage.aero, p.damage.body, p.damage.suspension].map(damage_fraction)
        })
    } else {
        [None; 3]
    };
    ViewModel {
        show_aero: true,
        status,
        damage,
        labels: match prefs.language {
            Language::Es => ["AERO", "CARROC.", "SUSP"],
            Language::En => ["AERO", "BODY", "SUSP"],
        },
        // Math.round del renderer productivo redondea .5 hacia arriba.
        percentages: damage.map(|v| format::percent(v.map(|v| (v * 100.0).round() / 100.0))),
    }
}

fn damage_fraction(integrity: Quality<f64>) -> Option<f64> {
    integrity
        .current()
        .copied()
        .filter(|v| v.is_finite())
        .map(|v| 1.0 - v.clamp(0.0, 1.0))
        // El ViewModel productivo usa `body || undefined` (también aero/susp).
        // Un coche intacto conserva ese guion y relleno neutro, no un 0 inventado.
        .filter(|v| *v > 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Damage, Player, State};

    fn snapshot(value: Quality<f64>, capability: Capability) -> Snapshot {
        let mut state = State {
            source_state: crate::SourceState::Live,
            player: Some(Player {
                damage: Damage {
                    aero: value,
                    body: value,
                    suspension: value,
                    ..Damage::default()
                },
                ..Player::default()
            }),
            ..State::default()
        };
        state.capabilities.damage = capability;
        Snapshot {
            state,
            ..Snapshot::default()
        }
    }

    #[test]
    fn integrity_quality_and_rounding_match_the_product() {
        use Quality::{Estimated, Reliable, Stale, Unavailable};
        for (value, text) in [
            (Reliable(0.0), "100%"),
            (Reliable(1.0), "—"),
            (Reliable(0.875), "13%"),
            (Reliable(-0.1), "100%"),
            (Reliable(1.1), "—"),
            (Estimated(0.5), "50%"),
            (Stale(0.5), "—"),
            (Unavailable, "—"),
            (Reliable(f64::NAN), "—"),
            (Reliable(f64::INFINITY), "—"),
        ] {
            let vm = project(&snapshot(value, Capability::Fresh), Preferences::default());
            assert_eq!(vm.percentages, [text; 3]);
            assert_eq!(vm.status, None);
            assert_eq!(vm.damage[0].is_none(), text == "—");
        }
    }

    #[test]
    fn missing_player_and_capabilities_have_localized_empty_states() {
        for (capability, es, en) in [
            (Capability::Unsupported, "SIN DATOS", "NO DATA"),
            (Capability::Supported, "SIN DATOS", "NO DATA"),
            (Capability::WithData, "DATOS ANTIGUOS", "DATA OUT OF DATE"),
        ] {
            for (language, expected) in [(Language::Es, es), (Language::En, en)] {
                let vm = project(
                    &snapshot(Quality::Reliable(0.0), capability),
                    Preferences {
                        language,
                        ..Preferences::default()
                    },
                );
                assert_eq!(vm.status, Some(expected));
                assert_eq!(vm.damage, [None; 3]);
                assert_eq!(vm.percentages, [format::PLACEHOLDER; 3]);
            }
        }
        assert_eq!(
            project(&Snapshot::default(), Preferences::default()).status,
            Some("SIN DATOS")
        );
    }

    #[test]
    fn a_missing_part_does_not_erase_the_other_parts() {
        let mut data = snapshot(Quality::Reliable(0.5), Capability::Fresh);
        if let Some(player) = data.state.player.as_mut() {
            player.damage.body = Quality::Unavailable;
        }
        let vm = project(
            &data,
            Preferences {
                language: Language::En,
                ..Preferences::default()
            },
        );
        assert_eq!(vm.percentages, ["50%", "—", "50%"]);
        assert_eq!(vm.labels, ["AERO", "BODY", "SUSP"]);
    }
}
