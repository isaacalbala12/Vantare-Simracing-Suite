//! Cadencias del host. Nunca altera adquisición, permisos ni los ViewModels.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Maximum,
    High,
    #[default]
    Balanced,
    Economy,
    Minimum,
}
impl Level {
    pub const ALL: [Self; 5] = [
        Self::Maximum,
        Self::High,
        Self::Balanced,
        Self::Economy,
        Self::Minimum,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Maximum => "Máximo",
            Self::High => "Alto",
            Self::Balanced => "Equilibrado",
            Self::Economy => "Ahorro",
            Self::Minimum => "Mínimo",
        }
    }
    pub fn hz(self, kind: crate::Kind) -> u16 {
        if matches!(kind, crate::Kind::RacingFlags) {
            return 0;
        }
        let table = matches!(
            kind,
            crate::Kind::Standings
                | crate::Kind::Relative
                | crate::Kind::MulticlassRelative
                | crate::Kind::BroadcastTower
        );
        match (self, table) {
            (Self::Maximum, true) | (Self::Economy, false) => 30,
            (Self::High, true) | (Self::Minimum, false) => 20,
            (Self::Balanced, true) => 15,
            (Self::Economy, true) => 10,
            (Self::Minimum, true) => 5,
            (Self::Maximum, false) => 0,
            (Self::High, false) => 60,
            (Self::Balanced, false) => 40,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub level: Level,
    /// IDs del documento activo; 0 = cada foto, ausencia = nivel global.
    pub widgets: BTreeMap<String, u16>,
}
impl Preferences {
    pub fn hz(&self, id: &str, kind: crate::Kind) -> u16 {
        if matches!(kind, crate::Kind::RacingFlags) {
            return 0;
        }
        self.widgets
            .get(id)
            .copied()
            .unwrap_or_else(|| self.level.hz(kind))
    }
    pub fn is_default(&self) -> bool {
        self == &Self::default()
    }
    pub(crate) fn valid(&self) -> bool {
        self.widgets.len() <= 256
            && self.widgets.iter().all(|(id, hz)| {
                !id.is_empty()
                    && id.len() <= 128
                    && matches!(hz, 0 | 1 | 4 | 5 | 10 | 15 | 20 | 30 | 40 | 60)
            })
    }
}

#[derive(Default)]
pub(crate) struct Cadence {
    last: Option<Instant>,
    identity: Option<(u64, vantare_domain::SourceState)>,
}
impl Cadence {
    pub fn due(
        &mut self,
        hz: u16,
        identity: (u64, vantare_domain::SourceState),
        now: Instant,
    ) -> bool {
        let due = hz == 0
            || self.identity != Some(identity)
            || self.last.is_none_or(|last| {
                now.saturating_duration_since(last) >= Duration::from_secs_f64(1.0 / f64::from(hz))
            });
        if due {
            self.last = Some(now);
            self.identity = Some(identity);
        }
        due
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn levels_and_overrides_keep_flags_immediate_and_state_transitions_unthrottled() {
        for (level, hz) in Level::ALL.into_iter().zip([30, 20, 15, 10, 5]) {
            assert_eq!(level.hz(crate::Kind::Standings), hz);
            assert_eq!(level.hz(crate::Kind::RacingFlags), 0);
        }
        let mut prefs = Preferences::default();
        prefs.widgets.insert("table".into(), 4);
        assert_eq!(prefs.hz("table", crate::Kind::Standings), 4);
        let mut cadence = Cadence::default();
        let now = Instant::now();
        let live = (1, vantare_domain::SourceState::Live);
        assert!(cadence.due(4, live, now));
        assert!(!cadence.due(4, live, now + Duration::from_millis(249)));
        assert!(cadence.due(4, live, now + Duration::from_millis(250)));
        assert!(cadence.due(
            4,
            (1, vantare_domain::SourceState::Lost),
            now + Duration::from_millis(251)
        ));
        assert!(cadence.due(
            4,
            (2, vantare_domain::SourceState::Live),
            now + Duration::from_millis(252)
        ));
    }
}
