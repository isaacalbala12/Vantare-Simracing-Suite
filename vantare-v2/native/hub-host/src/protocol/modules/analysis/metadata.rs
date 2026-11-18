use super::{Job, check_job};
use crate::analysis::catalog::{
    AnalysisSessionEndReason, AnalysisSessionKind, AnalysisSessionSummary, map_error,
};
use crate::analysis::{
    ErrorCode, Lap, LapTime, Reader, SessionEndReason, SessionKind, SessionSummary,
};
use crate::protocol::HostError;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
    time::Instant,
};

type SessionKey = (u64, u64);
type LapKey = (u64, u64, u32, u32);
const MAX_OFFICIAL_LAPS: usize = 8192;
const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

pub(super) fn session_indices(
    sessions: &[SessionSummary],
) -> Result<BTreeMap<SessionKey, u32>, HostError> {
    sessions
        .iter()
        .enumerate()
        .map(|(index, row)| {
            let index = u32::try_from(index).map_err(|_| HostError::AnalysisTooLarge)?;
            Ok(((row.epoch, row.session), index))
        })
        .collect()
}

pub(super) fn project_sessions(
    rows: Vec<SessionSummary>,
) -> Result<Vec<AnalysisSessionSummary>, HostError> {
    let nonempty = |text: String| (!text.is_empty()).then_some(text);
    rows.into_iter()
        .enumerate()
        .map(|(index, row)| {
            if row.started_at_ms > MAX_SAFE_INTEGER
                || row.ended_at_ms.is_some_and(|ms| ms > MAX_SAFE_INTEGER)
            {
                return Err(HostError::AnalysisUnreadable);
            }
            Ok(AnalysisSessionSummary {
                index: u32::try_from(index).map_err(|_| HostError::AnalysisTooLarge)?,
                kind: match row.kind {
                    SessionKind::Practice => AnalysisSessionKind::Practice,
                    SessionKind::Qualifying => AnalysisSessionKind::Qualifying,
                    SessionKind::Race => AnalysisSessionKind::Race,
                    SessionKind::Other => AnalysisSessionKind::Other,
                    SessionKind::Unknown => AnalysisSessionKind::Unknown,
                },
                kind_text: nonempty(row.kind_text),
                track_name: nonempty(row.track_name),
                vehicle: nonempty(row.vehicle),
                class_name: nonempty(row.class_name),
                started_at_ms: row.started_at_ms,
                ended_at_ms: row.ended_at_ms,
                sealed: row.sealed,
                end_reason: row.end_reason.map(|reason| match reason {
                    SessionEndReason::SessionChanged => AnalysisSessionEndReason::SessionChanged,
                    SessionEndReason::CoreStopped => AnalysisSessionEndReason::CoreStopped,
                }),
                position_at_close: row.final_position,
                class_position_at_close: row.final_class_position,
                laps_completed: row.laps_completed,
                best_lap_ms: row.best_lap_ms,
            })
        })
        .collect()
}

pub(super) fn official_times(
    helper: &Path,
    reader: &mut Reader,
    laps: &[Lap],
    sessions: &[SessionSummary],
    job: &Job,
) -> Result<BTreeMap<LapKey, LapTime>, HostError> {
    let active: BTreeSet<_> = laps.iter().map(|lap| (lap.epoch, lap.session)).collect();
    let mut official = BTreeMap::new();
    // Use the helper's session order for a deterministic allocation of the budget.
    for (epoch, session) in sessions
        .iter()
        .map(|row| (row.epoch, row.session))
        .filter(|key| active.contains(key))
    {
        check_job(job, Instant::now())?;
        match reader.lap_times_until(epoch, session, job.deadline) {
            Ok(times) if official.len() + times.len() <= MAX_OFFICIAL_LAPS => {
                official.extend(
                    times
                        .into_iter()
                        .map(|row| ((row.epoch, row.session, row.car, row.lap), row)),
                );
            }
            Ok(_) => eprintln!("host-analysis: official lap budget exceeded for {epoch}/{session}"),
            Err(error) if matches!(error.code, ErrorCode::Unreadable | ErrorCode::Limit) => {
                eprintln!(
                    "host-analysis: official laps unavailable for {epoch}/{session}: {:?}",
                    error.code
                );
                // The failed request collected its helper. Restore the ordinary
                // lap summaries and check the same database before using it again.
                let mut reopened = Reader::open_until(
                    helper,
                    &reader.path,
                    job.cancel.clone(),
                    job.deadline,
                    reader.timeout,
                )
                .map_err(|error| map_error(error.code))?;
                if reader.stamp != reopened.stamp
                    || (
                        reader.summary.watermark,
                        reader.summary.finished,
                        reader.summary.attempted,
                    ) != (
                        reopened.summary.watermark,
                        reopened.summary.finished,
                        reopened.summary.attempted,
                    )
                {
                    return Err(HostError::AnalysisChanged);
                }
                std::mem::swap(&mut reopened.summary, &mut reader.summary);
                *reader = reopened;
            }
            Err(error) => return Err(map_error(error.code)),
        }
    }
    Ok(official)
}
