//! Banderas Eficiencia: solo ámbitos de sesión/sector; nunca inferir verde.

use crate::{
    FlagKind, FlagScope, Quality, Snapshot,
    format::{Language, PLACEHOLDER, Preferences},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Config {
    pub show_sector_flags: bool,
    pub hide_when_green: bool,
    /// RGB de la preferencia validada; negro por defecto.
    pub text_color: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            show_sector_flags: true,
            hide_when_green: false,
            text_color: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub flag: Option<FlagKind>,
    pub heading: &'static str,
    pub message: &'static str,
    pub sectors: Vec<Option<FlagKind>>,
    pub hidden: bool,
    pub text_color: u32,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_with_config(snapshot, prefs, Config::default())
}

pub fn project_with_config(snapshot: &Snapshot, prefs: Preferences, config: Config) -> ViewModel {
    // El productivo conserva un valor stale y su color hasta que desaparezca
    // la señal; Unavailable y una lista vacía no equivalen a bandera verde.
    let flags = match &snapshot.state.flags {
        _ if snapshot.state.source_state == crate::SourceState::Lost => &[][..],
        Quality::Reliable(flags) | Quality::Estimated(flags) | Quality::Stale(flags) => {
            flags.as_slice()
        }
        Quality::Unavailable => &[],
    };
    let flag = flags
        .iter()
        .find(|f| f.scope == FlagScope::Session)
        .map(|f| f.kind.clone());
    let heading = match (flag.as_ref(), prefs.language) {
        (Some(FlagKind::Yellow), Language::Es) => "PRECAUCIÓN",
        (Some(FlagKind::Yellow), Language::En) => "CAUTION",
        (_, Language::Es) => "BANDERA",
        (_, Language::En) => "FLAG",
    };
    let mut sectors = Vec::new();
    if config.show_sector_flags {
        for f in flags {
            if let FlagScope::Sector(index) = f.scope {
                sectors.resize(sectors.len().max(usize::from(index) + 1), None);
                // El adaptador ordena por relevancia: conservar la primera.
                sectors[usize::from(index)].get_or_insert_with(|| f.kind.clone());
            }
        }
    }
    ViewModel {
        heading,
        message: label(flag.as_ref(), prefs.language),
        hidden: config.hide_when_green && flag == Some(FlagKind::Green),
        text_color: if flag == Some(FlagKind::Black) && config.text_color == 0 {
            0x00ff_ffff
        } else {
            config.text_color
        },
        flag,
        sectors,
    }
}

fn label(flag: Option<&FlagKind>, language: Language) -> &'static str {
    match (flag, language) {
        (Some(FlagKind::Green), Language::Es) => "VERDE",
        (Some(FlagKind::Yellow), Language::Es) => "AMARILLA",
        (Some(FlagKind::Red), Language::Es) => "ROJA",
        (Some(FlagKind::Blue), Language::Es) => "AZUL",
        (Some(FlagKind::White), Language::Es) => "BLANCA",
        (Some(FlagKind::Black), Language::Es) => "NEGRA",
        (Some(FlagKind::Checkered), Language::Es) => "CUADROS",
        (Some(FlagKind::Green), Language::En) => "GREEN",
        (Some(FlagKind::Yellow), Language::En) => "YELLOW",
        (Some(FlagKind::Red), Language::En) => "RED",
        (Some(FlagKind::Blue), Language::En) => "BLUE",
        (Some(FlagKind::White), Language::En) => "WHITE",
        (Some(FlagKind::Black), Language::En) => "BLACK",
        (Some(FlagKind::Checkered), Language::En) => "CHECKERED",
        _ => PLACEHOLDER,
    }
}

