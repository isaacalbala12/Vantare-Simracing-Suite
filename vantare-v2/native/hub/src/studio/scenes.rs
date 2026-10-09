//! Fotos reales de Studio: cada escena conserva el Snapshot completo sin alterar señales.
use vantare_domain::{Quality, SessionKind, SessionState, Snapshot};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scenario {
    Start,
    Race,
    Pits,
    Rain,
    Night,
}
impl Scenario {
    pub const ALL: [Self; 5] = [Self::Start, Self::Race, Self::Pits, Self::Rain, Self::Night];
    pub const fn label(self) -> &'static str {
        match self {
            Self::Start => "Salida",
            Self::Race => "Carrera",
            Self::Pits => "Boxes",
            Self::Rain => "Lluvia",
            Self::Night => "Noche",
        }
    }
    pub const fn reason(self) -> &'static str {
        match self {
            Self::Start => {
                "Próximamente: el corpus no contiene una parrilla o formación previa a la salida."
            }
            Self::Race => {
                "Próximamente: las sesiones reales del corpus son de práctica, no de carrera."
            }
            Self::Pits => "Próximamente: no hay foto del jugador en boxes.",
            Self::Rain => {
                "Próximamente: la lluvia observada es 0; no hay una foto real con lluvia."
            }
            Self::Night => "Próximamente: el corpus no aporta hora del día ni una señal de noche.",
        }
    }
    pub fn matches(self, snapshot: &Snapshot) -> bool {
        use vantare_domain::SourceState;
        if snapshot.state.source_state != SourceState::Live {
            return false;
        }
        match self {
            Self::Start => matches!(
                snapshot.state.session.state,
                Quality::Reliable(SessionState::Preparing)
            ),
            Self::Race => matches!(
                snapshot.state.session.kind,
                Quality::Reliable(SessionKind::Race)
            ),
            Self::Pits => snapshot
                .state
                .player_car()
                .is_some_and(|car| matches!(car.in_pits, Quality::Reliable(true))),
            Self::Rain => {
                matches!(snapshot.state.session.weather.rain,Quality::Reliable(v) if v>0.0)
            }
            Self::Night => false, // No existe señal en el DTO: no inferirla de elapsed_s.
        }
    }
}
pub struct Photo {
    pub snapshot: Snapshot,
    pub label: String,
}
pub fn load() -> Result<Vec<Photo>, String> {
    let mut photos = Vec::new();
    let lmu = vantare_ui::workshop::snapshots_from_json(include_str!(
        "../../../ui/fixtures/telemetry-real/lmu47-input.sequence.json"
    ))?;
    let count = lmu.len();
    for (i, snapshot) in lmu.into_iter().enumerate() {
        let lap = snapshot
            .state
            .player_car()
            .and_then(|c| c.laps.current())
            .map_or_else(|| "—".to_owned(), ToString::to_string);
        photos.push(Photo {
            label: format!("LMU · vuelta {lap} · foto {}/{count}", i + 1),
            snapshot,
        });
    }
    let snapshot = vantare_ipc::snapshot_from_json(include_str!(
        "../../../ui/fixtures/telemetry-real/acc.snapshot.json"
    ))
    .map_err(|e| e.to_string())?;
    let lap = snapshot
        .state
        .player_car()
        .and_then(|c| c.laps.current())
        .map_or_else(|| "—".to_owned(), ToString::to_string);
    photos.push(Photo {
        label: format!("ACC · vuelta {lap} · foto 1/1"),
        snapshot,
    });
    Ok(photos)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scenes_keep_whole_real_photos_and_never_fabricate_laps_or_conditions() {
        let photos = load().expect("real photos");
        assert_eq!(photos.len(), 13);
        let lmu = vantare_ui::workshop::snapshots_from_json(include_str!(
            "../../../ui/fixtures/telemetry-real/lmu47-input.sequence.json"
        ))
        .expect("corpus");
        for (photo, source) in photos.iter().zip(lmu) {
            assert_eq!(
                vantare_ipc::snapshot_to_json(&photo.snapshot).expect("json"),
                vantare_ipc::snapshot_to_json(&source).expect("json")
            );
            assert_eq!(
                photo
                    .snapshot
                    .state
                    .player_car()
                    .expect("player")
                    .laps
                    .current(),
                Some(&0)
            );
        }
        assert_eq!(
            vantare_ipc::snapshot_to_json(&photos[12].snapshot).expect("json"),
            vantare_ipc::snapshot_to_json(
                &vantare_ipc::snapshot_from_json(include_str!(
                    "../../../ui/fixtures/telemetry-real/acc.snapshot.json"
                ))
                .expect("source")
            )
            .expect("source json")
        );
        for scenario in Scenario::ALL {
            assert_eq!(
                photos.iter().any(|p| scenario.matches(&p.snapshot)),
                scenario == Scenario::Pits
            );
        }
    }
}
