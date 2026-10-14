//! Un contador por tipo efectivamente visible, nunca por ID de instancia.
use super::LiveScreens;
use std::{
    collections::{BTreeMap, BTreeSet},
    time::{Duration, Instant},
};
use vantare_services::diagnostics::{Usage, activity::Activity};

pub(super) struct State {
    epoch: Instant,
    sampled: Instant,
    clock: Activity,
    pending: BTreeMap<String, Duration>,
    generation: Option<u64>,
}

impl Default for State {
    fn default() -> Self {
        let now = Instant::now();
        Self {
            epoch: now,
            sampled: now,
            clock: Activity::default(),
            pending: BTreeMap::new(),
            generation: None,
        }
    }
}

impl State {
    fn consent(&mut self, generation: Option<u64>) {
        if self.generation != generation {
            self.generation = generation;
            self.clock = Activity::default();
            self.pending.clear();
        }
    }
    fn event(widget_type: &str, elapsed: Duration) -> Option<Usage> {
        (elapsed.as_secs() > 0).then(|| Usage::WidgetUsage {
            widget_type: widget_type.into(),
            duration_seconds: elapsed.as_secs().min(60),
        })
    }
    pub fn finish(&mut self, cx: &gpui::App) {
        for (kind, elapsed) in std::mem::take(&mut self.pending) {
            if let Some(event) = Self::event(&kind, elapsed)
                && let Some(generation) = self.generation
            {
                crate::analytics::record_in_generation(cx, &event, generation);
            }
        }
    }

    fn observe(&mut self, now: Duration, allowed: bool, visible: BTreeSet<String>) -> Vec<Usage> {
        let elapsed = self.clock.observe(now, allowed);
        if !allowed {
            self.pending.clear();
            return vec![];
        }
        let mut events = vec![];
        self.pending.retain(|kind, elapsed| {
            if visible.contains(kind) {
                true
            } else {
                events.extend(Self::event(kind, *elapsed));
                false
            }
        });
        for kind in visible {
            // Un tipo nuevo no hereda el intervalo anterior a su primera observación.
            if let Some(pending) = self.pending.get_mut(&kind) {
                *pending += elapsed;
                if *pending >= Duration::from_mins(1) {
                    events.extend(Self::event(&kind, *pending));
                    *pending = Duration::ZERO;
                }
            } else {
                self.pending.insert(kind, Duration::ZERO);
            }
        }
        events
    }
}

impl LiveScreens {
    pub(super) fn sample_usage(&mut self, cx: &gpui::App) {
        let now = Instant::now();
        if now.duration_since(self.usage.sampled) < Duration::from_secs(1) {
            return;
        }
        self.usage.sampled = now;
        let generation = crate::analytics::generation(cx);
        self.usage.consent(generation);
        let allowed = generation.is_some();
        if !allowed {
            let _ =
                self.usage
                    .observe(now.duration_since(self.usage.epoch), false, BTreeSet::new());
            return;
        }
        let visible: BTreeSet<_> = self
            .widgets
            .values()
            .filter(|widget| {
                let overlay = widget.view.read(cx);
                !self.hidden
                    && self.last.is_some()
                    && widget.visible
                    && !overlay.hidden_off_track
                    && overlay.shown_in_session()
                    && !crate::rights::denied(overlay.kind, cx)
            })
            .map(|widget| widget.settings.kind().name().to_owned())
            .collect();
        for event in self
            .usage
            .observe(now.duration_since(self.usage.epoch), allowed, visible)
        {
            if let Some(generation) = generation {
                crate::analytics::record_in_generation(cx, &event, generation);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn consent_generation_change_discards_widget_time_without_a_denied_sample() {
        let mut state = State::default();
        state.consent(Some(0));
        state.observe(Duration::ZERO, true, visible());
        state.observe(Duration::from_secs(1), true, visible());
        state.consent(Some(1));
        assert!(state.pending.is_empty());
        assert!(
            state
                .observe(Duration::from_secs(2), true, visible())
                .is_empty()
        );
        assert!(state.pending.values().all(Duration::is_zero));
    }
    fn visible() -> BTreeSet<String> {
        ["pedals", "pedals", "standings"]
            .into_iter()
            .map(String::from)
            .collect()
    }
    #[test]
    fn visible_types_are_counted_once_and_revocation_never_backfills() {
        let mut state = State::default();
        assert!(state.observe(Duration::ZERO, false, visible()).is_empty());
        assert!(
            state
                .observe(Duration::from_secs(10), true, visible())
                .is_empty()
        );
        for second in 11..70 {
            assert!(
                state
                    .observe(Duration::from_secs(second), true, visible())
                    .is_empty()
            );
        }
        let events = state.observe(Duration::from_secs(70), true, visible());
        assert_eq!(events.len(), 2);
        for event in events {
            assert!(matches!(
                event,
                Usage::WidgetUsage {
                    duration_seconds: 60,
                    ..
                }
            ));
        }
        assert!(
            state
                .observe(Duration::from_secs(71), true, visible())
                .is_empty()
        );
        assert!(
            state
                .observe(Duration::from_secs(72), false, visible())
                .is_empty()
        );
        assert!(
            state
                .observe(Duration::from_secs(100), true, visible())
                .is_empty()
        );
        assert!(
            state
                .observe(Duration::from_secs(101), true, visible())
                .is_empty()
        );
        let retired = state.observe(Duration::from_secs(102), true, BTreeSet::new());
        assert_eq!(retired.len(), 2);
        assert!(retired.into_iter().all(|event| matches!(
            event,
            Usage::WidgetUsage {
                duration_seconds: 1,
                ..
            }
        )));
    }
}
