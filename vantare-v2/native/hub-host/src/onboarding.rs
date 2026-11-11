//! First-run projection; local hardware is never sent to services.
use crate::settings::track::PerformanceLevel;
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[path = "onboarding/equipment.rs"]
mod equipment;
#[cfg(windows)]
#[path = "onboarding/presentation.rs"]
mod presentation;

pub const PRICES_URL: &str = "https://vantare.app/#precios";
pub const KIT_LIMIT: usize = 10;
pub const CPU_LIMIT: usize = 128;
pub const EQUIPMENT_COUNT_MAX: u32 = u32::MAX;
pub const REVISION_PATTERN: &str = "^[0-9a-f]{64}$";
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WidgetKind {
    Standings,
    Relative,
    Delta,
    Pedals,
    RacingFlags,
    HeadToHead,
    FuelStrategy,
    TrackWeather,
    BroadcastTower,
    TrackMap,
}
impl WidgetKind {
    pub const ALL: [Self; KIT_LIMIT] = [
        Self::Standings,
        Self::Relative,
        Self::Delta,
        Self::Pedals,
        Self::RacingFlags,
        Self::HeadToHead,
        Self::FuelStrategy,
        Self::TrackWeather,
        Self::BroadcastTower,
        Self::TrackMap,
    ];
    pub fn key(self) -> &'static str {
        match self {
            Self::Standings => "standings",
            Self::Relative => "relative",
            Self::Delta => "delta",
            Self::Pedals => "pedals",
            Self::RacingFlags => "racing-flags",
            Self::HeadToHead => "head-to-head",
            Self::FuelStrategy => "fuel-strategy",
            Self::TrackWeather => "track-weather",
            Self::BroadcastTower => "broadcast-tower",
            Self::TrackMap => "track-map",
        }
    }
    pub fn position(self) -> (u16, u16) {
        match self {
            Self::Standings => (60, 70),
            Self::Relative => (690, 770),
            Self::Delta => (730, 70),
            Self::Pedals => (1580, 760),
            Self::RacingFlags => (580, 70),
            Self::HeadToHead => (730, 480),
            Self::FuelStrategy => (60, 550),
            Self::TrackWeather => (60, 850),
            Self::BroadcastTower => (1500, 70),
            Self::TrackMap => (1350, 550),
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Standings => "Standings",
            Self::Relative => "Relative",
            Self::Delta => "Delta",
            Self::Pedals => "Pedals",
            Self::RacingFlags => "Banderas",
            Self::HeadToHead => "Duelo",
            Self::FuelStrategy => "Combustible",
            Self::TrackWeather => "Clima",
            Self::BroadcastTower => "Torre de TV",
            Self::TrackMap => "Mapa",
        }
    }
    pub fn free(self) -> bool {
        matches!(
            self,
            Self::Standings | Self::Relative | Self::Delta | Self::Pedals
        )
    }
}
pub fn valid_kit(kit: &[WidgetKind]) -> bool {
    !kit.is_empty()
        && kit.len() <= KIT_LIMIT
        && kit.iter().enumerate().all(|(i, k)| !kit[..i].contains(k))
}
pub fn kits() -> [&'static [WidgetKind]; 4] {
    use WidgetKind::{
        BroadcastTower, Delta, FuelStrategy, HeadToHead, Pedals, RacingFlags, Relative, Standings,
        TrackMap, TrackWeather,
    };
    [
        &[Standings, Relative, Delta, Pedals],
        &[Standings, Relative, Delta, RacingFlags, HeadToHead],
        &[
            Standings,
            Relative,
            Delta,
            RacingFlags,
            FuelStrategy,
            TrackWeather,
        ],
        &[BroadcastTower, TrackMap, Pedals, HeadToHead],
    ]
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Equipment {
    pub cpu: Option<String>,
    pub cores: Option<u32>,
    pub ram_gb: Option<u32>,
    #[serde(skip)]
    ram_bytes: Option<u64>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)] // Independent first-run, discovery, layout and session flags.
pub struct OnboardingView {
    pub pending: bool,
    pub simulators: [bool; 2],
    pub scanning: bool,
    pub equipment: Equipment,
    pub recommended_level: PerformanceLevel,
    pub layout_ready: bool,
    pub layout_revision: Option<String>,
    pub settings_revision: String,
    pub private_session: bool,
}
/// Session-only escape is granted by a failed consent write, never by the renderer.
#[derive(Default)]
pub struct PrivateExit {
    failed: bool,
    active: bool,
}
impl PrivateExit {
    pub fn record(&mut self, failed: bool) {
        self.failed = failed;
    }
    pub fn record_error(&mut self, error: Option<&crate::protocol::HostError>) {
        use crate::protocol::HostError;
        self.record(matches!(error, Some(HostError::Io | HostError::Protected | HostError::Busy)));
    }
    pub fn refresh(&mut self, value: &crate::privacy::PrivacyView, active: bool) {
        self.active = active;
        if consent_ready(value) {
            self.failed = false;
        }
    }
    pub fn can_skip(&self, pending: bool) -> bool {
        pending && self.failed
    }
    pub fn skip(&mut self, pending: bool) -> bool {
        if !pending || !self.failed {
            return false;
        }
        self.failed = false;
        self.active = true;
        true
    }
    pub fn can_finish(&self, value: &crate::privacy::PrivacyView) -> bool {
        !self.failed && !self.active && consent_ready(value)
    }
    pub fn active(&self) -> bool {
        self.active
    }
}
#[cfg(windows)]
pub(crate) fn show(path: &std::path::Path) -> Result<(), crate::protocol::HostError> {
    presentation::show(path)
}

