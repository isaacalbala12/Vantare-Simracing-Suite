use super::*;
use crate::launcher_resident::ResidentAnswerRejection as R;
use std::path::PathBuf;
use vantare_ipc::{
    account_session::AccountObservation,
    control::{AccessState, Policy},
    launcher::{
        Decision, Status,
        answer::QuestionScope,
        execution::{Capability, ExecutionStatus},
    },
};
struct Fixture {
    root: PathBuf,
    path: PathBuf,
    target: ResidentAnswerTarget,
    status: Status,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
fn review_message(argument: &str) -> String {
    serde_json::json!({
        "name": "QA", "startup": false, "hotkey": "", "firstDelay": 0, "retries": 0,
        "steps": [{"app": "QA", "path": "QA/private.exe", "args": [argument], "steam": false, "delay": 0}]
    }).to_string()
}

fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "host-answer-{}",
        vantare_services::random_id().unwrap()
    ));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("launcher.json");
    let mut extension = ExecutionStatus::new("b".repeat(64).try_into().unwrap());
    extension.capabilities.push(Capability::CheckedAnswer);
    let run = extension.begin().unwrap();
    extension.question = Some(QuestionScope {
        decision: "9007199254740993".into(),
        run,
        revision: "c".repeat(64),
        account: "a".repeat(64).try_into().unwrap(),
    });
    let target = ResidentAnswerTarget {
        instance: extension.instance.clone().into(),
        run: run.into(),
        revision: "c".repeat(64),
        account_generation: "a".repeat(64),
        decision: "9007199254740993".into(),
        action: ResidentAction::Stop,
    };
    Fixture {
        root,
        path,
        target,
        status: Status {
            version: native::VERSION,
            updated_ms: native::now_ms(),
            running: true,
            decision: Some(Decision {
                id: 9_007_199_254_740_993,
                message: review_message("--private"),
                actions: vec![native::Action::Stop, native::Action::Continue],
            }),
            extension: Some(extension),
            ..Default::default()
        },
    }
}
impl Fixture {
    fn save(&mut self) {
        self.status.updated_ms = native::now_ms();
        std::fs::write(
            native::status_path(&self.path),
            serde_json::to_vec(&self.status).unwrap(),
        )
        .unwrap();
    }
}
fn observation() -> AccountObservation {
    AccountObservation {
        generation: "a".repeat(64).try_into().unwrap(),
        policy: Policy {
            epoch: 1,
            revision: 1,
            checked_at_ms: vantare_ipc::control::wall_ms().unwrap(),
            ..Policy::denied(AccessState::Revoked)
        },
    }
}
#[test]
fn queues_only_exact_scoped_values_without_document_reload_and_never_overwrites_a_request() {
    let mut f = fixture();
    std::fs::write(&f.path, b"{edited-after-run-start").unwrap();
    f.save();
    let ResidentQueued::Queued { request } =
        answer(&f.path, Some(&observation()), &f.target).unwrap();
    let bytes = std::fs::read(native::request_path(&f.path)).unwrap();
    let native::Request::AnswerChecked(payload) = serde_json::from_slice(&bytes).unwrap() else {
        panic!("answer-v3 only");
    };
    assert_eq!(String::from(payload.request), request);
    assert_eq!(payload.decision, f.target.decision);
    assert_eq!(payload.revision, f.target.revision);
    assert_eq!(String::from(payload.account), f.target.account_generation);
    assert_eq!(String::from(payload.instance), f.target.instance);
    assert_eq!(String::from(payload.run), f.target.run);
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::Busy)
    );
    assert_eq!(std::fs::read(native::request_path(&f.path)).unwrap(), bytes);
}
#[test]
fn every_invalid_target_is_typed_and_does_not_write_the_mailbox() {
    for (case, reason) in [
        (0, R::TrustRequiresEditor),
        (1, R::WrongInstance),
        (2, R::AccountChanged),
        (3, R::WrongRun),
        (4, R::RevisionMismatch),
        (5, R::StaleQuestion),
        (6, R::InvalidAction),
    ] {
        let mut f = fixture();
        match case {
            0 => f.target.action = ResidentAction::Trust,
            1 => f.target.instance = "e".repeat(64),
            2 => f.target.account_generation = "e".repeat(64),
            3 => f.target.run = "2".into(),
            4 => f.target.revision = "e".repeat(64),
            5 => f.target.decision = "9007199254740994".into(),
            6 => f.target.action = ResidentAction::Restart,
            _ => unreachable!(),
        }
        f.save();
        assert_eq!(
            answer(&f.path, Some(&observation()), &f.target),
            Err(HostError::ResidentAnswerRejected { reason })
        );
        assert!(!native::request_path(&f.path).exists());
    }
}
#[test]
fn missing_old_stale_finished_or_unscoped_status_never_falls_back_to_answer_v2() {
    let mut f = fixture();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::CoreUnavailable)
    );
    f.status.extension.as_mut().unwrap().capabilities.clear();
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::Unsupported)
    );
    f.status
        .extension
        .as_mut()
        .unwrap()
        .capabilities
        .push(Capability::CheckedAnswer);
    f.save();
    assert_eq!(
        answer(&f.path, None, &f.target),
        Err(HostError::CoreUnavailable)
    );
    f.status.running = false;
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::ResidentAnswerRejected {
            reason: R::WrongRun
        })
    );
    f.status.running = true;
    f.status.extension.as_mut().unwrap().question = None;
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::ResidentAnswerRejected {
            reason: R::UnscopedRun
        })
    );
    assert!(!native::request_path(&f.path).exists());
}

