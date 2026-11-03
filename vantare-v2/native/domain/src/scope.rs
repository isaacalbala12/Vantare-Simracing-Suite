use crate::{CarId, SessionId, Source, State};

/// Identidad de las derivaciones y la retención del núcleo. La época pertenece
/// al productor; la frontera de hidratación del pipe tiene su propio contrato.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Scope {
    source: Source,
    session: SessionId,
    player: Option<CarId>,
}

impl Scope {
    #[must_use]
    pub fn of(source: Source, state: &State) -> Self {
        Self {
            source,
            session: state.session.id,
            player: state.player.as_ref().map(|player| player.car),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DrivingSituation, Player, Quality, SessionKind, SourceKind, SourceState};

    #[test]
    fn only_source_session_and_player_define_the_scope() {
        let source = Source::default();
        let state = State {
            player: Some(Player::default()),
            ..State::default()
        };
        let scope = Scope::of(source, &state);
        let mut metadata = state.clone();
        metadata.source_state = SourceState::Paused;
        metadata.driving_situation = DrivingSituation::Garage;
        metadata.session.track_name = Quality::Stale("same track".into());
        metadata.session.kind = Quality::Stale(SessionKind::Race);
        assert_eq!(Scope::of(source, &metadata), scope);
        let changes: [fn(&mut State); 3] = [
            |s: &mut State| s.session.id.0 += 1,
            |s: &mut State| s.player.as_mut().unwrap().car.0 += 1,
            |s: &mut State| s.player = None,
        ];
        for change in changes {
            let mut next = state.clone();
            change(&mut next);
            assert_ne!(Scope::of(source, &next), scope);
        }
        for next in [
            Source {
                simulator: "acc",
                ..source
            },
            Source {
                kind: SourceKind::Replay,
                ..source
            },
        ] {
            assert_ne!(Scope::of(next, &state), scope);
        }
    }
}
