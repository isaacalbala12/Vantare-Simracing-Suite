//! Observaciones de páginas; sin contenido ni acceso a cuenta.
use super::Hub;
use crate::Section;
use std::time::{Duration, Instant};
use vantare_services::diagnostics::{self, Usage, activity::Activity};

pub(super) struct State {
    epoch: Instant,
    sampled: Instant,
    clock: Activity,
    page: Option<Section>,
    pending: Duration,
    generation: Option<u64>,
    pub active: bool,
}

impl State {
    pub fn new(active: bool) -> Self {
        let now = Instant::now();
        Self {
            epoch: now,
            sampled: now,
            clock: Activity::default(),
            page: None,
            pending: Duration::ZERO,
            generation: None,
            active,
        }
    }

    fn flush(&mut self) -> Option<Usage> {
        let mut event = None;
        if let Some(page) = self.page
            && self.pending.as_secs() > 0
        {
            event = Some(Usage::PageUsage {
                page: page_name(page).into(),
                duration_seconds: self.pending.as_secs().min(60),
            });
        }
        self.pending = Duration::ZERO;
        event
    }

    fn consent(&mut self, generation: Option<u64>) {
        if self.generation != generation {
            self.generation = generation;
            self.clock = Activity::default();
            self.pending = Duration::ZERO;
            self.page = None;
        }
    }

    fn observe(&mut self, now: Duration, enabled: bool, section: Section) -> Vec<Usage> {
        let elapsed = self.clock.observe(now, enabled && self.active);
        if !enabled {
            self.page = None;
            self.pending = Duration::ZERO;
            return vec![];
        }
        let mut events = vec![];
        if !self.active {
            events.extend(self.flush());
            self.page = None;
            return events;
        }
        if self.page == Some(section) {
            self.pending += elapsed;
        } else {
            events.extend(self.flush());
            self.page = Some(section);
            events.push(Usage::PageViewed {
                page: page_name(section).into(),
            });
        }
        if self.pending >= Duration::from_mins(1) {
            events.extend(self.flush());
        }
        events
    }
}

fn page_name(page: Section) -> &'static str {
    match page {
        Section::Home => "home",
        Section::Workshop => "workshop",
        Section::Studio => "studio",
        Section::Launcher => "launcher",
        Section::Calendar => "calendar",
        Section::Strategy => "strategy",
        Section::Engineer => "engineer",
        Section::Analysis => "analysis",
        Section::Testing => "testing",
        Section::Roadmap => "roadmap",
        Section::Account => "account",
        Section::Licenses => "licenses",
        Section::Notifications => "notifications",
        Section::Settings => "settings",
    }
}

impl Hub {
    pub(super) fn poll_usage(&mut self, cx: &gpui::Context<Self>, force: bool) {
        let now = Instant::now();
        if !force && now.duration_since(self.analytics.sampled) < Duration::from_secs(1) {
            return;
        }
        self.analytics.sampled = now;
        let generation = diagnostics::configured()
            .then(|| {
                diagnostics::data_root()
                    .and_then(|root| diagnostics::Privacy::load(&root))
                    .ok()
                    .filter(|privacy| privacy.usage)
                    .map(|privacy| privacy.generation)
            })
            .flatten();
        self.analytics.consent(generation);
        let available = self.demo.is_none()
            && self.capture.is_none()
            && !self.privacy_question_pending()
            && !self.remote.read(cx).requires_access()
            && self.shell.access.beta_lock(self.section).is_none();
        let enabled = generation.is_some() && available;
        if enabled {
            diagnostics::record_usage_once(&Usage::InstallationObserved {});
        }
        for event in self.analytics.observe(
            now.duration_since(self.analytics.epoch),
            enabled,
            self.section,
        ) {
            if let Some(generation) = generation {
                diagnostics::record_usage_in_generation(&event, generation);
            }
        }
    }

    pub(super) fn finish_usage(&mut self) {
        if let Some(event) = self.analytics.flush()
            && let Some(generation) = self.analytics.generation
        {
            diagnostics::record_usage_in_generation(&event, generation);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn consent_generation_change_discards_page_time_even_without_a_denied_sample() {
        let mut state = State::new(true);
        state.consent(Some(0));
        state.observe(Duration::ZERO, true, Section::Home);
        state.observe(Duration::from_secs(1), true, Section::Home);
        state.consent(Some(1));
        assert!(state.flush().is_none());
        let events = state.observe(Duration::from_secs(2), true, Section::Home);
        assert!(matches!(events.as_slice(), [Usage::PageViewed { .. }]));
        assert!(state.flush().is_none());
    }
    #[test]
    fn pages_track_only_consent_active_time_and_do_not_restore_revoked_time() {
        let mut state = State::new(true);
        assert!(
            state
                .observe(Duration::ZERO, false, Section::Home)
                .is_empty()
        );
        let first = state.observe(Duration::from_secs(10), true, Section::Home);
        assert!(matches!(first.as_slice(), [Usage::PageViewed { page }] if page == "home"));
        assert!(
            state
                .observe(Duration::from_secs(11), true, Section::Home)
                .is_empty()
        );
        let switch = state.observe(Duration::from_secs(12), true, Section::Studio);
        assert!(
            matches!(switch.as_slice(), [Usage::PageUsage { page, duration_seconds: 1 }, Usage::PageViewed { .. }] if page == "home")
        );
        assert!(
            state
                .observe(Duration::from_secs(13), true, Section::Studio)
                .is_empty()
        );
        assert!(
            state
                .observe(Duration::from_secs(14), false, Section::Studio)
                .is_empty()
        );
        let _ = state.observe(Duration::from_secs(20), true, Section::Studio);
        assert!(state.flush().is_none());
        state.active = false;
        assert!(
            state
                .observe(Duration::from_secs(21), true, Section::Studio)
                .is_empty()
        );
        state.active = true;
        let _ = state.observe(Duration::from_secs(30), true, Section::Studio);
        assert!(state.flush().is_none());
        let _ = state.observe(Duration::from_secs(31), true, Section::Studio);
        assert!(matches!(
            state.flush(),
            Some(Usage::PageUsage {
                duration_seconds: 1,
                ..
            })
        ));
    }
    #[test]
    fn every_page_has_a_unique_catalog_name_without_localized_text() {
        let names: std::collections::BTreeSet<_> =
            Section::ALL.iter().map(|page| page_name(*page)).collect();
        assert_eq!(names.len(), Section::ALL.len());
        for name in names {
            let payload = serde_json::json!({"event":"page_viewed", "properties":{"page":name}});
            assert!(serde_json::from_value::<Usage>(payload).is_ok());
        }
    }
}
