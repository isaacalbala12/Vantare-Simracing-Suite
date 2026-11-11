//! Existing overlay feed, published by the host tick without renderer participation.
use super::{CalendarAlerts, CalendarDocumentState, CalendarView, State, agenda};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime},
};
use vantare_ipc::{
    files,
    session_alerts::{Event, Feed},
};
const FEED_LIMIT: u64 = 65_536;
const EVENTS_LIMIT: usize = 256;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum FeedError {
    Clock,
    Agenda,
    Limit,
    Protected,
    Io,
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Stamp {
    length: u64,
    modified: Option<SystemTime>,
    plain: bool,
}
#[derive(Default)]
pub(super) struct Publisher {
    layout: Option<PathBuf>,
    last_tick: Option<Instant>,
    enabled: bool,
    in_track: bool,
    observed: Option<Vec<Option<Stamp>>>,
    last_error: Option<FeedError>,
}
fn stamps(base: &Path) -> Vec<Option<Stamp>> {
    [
        "official-schedule.json",
        "fallback-schedule.json",
        "official-schedule-previous.json",
        "calendar-stamps.json",
        "calendar-following.json",
        "calendar-prefs.json",
        "calendar-alerts.json",
    ]
    .iter()
    .map(|name| {
        std::fs::symlink_metadata(base.join(name))
            .ok()
            .map(|m| Stamp {
                length: m.len(),
                modified: m.modified().ok(),
                plain: m.is_file() && !m.file_type().is_symlink(),
            })
    })
    .collect()
}
pub(super) fn build(
    view: &CalendarView,
    alerts: &CalendarAlerts,
    now: i64,
    enabled: bool,
    in_track: bool,
) -> Result<Feed, FeedError> {
    let mut feed = Feed {
        version: 1,
        updated_at_ms: u64::try_from(now).map_err(|_| FeedError::Clock)?,
        events: Vec::new(),
    };
    if !enabled || !alerts.channels.in_track {
        return Ok(feed);
    }
    let Some(schedule) = agenda::current(view, now) else {
        return Ok(feed);
    };
    for series in &schedule.series {
        for at in agenda::starts(
            &schedule,
            series,
            now.saturating_sub(2000),
            now.saturating_add(61 * 60_000),
        )
        .map_err(|_| FeedError::Agenda)?
        {
            match agenda::cause(&schedule, series, at, alerts).map_err(|_| FeedError::Agenda)? {
                Some(agenda::Cause::Band) if in_track => continue,
                Some(_) => {}
                None => continue,
            }
            feed.events.push(Event {
                id: format!("{}:{}", series.id, at / 1000),
                label: format!("{} · {}", series.name, series.track),
                starts_at_ms: u64::try_from(at).map_err(|_| FeedError::Clock)?,
            });
            if feed.events.len() > EVENTS_LIMIT {
                return Err(FeedError::Limit);
            }
        }
    }
    feed.events.sort_by_key(|event| event.starts_at_ms);
    Ok(feed)
}
pub(super) fn publish(layout: &Path, feed: &Feed) -> Result<bool, FeedError> {
    let path = vantare_ipc::session_alerts::calendar_path(layout);
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) if !metadata.is_file() || metadata.file_type().is_symlink() => {
            return Err(FeedError::Protected);
        }
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(FeedError::Io),
        _ => {}
    }
    let old = files::read_optional(&path, FEED_LIMIT).map_err(|_| FeedError::Io)?;
    if old
        .as_deref()
        .and_then(|bytes| serde_json::from_slice::<Feed>(bytes).ok())
        .is_some_and(|previous| {
            previous.version == feed.version
                && previous.events == feed.events
                && feed
                    .updated_at_ms
                    .checked_sub(previous.updated_at_ms)
                    .is_some_and(|elapsed| elapsed < 5000)
        })
    {
        return Ok(false);
    }
    let bytes = serde_json::to_vec(feed).map_err(|_| FeedError::Io)?;
    if bytes.len() as u64 > FEED_LIMIT {
        return Err(FeedError::Limit);
    }
    files::save(
        &path,
        &bytes,
        files::Mode::Observed(old.as_deref()),
        &files::Options {
            limit: FEED_LIMIT,
            ..Default::default()
        },
    )
    .map_err(|_| FeedError::Io)?;
    Ok(true)
}
impl State {
    #[must_use]
    pub fn with_layout(mut self, layout: PathBuf) -> Self {
        self.feed.layout = Some(layout);
        self
    }
    pub fn tick_feed(&mut self, now: i64, monotonic: Instant, enabled: bool, in_track: bool) {
        let Some(layout) = self.feed.layout.clone() else {
            return;
        };
        let changed = self.feed.enabled != enabled || self.feed.in_track != in_track;
        if !changed
            && self.feed.last_tick.is_some_and(|previous| {
                monotonic.saturating_duration_since(previous) < Duration::from_secs(1)
            })
        {
            return;
        }
        self.feed.last_tick = Some(monotonic);
        self.feed.enabled = enabled;
        self.feed.in_track = in_track;
        if enabled {
            let next = stamps(&self.base);
            if self.feed.observed.as_ref() != Some(&next) {
                self.load();
                self.config();
                self.feed.observed = Some(next);
            }
        }
        let safe = enabled && self.config_view.documents.alerts == CalendarDocumentState::Ready;
        let result = build(&self.view, &self.config_view.alerts, now, safe, in_track)
            .and_then(|feed| publish(&layout, &feed));
        if let Err(error) = result {
            // A malformed source or expansion must not leave a previous agenda active.
            if let Ok(empty) = build(&self.view, &self.config_view.alerts, now, false, in_track) {
                let _ = publish(&layout, &empty);
            }
            if self.feed.last_error != Some(error) {
                eprintln!("calendar feed: {error:?}");
            }
            self.feed.last_error = Some(error);
        } else {
            self.feed.last_error = None;
        }
    }
}

#[cfg(test)]
#[path = "feed_tests.rs"]
mod tests;