#[test]
fn continuing_is_denied_without_permission_and_allowed_only_with_a_fresh_launch_policy() {
    let mut f = fixture();
    f.target.action = ResidentAction::Continue;
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::ResidentAnswerRejected { reason: R::Denied })
    );
    assert!(!native::request_path(&f.path).exists());
    let mut current = observation();
    current.policy.state = AccessState::Active;
    assert!(matches!(
        answer(&f.path, Some(&current), &f.target),
        Ok(ResidentQueued::Queued { .. })
    ));
}

#[test]
fn a_new_observed_account_cannot_answer_the_previous_accounts_question() {
    let mut f = fixture();
    f.save();
    let mut current = observation();
    current.generation = "e".repeat(64).try_into().unwrap();
    assert_eq!(
        answer(&f.path, Some(&current), &f.target),
        Err(HostError::ResidentAnswerRejected {
            reason: R::AccountChanged
        })
    );
    assert!(!native::request_path(&f.path).exists());
}

#[test]
fn failed_mailbox_write_returns_io_without_claiming_queued_or_replacing_existing_data() {
    let mut f = fixture();
    let mailbox = native::request_path(&f.path);
    std::fs::create_dir(&mailbox).unwrap();
    let sentinel = mailbox.join("keep");
    std::fs::write(&sentinel, b"unchanged").unwrap();
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::Io)
    );
    assert!(mailbox.is_dir());
    assert_eq!(std::fs::read(sentinel).unwrap(), b"unchanged");
}

#[test]
fn projects_review_only_when_the_private_message_and_scope_are_valid() {
    use crate::launcher_resident::{ResidentReview, State};
    use crate::protocol::{Event, HostToUi, Reply};

    let mut f = fixture();
    f.status.decision.as_mut().unwrap().actions =
        vec![native::Action::Trust, native::Action::Cancel];
    let mut observation = observation();
    observation.policy.state = AccessState::Active;
    let mut state = State::new(f.path.clone());
    f.save();
    let view = state.view_for_account(Some(&observation));
    assert_eq!(
        view.decision.as_ref().unwrap().review,
        ResidentReview::Available
    );
    for message in [
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherResidentGet {
                value: Box::new(view.clone()),
            },
        },
        HostToUi::Event {
            event: Event::LauncherResident { value: view },
        },
        HostToUi::Failure {
            id: 2,
            error: rejected(AnswerRejection::StaleQuestion),
        },
    ] {
        for secret in ["QA/private.exe", "--private"] {
            assert!(!serde_json::to_string(&message).unwrap().contains(secret));
            assert!(!format!("{message:?}").contains(secret));
        }
    }
    assert_eq!(
        state.view().decision.unwrap().review,
        ResidentReview::Unavailable
    );

    for bad in [String::new(), "bad\0message".into()] {
        f.status.decision.as_mut().unwrap().message = bad;
        f.save();
        assert_eq!(
            state
                .view_for_account(Some(&observation))
                .decision
                .unwrap()
                .review,
            ResidentReview::Unavailable
        );
    }
}

