//! Bounded UTC recurrence expansion and GPUI's local alert windows.
use super::{CalendarAlerts, CalendarBandMode, CalendarDays, CalendarSchedule, CalendarSeries, STARTS_LIMIT, WEEKDAYS, date_millis};
use chrono::{Datelike, Local, TimeZone, Timelike};

const MINUTE: i64 = 60_000;
const DAY: i64 = 86_400_000;
const ORIGIN: i64 = -62_135_596_800_000;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum AgendaError { Invalid, Expansion }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Cause { Band, Slot }
pub(super) fn daily(series: &CalendarSeries) -> bool {
 series.recurrence.kind == "interval" && !matches!(series.event_kind.as_str(), "weekly" | "special")
}
pub(super) fn starts(schedule: &CalendarSchedule, series: &CalendarSeries, from: i64, until: i64) -> Result<Vec<i64>, AgendaError> {
 let from = from.max(date_millis(&schedule.valid_from).ok_or(AgendaError::Invalid)?);
 let until = until.min(date_millis(&schedule.valid_until).ok_or(AgendaError::Invalid)?);
 if until <= from { return Ok(Vec::new()); }
 let mut out = Vec::new();
 let recurrence = &series.recurrence;
 if recurrence.kind == "interval" {
  let every = i64::from(recurrence.interval_minutes) * MINUTE;
  if every <= 0 { return Err(AgendaError::Invalid); }
  let base = ORIGIN + i64::from(series.start_offset_minute).rem_euclid(i64::from(recurrence.interval_minutes)) * MINUTE;
  let mut at = base + (from-base).div_euclid(every)*every;
  if at < from { at += every; }
  while at < until { out.push(at); if out.len() > STARTS_LIMIT { return Err(AgendaError::Expansion); } at += every; }
 } else if recurrence.kind == "weekly-slots" {
  let mut date = from.div_euclid(DAY) * DAY;
  while date < until {
   let stamp = chrono::DateTime::from_timestamp_millis(date).ok_or(AgendaError::Invalid)?;
   let weekday = WEEKDAYS[stamp.weekday().num_days_from_monday() as usize];
   if recurrence.days.iter().any(|day| day == weekday) {
    for time in &recurrence.times_utc {
     let (hour,minute) = time.split_once(':').ok_or(AgendaError::Invalid)?;
     let hour = hour.parse::<i64>().map_err(|_| AgendaError::Invalid)?;
     let minute = minute.parse::<i64>().map_err(|_| AgendaError::Invalid)?;
     if hour > 23 || minute > 59 || hour < 0 || minute < 0 { return Err(AgendaError::Invalid); }
     let at = date+(hour*60+minute)*MINUTE;
     if at >= from && at < until { out.push(at); if out.len() > STARTS_LIMIT { return Err(AgendaError::Expansion); } }
    }
   }
   date += DAY;
  }
 } else { return Err(AgendaError::Invalid); }
 out.sort_unstable(); out.dedup(); Ok(out)
}
pub(super) fn cause(schedule: &CalendarSchedule, series: &CalendarSeries, at: i64, alerts: &CalendarAlerts) -> Result<Option<Cause>, AgendaError> {
 if !daily(series) { return Ok(alerts.slots.iter().any(|slot| slot.series_id == series.id && slot.at.checked_mul(1000) == Some(at)).then_some(Cause::Slot)); }
 let Some(band) = alerts.bands.iter().find(|band| band.series_id == series.id) else {return Ok(None);};
 let local = Local.timestamp_millis_opt(at).single().ok_or(AgendaError::Invalid)?;
 let minute = local.hour()*60+local.minute();
 let weekend = local.weekday().num_days_from_monday() >= 5;
 if minute < u32::from(band.from) || minute >= u32::from(band.to) || matches!(band.days, CalendarDays::Weekdays) && weekend || matches!(band.days, CalendarDays::Weekend) && !weekend { return Ok(None); }
 if band.mode == CalendarBandMode::First {
  // Frozen alerts.rs adds elapsed minutes to local midnight, including DST days.
  let midnight = Local.from_local_datetime(&local.date_naive().and_hms_opt(0,0,0).ok_or(AgendaError::Invalid)?).earliest().ok_or(AgendaError::Invalid)?.timestamp_millis();
  let from = midnight + i64::from(band.from)*MINUTE;
  if starts(schedule, series, from, from+i64::from(band.to-band.from)*MINUTE)?.first().copied() != Some(at) {return Ok(None);}
 }
 Ok(Some(Cause::Band))
}

pub(super) fn current(view: &super::CalendarView, now: i64) -> Option<CalendarSchedule> {
 let active = |schedule: &CalendarSchedule| date_millis(&schedule.valid_from).zip(date_millis(&schedule.valid_until)).is_some_and(|(from,until)| from <= now && now < until);
 let official = view.official.as_ref().filter(|schedule| active(schedule));
 let fallback = view.fallback.as_ref().filter(|schedule| active(schedule));
 let mut result = official.or(fallback)?.clone();
 if let (Some(_),Some(extra)) = (official,fallback) {
  let normalized = |value: &str| value.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_lowercase()).collect::<String>();
  for series in &extra.series {
   if result.series.len() == super::SERIES_LIMIT {break;}
   if result.series.iter().any(|old| old.id == series.id || normalized(&old.name) == normalized(&series.name)) {continue;}
   let mut added = series.clone(); added.source = "racecontrol".into(); result.series.push(added);
  }
 }
 Some(result)
}
