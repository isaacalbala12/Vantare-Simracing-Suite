//! The supervisor renews from the core's signed-policy deadlines, never UI labels.
use std::time::{Duration, Instant};
use vantare_ipc::control::{self, Policy};
use vantare_services::protocol::Reply;

const RETRY: Duration = Duration::from_mins(1);
const AHEAD_MS: u64 = 60_000;

#[derive(Default)]
pub(super) struct Renewal {
    signed_in: bool,
    attempted_at: Option<Instant>,
    blocked: bool,
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
            if !self.signed_in {
                self.attempted_at = None;
                self.blocked = false;
            }
        }
    }

    pub(super) fn completed(&mut self, reply: &Reply, now: Instant) {
        self.attempted_at = Some(now);
        self.blocked = !matches!(reply, Reply::License { policy, .. }
            if policy.version == control::VERSION && policy.revision > 0
                && policy.error.is_none() && policy.overlays_advanced);
    }

    pub(super) fn claim(&mut self, policy: &Policy, wall_ms: u64, now: Instant) -> bool {
        // A stale transport observation cannot trigger HTTP. A definitive denial
        // can: login must recover a logout tombstone through a fresh signed grant.
        let fresh = policy.version == control::VERSION
            && policy.revision > 0
            && wall_ms >= policy.checked_at_ms
            && wall_ms.saturating_sub(policy.checked_at_ms) < 2_000;
        // Reconcile once after restoring a session too. In v1 an expired paid
        // capability falls back to Free and no longer supplies a future deadline.
        let due = self.attempted_at.is_none()
            || !policy.overlays_advanced
            || policy
                .valid_until_ms
                .is_some_and(|end| end <= wall_ms.saturating_add(AHEAD_MS));
        if !self.signed_in
            || self.blocked
            || !fresh
            || !due
            || (policy.live && policy.overlays_advanced)
            || self
                .attempted_at
                .is_some_and(|last| now.saturating_duration_since(last) < RETRY)
        {
            return false;
        }
        self.attempted_at = Some(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session(signed_in: bool) -> Reply {
        Reply::Account {
            signed_in,
            pending: false,
            copy_link: false,
            expires_at: signed_in.then_some(900),
            error: None,
            profile: None,
            message: String::new(),
        }
    }
    #[test]
    fn restored_session_without_binding_requests_once_and_uses_injected_retry_clock() {
        let mut renewal = Renewal::default();
        let now = Instant::now();
        let policy = Policy {
            version: control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            ..Policy::default()
        };
        assert!(!renewal.claim(&policy, 1000, now));
        renewal.observe(&session(true));
        assert!(
            renewal.claim(&policy, 1000, now),
            "restored login with no license needs no UI action"
        );
        assert!(!renewal.claim(&policy, 1000, now + Duration::from_secs(59)));
        assert!(renewal.claim(&policy, 1000, now + RETRY));
        renewal.observe(&session(false));
        assert!(!renewal.claim(&policy, 1000, now + RETRY * 2));
    }
    #[test]
    fn deadlines_renew_before_expiry_but_never_from_stale_or_live_licensed_policy() {
        let now = Instant::now();
        for (deadline, live, checked, expected) in [
            (61_001, false, 1000, false),
            (61_000, false, 1000, true),
            (999, false, 1000, true),
            (61_000, true, 1000, false),
            (61_000, false, 1001, false),
            (61_000, false, 0, true),
        ] {
            let mut renewal = Renewal::default();
            renewal.observe(&session(true));
            let initial = Policy {
                version: control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                overlays_advanced: true,
                ..Policy::default()
            };
            assert!(
                renewal.claim(&initial, 1000, now),
                "one startup reconciliation even with a stored license"
            );
            let policy = Policy {
                version: control::VERSION,
                revision: 1,
                checked_at_ms: checked,
                overlays_advanced: true,
                live,
                valid_until_ms: Some(deadline),
                ..Policy::default()
            };
            assert_eq!(renewal.claim(&policy, 1000, now + RETRY), expected);
        }
        let mut renewal = Renewal::default();
        renewal.observe(&session(true));
        assert!(!renewal.claim(&Policy::default(), 1000, now));
    }

    #[test]
    fn pending_failed_or_unconfirmed_account_never_starts_license_http() {
        let now = Instant::now();
        let policy = Policy {
            version: control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            ..Policy::default()
        };
        for reply in [
            Reply::Account {
                signed_in: true,
                pending: true,
                copy_link: false,
                expires_at: Some(900),
                error: None,
                profile: None,
                message: String::new(),
            },
            Reply::Account {
                signed_in: true,
                pending: false,
                copy_link: false,
                expires_at: None,
                error: None,
                profile: None,
                message: String::new(),
            },
            Reply::Account {
                signed_in: true,
                pending: false,
                copy_link: false,
                expires_at: Some(900),
                error: Some("fixture denied".into()),
                profile: None,
                message: String::new(),
            },
        ] {
            let mut renewal = Renewal::default();
            renewal.observe(&reply);
            assert!(!renewal.claim(&policy, 1000, now));
            renewal.observe(&session(true));
            assert!(
                renewal.claim(&policy, 1000, now),
                "confirmed login triggers the supervisor without a UI renewal command"
            );
        }
    }

    #[test]
    fn failed_automatic_renewal_stops_until_an_explicit_retry_or_new_login() {
        let now = Instant::now();
        let policy = Policy {
            version: control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            ..Policy::default()
        };
        let mut renewal = Renewal::default();
        renewal.observe(&session(true));
        assert!(renewal.claim(&policy, 1000, now));
        renewal.completed(
            &Reply::Error {
                message: "offline fixture".into(),
            },
            now,
        );
        assert!(
            !renewal.claim(&policy, 1000, now + RETRY * 10),
            "an error never starts a background HTTP loop"
        );
        renewal.observe(&session(false));
        renewal.observe(&session(true));
        assert!(renewal.claim(&policy, 1000, now + RETRY * 10));
        let verified = Policy {
            overlays_advanced: true,
            ..policy.clone()
        };
        renewal.completed(
            &Reply::License {
                policy: verified.clone(),
                message: String::new(),
            },
            now + RETRY * 10,
        );
        assert!(
            !renewal.claim(&verified, 1000, now + RETRY * 11),
            "successful explicit renewal must not be duplicated after AccountPoll"
        );
    }
}
