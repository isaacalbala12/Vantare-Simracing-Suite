//! Renewal scheduling uses injected wall and monotonic clocks, never UI labels.
use std::time::{Duration, Instant};
use vantare_ipc::{
    control::{self, Policy},
    services_protocol::{RenewalOutcome, Reply, Session},
};

const MINUTE: Duration = Duration::from_mins(1);
// Three retries even at the 15-minute cap, plus 15 minutes for polling/I/O.
// Never extends the signed credential or the two-second policy freshness TTL.
#[cfg(test)]
const RENEW_AHEAD_MS: u64 = 60 * 60_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Origin {
    Automatic,
    Purchase,
}

pub(super) fn live_allowed(policy: &Policy, wall: u64, origin: Origin) -> bool {
    !policy.state.permits_access() || urgent(policy, wall) || origin == Origin::Purchase
}

use vantare_services::outcome::renewal_deadline;
pub(super) use vantare_services::outcome::renewal_urgent as urgent;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Skip {
    NoSession,
    Blocked,
    StalePolicy,
    NotDue,
    Live,
    Backoff,
    ClockBehind,
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
            Self::ClockBehind => "license-auto-clock-behind",
        }
    }
}
#[derive(Default)]
pub(super) struct Renewal {
    session: Option<Session>,
    last_attempt: Option<Instant>,
    failures: u8,
    last_verified: bool,
    blocked: bool,
    last_skip: Option<Skip>,
    last_check: Option<Instant>,
}
impl Renewal {
    pub(super) fn signed_in(&self) -> bool {
        self.session == Some(Session::SignedIn)
    }
    pub(super) fn session(&self) -> Option<Session> {
        self.session
    }
    pub(super) fn observe(&mut self, reply: &Reply) {
        if let Reply::Account { session, .. } = reply {
            self.session = Some(*session);
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
        self.last_verified = result == RenewalOutcome::Verified;
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
    pub(super) fn user_recovery(&mut self) {
        self.last_verified = false;
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
    #[cfg(test)]
    pub(super) fn claim(&mut self, policy: &Policy, wall: u64, now: Instant) -> Result<(), Skip> {
        self.claim_from(policy, wall, now, Origin::Automatic)
    }
    pub(super) fn claim_from(
        &mut self,
        policy: &Policy,
        wall: u64,
        now: Instant,
        origin: Origin,
    ) -> Result<(), Skip> {
        let result = self.reason(policy, wall, now, origin);
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
    fn reason(&self, policy: &Policy, wall: u64, now: Instant, origin: Origin) -> Result<(), Skip> {
        if !self.signed_in() {
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
        if matches!(policy.state, control::AccessState::ClockBehind { until_ms } if wall <= until_ms)
        {
            return Err(Skip::ClockBehind);
        }
        if policy.live && !live_allowed(policy, wall, origin) {
            return Err(Skip::Live);
        }
        if self.last_attempt.is_some_and(|last| {
            now.saturating_duration_since(last) < self.policy_delay(policy, wall, origin)
        }) {
            return Err(Skip::Backoff);
        }
        let due = origin == Origin::Purchase
            || self.failures > 0
            || !policy.state.permits_access()
            // Preserve startup discovery of a purchase made outside this Hub.
            // Paid/perpetual bindings with runway do not need this check.
            || (self.last_attempt.is_none() && policy.catalog == control::CatalogAccess::Free)
            || urgent(policy, wall);
        if !due {
            return Err(Skip::NotDue);
        }
        Ok(())
    }

    fn policy_delay(&self, policy: &Policy, wall: u64, origin: Origin) -> Duration {
        if renewal_deadline(policy)
            .is_some_and(|end| wall < end && end <= wall.saturating_add(5 * 60_000))
        {
            // Short-lived/newly restored grants still get attempts near expiry.
            // Keep the one-minute hard floor; never create a tight retry loop.
            MINUTE
        } else if origin != Origin::Purchase
            && self.last_verified
            && policy.state.permits_access()
            && urgent(policy, wall)
        {
            // A valid 200 without new runway is not a transport failure. Poll
            // calmly at the existing cap; near expiry the one-minute floor wins.
            MINUTE * 15
        } else {
            self.delay()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wall_boundary_does_not_wait_for_the_server_ahead_effective_tombstone() {
        let mut renewal = Renewal::default();
        renewal.observe(&account(false));
        let policy = Policy {
            checked_at_ms: 111_000,
            state: control::AccessState::ClockBehind { until_ms: 110_000 },
            ..policy()
        };
        // Effective tombstone210 minus signed forward100 is wall110.
        assert_eq!(renewal.claim(&policy, 111_000, Instant::now()), Ok(()));
    }
    #[test]
    fn explicit_purchase_reopens_confirmation_after_a_success_without_new_runway() {
        let mut renewal = Renewal::default();
        renewal.observe(&account(false));
        let now = Instant::now();
        let p = Policy {
            state: control::AccessState::Active,
            signed_until_ms: Some(3_601_000),
            ..policy()
        };
        renewal.attempted(now);
        renewal.completed(RenewalOutcome::Verified);
        assert_eq!(
            renewal.claim_from(&p, 1000, now + MINUTE, Origin::Automatic),
            Err(Skip::Backoff)
        );
        renewal.user_recovery();
        assert_eq!(
            renewal.claim_from(&p, 1000, now + Duration::from_secs(59), Origin::Purchase),
            Err(Skip::Backoff)
        );
        assert_eq!(
            renewal.claim_from(&p, 1000, now + MINUTE, Origin::Purchase),
            Ok(())
        );
        for minute in [2, 3, 4] {
            renewal.completed(RenewalOutcome::Verified);
            assert_eq!(
                renewal.claim_from(&p, 1000, now + MINUTE * minute, Origin::Purchase),
                Ok(()),
                "a verified unchanged grant must not outlive the purchase window"
            );
            assert_eq!(renewal.failures, 0);
        }
    }

    #[test]
    fn future_tombstone_suppresses_every_automatic_origin_until_the_boundary() {
        let mut renewal = Renewal::default();
        renewal.observe(&account(false));
        let now = Instant::now();
        let mut p = Policy {
            state: control::AccessState::ClockBehind { until_ms: 10_000 },
            ..policy()
        };
        for wall in [1000, 5000, 10_000] {
            p.checked_at_ms = wall;
            for origin in [Origin::Automatic, Origin::Purchase] {
                assert_eq!(
                    renewal.claim_from(&p, wall, now, origin),
                    Err(Skip::ClockBehind)
                );
            }
        }
        assert!(renewal.last_attempt.is_none(), "no HTTP attempt reserved");
        p.checked_at_ms = 10_001;
        assert_eq!(renewal.claim(&p, 10_001, now), Ok(()));
        assert!(!p.state.permits_access(), "waiting does not grant rights");
    }

    #[test]
    fn successful_short_recovery_keeps_failures_at_zero_and_the_hard_floor() {
        let mut renewal = Renewal::default();
        renewal.observe(&account(false));
        let mut now = Instant::now();
        let mut p = Policy {
            state: control::AccessState::Active,
            signed_until_ms: Some(3_601_000),
            ..policy()
        };
        for minute in [0, 15, 30, 45] {
            let wall = 1000 + minute * 60_000;
            p.checked_at_ms = wall;
            assert_eq!(renewal.claim(&p, wall, now), Ok(()));
            let reply = Reply::License {
                policy: p.clone(),
                message: String::new(),
            };
            renewal.completed(
                vantare_services::outcome::outcome(vantare_services::outcome::Observation::Reply(
                    &reply,
                ))
                .renewal,
            );
            assert_eq!(renewal.failures, 0);
            assert_eq!(
                renewal.claim(&p, wall, now + Duration::from_secs(59)),
                Err(Skip::Backoff)
            );
            now += MINUTE * 15;
        }
    }

    #[test]
    fn explicit_session_alone_controls_renewal_without_resetting_backoff() {
        let mut renewal = Renewal::default();
        let now = Instant::now();
        let mut reply = account(false);
        if let Reply::Account {
            signed_in,
            pending,
            expires_at,
            error,
            ..
        } = &mut reply
        {
            *signed_in = false;
            *pending = true;
            *expires_at = None;
            *error = Some("presentation failure".into());
        }
        renewal.observe(&reply);
        assert_eq!(renewal.claim(&policy(), 1000, now), Ok(()));
        renewal.completed(RenewalOutcome::Transient);
        for state in [Session::NeedsSignIn, Session::Pending, Session::SignedOut] {
            if let Reply::Account { session, .. } = &mut reply {
                *session = state;
            }
            renewal.observe(&reply);
            assert_eq!(
                renewal.claim(&policy(), 1000, now + MINUTE),
                Err(Skip::NoSession)
            );
        }
        if let Reply::Account { session, .. } = &mut reply {
            *session = Session::SignedIn;
        }
        renewal.observe(&reply);
        assert_eq!(
            renewal.claim(&policy(), 1000, now + Duration::from_secs(59)),
            Err(Skip::Backoff)
        );
        assert_eq!(renewal.claim(&policy(), 1000, now + MINUTE), Ok(()));
    }
    fn account(pending: bool) -> Reply {
        Reply::Account {
            session: if pending {
                vantare_ipc::services_protocol::Session::Pending
            } else {
                vantare_ipc::services_protocol::Session::SignedIn
            },
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
    fn profile_error_keeps_session_and_renewal_admission_until_explicit_logout() {
        let mut renewal = Renewal::default();
        let now = Instant::now();
        let mut reply = account(false);
        if let Reply::Account { error, .. } = &mut reply {
            *error = Some("servicio sin conexión".into());
        }
        renewal.observe(&reply);
        assert!(
            renewal.signed_in(),
            "explicit Session survives presentation errors"
        );
        renewal.observe(&account(false));
        renewal.observe(&reply);
        assert_eq!(renewal.claim(&policy(), 1000, now), Ok(()));
        renewal.observe(&reply);
        assert_eq!(
            renewal.claim(&policy(), 1000, now + Duration::from_secs(59)),
            Err(Skip::Backoff)
        );
        assert_eq!(renewal.claim(&policy(), 1000, now + MINUTE), Ok(()));
        if let Reply::Account {
            session,
            signed_in,
            expires_at,
            ..
        } = &mut reply
        {
            *session = Session::SignedOut;
            *signed_in = false;
            *expires_at = None;
        }
        renewal.observe(&reply);
        assert_eq!(
            renewal.claim(&policy(), 1000, now + MINUTE * 2),
            Err(Skip::NoSession)
        );
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
            state: vantare_ipc::control::AccessState::Active,
            catalog: control::CatalogAccess::Founders,
            ..policy()
        };
        assert_eq!(
            r.claim(&p, 1000, now),
            Err(Skip::NotDue),
            "a healthy restored binding does not require startup HTTP"
        );
        r.completed(RenewalOutcome::Verified);
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Err(Skip::NotDue));
        p.signed_until_ms = Some(1000 + RENEW_AHEAD_MS + 1);
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Err(Skip::NotDue));
        p.signed_until_ms = Some(1000 + RENEW_AHEAD_MS);
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Ok(()));
        p.live = true;
        p.signed_until_ms = Some(1000 + RENEW_AHEAD_MS * 2 + 1);
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 2), Err(Skip::Live));
        p.live = false;
        p.checked_at_ms = 1001;
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 2), Err(Skip::StalePolicy));
        r.checked(now);
        assert!(!r.should_check(false, now + Duration::from_secs(29)));
        assert!(r.should_check(false, now + Duration::from_secs(30)));
    }

    #[test]
    fn restored_free_checks_for_external_purchases_once_without_polling_forever() {
        let now = Instant::now();
        let p = Policy {
            state: vantare_ipc::control::AccessState::Active,
            ..policy()
        };
        let mut r = Renewal::default();
        r.observe(&account(false));
        assert_eq!(r.claim(&p, 1000, now), Ok(()));
        r.completed(RenewalOutcome::Verified);
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Err(Skip::NotDue));
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 60), Err(Skip::NotDue));
    }

    #[test]
    fn capped_backoff_gets_three_retries_before_expiry_with_fifteen_minutes_margin() {
        let mut r = Renewal::default();
        r.observe(&account(false));
        let now = Instant::now();
        r.attempted(now);
        r.completed(RenewalOutcome::Verified);
        let end = 10_000_000;
        let wall = end - RENEW_AHEAD_MS;
        let mut p = Policy {
            state: vantare_ipc::control::AccessState::Active,
            signed_until_ms: Some(end),
            checked_at_ms: wall,
            ..policy()
        };
        // Start the test already at the worst-case backoff cap.
        r.failures = 8;
        let mut attempts = Vec::new();
        for minute in 0..=60 {
            let at = wall + minute * 60_000;
            p.checked_at_ms = at;
            if r.claim(
                &p,
                at,
                now + MINUTE * u32::try_from(minute).expect("minutes"),
            )
            .is_ok()
            {
                attempts.push(minute);
                r.completed(RenewalOutcome::Transient);
            }
            assert!(!r.blocked);
        }
        assert!(
            attempts.len() >= 3,
            "actual claims before expiry: {attempts:?}"
        );
        assert_eq!(
            &attempts[..3],
            &[15, 30, 45],
            "cap must leave the final quarter-hour available"
        );
        assert!(attempts.iter().all(|minute| *minute < 60));
    }

    #[test]
    fn expired_deadline_does_not_force_one_minute_retries_forever() {
        let now = Instant::now();
        let mut r = Renewal::default();
        r.observe(&account(false));
        r.attempted(now);
        r.failures = 8;
        let p = Policy {
            signed_until_ms: Some(999),
            ..policy()
        };
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Err(Skip::Backoff));
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 15), Ok(()));
    }

    #[test]
    fn short_deadline_reduces_backoff_but_keeps_one_minute_floor_and_verified_recovers() {
        let now = Instant::now();
        let mut r = Renewal::default();
        r.observe(&account(false));
        r.attempted(now);
        r.failures = 8;
        let mut p = Policy {
            state: vantare_ipc::control::AccessState::Active,
            signed_until_ms: Some(241_000),
            ..policy()
        };
        assert_eq!(
            r.claim(&p, 1000, now + Duration::from_secs(59)),
            Err(Skip::Backoff)
        );
        assert_eq!(r.claim(&p, 1000, now + MINUTE), Ok(()));
        r.completed(RenewalOutcome::Verified);
        p.signed_until_ms = Some(1000 + RENEW_AHEAD_MS + 1);
        assert_eq!(r.claim(&p, 1000, now + MINUTE * 2), Err(Skip::NotDue));
        assert!(!r.blocked);
    }
}