fn review_fixture() -> (
    Fixture,
    AccountObservation,
    super::super::ResidentReviewTarget,
) {
    use super::super::ResidentReviewTarget;
    let mut f = fixture();
    f.status.decision.as_mut().unwrap().actions =
        vec![native::Action::Trust, native::Action::Cancel];
    f.save();
    let mut allowed = observation();
    allowed.policy.state = AccessState::Active;
    let target = ResidentReviewTarget {
        instance: f.target.instance.clone(),
        account_generation: f.target.account_generation.clone(),
        run: f.target.run.clone(),
        revision: f.target.revision.clone(),
        decision: f.target.decision.clone(),
    };
    (f, allowed, target)
}

#[test]
fn scoped_ticket_is_private_and_one_use_and_trust_carries_the_exact_digest() {
    use super::super::{ReviewChoice, ReviewDecision, ReviewFailure, review::Review};
    use std::time::Instant;
    let (mut f, allowed, target) = review_fixture();
    let mut review = Review::default();
    let now = Instant::now();
    let old = review
        .open(&f.path, Some(&allowed), &target)
        .unwrap()
        .ticket;
    let ticket = review
        .open(&f.path, Some(&allowed), &target)
        .unwrap()
        .ticket;
    assert_ne!(ticket, old);
    assert_eq!(ticket.len(), 32);
    assert!(
        ticket
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    );
    assert_eq!(
        review.content(&f.path, Some(&allowed), &old, now),
        Err(ReviewFailure::Unavailable)
    );
    let content = review
        .content(&f.path, Some(&allowed), &ticket, now)
        .unwrap();
    assert_eq!(
        content.pages,
        native::review::review_pages(&f.status.decision.as_ref().unwrap().message).unwrap()
    );
    assert!(!format!("{content:?}").contains("QA/private.exe"));
    let submit = ReviewDecision {
        ticket,
        decision: ReviewChoice::Trust,
        issued_ms: Some(1_000),
    };
    review
        .decide(&f.path, Some(&allowed), &submit, now, Some(1_000))
        .unwrap();
    let path = native::request_path(&f.path);
    let bytes = std::fs::read(&path).unwrap();
    let native::Request::AnswerChecked(answer) = serde_json::from_slice(&bytes).unwrap() else {
        panic!("checked answer");
    };
    assert_eq!(answer.action, native::Action::Trust);
    let proof = answer.review.unwrap();
    assert_eq!(
        proof.pages_digest,
        vantare_services::content_hash(&native::review::frame_pages(&content.pages))
    );
    assert_eq!(proof.issued_ms, 1_000);
    std::fs::remove_file(&path).unwrap();
    assert_eq!(
        review.decide(&f.path, Some(&allowed), &submit, now, Some(1_000)),
        Err(ReviewFailure::Unavailable)
    );
    assert!(!path.exists());
    let extension = f.status.extension.as_mut().unwrap();
    extension.question = None;
    extension
        .record(native::execution::EventKind::OrderReceived {
            request: answer.request,
            receipt: native::answer::OrderReceipt::Accepted { run: answer.run },
        })
        .unwrap();
    f.status.decision = None;
    let outcome = review
        .outcome(Some(&f.status), Some(&allowed), now)
        .unwrap();
    assert_eq!(outcome.state, super::super::ResidentReviewState::Trusted);
    assert!(f.status.running);
    let replacement = native::Decision {
        id: target.decision.parse::<u64>().unwrap() + 1,
        message: review_message("--replacement"),
        actions: vec![native::Action::Trust, native::Action::Cancel],
    };
    f.status.decision = Some(replacement);
    assert!(
        review
            .outcome(Some(&f.status), Some(&allowed), now)
            .is_none()
    );
}

