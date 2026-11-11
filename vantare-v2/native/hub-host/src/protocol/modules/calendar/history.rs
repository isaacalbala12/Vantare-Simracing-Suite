//! Read-only projection of GPUI's calendar-history.json; never repairs or seeds it.
use super::{DOCUMENT_LIMIT, SERIES_LIMIT, State, TEXT_LIMIT, TIMESTAMP_LIMIT, nonblank, text};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const HISTORY_WEEKS_LIMIT: usize = 8;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarHistoryTrack {
    pub series_id: String,
    pub name: String,
    pub track: String,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarHistoryWeek {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub from: i64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub until: i64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub seen_at: i64,
    pub tracks: Vec<CalendarHistoryTrack>,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarHistoryView {
    pub weeks: Vec<CalendarHistoryWeek>,
    pub invalid_cache: bool,
}

// GPUI history.rs allows unknown fields. Read those documents without rewriting
// them, but expose only this bounded projection to the renderer.
#[derive(Deserialize)]
struct History {
    weeks: Vec<CalendarHistoryWeek>,
}

fn parse(bytes: &[u8]) -> Option<CalendarHistoryView> {
    if bytes.len() > DOCUMENT_LIMIT {
        return None;
    }
    let history: History = serde_json::from_slice(bytes).ok()?;
    if history.weeks.len() > HISTORY_WEEKS_LIMIT {
        return None;
    }
    let mut dates = HashSet::new();
    for week in &history.weeks {
        let stamps = [week.from, week.until, week.seen_at];
        if stamps
            .iter()
            .any(|stamp| !(0..=TIMESTAMP_LIMIT).contains(stamp))
            || week.until <= week.from
            || !dates.insert(week.from)
            || week.tracks.len() > SERIES_LIMIT
        {
            return None;
        }
        let mut ids = HashSet::new();
        for track in &week.tracks {
            if ![&track.series_id, &track.name, &track.track]
                .into_iter()
                .all(|value| value.len() <= TEXT_LIMIT && text(value))
                || !nonblank(&track.series_id)
                || !nonblank(&track.name)
                || !ids.insert(&track.series_id)
            {
                return None;
            }
        }
    }
    let mut weeks = history.weeks;
    weeks.sort_by_key(|week| week.from);
    Some(CalendarHistoryView {
        weeks,
        invalid_cache: false,
    })
}

impl State {
    pub fn history(&self) -> CalendarHistoryView {
        let path = self.base.join("calendar-history.json");
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return CalendarHistoryView::default();
            }
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                if let Ok(bytes) = vantare_ipc::files::read(&path, DOCUMENT_LIMIT as u64)
                    && let Some(view) = parse(&bytes)
                {
                    return view;
                }
            }
            _ => {}
        }
        CalendarHistoryView {
            invalid_cache: true,
            ..Default::default()
        }
    }
}

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;