/// Los sectores del productivo usan la inicial del código, no del idioma.
pub fn sector_label(flag: Option<&FlagKind>) -> String {
    match flag {
        Some(FlagKind::Other(original)) => original
            .chars()
            .next()
            .map_or_else(|| PLACEHOLDER.into(), |c| c.to_uppercase().collect()),
        Some(flag) => label(Some(flag), Language::En).chars().take(1).collect(),
        None => PLACEHOLDER.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CarId, Flag};

    fn snapshot(flags: Quality<Vec<Flag>>) -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.flags = flags;
        snapshot
    }

    fn session(kind: FlagKind) -> Flag {
        Flag {
            kind,
            scope: FlagScope::Session,
        }
    }

    #[test]
    fn all_colors_match_the_product_labels() {
        for (flag, es, en, initial) in [
            (FlagKind::Green, "VERDE", "GREEN", "G"),
            (FlagKind::Yellow, "AMARILLA", "YELLOW", "Y"),
            (FlagKind::Red, "ROJA", "RED", "R"),
            (FlagKind::Blue, "AZUL", "BLUE", "B"),
            (FlagKind::White, "BLANCA", "WHITE", "W"),
            (FlagKind::Black, "NEGRA", "BLACK", "B"),
            (FlagKind::Checkered, "CUADROS", "CHECKERED", "C"),
            (
                FlagKind::Other("purple".into()),
                PLACEHOLDER,
                PLACEHOLDER,
                "P",
            ),
        ] {
            let scene = snapshot(Quality::Reliable(vec![session(flag.clone())]));
            for (language, message) in [(Language::Es, es), (Language::En, en)] {
                let vm = project(
                    &scene,
                    Preferences {
                        language,
                        ..Preferences::default()
                    },
                );
                assert_eq!(vm.message, message);
                assert_eq!(vm.flag.as_ref(), Some(&flag));
            }
            assert_eq!(sector_label(Some(&flag)), initial);
        }
    }

    #[test]
    fn quality_and_empty_states_never_invent_green() {
        for (quality, expected) in [
            (Quality::Unavailable, None),
            (Quality::Reliable(vec![]), None),
            (
                Quality::Reliable(vec![session(FlagKind::Yellow)]),
                Some(FlagKind::Yellow),
            ),
            (
                Quality::Estimated(vec![session(FlagKind::Yellow)]),
                Some(FlagKind::Yellow),
            ),
            (
                Quality::Stale(vec![session(FlagKind::Yellow)]),
                Some(FlagKind::Yellow),
            ),
        ] {
            let vm = project(&snapshot(quality), Preferences::default());
            assert_eq!(vm.flag, expected);
            assert!(!vm.hidden);
            if expected.is_none() {
                assert_eq!(vm.message, PLACEHOLDER);
            }
            assert_eq!(
                vm.heading,
                if expected.is_some() {
                    "PRECAUCIÓN"
                } else {
                    "BANDERA"
                }
            );
        }
    }

    #[test]
    fn scopes_and_relevance_are_preserved_without_a_three_sector_limit() {
        let scene = snapshot(Quality::Reliable(vec![
            Flag {
                kind: FlagKind::Black,
                scope: FlagScope::Car(CarId(1)),
            },
            Flag {
                kind: FlagKind::Yellow,
                scope: FlagScope::Sector(4),
            },
            Flag {
                kind: FlagKind::Green,
                scope: FlagScope::Sector(4),
            },
            session(FlagKind::Red),
            session(FlagKind::Green),
        ]));
        let vm = project(&scene, Preferences::default());
        assert_eq!(vm.flag, Some(FlagKind::Red));
        assert_eq!(vm.sectors, [None, None, None, None, Some(FlagKind::Yellow)]);
        assert_eq!(sector_label(vm.sectors[0].as_ref()), PLACEHOLDER);
        let vm = project_with_config(
            &scene,
            Preferences::default(),
            Config {
                show_sector_flags: false,
                ..Config::default()
            },
        );
        assert!(vm.sectors.is_empty());
        let vm = project(
            &snapshot(Quality::Reliable(vec![Flag {
                kind: FlagKind::Blue,
                scope: FlagScope::Car(CarId(1)),
            }])),
            Preferences::default(),
        );
        assert_eq!(vm.flag, None);
    }

    #[test]
    fn hiding_and_black_text_contrast_follow_settings() {
        for (flag, selected, hidden, expected_color) in [
            (FlagKind::Green, 0, true, 0),
            (FlagKind::Yellow, 0, false, 0),
            (FlagKind::Black, 0, false, 0x00ff_ffff),
            (FlagKind::Black, 0x00ab_cdef, false, 0x00ab_cdef),
        ] {
            let vm = project_with_config(
                &snapshot(Quality::Reliable(vec![session(flag)])),
                Preferences::default(),
                Config {
                    hide_when_green: true,
                    text_color: selected,
                    ..Config::default()
                },
            );
            assert_eq!(vm.hidden, hidden);
            assert_eq!(vm.text_color, expected_color);
        }
        let vm = project_with_config(
            &Snapshot::default(),
            Preferences::default(),
            Config {
                hide_when_green: true,
                ..Config::default()
            },
        );
        assert!(!vm.hidden);
    }
}