#[test]
fn changed_and_expired_tickets_are_consumed_without_creating_orders() {
    use super::super::{ReviewChoice, ReviewDecision, ReviewFailure, review::Review};
    use std::time::{Duration, Instant};
    for (case, reason) in [
        (0, ReviewFailure::Changed),
        (1, ReviewFailure::Expired),
        (2, ReviewFailure::Changed),
        (3, ReviewFailure::Changed),
        (4, ReviewFailure::Changed),
        (5, ReviewFailure::Changed),
    ] {
        let (mut f, mut allowed, target) = review_fixture();
        let mut review = Review::default();
        let now = Instant::now();
        let ticket = review
            .open(&f.path, Some(&allowed), &target)
            .unwrap()
            .ticket;
        review
            .content(&f.path, Some(&allowed), &ticket, now)
            .unwrap();
        let at = match case {
            0 => {
                f.status.decision.as_mut().unwrap().message = review_message("--changed");
                now
            }
            1 => now + Duration::from_secs(180),
            2 => {
                f.status.decision.as_mut().unwrap().id += 1;
                f.status
                    .extension
                    .as_mut()
                    .unwrap()
                    .question
                    .as_mut()
                    .unwrap()
                    .decision = f.status.decision.as_ref().unwrap().id.to_string();
                now
            }
            3 => {
                allowed.generation = "e".repeat(64).try_into().unwrap();
                now
            }
            4 => {
                f.status
                    .extension
                    .as_mut()
                    .unwrap()
                    .question
                    .as_mut()
                    .unwrap()
                    .revision = "e".repeat(64);
                now
            }
            _ => {
                let extension = f.status.extension.as_mut().unwrap();
                let next = extension.begin().unwrap();
                extension.question.as_mut().unwrap().run = next;
                now
            }
        };
        f.save();
        let decision = ReviewDecision {
            ticket,
            decision: ReviewChoice::Trust,
            issued_ms: Some(1_000),
        };
        assert_eq!(
            review.content(&f.path, Some(&allowed), &decision.ticket, at),
            Err(reason)
        );
        assert_eq!(
            review.decide(&f.path, Some(&allowed), &decision, at, Some(1_000)),
            Err(reason)
        );
        assert_eq!(
            review.decide(&f.path, Some(&allowed), &decision, at, Some(1_000)),
            Err(ReviewFailure::Unavailable)
        );
        assert!(!native::request_path(&f.path).exists());
    }
}

#[test]
fn opening_checks_the_exact_scope_and_cancel_queues_without_proof() {
    use super::super::{ReviewChoice, ReviewDecision, review::Review};
    use std::time::Instant;
    let (f, mut allowed, target) = review_fixture();
    let mut review = Review::default();
    let now = Instant::now();
    for (field, reason) in [
        (0, AnswerRejection::WrongInstance),
        (1, AnswerRejection::AccountChanged),
        (2, AnswerRejection::WrongRun),
        (3, AnswerRejection::RevisionMismatch),
        (4, AnswerRejection::StaleQuestion),
    ] {
        let mut stale = target.clone();
        match field {
            0 => stale.instance = "e".repeat(64),
            1 => stale.account_generation = "e".repeat(64),
            2 => stale.run = "999".into(),
            3 => stale.revision = "e".repeat(64),
            _ => stale.decision = "999".into(),
        }
        assert_eq!(
            review.open(&f.path, Some(&allowed), &stale),
            Err(rejected(reason))
        );
    }
    allowed.policy.state = AccessState::Revoked;
    assert_eq!(
        review.open(&f.path, Some(&allowed), &target),
        Err(rejected(AnswerRejection::Denied))
    );
    allowed.policy.state = AccessState::Active;
    let ticket = review
        .open(&f.path, Some(&allowed), &target)
        .unwrap()
        .ticket;
    review
        .content(&f.path, Some(&allowed), &ticket, now)
        .unwrap();
    review
        .decide(
            &f.path,
            Some(&allowed),
            &ReviewDecision {
                ticket,
                decision: ReviewChoice::Cancel,
                issued_ms: None,
            },
            now,
            None,
        )
        .unwrap();
    let bytes = std::fs::read(native::request_path(&f.path)).unwrap();
    let native::Request::AnswerChecked(answer) = serde_json::from_slice(&bytes).unwrap() else {
        panic!("checked cancel");
    };
    assert_eq!(answer.action, native::Action::Cancel);
    assert!(answer.review.is_none());
}

