use super::{
    CalendarDocumentState, HostError, State, agenda,
    launch::{Candidate, Clock},
    launch_types::{CalendarLaunchMode, LEAD_MS, MAX_FUTURE_MS},
};
impl State {
    pub fn launch_target(
        &mut self,
        id: &str,
        at: i64,
        now: i64,
        arming: bool,
    ) -> Result<(), HostError> {
        if !super::text(id)
            || !super::nonblank(id)
            || !(0..=super::TIMESTAMP_LIMIT * 1000).contains(&at)
        {
            return Err(HostError::Rejected);
        }
        if arming
            && at
                .checked_sub(now)
                .is_none_or(|delay| !(LEAD_MS..=MAX_FUTURE_MS + LEAD_MS).contains(&delay))
        {
            return Err(HostError::Rejected);
        }
        self.cache_current(now);
        let schedule = self
            .cached_current
            .as_ref()
            .ok_or(HostError::CalendarScheduleUnavailable)?;
        let series = schedule
            .series
            .iter()
            .find(|series| series.id == id)
            .ok_or(HostError::CalendarScheduleUnavailable)?;
        if !agenda::starts(schedule, series, at, at.saturating_add(1))
            .is_ok_and(|starts| starts.contains(&at))
        {
            return Err(HostError::Rejected);
        }
        Ok(())
    }
    pub fn prepare_launch(
        &mut self,
        mode: &CalendarLaunchMode,
        now: Clock,
    ) -> Result<Option<super::CalendarConfigView>, HostError> {
        self.load();
        self.config();
        match mode {
            CalendarLaunchMode::Once {
                series_id,
                start_at,
            } => {
                self.launch_target(series_id, *start_at, now.wall, true)?;
                Ok(None)
            }
            CalendarLaunchMode::Alerts { expected_revision } => {
                self.cache_current(now.wall);
                if self.cached_current.is_none() {
                    return Err(HostError::CalendarScheduleUnavailable);
                }
                self.arm_auto_launch(expected_revision).map(Some)
            }
        }
    }
    pub fn launch_sources(&mut self, now: i64) -> (bool, bool, Vec<Candidate>) {
        self.cache_current(now);
        let ready = self.config_view.documents.alerts == CalendarDocumentState::Ready;
        let enabled = self.config_view.alerts.auto_launch;
        let candidates = self
            .cached_current
            .as_ref()
            .map_or_else(Vec::new, |schedule| {
                schedule
                    .series
                    .iter()
                    .filter_map(|series| {
                        let at =
                            agenda::starts(schedule, series, now, now.saturating_add(LEAD_MS + 1))
                                .ok()?
                                .first()
                                .copied()?;
                        agenda::cause(schedule, series, at, &self.config_view.alerts)
                            .ok()
                            .flatten()?;
                        Some(Candidate {
                            series_id: series.id.clone(),
                            start_at: at,
                        })
                    })
                    .collect()
            });
        (ready, enabled, candidates)
    }
}
