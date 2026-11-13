//! Read-only polling with an injected frame clock, one request in flight and exact correlation.
use vantare_hub_host::{
    protocol::{REQUEST_TIMEOUT_MS, Reply, Request, UiToHost},
    roadmap::{MAX_ITEMS, REFRESH_MS, RoadmapView},
};
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Cached,
    Refresh,
}
struct Pending {
    id: u32,
    kind: Kind,
    deadline: f64,
}
pub struct Roadmap {
    pub value: RoadmapView,
    pub failed: bool,
    pub tab: &'static str,
    pending: Option<Pending>,
    entered: bool,
    cached: bool,
    refresh_at: f64,
    next_id: u32,
}
impl Default for Roadmap {
    fn default() -> Self {
        Self {
            value: RoadmapView {
                publication: None,
                stale: true,
            },
            failed: false,
            tab: "board",
            pending: None,
            entered: false,
            cached: true,
            refresh_at: 0.0,
            next_id: 100,
        }
    }
}
impl Roadmap {
    pub fn next(&mut self, now: f64, visible: bool) -> Option<UiToHost> {
        if !visible {
            self.entered = false;
            self.pending = None;
            return None;
        }
        if !self.entered {
            self.entered = true;
            self.cached = true;
        }
        if self.pending.as_ref().is_some_and(|p| now >= p.deadline) {
            self.failed = true;
            self.pending = None;
        }
        if self.pending.is_some() {
            return None;
        }
        let kind = if self.cached {
            self.cached = false;
            Kind::Cached
        } else {
            if now < self.refresh_at {
                return None;
            }
            self.refresh_at = now + f64::from(REFRESH_MS) / 1000.0;
            Kind::Refresh
        };
        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1)?;
        self.pending = Some(Pending {
            id,
            kind,
            deadline: now + f64::from(REQUEST_TIMEOUT_MS) / 1000.0,
        });
        Some(UiToHost::Request {
            id,
            request: match kind {
                Kind::Cached => Request::RoadmapCached {},
                Kind::Refresh => Request::RoadmapRefresh {},
            },
        })
    }
    pub fn accept(&mut self, id: u32, reply: Reply) -> bool {
        let Some(pending) = &self.pending else {
            return false;
        };
        if pending.id != id {
            return false;
        }
        let value = match (pending.kind, reply) {
            (Kind::Cached, Reply::RoadmapCached { value })
            | (Kind::Refresh, Reply::RoadmapRefresh { value }) => value,
            _ => return false,
        };
        self.pending = None;
        if value.publication.as_ref().is_some_and(|p| {
            p.items.len() > MAX_ITEMS
                || p.items
                    .iter()
                    .any(|i| !["next", "later", "now", "done"].contains(&i.section.as_str()))
        }) {
            self.failed = true;
            return true;
        }
        if value.publication.is_some() {
            self.value.publication = value.publication;
        }
        self.value.stale = value.stale;
        self.failed = false;
        true
    }
    pub fn fail(&mut self, id: u32) -> bool {
        if self.pending.as_ref().is_some_and(|p| p.id == id) {
            self.pending = None;
            self.failed = true;
            true
        } else {
            false
        }
    }
    pub fn due(&self) -> Option<f64> {
        if !self.entered {
            None
        } else {
            Some(
                self.pending
                    .as_ref()
                    .map_or(self.refresh_at, |p| p.deadline),
            )
        }
    }
    pub fn status(&self) -> &'static str {
        if self.failed {
            if self.value.publication.is_some() {
                "roadmap.failed"
            } else {
                "roadmap.failedEmpty"
            }
        } else if self.pending.is_some() {
            "roadmap.loading"
        } else if self.value.publication.is_none() {
            "roadmap.noPublication"
        } else if self.value.stale {
            "roadmap.cached"
        } else {
            "roadmap.updated"
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn id(message: UiToHost) -> u32 {
        if let UiToHost::Request { id, .. } = message {
            id
        } else {
            panic!("request")
        }
    }
    fn sample() -> RoadmapView {
        vantare_hub_host::roadmap::project(
            Some(
                serde_json::from_str(include_str!(
                    "../../hub-web/fixtures/roadmap-publication.json"
                ))
                .unwrap(),
            ),
            false,
        )
        .unwrap()
    }
    #[test]
    fn cache_then_refresh_is_serial_throttled_and_stops_when_hidden() {
        let mut state = Roadmap::default();
        let cache = id(state.next(0.0, true).unwrap());
        assert!(state.next(1.0, true).is_none());
        assert!(state.accept(cache, Reply::RoadmapCached { value: sample() }));
        let refresh = id(state.next(1.0, true).unwrap());
        assert!(state.accept(refresh, Reply::RoadmapRefresh { value: sample() }));
        assert!(state.next(300.0, true).is_none());
        assert!(state.next(301.0, true).is_some());
        assert!(state.next(1000.0, false).is_none());
        assert_eq!(state.due(), None);
        assert!(!state.accept(refresh, Reply::RoadmapRefresh { value: sample() }));
    }
    #[test]
    fn failed_refresh_preserves_publication_and_ignores_old_responses() {
        let mut state = Roadmap::default();
        let cache = id(state.next(0.0, true).unwrap());
        let publication = sample();
        assert!(state.accept(
            cache,
            Reply::RoadmapCached {
                value: publication.clone()
            }
        ));
        let refresh = id(state.next(0.0, true).unwrap());
        assert!(!state.accept(
            cache,
            Reply::RoadmapCached {
                value: RoadmapView {
                    publication: None,
                    stale: true
                }
            }
        ));
        assert!(state.fail(refresh));
        assert_eq!(state.value, publication);
        assert_eq!(state.status(), "roadmap.failed");
        assert!(state.next(299.0, true).is_none());
        assert!(state.next(300.0, true).is_some());
    }
    #[test]
    fn stalled_request_expires_and_never_accepts_a_late_reply() {
        let mut state = Roadmap::default();
        let old = id(state.next(0.0, true).unwrap());
        let refresh = id(state.next(45.0, true).unwrap());
        assert_ne!(old, refresh);
        assert!(!state.accept(old, Reply::RoadmapCached { value: sample() }));
        assert!(state.next(90.0, true).is_none());
        assert!(state.failed);
    }
    #[test]
    fn official_publication_preserves_literal_titles_and_legacy_lane() {
        let p = sample().publication.unwrap();
        assert!(!p.items.is_empty());
        assert_eq!(p.items[0].title, "Rework - Roadmap");
        let mut state = Roadmap::default();
        let request = id(state.next(0.0, true).unwrap());
        let mut value = sample();
        value.publication.as_mut().unwrap().items[0].section = "later".into();
        assert!(state.accept(request, Reply::RoadmapCached { value }));
        assert_eq!(state.value.publication.unwrap().items[0].section, "later");
    }
}
