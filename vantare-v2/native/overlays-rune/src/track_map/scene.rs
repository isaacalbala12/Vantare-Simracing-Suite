//! The GPUI demo gate and header facts; geometry and matching have a single source.
use std::sync::OnceLock;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    track_map::{self, Geometry},
};

pub(super) fn geometry(snapshot: &Snapshot) -> Option<Geometry<'static>> {
    static DESIGN: OnceLock<Vec<Snapshot>> = OnceLock::new();
    let reference = DESIGN.get_or_init(|| {
        vantare_ipc::snapshots_from_json(include_str!(
            "../../../ui/fixtures/track-map-design-system.sequence.json"
        ))
        .unwrap_or_default()
    });
    reference
        .iter()
        .any(|r| track_map::same_scene(r, snapshot))
        .then_some(Geometry {
            track_name: "Le Mans",
            label: "Le Mans",
            points_m: track_map::DEMO_LE_MANS_POINTS,
            synthetic: true,
        })
}

pub(super) fn labels(snapshot: &Snapshot, prefs: Preferences) -> [String; 3] {
    let es = prefs.language == vantare_domain::format::Language::Es;
    let car = snapshot.state.player_car();
    let name = snapshot
        .state
        .session
        .track_name
        .current()
        .map_or(if es { "CIRCUITO" } else { "TRACK" }, String::as_str);
    let length = snapshot
        .state
        .session
        .track_length_m
        .current()
        .filter(|v| v.is_finite() && **v > 0.0)
        .map_or_else(String::new, |v| format!(" · {:.3} KM", v / 1000.0));
    let session = match (snapshot.state.session.kind.current(), es) {
        (Some(vantare_domain::SessionKind::Race), true) => "CARRERA",
        (Some(vantare_domain::SessionKind::Race), false) => "RACE",
        (Some(vantare_domain::SessionKind::Qualifying), true) => "CLASIFICACIÓN",
        (Some(vantare_domain::SessionKind::Qualifying), false) => "QUALIFYING",
        (Some(vantare_domain::SessionKind::Practice), true) => "PRÁCTICA",
        (Some(vantare_domain::SessionKind::Practice), false) => "PRACTICE",
        _ => "",
    };
    let lap = if snapshot
        .state
        .session
        .kind
        .current()
        .is_some_and(vantare_domain::SessionKind::ranks_by_best_lap)
    {
        snapshot
            .state
            .session
            .remaining_s
            .current()
            .filter(|v| v.is_finite() && **v >= 0.0)
            .map_or_else(
                || session.to_owned(),
                |seconds| {
                    let total = *seconds as u64;
                    format!("{session} · {:02}:{:02}", total / 60, total % 60)
                },
            )
    } else {
        car.and_then(|c| c.laps.current())
            .zip(snapshot.state.session.laps_total.current())
            .map_or_else(
                || session.to_owned(),
                |(a, b)| format!("{session} · {} {a}/{b}", if es { "V" } else { "L" }),
            )
    };
    let player = car.and_then(|c| c.position.current()).map_or_else(
        || if es { "Tú" } else { "You" }.into(),
        |v| format!("{} P{v}", if es { "Tú" } else { "You" }),
    );
    [format!("{}{length}", name.to_uppercase()), lap, player]
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        Quality, SourceKind, SourceState,
        format::{Language, Units},
    };

    fn demos() -> Vec<Snapshot> {
        vantare_ipc::snapshots_from_json(include_str!(
            "../../../ui/fixtures/track-map-design-system.sequence.json"
        ))
        .expect("canonical GPUI demos")
    }

    #[test]
    fn demos_use_the_single_typed_point_source_and_the_existing_projection() {
        for (photo, (count, session)) in demos().iter().zip([
            (14, "CARRERA · V 14/38"),
            (5, "CLASIFICACIÓN · 08:42"),
            (4, "PRÁCTICA · 42:10"),
        ]) {
            let g = geometry(photo).expect("closed demo");
            assert_eq!(g.points_m, track_map::DEMO_LE_MANS_POINTS);
            assert_eq!(g.points_m.len(), 621);
            let vm = track_map::project_with_geometry(photo, Preferences::default(), Some(&g));
            assert_eq!(vm.markers.len(), count);
            assert!(vm.markers.iter().any(|m| m.is_player));
            assert_eq!(labels(photo, Preferences::default())[1], session);
        }
    }

    #[test]
    fn metadata_can_advance_but_source_epoch_session_or_spatial_identity_cannot() {
        for photo in demos() {
            let mut unchanged = photo.clone();
            unchanged.sequence += 1;
            unchanged.origin.received_at += std::time::Duration::from_secs(10);
            unchanged.state.cars[0].driver.name = "ignored by the map gate".into();
            assert!(geometry(&unchanged).is_some());
            let changes: [fn(&mut Snapshot); 7] = [
                |s| s.epoch += 1,
                |s| s.origin.source.kind = SourceKind::Live,
                |s| s.origin.source_time = Some(std::time::Duration::from_secs(1)),
                |s| s.state.session.id += 1,
                |s| s.state.session.track_name = Quality::Reliable("other".into()),
                |s| s.state.cars[0].pose = Quality::Stale(Default::default()),
                |s| s.state.cars.swap(0, 1),
            ];
            for change in changes {
                let mut altered = photo.clone();
                change(&mut altered);
                assert!(geometry(&altered).is_none());
            }
        }
        let sebring = vantare_ipc::snapshot_from_json(include_str!(
            "../../../ui/fixtures/track-map.snapshot.json"
        ))
        .unwrap();
        assert!(
            geometry(&sebring).is_none(),
            "GPUI Sebring is parity-capture only"
        );
    }

    #[test]
    fn captions_keep_snapshot_time_units_and_player_rules() {
        let mut photos = demos();
        let prefs = Preferences {
            units: Units::Imperial,
            language: Language::En,
        };
        assert_eq!(labels(&photos[1], prefs)[0], "LE MANS · 13.626 KM");
        assert_eq!(labels(&photos[1], prefs)[1], "QUALIFYING · 08:42");
        photos[1].state.session.remaining_s = Quality::Stale(500.0);
        assert_eq!(labels(&photos[1], prefs)[1], "QUALIFYING");
        photos[0].state.session.laps_total = Quality::Unavailable;
        assert_eq!(labels(&photos[0], prefs)[1], "RACE");
        for state in [SourceState::Waiting, SourceState::Lost] {
            photos[0].state.source_state = state;
            let g = geometry(&photos[0]);
            let vm = track_map::project_with_geometry(&photos[0], prefs, g.as_ref());
            assert!(vm.outline.is_empty());
            assert_eq!(vm.empty_text, "NO TELEMETRY");
        }
    }
}
