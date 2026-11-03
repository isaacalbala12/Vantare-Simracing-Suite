//! Corpus real compartido por los contratos de Board (#1531 / inventario #1537).
use vantare_domain::{Quality, Snapshot, SourceState};

pub(crate) fn photos() -> Vec<(&'static str, Snapshot)> {
    [
        (
            "lmu47",
            include_str!("../fixtures/telemetry-real/lmu47.snapshot.json"),
        ),
        (
            "acc",
            include_str!("../fixtures/telemetry-real/acc.snapshot.json"),
        ),
        (
            "stale",
            include_str!("../fixtures/telemetry-real/lmu-stale.snapshot.json"),
        ),
        (
            "menu",
            include_str!("../fixtures/telemetry-real/lmu-menu.snapshot.json"),
        ),
    ]
    .map(|(name, json)| {
        (
            name,
            vantare_ipc::snapshot_from_json(json).expect("foto real intacta"),
        )
    })
    .into()
}

pub(crate) const STATES: [SourceState; 5] = [
    SourceState::Waiting,
    SourceState::Live,
    SourceState::Paused,
    SourceState::Stale,
    SourceState::Lost,
];

pub(crate) fn cases() -> Vec<(String, Snapshot)> {
    photos()
        .into_iter()
        .flat_map(|(name, photo)| {
            let mut stale = photo.clone();
            // Valores del corpus sin inventar telemetría: misma degradación que Core.
            vantare_domain::degrade(&mut stale.state);
            [(name.into(), photo), (format!("{name}/degraded"), stale)]
        })
        .collect()
}

/// Solo para comprobar identidad y orden histórico; nunca es un dato actual.
pub(crate) fn known<T>(quality: &Quality<T>) -> Option<&T> {
    match quality {
        Quality::Reliable(v) | Quality::Estimated(v) | Quality::Stale(v) => Some(v),
        Quality::Unavailable => None,
    }
}