#[test]
fn review_without_a_decision_expires_without_an_order() {
    use super::super::{ResidentReviewState, ReviewFailure, State};
    use std::time::{Duration, Instant};
    let (mut f, allowed, target) = review_fixture();
    let mut state = State::new(f.path.clone());
    let now = Instant::now();
    let ticket = state
        .review
        .open(&f.path, Some(&allowed), &target)
        .unwrap()
        .ticket;
    let dialog_opened = now + Duration::from_secs(45);
    state
        .review
        .content(&f.path, Some(&allowed), &ticket, dialog_opened)
        .unwrap();
    let before_deadline = dialog_opened + Duration::from_secs(179);
    let deadline = dialog_opened + Duration::from_secs(180);
    f.save();
    assert!(
        state
            .observed_for_account(before_deadline, Some(&allowed))
            .review_outcome
            .is_none()
    );
    let view = state.changed_for_account(deadline, Some(&allowed)).unwrap();
    assert_eq!(
        view.review_outcome.unwrap().state,
        ResidentReviewState::Expired
    );
    assert_eq!(
        state
            .review
            .content(&f.path, Some(&allowed), &ticket, deadline),
        Err(ReviewFailure::Unavailable)
    );
    assert!(!native::request_path(&f.path).exists());
}

#[test]
fn a_too_long_question_cannot_issue_a_ticket() {
    use super::super::{ResidentReview, State, review::Review};
    let (mut f, allowed, target) = review_fixture();
    f.status.decision.as_mut().unwrap().message = review_message(&"a".repeat(201));
    f.save();
    let mut state = State::new(f.path.clone());
    assert_eq!(
        state
            .view_for_account(Some(&allowed))
            .decision
            .unwrap()
            .review,
        ResidentReview::TooLong
    );
    assert!(
        Review::default()
            .open(&f.path, Some(&allowed), &target)
            .is_err()
    );
}

#[test]
fn a_disguised_program_path_cannot_be_trusted_or_issue_a_ticket() {
    // #2579: extensión que parece latina («.ехе» cirílica) o punto que imita «.».
    use super::super::{ResidentReview, State, review::Review};
    for path in ["QA/private.\u{435}\u{445}\u{435}", "QA/private\u{2024}exe"] {
        let (mut f, allowed, target) = review_fixture();
        let mut message: serde_json::Value =
            serde_json::from_str(&review_message("--private")).unwrap();
        message["steps"][0]["path"] = path.into();
        f.status.decision.as_mut().unwrap().message = message.to_string();
        f.save();
        let mut state = State::new(f.path.clone());
        assert_eq!(
            state
                .view_for_account(Some(&allowed))
                .decision
                .unwrap()
                .review,
            ResidentReview::Unavailable,
            "{path}"
        );
        assert_eq!(
            checked_review(&f.path, Some(&allowed), &target).err(),
            Some(rejected(AnswerRejection::Unavailable)),
            "{path}"
        );
        assert!(
            Review::default()
                .open(&f.path, Some(&allowed), &target)
                .is_err()
        );
        assert!(!native::request_path(&f.path).exists(), "{path}");
    }
}

#[test]
fn an_expired_confirmation_is_rejected_while_the_dialog_ticket_is_still_valid() {
    use super::super::{ReviewChoice, ReviewDecision, ReviewFailure, review::Review};
    use std::time::Instant;
    let (f, allowed, target) = review_fixture();
    let mut review = Review::default();
    let now = Instant::now();
    let ticket = review
        .open(&f.path, Some(&allowed), &target)
        .unwrap()
        .ticket;
    review
        .content(&f.path, Some(&allowed), &ticket, now)
        .unwrap();
    let input = ReviewDecision {
        ticket,
        decision: ReviewChoice::Trust,
        issued_ms: Some(1_000),
    };
    assert_eq!(
        review.decide(&f.path, Some(&allowed), &input, now, Some(11_001)),
        Err(ReviewFailure::Expired)
    );
    assert!(!native::request_path(&f.path).exists());
}
