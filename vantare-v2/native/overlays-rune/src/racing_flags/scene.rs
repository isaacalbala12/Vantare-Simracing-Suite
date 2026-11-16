//! Escena pura de banderas: textos visibles, semántica de sectores y ocultado.
use std::sync::Arc;
use vantare_domain::{
    FlagKind,
    format::{Language, Preferences},
    racing_flags::ViewModel,
    widget_session::Session,
};

/// Contexto de sesión que cambia los textos de la tarjeta.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SessionInfo {
    pub kind: Option<Session>,
    /// Posición y clase del jugador al acabar una carrera con bandera a cuadros.
    pub finish: Option<(u32, String)>,
}

/// Lo visible de la tarjeta, sin colores ni medidas.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub waiting: bool,
    pub quiet: bool,
    pub flag: Option<FlagKind>,
    pub title: Arc<str>,
    pub message: Arc<str>,
    pub text_color: u32,
    pub sectors_visible: bool,
    pub sectors: [bool; 3],
}

pub fn sample(
    vm: &ViewModel,
    waiting: bool,
    session: &SessionInfo,
    prefs: Preferences,
) -> Option<Scene> {
    // La espera siempre se ve; oculto solo cuenta con una foto fuera de espera.
    if vm.hidden && !waiting {
        return None;
    }
    let es = prefs.language == Language::Es;
    let penalized = vm.penalty.is_some();
    let quiet = waiting || (vm.flag.is_none() && !penalized);
    let sectors_visible = !quiet && !penalized && !vm.sectors.is_empty();
    let mut sectors = [false; 3];
    for (index, flag) in vm.sectors.iter().take(3).enumerate() {
        sectors[index] = flag.as_ref() == Some(&FlagKind::Yellow);
    }
    Some(Scene {
        waiting,
        quiet,
        flag: vm.flag.clone(),
        title: Arc::from(title(vm, waiting, sectors_visible, session, es)),
        message: Arc::from(message(vm, waiting, session, es)),
        text_color: vm.text_color,
        sectors_visible,
        sectors,
    })
}

fn base_title(vm: &ViewModel, waiting: bool, es: bool) -> &'static str {
    if waiting {
        return if es {
            "ESPERANDO A LMU"
        } else {
            "WAITING FOR LMU"
        };
    }
    match vm.flag.as_ref() {
        Some(FlagKind::Yellow) => {
            if es {
                "AMARILLA"
            } else {
                "YELLOW"
            }
        }
        Some(FlagKind::Green) => {
            if es {
                "VERDE"
            } else {
                "GREEN"
            }
        }
        Some(FlagKind::Red) => {
            if es {
                "ROJA"
            } else {
                "RED"
            }
        }
        Some(FlagKind::Blue) => {
            if es {
                "AZUL"
            } else {
                "BLUE"
            }
        }
        Some(FlagKind::White) => {
            if es {
                "BLANCA"
            } else {
                "WHITE"
            }
        }
        Some(FlagKind::Black) => {
            if es {
                "BANDERA NEGRA"
            } else {
                "BLACK FLAG"
            }
        }
        Some(FlagKind::Checkered) => {
            if es {
                "BANDERA A CUADROS"
            } else {
                "CHEQUERED FLAG"
            }
        }
        _ => {
            if es {
                "SIN BANDERAS"
            } else {
                "NO FLAGS"
            }
        }
    }
}

fn base_message(vm: &ViewModel, waiting: bool, es: bool) -> &'static str {
    if waiting {
        return if es {
            "Las banderas aparecen al entrar en pista"
        } else {
            "Flags appear when you enter the track"
        };
    }
    match vm.flag.as_ref() {
        Some(FlagKind::Yellow) => {
            if es {
                "Precaución · no adelantes"
            } else {
                "Caution · no overtaking"
            }
        }
        Some(FlagKind::Green) => {
            if es {
                "Pista libre · se puede adelantar"
            } else {
                "Track clear · overtaking allowed"
            }
        }
        Some(FlagKind::Red) => {
            if es {
                "Sesión detenida · vuelve a boxes"
            } else {
                "Session stopped · return to pits"
            }
        }
        Some(FlagKind::Blue) => {
            if es {
                "Coche más rápido · déjale pasar"
            } else {
                "Faster car · let it pass"
            }
        }
        Some(FlagKind::White) => {
            if es {
                "Coche lento delante"
            } else {
                "Slow car ahead"
            }
        }
        Some(FlagKind::Black) => {
            if es {
                "Descalificado · vuelve a boxes"
            } else {
                "Disqualified · return to pits"
            }
        }
        Some(FlagKind::Checkered) => {
            if es {
                "Fin de la sesión"
            } else {
                "Session finished"
            }
        }
        _ => {
            if es {
                "Esperando información de pista"
            } else {
                "Waiting for track information"
            }
        }
    }
}

