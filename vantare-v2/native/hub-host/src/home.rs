//! Read-only Home projection. Launching remains the shared Launcher contract.
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::{Instant, SystemTime},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{files, launcher as resident};
#[path = "home/demand.rs"]
pub mod demand;
#[path = "home/layout.rs"]
pub mod layout;
pub use layout::{HomeLayoutView, HomePreviewState, HomePreviewWidget, HomeWidgetKind};

pub const WATCH_MS: u64 = 500;
pub const PROGRESS_LIMIT: usize = 120;
pub const DATE_LIMIT: usize = 64;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HomeProfile {
    pub id: String,
    pub name: String,
    pub steps: usize,
    pub favorite: bool,
    pub last_launched_at: Option<String>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum LaunchProgress {
    #[default]
    Idle,
    Running {
        text: String,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HomeView {
    pub sim: HomeSim,
    pub profiles: Vec<HomeProfile>,
    pub favorite: Option<String>,
    pub revision: String,
    pub protected: bool,
    pub launch: LaunchProgress,
    pub layout: HomeLayoutView,
    pub version: String,
}
fn text(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .take(limit)
        .collect()
}
fn profiles(path: &Path) -> (Vec<HomeProfile>, Option<String>, String, bool) {
    let empty = || (vec![], None, vantare_services::content_hash(&[]), false);
    if path.is_absolute() && !vantare_launcher::is_local_path(path) {
        return (vec![], None, vantare_services::content_hash(&[]), true);
    }
    let bytes = match files::read_optional(path, files::MAX_DOCUMENT) {
        Ok(Some(bytes)) => bytes,
        Ok(None) => return empty(),
        Err(_) => return (vec![], None, vantare_services::content_hash(&[]), true),
    };
    let revision = vantare_services::content_hash(&bytes);
    let document = match vantare_launcher::Document::from_bytes(&bytes) {
        Ok(value) if value.profiles.len() <= crate::launcher::PROFILE_LIMIT => value,
        _ => return (vec![], None, revision, true),
    };
    let favorite = crate::favorite::selected(&document).map(str::to_owned);
    let summaries = document
        .profiles
        .iter()
        .map(|profile| HomeProfile {
            id: profile.id.clone(),
            name: profile.name.clone(),
            steps: profile.steps.len(),
            favorite: profile.favorite,
            last_launched_at: profile
                .last_launched_at
                .as_ref()
                .map(|value| text(value, DATE_LIMIT)),
        })
        .collect();
    (summaries, favorite, revision, false)
}
type Signature = [Option<(SystemTime, u64)>; 3];
fn signature(path: &Path) -> Option<(SystemTime, u64)> {
    let metadata = std::fs::metadata(path).ok()?;
    Some((metadata.modified().ok()?, metadata.len()))
}
pub struct Reader {
    launcher: PathBuf,
    layout: PathBuf,
    last_check: Option<Instant>,
    signature: Option<Signature>,
    sim: Option<HomeSim>,
    launch: Option<LaunchProgress>,
}
impl Reader {
    pub fn new(launcher: PathBuf, layout: PathBuf) -> Self {
        Self {
            launcher,
            layout,
            last_check: None,
            signature: None,
            sim: None,
            launch: None,
        }
    }
    pub fn view(&self, sim: HomeSim) -> HomeView {
        let (profiles, favorite, revision, protected) = profiles(&self.launcher);
        let launch = self.launch_progress();
        HomeView {
            profiles,
            favorite,
            revision,
            protected,
            launch,
            sim,
            layout: layout_preview(&self.layout),
            version: vantare_ipc::product::VERSION.into(),
        }
    }
    fn launch_progress(&self) -> LaunchProgress {
        resident::read_status(&self.launcher)
            .filter(|status| status.running)
            .map_or(LaunchProgress::Idle, |status| LaunchProgress::Running {
                text: text(&status.progress, PROGRESS_LIMIT),
            })
    }
    pub fn changed(&mut self, subscribed: bool, now: Instant, sim: HomeSim) -> Option<HomeView> {
        if !subscribed {
            self.last_check = None;
            self.signature = None;
            self.sim = None;
            self.launch = None;
            return None;
        }
        if self.last_check.is_some_and(|last| {
            now.saturating_duration_since(last).as_millis() < u128::from(WATCH_MS)
        }) {
            return None;
        }
        self.last_check = Some(now);
        let observed = [
            signature(&self.launcher),
            signature(&self.layout),
            signature(&resident::status_path(&self.launcher)),
        ];
        let launch = self.launch_progress();
        if self.signature.as_ref() == Some(&observed)
            && self.sim.as_ref() == Some(&sim)
            && self.launch.as_ref() == Some(&launch)
        {
            return None;
        }
        self.launch = Some(launch);
        self.signature = Some(observed);
        self.sim = Some(sim.clone());
        Some(self.view(sim))
    }
}

#[cfg(windows)]
fn layout_preview(path: &Path) -> HomeLayoutView {
    crate::settings::layout::preview::read(path)
}
#[cfg(not(windows))]
fn layout_preview(_path: &Path) -> HomeLayoutView {
    HomeLayoutView::empty(HomePreviewState::Missing)
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HomeSim {
    pub connected: bool,
    pub track: Option<String>,
}
impl HomeSim {
    pub fn from_photo(photo: &vantare_ipc::Photo) -> Self {
        use vantare_domain::{Quality, SourceKind, SourceState};
        let connected = photo.snapshot.origin.source.kind == SourceKind::Live
            && !matches!(
                photo.snapshot.state.source_state,
                SourceState::Waiting | SourceState::Lost
            )
            && photo.signal_state(vantare_ipc::Signal::SessionInfo)
                == vantare_ipc::SignalState::Requested;
        let track = if connected
            && photo.signal_state(vantare_ipc::Signal::TrackName)
                == vantare_ipc::SignalState::Requested
        {
            match &photo.snapshot.state.session.track_name {
                Quality::Reliable(value) | Quality::Estimated(value) | Quality::Stale(value) => {
                    Some(text(value, PROGRESS_LIMIT))
                }
                Quality::Unavailable => None,
            }
        } else {
            None
        };
        Self { connected, track }
    }
}

impl Default for HomeView {
    fn default() -> Self {
        Self {
            profiles: vec![],
            favorite: None,
            revision: vantare_services::content_hash(&[]),
            protected: false,
            launch: LaunchProgress::Idle,
            layout: HomeLayoutView::empty(HomePreviewState::Missing),
            version: vantare_ipc::product::VERSION.into(),
            sim: HomeSim::default(),
        }
    }
}
#[cfg(test)]
#[path = "home/tests.rs"]
mod tests;