/// Internal finalization intent. Revisions are opaque hashes, never paths.
pub struct Finish {
    pub kit: Vec<WidgetKind>,
    pub level: PerformanceLevel,
    pub show: bool,
    pub base_revision: String,
    pub layout_revision: Option<String>,
}

pub struct State {
    pub layout: std::path::PathBuf,
    pub equipment: Equipment,
    pub private: PrivateExit,
}
impl State {
    pub fn new(layout: std::path::PathBuf) -> Self {
        Self {
            layout,
            equipment: Equipment::detect(),
            private: PrivateExit::default(),
        }
    }
    pub fn view(
        &self,
        settings: &crate::settings::SettingsView,
        simulators: [bool; 2],
        scanning: bool,
    ) -> Result<OnboardingView, crate::protocol::HostError> {
        #[cfg(windows)]
        let (layout_ready, layout_revision) =
            crate::settings::Settings::onboarding_layout(&self.layout)?;
        #[cfg(not(windows))]
        let (layout_ready, layout_revision) = (false, None);
        Ok(OnboardingView {
            pending: !settings.general.onboarding_completed && !self.private.active(),
            simulators,
            scanning,
            equipment: self.equipment.clone(),
            recommended_level: self.equipment.recommended_level(),
            layout_ready,
            layout_revision,
            settings_revision: settings.revision.clone(),
            private_session: self.private.active(),
        })
    }
}

pub fn consent_ready(value: &crate::privacy::PrivacyView) -> bool {
    value.crashes_decided
        && value.usage_decided
        && !value.protected
        && !value.cleanup_pending
        && !value.cleanup_busy
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn only_unpersisted_write_failures_allow_escape_and_refresh_unblocks_finish() {
        use crate::protocol::HostError;
        let mut exit = PrivateExit::default();
        for error in [HostError::Io, HostError::Protected, HostError::Busy] {
            exit.record_error(Some(&error));
            assert!(exit.can_skip(true));
            assert!(!exit.can_skip(false));
        }
        let mut value = crate::privacy::State::isolated(&crate::test_support::Root::new().path).view();
        for error in [HostError::Denied, HostError::PrivacyConflict { current: value.clone() }, HostError::PrivacyCleanup { current: value.clone() }] {
            exit.record_error(Some(&error));
            assert!(!exit.can_skip(true));
        }
        value.crashes_decided = true;
        value.usage_decided = true;
        exit.record_error(Some(&HostError::Io));
        exit.refresh(&value, false);
        assert!(exit.can_finish(&value));
    }
    #[test]
    fn prices_url_is_the_exact_public_https_document() {
        assert_eq!(PRICES_URL, "https://vantare.app/#precios");
    }
    #[test]
    fn finishing_requires_both_consents_confirmed_without_pending_cleanup() {
        let mut value = crate::privacy::PrivacyView {
            crashes: false,
            usage: false,
            crashes_decided: false,
            usage_decided: false,
            revision: "0".repeat(64),
            protected: false,
            cleanup_pending: false,
            cleanup_busy: false,
            reporting_configured: false,
        };
        value.crashes_decided = true;
        value.usage_decided = true;
        value.protected = false;
        value.cleanup_pending = false;
        value.cleanup_busy = false;
        assert!(consent_ready(&value));
        let mut exit = PrivateExit::default();
        assert!(exit.can_finish(&value));
        exit.record(true);
        assert!(!exit.can_finish(&value));
        exit.record(false);
        assert!(exit.can_finish(&value));
        exit.record(true);
        assert!(exit.skip(true));
        assert!(!exit.can_finish(&value));
        value.usage_decided = false;
        assert!(!consent_ready(&value));
        value.usage_decided = true;
        value.cleanup_pending = true;
        assert!(!consent_ready(&value));
    }
    #[test]
    fn kit_is_nonempty_closed_and_unique() {
        assert!(!valid_kit(&[]));
        assert!(valid_kit(&WidgetKind::ALL));
        assert!(!valid_kit(&[WidgetKind::Delta, WidgetKind::Delta]));
        assert!(serde_json::from_str::<WidgetKind>("\"unknown\"").is_err());
        for kit in kits() {
            assert!(valid_kit(kit));
        }
        assert_eq!(WidgetKind::ALL.iter().filter(|k| k.free()).count(), 4);
    }
    #[test]
    fn private_exit_requires_the_latest_failed_write_and_an_unfinished_onboarding() {
        let mut exit = PrivateExit::default();
        assert!(!exit.skip(true));
        exit.record(true);
        assert!(!exit.skip(false));
        assert!(exit.skip(true));
        assert!(exit.active());
        assert!(!exit.skip(true));
        exit.record(true);
        exit.record(false);
        assert!(!exit.skip(true));
    }
}
