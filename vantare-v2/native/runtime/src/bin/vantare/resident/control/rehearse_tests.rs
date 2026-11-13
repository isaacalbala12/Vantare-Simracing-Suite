use super::super::support::*;
use super::*;
use std::fs;
#[test]
fn selected_indices_keep_repetitions_and_the_verified_snapshot_despite_a_later_edit() {
    let mut f = idle(&["lmu", "obs", "lmu", "obs"]);
    let request = f.rehearse();
    let original = fs::read(&f.owner.path).unwrap();
    let (release, wait) = std::sync::mpsc::channel();
    let path = f.owner.path.clone();
    let settings = path.clone();
    let processes = f.owner.processes.clone();
    f.owner.rehearse_checked_with(
        request.clone(),
        || {
            fs::write(&path, b"{edited-after-snapshot").unwrap();
            Ok(Some(observed()))
        },
        |document, profile, selected| {
            assert_eq!(serde_json::to_vec(&document).unwrap(), original);
            assert_eq!(selected, vec![1, 3]);
            assert_eq!(
                profile.steps[3].args_override.as_deref(),
                Some(["snapshot".to_owned()].as_slice())
            );
            Chain::start_checked(
                document,
                profile,
                move |_| {
                    wait.recv().unwrap();
                    Discovery::default()
                },
                processes,
                Some(selected),
                &settings,
            )
        },
    );
    let OrderReceipt::Accepted { run } = receipt(&f.owner) else {
        panic!("rehearsal accepted")
    };
    assert_eq!(
        f.owner
            .status
            .extension
            .as_ref()
            .unwrap()
            .active
            .as_ref()
            .unwrap()
            .run,
        run
    );
    assert_eq!(
        f.owner
            .status
            .extension
            .as_ref()
            .unwrap()
            .active
            .as_ref()
            .unwrap()
            .revision,
        request.revision
    );
    let count = f.owner.status.extension.as_ref().unwrap().events.len();
    f.owner.rehearse_checked_with(
        request,
        || panic!("duplicate authority"),
        |_, _, _| panic!("duplicate start"),
    );
    assert_eq!(
        f.owner.status.extension.as_ref().unwrap().events.len(),
        count
    );
    release.send(()).unwrap();
    terminal(&mut f.owner);
    assert!(f.owner.status.extension.as_ref().unwrap().events.iter().any(|e| matches!(e.kind,super::super::super::EventKind::Finished { run: actual, .. } if actual==run)));
    assert_eq!(fs::read(&f.owner.path).unwrap(), b"{edited-after-snapshot");
}
#[test]
fn no_steps_busy_and_exhausted_sequences_never_start_or_query_authority() {
    for case in 0..4 {
        let mut f = match case {
            0 => idle(&["lmu", "lmu"]),
            1 => idle(&[]),
            2 => active(),
            _ => idle(&["obs"]),
        };
        let request = f.rehearse();
        let reason = match case {
            0 | 1 => OrderRejection::NoSteps,
            2 => OrderRejection::Busy,
            _ => {
                let ext = f.owner.status.extension.as_mut().unwrap();
                let max = u64::MAX.to_string().try_into().unwrap();
                ext.events
                    .push(vantare_ipc::launcher::execution::ExecutionEvent {
                        seq: max,
                        kind: super::super::super::EventKind::Started { run: max },
                    });
                ext.first_retained_seq = max;
                OrderRejection::StartFailed
            }
        };
        f.owner.rehearse_checked_with(
            request,
            || panic!("precondition failed"),
            |_, _, _| panic!("must not start"),
        );
        if case == 3 {
            assert!(f.owner.status.extension.is_none());
        } else {
            assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
        }
    }
}
#[test]
fn stale_deleted_missing_empty_and_protected_documents_never_use_the_cached_profile() {
    for case in 0..5 {
        let mut f = idle(&["obs"]);
        let mut request = f.rehearse();
        let reason = match case {
            0 => {
                let mut bytes = fs::read(&f.owner.path).unwrap();
                bytes.push(b'\n');
                fs::write(&f.owner.path, bytes).unwrap();
                OrderRejection::RevisionMismatch
            }
            1 => {
                fs::remove_file(&f.owner.path).unwrap();
                OrderRejection::DocumentUnavailable
            }
            2 => {
                request.profile = "missing".into();
                OrderRejection::DocumentUnavailable
            }
            3 => {
                let mut doc = f.owner.document.clone();
                doc.profiles[0].steps.clear();
                let bytes = serde_json::to_vec(&doc).unwrap();
                fs::write(&f.owner.path, &bytes).unwrap();
                request.revision = vantare_services::content_hash(&bytes);
                OrderRejection::NoSteps
            }
            _ => {
                let bytes = br#"{"version":99,"future":"preserve"}"#;
                fs::write(&f.owner.path, bytes).unwrap();
                request.revision = vantare_services::content_hash(bytes);
                OrderRejection::DocumentUnavailable
            }
        };
        let original = fs::read(&f.owner.path).ok();
        f.owner.rehearse_checked_with(
            request,
            || panic!("invalid document"),
            |_, _, _| panic!("must not use cache"),
        );
        assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
        assert_eq!(fs::read(&f.owner.path).ok(), original);
        assert!(f.owner.chain.is_none());
    }
}
#[test]
fn authority_and_start_errors_are_typed_and_never_claim_a_run() {
    for case in 0..7 {
        let mut f = idle(&["obs"]);
        let request = f.rehearse();
        let reason = match case {
            0 => OrderRejection::AuthorityUnavailable,
            1 | 2 => OrderRejection::AccountChanged,
            3 => OrderRejection::Denied,
            4 => OrderRejection::Busy,
            _ => OrderRejection::StartFailed,
        };
        f.owner.rehearse_checked_with(
            request,
            || match case {
                0 => Err(std::io::ErrorKind::TimedOut.into()),
                1 => Ok(None),
                _ => {
                    let mut o = observed();
                    if case == 2 {
                        o.generation = "f".repeat(64).try_into().unwrap();
                    }
                    if case == 3 {
                        o.policy.live = true;
                    }
                    Ok(Some(o))
                }
            },
            |_, _, _| match case {
                4 => Err(StartError::Busy("fixture".into())),
                5 => Err(StartError::Invalid("fixture".into())),
                6 => Err(StartError::Io("fixture".into())),
                _ => panic!("authority denied"),
            },
        );
        assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
        assert!(f.owner.active_run.is_none());
        assert!(f.owner.chain.is_none());
    }
}

