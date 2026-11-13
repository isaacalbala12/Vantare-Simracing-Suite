use super::super::support::*;
use super::*;
use std::fs;
use vantare_ipc::{
    control::AccessState,
    launcher::{
        Request,
        execution::{CancelReason, ChainOutcome},
    },
};
#[test]
fn cancellation_uses_the_running_snapshot_and_retained_duplicate_has_no_second_effect() {
    let mut f = active();
    let request = f.cancel();
    fs::write(&f.owner.path, b"{protected-after-start").unwrap();
    f.owner.cancel_checked_with(request.clone(), || {
        let mut o = observed();
        o.policy.state = AccessState::Revoked;
        Ok(Some(o))
    });
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Accepted { run: request.run }
    );
    let count = f.owner.status.extension.as_ref().unwrap().events.len();
    f.owner.cancel_checked_with(request.clone(), || {
        panic!("duplicate must not query authority")
    });
    assert_eq!(
        f.owner.status.extension.as_ref().unwrap().events.len(),
        count
    );
    assert!(
        !f.owner
            .status
            .extension
            .as_ref()
            .unwrap()
            .events
            .iter()
            .any(|e| matches!(e.kind, EventKind::Finished { .. }))
    );
    terminal(&mut f.owner);
    let events = &f.owner.status.extension.as_ref().unwrap().events;
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e.kind, EventKind::OrderReceived { .. }))
            .count(),
        1
    );
    assert_eq!(events.iter().filter(|e| matches!(e.kind, EventKind::Finished { run, outcome: ChainOutcome::Cancelled { reason: CancelReason::User } } if run == request.run)).count(), 1);
    assert!(f.owner.status.extension.as_ref().unwrap().active.is_none());
    assert_eq!(fs::read(&f.owner.path).unwrap(), b"{protected-after-start");
    let mut later = request;
    later.request = "d".repeat(32).try_into().unwrap();
    f.owner
        .cancel_checked_with(later, || panic!("a finished run must not query authority"));
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Rejected {
            reason: OrderRejection::WrongRun
        }
    );
}
#[test]
fn stale_targets_and_exhaustion_fail_before_authority_or_cancellation() {
    for case in 0..6 {
        let mut f = active();
        let mut request = f.cancel();
        let reason = match case {
            0 => {
                request.instance = "f".repeat(64).try_into().unwrap();
                OrderRejection::WrongInstance
            }
            1 => {
                request.run = "999".to_owned().try_into().unwrap();
                OrderRejection::WrongRun
            }
            2 => {
                request.account = "f".repeat(64).try_into().unwrap();
                OrderRejection::AccountChanged
            }
            3 => {
                request.revision = "f".repeat(64);
                OrderRejection::RevisionMismatch
            }
            4 => {
                f.owner.active_scope = None;
                OrderRejection::UnscopedRun
            }
            _ => {
                let ext = f.owner.status.extension.as_mut().unwrap();
                let max = u64::MAX.to_string().try_into().unwrap();
                ext.events[0].seq = max;
                ext.first_retained_seq = max;
                OrderRejection::Unavailable
            }
        };
        f.owner.cancel_checked_with(request, || {
            panic!("invalid target must not observe authority")
        });
        if case == 5 {
            assert!(f.owner.status.extension.is_none());
        } else {
            assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
        }
        f.owner
            .chain
            .as_ref()
            .unwrap()
            .answer_checked(
                f.owner.chain_decision.unwrap(),
                vantare_ipc::launcher::Action::Stop,
            )
            .unwrap();
    }
}
#[test]
fn authority_failure_account_switch_and_unobservable_policy_never_cancel() {
    for case in 0..4 {
        let mut f = active();
        let request = f.cancel();
        let reason = match case {
            0 => OrderRejection::AuthorityUnavailable,
            1 | 2 => OrderRejection::AccountChanged,
            _ => OrderRejection::Denied,
        };
        f.owner.cancel_checked_with(request, || match case {
            0 => Err(std::io::ErrorKind::TimedOut.into()),
            1 => Ok(None),
            _ => {
                let mut o = observed();
                if case == 2 {
                    o.generation = "f".repeat(64).try_into().unwrap();
                } else {
                    o.policy.epoch = 0;
                }
                Ok(Some(o))
            }
        });
        assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
        f.owner
            .chain
            .as_ref()
            .unwrap()
            .answer_checked(
                f.owner.chain_decision.unwrap(),
                vantare_ipc::launcher::Action::Stop,
            )
            .unwrap();
    }
}
#[test]
fn mailbox_discards_the_consumed_request_and_wrong_instance_cannot_reach_cancel() {
    let mut f = active();
    let mut request = f.cancel();
    request.instance = "f".repeat(64).try_into().unwrap();
    let path = vantare_ipc::launcher::request_path(&f.owner.path);
    fs::write(
        &path,
        serde_json::to_vec(&Request::CancelChecked(request)).unwrap(),
    )
    .unwrap();
    f.owner.request();
    assert!(!path.exists());
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Rejected {
            reason: OrderRejection::WrongInstance
        }
    );
    let count = f.owner.status.extension.as_ref().unwrap().events.len();
    f.owner.request();
    assert_eq!(
        f.owner.status.extension.as_ref().unwrap().events.len(),
        count
    );
}
#[test]
fn completion_during_authority_query_is_rejected_instead_of_cancelling_an_ended_run() {
    use vantare_launcher::{chain::Chain, discovery::Discovery};
    let mut f = idle(&["obs"]);
    let (release, wait) = std::sync::mpsc::channel();
    let chain = Chain::start_checked(
        f.owner.document.clone(),
        f.owner.document.profiles[0].clone(),
        move |_| {
            wait.recv().unwrap();
            Discovery::default()
        },
        f.owner.processes.clone(),
        None,
        &f.owner.path,
    )
    .unwrap();
    f.owner.chain = Some(chain);
    f.owner.active_run = f.owner.status.extension.as_mut().unwrap().begin();
    f.owner.active_scope = Some(super::super::super::ActiveScope {
        revision: f.revision.clone(),
        account: f.account.clone(),
    });
    let (_, empty) = std::sync::mpsc::channel();
    let receiver = std::mem::replace(&mut f.owner.chain.as_mut().unwrap().progress, empty);
    let request = f.cancel();
    f.owner.cancel_checked_with(request, || {
        release.send(()).unwrap();
        drain(&receiver);
        Ok(Some(observed()))
    });
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Rejected {
            reason: OrderRejection::WrongRun
        }
    );
}