fn title(
    vm: &ViewModel,
    waiting: bool,
    sectors_visible: bool,
    session: &SessionInfo,
    es: bool,
) -> String {
    let mut title = base_title(vm, waiting, es).to_owned();
    if !waiting && session.kind == Some(Session::Qualifying) && vm.penalty.is_none() {
        title = match vm.flag.as_ref() {
            Some(FlagKind::Red) => {
                if es {
                    "ROJA · CLASIFICACIÓN".into()
                } else {
                    "RED · QUALIFYING".into()
                }
            }
            Some(FlagKind::Checkered) => {
                if es {
                    "FIN DE LA CLASIFICACIÓN".into()
                } else {
                    "QUALIFYING FINISHED".into()
                }
            }
            _ => title,
        };
    }
    if vm.flag.as_ref() == Some(&FlagKind::Yellow)
        && sectors_visible
        && let Some(index) = vm
            .sectors
            .iter()
            .position(|flag| flag.as_ref() == Some(&FlagKind::Yellow))
    {
        title = format!("{title} · SECTOR {}", index + 1);
    }
    title
}

fn message(vm: &ViewModel, waiting: bool, session: &SessionInfo, es: bool) -> String {
    if vm.flag.as_ref() == Some(&FlagKind::Checkered) && vm.penalty.is_none() && !waiting {
        if session.kind == Some(Session::Qualifying) {
            return if es {
                "Termina la vuelta en curso".into()
            } else {
                "Finish your current lap".into()
            };
        }
        if let Some((position, class)) = &session.finish {
            return if es {
                format!("Fin de la carrera · P{position} en {class}")
            } else {
                format!("Race finished · P{position} in {class}")
            };
        }
    }
    base_message(vm, waiting, es).to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Flag, FlagScope, Quality, Snapshot, racing_flags};

    fn projected(flags: Vec<Flag>, config: racing_flags::Config) -> racing_flags::ViewModel {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.flags = Quality::Reliable(flags);
        racing_flags::project_with_config(&snapshot, Preferences::default(), config)
    }

    fn session(kind: FlagKind) -> Flag {
        Flag {
            kind,
            scope: FlagScope::Session,
        }
    }

    fn scene(flags: Vec<Flag>, waiting: bool, info: &SessionInfo) -> Option<Scene> {
        sample(
            &projected(flags, racing_flags::Config::default()),
            waiting,
            info,
            Preferences::default(),
        )
    }

    #[test]
    fn flag_titles_messages_and_colors_follow_the_card_contract() {
        for (flag, title, message) in [
            (FlagKind::Yellow, "AMARILLA", "Precaución · no adelantes"),
            (FlagKind::Green, "VERDE", "Pista libre · se puede adelantar"),
            (FlagKind::Red, "ROJA", "Sesión detenida · vuelve a boxes"),
            (FlagKind::Blue, "AZUL", "Coche más rápido · déjale pasar"),
            (FlagKind::White, "BLANCA", "Coche lento delante"),
            (
                FlagKind::Black,
                "BANDERA NEGRA",
                "Descalificado · vuelve a boxes",
            ),
            (FlagKind::Checkered, "BANDERA A CUADROS", "Fin de la sesión"),
        ] {
            let card = scene(vec![session(flag.clone())], false, &SessionInfo::default())
                .expect("tarjeta");
            assert_eq!(&*card.title, title);
            assert_eq!(&*card.message, message);
            assert!(!card.quiet && !card.sectors_visible);
        }
        let card = scene(vec![], false, &SessionInfo::default()).expect("sin banderas");
        assert!(card.quiet && card.flag.is_none());
        assert_eq!(&*card.title, "SIN BANDERAS");
        assert_eq!(&*card.message, "Esperando información de pista");
    }

    #[test]
    fn english_and_waiting_change_the_texts() {
        let prefs = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        let card = sample(
            &projected(
                vec![session(FlagKind::Green)],
                racing_flags::Config::default(),
            ),
            false,
            &SessionInfo::default(),
            prefs,
        )
        .expect("tarjeta");
        assert_eq!(&*card.title, "GREEN");
        assert_eq!(&*card.message, "Track clear · overtaking allowed");
        let waiting = sample(
            &projected(
                vec![session(FlagKind::Green)],
                racing_flags::Config::default(),
            ),
            true,
            &SessionInfo::default(),
            prefs,
        )
        .expect("espera");
        assert!(waiting.waiting && waiting.quiet);
        assert_eq!(&*waiting.title, "WAITING FOR LMU");
        assert_eq!(&*waiting.message, "Flags appear when you enter the track");
    }

    #[test]
    fn sector_flags_show_three_chips_and_name_the_first_yellow() {
        let flags = vec![
            session(FlagKind::Yellow),
            Flag {
                kind: FlagKind::Yellow,
                scope: FlagScope::Sector(1),
            },
            Flag {
                kind: FlagKind::Green,
                scope: FlagScope::Sector(2),
            },
        ];
        let card = scene(flags, false, &SessionInfo::default()).expect("tarjeta");
        assert!(card.sectors_visible);
        assert_eq!(card.sectors, [false, true, false]);
        assert_eq!(&*card.title, "AMARILLA · SECTOR 2");
        let no_sectors = sample(
            &projected(
                vec![
                    session(FlagKind::Yellow),
                    Flag {
                        kind: FlagKind::Yellow,
                        scope: FlagScope::Sector(1),
                    },
                ],
                racing_flags::Config {
                    show_sector_flags: false,
                    ..racing_flags::Config::default()
                },
            ),
            false,
            &SessionInfo::default(),
            Preferences::default(),
        )
        .expect("tarjeta");
        assert!(!no_sectors.sectors_visible);
        assert_eq!(&*no_sectors.title, "AMARILLA");
    }

    #[test]
    fn hidden_green_and_penalties_keep_the_card_semantics() {
        let config = racing_flags::Config {
            hide_when_green: true,
            ..racing_flags::Config::default()
        };
        let green = projected(vec![session(FlagKind::Green)], config);
        assert!(
            sample(
                &green,
                false,
                &SessionInfo::default(),
                Preferences::default()
            )
            .is_none()
        );
        assert!(
            sample(
                &green,
                true,
                &SessionInfo::default(),
                Preferences::default()
            )
            .is_some(),
            "la espera no se oculta"
        );
        let black = projected(vec![session(FlagKind::Black)], config);
        let card = sample(
            &black,
            false,
            &SessionInfo::default(),
            Preferences::default(),
        )
        .expect("negra");
        assert_eq!(card.flag, Some(FlagKind::Black));
        assert!(!card.sectors_visible, "la negra oculta los sectores");
    }

    #[test]
    fn qualifying_and_race_finish_change_the_checkered_and_red_texts() {
        let qualifying = SessionInfo {
            kind: Some(Session::Qualifying),
            finish: None,
        };
        let red = scene(vec![session(FlagKind::Red)], false, &qualifying).expect("roja");
        assert_eq!(&*red.title, "ROJA · CLASIFICACIÓN");
        let checkered =
            scene(vec![session(FlagKind::Checkered)], false, &qualifying).expect("cuadros");
        assert_eq!(&*checkered.title, "FIN DE LA CLASIFICACIÓN");
        assert_eq!(&*checkered.message, "Termina la vuelta en curso");
        let race = SessionInfo {
            kind: Some(Session::Race),
            finish: Some((3, "GT3".into())),
        };
        let finished = scene(vec![session(FlagKind::Checkered)], false, &race).expect("cuadros");
        assert_eq!(&*finished.message, "Fin de la carrera · P3 en GT3");
    }
}
