//! Home is a host-owned projection. Subscribe only while the screen is visible.
use vantare_hub_host::{
    home::HomeView,
    protocol::{REQUEST_TIMEOUT_MS, Reply, Request, Topic, UiToHost},
};

struct Pending {
    id: u32,
    deadline: f64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LaunchProblem {
    Failed,
    ConditionsChanged,
    Uncertain { read_from: u32 },
}
pub struct Home {
    pub value: Option<HomeView>,
    pub failed: bool,
    pub launch_problem: Option<LaunchProblem>,
    pub selected: String,
    pub choosing: bool,
    launch_queued: Option<(String, String)>,
    launch_pending: Option<Pending>,
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
            launch_problem: None,
            selected: String::new(),
            choosing: false,
            launch_queued: None,
            launch_pending: None,
            active: false,
            retry: false,
            next_id: 0x8000_0000,
            pending: None,
        }
    }
}
impl Home {
    pub fn choice(&self, favorite: bool) -> Option<&vantare_hub_host::home::HomeProfile> {
        let value = self.value.as_ref()?;
        if !favorite && let Some(profile) = value.profiles.iter().find(|p| p.id == self.selected) {
            return Some(profile);
        }
        value
            .profiles
            .iter()
            .find(|p| Some(&p.id) == value.favorite.as_ref())
            .or_else(|| {
                if favorite {
                    None
                } else {
                    value.profiles.first()
                }
            })
    }
    pub fn launching(&self) -> bool {
        matches!(self.launch_problem, Some(LaunchProblem::Uncertain { .. }))
            || self.launch_queued.is_some()
            || self.launch_pending.is_some()
            || self.value.as_ref().is_some_and(|v| {
                matches!(
                    v.launch,
                    vantare_hub_host::home::LaunchProgress::Running { .. }
                )
            })
    }
    pub fn can_launch(
        &self,
        core: &vantare_hub_host::protocol::CoreStatus,
        favorite: bool,
    ) -> bool {
        core.access.verified
            && !core.access.blocked
            && !core.live
            && !self.launching()
            && self.value.as_ref().is_some_and(|v| !v.protected)
            && self.choice(favorite).is_some()
    }
    pub fn queue_launch(&mut self, core: &vantare_hub_host::protocol::CoreStatus, favorite: bool) {
        if self.can_launch(core, favorite) {
            self.launch_problem = None;
            self.launch_queued = Some((
                self.choice(favorite).unwrap().id.clone(),
                self.value.as_ref().unwrap().revision.clone(),
            ));
        }
    }
    pub fn next_launch(
        &mut self,
        now: f64,
        core: &vantare_hub_host::protocol::CoreStatus,
    ) -> Option<UiToHost> {
        if self
            .launch_pending
            .as_ref()
            .is_some_and(|p| now >= p.deadline)
        {
            self.launch_pending = None;
            // A missing acknowledgement cannot prove the host did not launch.
            // Only a subsequent Home publication or a fresh HomeGet may resolve it.
            self.launch_problem = Some(LaunchProblem::Uncertain {
                read_from: self.next_id,
            });
            self.retry = true;
        }
        let (profile, base_revision) = self.launch_queued.take()?;
        if !self.can_launch(core, false) {
            self.launch_problem = Some(LaunchProblem::ConditionsChanged);
            self.retry = true;
            return None;
        }
        if !self.value.as_ref().is_some_and(|v| {
            v.revision == base_revision && v.profiles.iter().any(|p| p.id == profile)
        }) {
            self.launch_problem = Some(LaunchProblem::ConditionsChanged);
            self.retry = true;
            return None;
        }
        let id = self.next_id;
        self.next_id = id.checked_add(1)?;
        self.launch_problem = None;
        self.launch_pending = Some(Pending {
            id,
            deadline: now + f64::from(REQUEST_TIMEOUT_MS) / 1000.0,
        });
        Some(UiToHost::Request {
            id,
            request: Request::LauncherLaunch {
                profile,
                base_revision,
            },
        })
    }
    pub fn finish_launch(&mut self, id: u32, accepted: bool) -> bool {
        if self.launch_pending.as_ref().is_none_or(|p| p.id != id) {
            return false;
        }
        self.launch_pending = None;
        self.launch_problem = (!accepted).then_some(LaunchProblem::Failed);
        self.retry = true;
        true
    }
    #[cfg(test)]
    pub fn last_request_id(&self) -> u32 {
        self.next_id
    }
    pub fn retry(&mut self) {
        if !matches!(self.launch_problem, Some(LaunchProblem::Uncertain { .. })) {
            self.launch_problem = None;
        }
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
        self.observe_launch(&value, Some(id));
        self.value = Some(value);
        self.pending = None;
        self.failed = false;
        true
    }
    pub fn event(&mut self, value: HomeView) -> bool {
        if !self.active {
            return false;
        }
        self.observe_launch(&value, None);
        self.value = Some(value);
        self.failed = false;
        true
    }
    fn observe_launch(&mut self, value: &HomeView, request_id: Option<u32>) {
        let running = matches!(
            value.launch,
            vantare_hub_host::home::LaunchProgress::Running { .. }
        );
        if running {
            self.launch_pending = None;
        }
        if let Some(LaunchProblem::Uncertain { read_from }) = self.launch_problem
            && (running || request_id.is_none_or(|id| id >= read_from))
        {
            self.launch_problem = None;
        }
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
        self.pending
            .iter()
            .chain(self.launch_pending.iter())
            .map(|p| p.deadline)
            .min_by(f64::total_cmp)
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
    fn ready() -> (Home, vantare_hub_host::protocol::CoreStatus) {
        let mut home = Home::default();
        let id = request(&home.next(0.0, true));
        let value = serde_json::from_value(
            crate::catalog::catalog()["home"]["scenes"]["inicio-base"].clone(),
        )
        .unwrap();
        home.accept(id, Reply::HomeGet { value });
        let mut core = vantare_hub_host::protocol::CoreStatus::default();
        core.access.verified = true;
        (home, core)
    }
    #[test]
    fn launch_uses_the_profile_and_revision_once_and_refreshes_after_answer() {
        let (mut home, core) = ready();
        home.selected = "entreno-rapido".into();
        home.queue_launch(&core, false);
        home.queue_launch(&core, true);
        let UiToHost::Request {
            id,
            request:
                Request::LauncherLaunch {
                    profile,
                    base_revision,
                },
        } = home.next_launch(1.0, &core).unwrap()
        else {
            panic!("launch contract")
        };
        assert_eq!(profile, "entreno-rapido");
        assert_eq!(base_revision, home.value.as_ref().unwrap().revision);
        assert!(home.next_launch(2.0, &core).is_none());
        assert!(!home.finish_launch(id + 1, true));
        assert!(home.finish_launch(id, false));
        assert!(home.launch_problem.is_some());
        home.retry();
        assert!(
            home.launch_problem.is_none(),
            "retry clears the displayed launch failure"
        );
        assert!(!home.next(3.0, true).is_empty());
    }
    #[test]
    fn launch_rechecks_revocation_and_timeout_never_relaunches_automatically() {
        let (mut home, mut core) = ready();
        home.queue_launch(&core, true);
        core.access.blocked = true;
        assert!(home.next_launch(1.0, &core).is_none());
        core.access.blocked = false;
        home.queue_launch(&core, true);
        let UiToHost::Request { id, .. } = home.next_launch(2.0, &core).unwrap() else {
            unreachable!()
        };
        assert!(home.next_launch(48.0, &core).is_none());
        assert!(matches!(
            home.launch_problem,
            Some(LaunchProblem::Uncertain { .. })
        ));
        home.queue_launch(&core, true);
        assert!(!home.can_launch(&core, true));
        assert!(!home.finish_launch(id, true));
        assert!(home.next_launch(100.0, &core).is_none());
        for restriction in ["live", "unverified", "protected", "running"] {
            let (mut home, mut core) = ready();
            match restriction {
                "live" => core.live = true,
                "unverified" => core.access.verified = false,
                "protected" => home.value.as_mut().unwrap().protected = true,
                _ => {
                    home.value.as_mut().unwrap().launch =
                        vantare_hub_host::home::LaunchProgress::Running {
                            text: String::new(),
                        }
                }
            }
            home.queue_launch(&core, true);
            assert!(home.next_launch(0.0, &core).is_none(), "{restriction}");
        }
    }
    #[test]
    fn timed_out_launch_blocks_retries_until_a_fresh_home_projection_resolves_it() {
        for running in [false, true] {
            let (mut home, core) = ready();
            home.queue_launch(&core, true);
            let UiToHost::Request { id, .. } = home.next_launch(1.0, &core).unwrap() else {
                unreachable!()
            };
            home.retry();
            let stale = request(&home.next(2.0, true));
            let idle = home.value.clone().unwrap();
            home.next_launch(46.0, &core);
            home.retry();
            home.queue_launch(&core, true);
            assert!(home.next_launch(47.0, &core).is_none());
            assert!(!home.can_launch(&core, true));
            assert!(
                !home.finish_launch(id, true),
                "a late ack is not a fresh projection"
            );
            home.accept(
                stale,
                Reply::HomeGet {
                    value: idle.clone(),
                },
            );
            assert!(
                !home.can_launch(&core, true),
                "pre-timeout reads cannot certify Idle"
            );
            let fresh = request(&home.next(48.0, true));
            let mut value = idle.clone();
            if running {
                value.launch = vantare_hub_host::home::LaunchProgress::Running {
                    text: String::new(),
                };
            }
            home.accept(fresh, Reply::HomeGet { value });
            assert_eq!(home.launch_problem, None);
            assert_eq!(home.can_launch(&core, true), !running);
            home.event(idle);
            assert!(home.can_launch(&core, true));
        }
    }
    #[test]
    fn dispatch_reports_revoked_launch_conditions_instead_of_silently_dropping_the_click() {
        for restriction in ["blocked", "live", "unverified", "protected", "running"] {
            let (mut home, mut core) = ready();
            home.queue_launch(&core, true);
            match restriction {
                "blocked" => core.access.blocked = true,
                "live" => core.live = true,
                "unverified" => core.access.verified = false,
                "protected" => home.value.as_mut().unwrap().protected = true,
                _ => {
                    home.value.as_mut().unwrap().launch =
                        vantare_hub_host::home::LaunchProgress::Running {
                            text: String::new(),
                        }
                }
            }
            assert!(home.next_launch(1.0, &core).is_none());
            assert_eq!(home.launch_problem, Some(LaunchProblem::ConditionsChanged));
        }
    }
    #[test]
    fn changed_projection_cannot_launch_a_different_profile_than_the_clicked_one() {
        let (mut home, core) = ready();
        home.queue_launch(&core, true);
        home.value.as_mut().unwrap().revision = "changed".into();
        assert!(home.next_launch(0.0, &core).is_none());
        assert!(home.launch_problem.is_some());
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