#[cfg(windows)]
#[test]
fn real_mailbox_rehearsal_executes_only_original_non_lmu_indices_and_emits_one_terminal() {
    use std::time::Duration;
    use vantare_ipc::{
        account_session, control,
        launcher::{Request, execution::EventKind, request_path},
        transport::{Event, Listener},
    };
    let mut f = idle(&["lmu", "obs", "lmu", "obs"]);
    let request = f.rehearse();
    let link = account_session::AuthorityLink {
        pipe: format!("rehearse-owner-{}", vantare_services::random_id().unwrap()),
        image: std::env::current_exe().unwrap(),
    };
    let stop = Arc::new(Event::new().unwrap());
    let mut listener = Listener::new(&link.pipe, stop, Duration::from_secs(2)).unwrap();
    let mut pipe = listener.instance().unwrap();
    let server = std::thread::spawn(move || {
        pipe.accept().unwrap();
        let request = control::read_request(&mut pipe).unwrap();
        assert!(matches!(
            request.command,
            control::Command::ReadAccountSession {}
        ));
        assert_eq!(request.nonce, "");
        control::write(
            &mut pipe,
            &account_session::ControlResponse {
                version: control::VERSION,
                sequence: request.sequence,
                observation: Some(observed()),
            },
        )
        .unwrap();
    });
    f.owner.authority = Some(link);
    let bytes = serde_json::to_vec(&Request::RehearseChecked(request)).unwrap();
    fs::write(request_path(&f.owner.path), &bytes).unwrap();
    f.owner.request();
    server.join().unwrap();
    assert!(!request_path(&f.owner.path).exists());
    let OrderReceipt::Accepted { run } = receipt(&f.owner) else {
        panic!("accepted rehearsal")
    };
    let chain = f.owner.chain.as_mut().unwrap();
    let mut indices = std::collections::BTreeSet::new();
    loop {
        match chain.progress.recv_timeout(Duration::from_secs(5)) {
            Ok(progress) => {
                if let Some(index) = progress.step {
                    indices.insert(index);
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => panic!("fixture did not finish"),
        }
    }
    assert_eq!(indices, std::collections::BTreeSet::from([1, 3]));
    chain.shutdown().unwrap();
    f.owner.progress();
    let events = &f.owner.status.extension.as_ref().unwrap().events;
    assert_eq!(events.len(), 2);
    assert!(matches!(events[1].kind,EventKind::Finished{run:actual,..} if actual==run));
    fs::write(request_path(&f.owner.path), bytes).unwrap();
    f.owner.request();
    assert_eq!(f.owner.status.extension.as_ref().unwrap().events.len(), 2);
    assert!(!request_path(&f.owner.path).exists());
}
#[cfg(windows)]
#[test]
fn sharing_protected_rehearsal_document_is_unavailable_without_recovery_or_start() {
    use std::os::windows::fs::OpenOptionsExt;
    let mut f = idle(&["obs"]);
    let request = f.rehearse();
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&f.owner.path)
        .unwrap();
    f.owner.rehearse_checked_with(
        request,
        || panic!("protected document"),
        |_, _, _| panic!("protected document"),
    );
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Rejected {
            reason: OrderRejection::DocumentUnavailable
        }
    );
    drop(held);
    assert_eq!(
        vantare_services::content_hash(&fs::read(&f.owner.path).unwrap()),
        f.revision
    );
}
