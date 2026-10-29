//! Renewal scheduling uses injected wall and monotonic clocks, never UI labels.
use std::time::{Duration, Instant};
use vantare_ipc::{
    control::{self, Policy},
    services_protocol::{RenewalOutcome, Reply},
};

const MINUTE: Duration = Duration::from_mins(1);
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Skip {
    NoSession,
    Blocked,
    StalePolicy,
    NotDue,
    Live,
    Backoff,
}
impl Skip {
    fn diagnostic(self) -> &'static str {
        match self {
            Self::NoSession => "license-auto-no-session",
            Self::Blocked => "license-auto-definitive",
            Self::StalePolicy => "license-auto-stale-policy",
            Self::NotDue => "license-auto-not-due",
            Self::Live => "license-auto-live",
            Self::Backoff => "license-auto-backoff",
        }
    }
}
#[derive(Default)]
pub(super) struct Renewal {
    signed_in: bool,
    last_attempt: Option<Instant>,
    failures: u8,
    blocked: bool,
    last_skip: Option<Skip>,
    last_check: Option<Instant>,
}
impl Renewal {
    pub(super) fn signed_in(&self) -> bool {
        self.signed_in
    }
    pub(super) fn observe(&mut self, reply: &Reply) {
        if let Reply::Account {
            signed_in,
            pending,
            expires_at,
            error,
            ..
        } = reply
        {
            self.signed_in = *signed_in && !pending && expires_at.is_some() && error.is_none();
            // Pending polls never reset the hard floor or a definitive rejection.
        }
    }
    pub(super) fn should_check(&self, connected: bool, now: Instant) -> bool {
        connected
            || self
                .last_check
                .is_none_or(|last| now.saturating_duration_since(last) >= Duration::from_secs(30))
    }
    pub(super) fn checked(&mut self, now: Instant) {
        self.last_check = Some(now);
    }
    pub(super) fn completed(&mut self, result: RenewalOutcome) {
        match result {
            RenewalOutcome::Verified => {
                self.failures = 0;
                self.blocked = false;
            }
            RenewalOutcome::Definitive => self.blocked = true,
            RenewalOutcome::Transient => {
                self.blocked = false;
                self.failures = self.failures.saturating_add(1);
            }
        }
    }
    pub(super) fn automatic_action_ready(&mut self, now: Instant) -> bool {
        let reason = if !self.signed_in {
            Some(Skip::NoSession)
        } else if self.blocked {
            Some(Skip::Blocked)
        } else if self
            .last_attempt
            .is_some_and(|last| now.saturating_duration_since(last) < self.delay())
        {
            Some(Skip::Backoff)
        } else {
            None
        };
        if let Some(reason) = reason {
            if self.last_skip != Some(reason) {
                eprintln!("{}", reason.diagnostic());
            }
            self.last_skip = Some(reason);
            false
        } else {
            true
        }
    }
    pub(super) fn user_recovery(&mut self) {
        self.blocked = false;
        self.failures = 0;
        // Preserve last_attempt: a user action cannot create an automatic burst.
    }
    pub(super) fn attempted(&mut self, now: Instant) {
        self.last_attempt = Some(now);
    }
    fn delay(&self) -> Duration {
        MINUTE
            * match self.failures {
                0..=1 => 1,
                2 => 2,
                3 => 4,
                4 => 8,
                _ => 15,
            }
    }
    pub(super) fn claim(&mut self, policy: &Policy, wall: u64, now: Instant) -> Result<(), Skip> {
        let result = self.reason(policy, wall, now);
        if let Err(reason) = result {
            // Closed reason on transition; avoid filling triage every timer tick.
            if self.last_skip != Some(reason) {
                eprintln!("{}", reason.diagnostic());
            }
            self.last_skip = Some(reason);
        } else {
            self.last_skip = None;
            self.last_attempt = Some(now);
        }
        result
    }
    fn reason(&self, policy: &Policy, wall: u64, now: Instant) -> Result<(), Skip> {
        if !self.signed_in {
            return Err(Skip::NoSession);
        }
        if self.blocked {
            return Err(Skip::Blocked);
        }
        if policy.version != control::VERSION
            || policy.revision == 0
            || wall < policy.checked_at_ms
            || wall.saturating_sub(policy.checked_at_ms) >= 2000
        {
            return Err(Skip::StalePolicy);
        }
        if policy.live && policy.overlays_advanced {
            return Err(Skip::Live);
        }
        if self
            .last_attempt
            .is_some_and(|last| now.saturating_duration_since(last) < self.delay())
        {
            return Err(Skip::Backoff);
        }
        let due = self.last_attempt.is_none()
            || self.failures > 0
            || !policy.overlays_advanced
            || policy
                .valid_until_ms
                .is_some_and(|end| end <= wall.saturating_add(60_000));
        if !due {
            return Err(Skip::NotDue);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn account(pending: bool) -> Reply {
        Reply::Account {
            signed_in: true,
            pending,
            expires_at: Some(900),
            error: None,
            profile: None,
            copy_link: false,
            message: String::new(),
        }
    }
    fn policy() -> Policy {
        Policy {
            version: control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            ..Policy::default()
        }
    }
    #[test]
    fn restored_session_claims_once_and_pending_polls_cannot_reset_the_floor() {
        let mut r = Renewal::default();
        let now = Instant::now();
        let p = policy();
        assert_eq!(r.claim(&p, 1000, now), Err(Skip::NoSession));
        r.observe(&account(false));
        assert_eq!(r.claim(&p, 1000, now), Ok(()));
        r.observe(&account(true));
        r.observe(&account(false));
        assert_eq!(
            r.claim(&p, 1000, now + Duration::from_secs(59)),
            Err(Skip::Backoff)
        );
        assert!(!r.automatic_action_ready(now + Duration::from_secs(59)));
        assert!(r.automatic_action_ready(now + MINUTE));
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Ok(()));
    }
    #[test]
    fn transient_backoff_is_one_two_four_eight_fifteen_minutes_with_a_cap() {
        let mut r = Renewal::default();
        r.observe(&account(false));
        let mut now = Instant::now();
        let p = policy();
        for minutes in [1, 2, 4, 8, 15, 15] {
            assert_eq!(r.claim(&p, 1000, now), Ok(()));
            r.completed(RenewalOutcome::Transient);
            let delay = MINUTE * minutes;
            assert_eq!(
                r.claim(
                    &p,
                    1000,
                    (now + delay)
                        .checked_sub(Duration::from_millis(1))
                        .expect("injected boundary")
                ),
                Err(Skip::Backoff)
            );
            now += delay;
        }
        r.completed(RenewalOutcome::Definitive);
        r.observe(&account(true));
        r.observe(&account(false));
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 100), Err(Skip::Blocked));
    }
    #[test]
    fn explicit_device_recovery_clears_a_definitive_rejection_but_preserves_the_floor() {
        let now = Instant::now();
        let p = policy();
        let mut r = Renewal::default();
        r.observe(&account(false));
        assert_eq!(r.claim(&p, 1000, now), Ok(()));
        r.completed(RenewalOutcome::Definitive);
        r.user_recovery();
        assert_eq!(
            r.claim(&p, 1000, now + Duration::from_secs(59)),
            Err(Skip::Backoff)
        );
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Ok(()));
        r.completed(RenewalOutcome::Definitive);
        r.attempted(now + MINUTE * 2);
        r.completed(RenewalOutcome::Transient);
        assert_eq!(
            r.claim(&p, 1000, now + MINUTE * 3),
            Ok(()),
            "a new transient result is not a definitive block"
        );
    }

    #[test]
    fn verified_deadlines_live_and_stale_policy_keep_their_boundaries() {
        let mut r = Renewal::default();
        r.observe(&account(false));
        let now = Instant::now();
        let mut p = Policy {
            overlays_advanced: true,
            ..policy()
        };
        assert_eq!(r.claim(&p, 1000, now), Ok(()));
        r.completed(RenewalOutcome::Verified);
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Err(Skip::NotDue));
        p.valid_until_ms = Some(61_001);
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Err(Skip::NotDue));
        p.valid_until_ms = Some(61_000);
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Ok(()));
        p.live = true;
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 2), Err(Skip::Live));
        p.live = false;
        p.checked_at_ms = 1001;
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 2), Err(Skip::StalePolicy));
        r.checked(now);
        assert!(!r.should_check(false, now + Duration::from_secs(29)));
        assert!(r.should_check(false, now + Duration::from_secs(30)));
    }
}
