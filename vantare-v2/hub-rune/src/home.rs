//! Home is a host-owned projection. Subscribe only while the screen is visible.
use vantare_hub_host::{
    home::HomeView,
    protocol::{REQUEST_TIMEOUT_MS, Reply, Request, Topic, UiToHost},
};

struct Pending {
    id: u32,
    deadline: f64,
}
pub struct Home {
    pub value: Option<HomeView>,
    pub failed: bool,
    active: bool,
    retry: bool,
    next_id: u32,
    pending: Option<Pending>,
}
impl Default for Home {
    fn default() -> Self {
        Self {
            value: None,
            failed: false,
            active: false,
            retry: false,
            next_id: 0x8000_0000,
            pending: None,
        }
    }
}
impl Home {
    pub fn retry(&mut self) {
        self.retry = true;
    }
    pub fn next(&mut self, now: f64, visible: bool) -> Vec<UiToHost> {
        let mut messages = Vec::new();
        if !visible {
            if self.active {
                messages.push(UiToHost::Unsubscribe { topic: Topic::Home });
            }
            self.active = false;
            self.pending = None;
            return messages;
        }
        if !self.active {
            self.active = true;
            self.retry = true;
            messages.push(UiToHost::Subscribe { topic: Topic::Home });
        }
        if self.pending.as_ref().is_some_and(|p| now >= p.deadline) {
            self.failed = true;
            self.pending = None;
        }
        if self.retry && self.pending.is_none() {
            self.retry = false;
            self.failed = false;
            let id = self.next_id;
            if let Some(next) = id.checked_add(1) {
                self.next_id = next;
                self.pending = Some(Pending {
                    id,
                    deadline: now + f64::from(REQUEST_TIMEOUT_MS) / 1000.0,
                });
                messages.push(UiToHost::Request {
                    id,
                    request: Request::HomeGet {},
                });
            } else {
                self.failed = true;
            }
        }
        messages
    }
    pub fn accept(&mut self, id: u32, reply: Reply) -> bool {
        let Some(pending) = &self.pending else {
            return false;
        };
        if pending.id != id {
            return false;
        }
        let Reply::HomeGet { value } = reply else {
            return false;
        };
        // Home replies/events are written serially by the host: retain its wire order.
        self.value = Some(value);
        self.pending = None;
        self.failed = false;
        true
    }
    pub fn event(&mut self, value: HomeView) -> bool {
        if !self.active {
            return false;
        }
        self.value = Some(value);
        self.failed = false;
        true
    }
    pub fn fail(&mut self, id: u32) -> bool {
        if self.pending.as_ref().is_none_or(|p| p.id != id) {
            return false;
        }
        self.pending = None;
        self.failed = true;
        true
    }
    pub fn due(&self) -> Option<f64> {
        self.pending.as_ref().map(|p| p.deadline)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(messages: &[UiToHost]) -> u32 {
        messages
            .iter()
            .find_map(|m| match m {
                UiToHost::Request {
                    id,
                    request: Request::HomeGet {},
                } => Some(*id),
                _ => None,
            })
            .unwrap()
    }
    #[test]
    fn subscriptions_follow_visibility_without_periodic_polling() {
        let mut home = Home::default();
        assert!(home.next(0.0, false).is_empty());
        let messages = home.next(1.0, true);
        assert!(matches!(
            messages[0],
            UiToHost::Subscribe { topic: Topic::Home }
        ));
        let id = request(&messages);
        assert!(home.accept(
            id,
            Reply::HomeGet {
                value: HomeView::default()
            }
        ));
        assert!(home.next(600.0, true).is_empty());
        assert_eq!(home.due(), None);
        assert!(matches!(
            home.next(601.0, false).as_slice(),
            [UiToHost::Unsubscribe { topic: Topic::Home }]
        ));
        assert!(!home.event(HomeView::default()));
        assert!(home.next(602.0, false).is_empty());
        assert_ne!(request(&home.next(603.0, true)), id);
    }
    #[test]
    fn timeout_preserves_last_value_and_late_response_cannot_replace_it() {
        let mut home = Home::default();
        let id = request(&home.next(0.0, true));
        home.event(HomeView {
            version: "new".into(),
            ..Default::default()
        });
        assert!(home.next(46.0, true).is_empty());
        assert!(home.failed);
        assert_eq!(home.value.as_ref().unwrap().version, "new");
        assert!(!home.accept(
            id,
            Reply::HomeGet {
                value: HomeView::default()
            }
        ));
        home.retry();
        let retry = request(&home.next(47.0, true));
        assert_ne!(retry, id);
        assert!(!home.fail(id));
        assert!(home.fail(retry));
        assert!(home.failed);
    }
    #[test]
    fn events_and_correlated_responses_preserve_the_hosts_wire_order() {
        let mut home = Home::default();
        let id = request(&home.next(0.0, true));
        home.event(HomeView {
            version: "event".into(),
            ..Default::default()
        });
        assert!(!home.accept(
            id + 1,
            Reply::HomeGet {
                value: HomeView::default()
            }
        ));
        assert!(home.accept(
            id,
            Reply::HomeGet {
                value: HomeView::default()
            }
        ));
        assert_ne!(
            home.value.as_ref().unwrap().version,
            "event",
            "the later host reply is authoritative"
        );
        home.event(HomeView {
            version: "latest event".into(),
            ..Default::default()
        });
        assert_eq!(home.value.unwrap().version, "latest event");
    }
}
