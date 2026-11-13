use super::super::control::support::{idle, observed};
use super::*;
use std::fs;
use vantare_ipc::launcher::{Request, ownership::RemoveProfileChecked};

fn fixture() -> super::super::control::support::Fixture {
    let mut f = idle(&[]);
    enable(&mut f.owner);
    f
}
fn request(owner: &Owner) -> RemoveProfileChecked {
    RemoveProfileChecked {
        request: "d".repeat(32).try_into().unwrap(),
        instance: owner.status.extension.as_ref().unwrap().instance.clone(),
        account: observed().generation,
        profile: "qa".into(),
        revision: vantare_services::content_hash(owner.bytes.as_ref().unwrap()),
    }
}
fn enable(owner: &mut Owner) {
    owner
        .status
        .extension
        .as_mut()
        .unwrap()
        .capabilities
        .push(vantare_ipc::launcher::execution::Capability::LiveProfileOwnership);
}
#[test]
fn durable_removal_reconciles_cache_before_releasing_chain_lease_and_is_consumed_once() {
    let mut f = fixture();
    enable(&mut f.owner);
    f.owner.document.lmu_trigger_profile = Some("qa".into());
    f.owner.document.profiles[0].launch_on_windows_startup = true;
    let document = f.owner.document.clone();
    let apps = document.apps.clone();
    let bytes = serde_json::to_vec(&document).unwrap();
    fs::write(&f.owner.path, &bytes).unwrap();
    f.owner.install_document(bytes, document);
    let command = request(&f.owner);
    let path = f.owner.path.clone();
    let registry = Arc::clone(&f.owner.processes);
    f.owner.remove_profile_with(
        command.clone(),
        || Ok(Some(observed())),
        |path, next, observed| {
            assert!(matches!(
                vantare_launcher::chain::acquire_lease(path),
                Err(vantare_launcher::chain::StartError::Busy(_))
            ));
            assert!(registry.try_lock().is_err());
            files::save_with_limit(path, next, Some(observed), files::MAX_DOCUMENT)
        },
    );
    assert!(f.owner.document.profiles.is_empty());
    assert!(f.owner.document.lmu_trigger_profile.is_none());
    assert_eq!(f.owner.document.apps, apps);
    assert!(
        Document::from_bytes(&fs::read(&path).unwrap())
            .unwrap()
            .profiles
            .is_empty()
    );
    assert_eq!(f.owner.bytes, Some(fs::read(&path).unwrap()));
    assert!(f.owner.status.profiles.is_empty());
    assert_eq!(f.owner.hotkeys, Vec::new());
    let events = f.owner.status.extension.as_ref().unwrap().events.clone();
    assert!(matches!(
        events[0].kind,
        EventKind::RemovalReceived {
            receipt: RemovalReceipt::Accepted,
            ..
        }
    ));
    assert!(matches!(
        events[1].kind,
        EventKind::RemovalFinished {
            outcome: RemovalOutcome::Removed { .. },
            ..
        }
    ));
    f.owner.remove_profile_with(
        command,
        || panic!("duplicate authority"),
        |_, _, _| panic!("duplicate persist"),
    );
    assert_eq!(f.owner.status.extension.as_ref().unwrap().events, events);
    fs::write(
        vantare_ipc::launcher::request_path(&path),
        serde_json::to_vec(&Request::Launch {
            profile: "qa".into(),
        })
        .unwrap(),
    )
    .unwrap();
    f.owner.request();
    assert!(
        f.owner.chain.is_none(),
        "legacy cannot relaunch the removed cached profile"
    );
    assert!(vantare_launcher::chain::acquire_lease(&path).is_ok());
}
#[test]
fn failed_cas_never_commits_cache_and_finishes_with_a_typed_failure() {
    for conflict in [true, false] {
        let mut f = fixture();
        let original = fs::read(&f.owner.path).unwrap();
        let command = request(&f.owner);
        f.owner.remove_profile_with(
            command,
            || Ok(Some(observed())),
            |path, _, _| {
                Err(if conflict {
                    files::Error::Conflict { path: path.into() }
                } else {
                    files::Error::Io(std::io::ErrorKind::PermissionDenied.into())
                })
            },
        );
        assert_eq!(fs::read(&f.owner.path).unwrap(), original);
        assert_eq!(f.owner.bytes.as_ref(), Some(&original));
        assert_eq!(f.owner.document.profiles.len(), 1);
        assert!(
            matches!(&f.owner.status.extension.as_ref().unwrap().events.last().unwrap().kind,
            EventKind::RemovalFinished {outcome: RemovalOutcome::Failed {reason},..} if *reason == if conflict {Rejection::WriteConflict} else {Rejection::Io})
        );
    }
}
#[test]
fn instance_account_revision_and_registry_contention_are_fail_closed() {
    for case in 0..5 {
        let mut f = fixture();
        enable(&mut f.owner);
        let mut command = request(&f.owner);
        let registry = Arc::clone(&f.owner.processes);
        let held = (case == 4).then(|| registry.lock().unwrap());
        let reason = match case {
            0 => {
                command.instance = "f".repeat(64).try_into().unwrap();
                Rejection::WrongInstance
            }
            1 => {
                command.account = "f".repeat(64).try_into().unwrap();
                Rejection::AccountChanged
            }
            2 => {
                command.revision = "f".repeat(64);
                Rejection::RevisionMismatch
            }
            3 => {
                fs::write(&f.owner.path, b"{protected").unwrap();
                command.revision = vantare_services::content_hash(b"{protected");
                Rejection::DocumentUnavailable
            }
            _ => Rejection::OwnershipUnknown,
        };
        let original = fs::read(&f.owner.path).unwrap();
        f.owner.remove_profile_with(
            command,
            || Ok(Some(observed())),
            |_, _, _| panic!("must not persist"),
        );
        assert_eq!(fs::read(&f.owner.path).unwrap(), original);
        assert!(
            matches!(&f.owner.status.extension.as_ref().unwrap().events.last().unwrap().kind,
            EventKind::RemovalReceived {receipt: RemovalReceipt::Rejected{reason:actual},..} if *actual == reason)
        );
        if held.is_some() {
            assert!(matches!(
                f.owner.status.extension.as_ref().unwrap().ownership,
                Some(Ownership::Unknown)
            ));
        }
    }
}

#[test]
fn owned_child_fixture() {
    use std::io::{Read, Write};
    if std::env::var_os("VANTARE_OWNERSHIP_CHILD").is_none() {
        return;
    }
    println!("OWNERSHIP_READY");
    std::io::stdout().flush().unwrap();
    let _ = std::io::stdin().read(&mut [0]);
}
struct ChildFixture(Option<std::process::Child>);
impl Drop for ChildFixture {
    fn drop(&mut self) {
        if let Some(child) = &mut self.0 {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
fn child() -> ChildFixture {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "resident::ownership::tests::owned_child_fixture",
            "--nocapture",
        ])
        .env("VANTARE_OWNERSHIP_CHILD", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    loop {
        let mut line = String::new();
        assert_ne!(
            output.read_line(&mut line).unwrap(),
            0,
            "fixture must signal readiness"
        );
        if line.contains("OWNERSHIP_READY") {
            break;
        }
    }
    ChildFixture(Some(child))
}
struct RegistryCleanup(vantare_launcher::processes::Shared);
impl Drop for RegistryCleanup {
    fn drop(&mut self) {
        if let Ok(mut registry) = self.0.lock() {
            let _ = registry.close_profile("qa");
        }
    }
}
#[test]
fn unreconciled_handles_never_look_empty_or_allow_another_profile_to_be_deleted() {
    let mut f = fixture();
    let mut owned = child();
    let _cleanup = RegistryCleanup(Arc::clone(&f.owner.processes));
    f.owner.processes.lock().unwrap().record(
        "qa",
        "fixture",
        &std::env::current_exe().unwrap(),
        owned.0.take().unwrap(),
    );
    // Model an old, uncoordinated writer removing the profile while a handle lives.
    f.owner.document.profiles = vec![vantare_launcher::Profile::new(
        "other".into(),
        "Other".into(),
    )];
    let document = f.owner.document.clone();
    let bytes = serde_json::to_vec(&document).unwrap();
    fs::write(&f.owner.path, &bytes).unwrap();
    f.owner.install_document(bytes.clone(), document);
    assert!(matches!(
        f.owner.status.extension.as_ref().unwrap().ownership,
        Some(Ownership::Unknown)
    ));
    let mut command = request(&f.owner);
    command.profile = "other".into();
    f.owner.remove_profile_with(
        command,
        || Ok(Some(observed())),
        |_, _, _| panic!("unreconciled registry must not write"),
    );
    assert_eq!(fs::read(&f.owner.path).unwrap(), bytes);
    assert!(matches!(
        &f.owner
            .status
            .extension
            .as_ref()
            .unwrap()
            .events
            .last()
            .unwrap()
            .kind,
        EventKind::RemovalReceived {
            receipt: RemovalReceipt::Rejected {
                reason: Rejection::OwnershipUnknown
            },
            ..
        }
    ));
}
#[test]
fn finished_chains_can_own_live_handles_but_external_processes_are_never_claimed() {
    let mut f = fixture();
    enable(&mut f.owner);
    let mut external = child();
    f.owner.publish();
    assert!(
        matches!(&f.owner.status.extension.as_ref().unwrap().ownership,Some(Ownership::Known{profiles,..}) if !profiles[0].owned_live)
    );
    let mut owned = child();
    // Transfer the Child handle to the registry rather than reopening its PID.
    let _cleanup = RegistryCleanup(Arc::clone(&f.owner.processes));
    f.owner.processes.lock().unwrap().record(
        "qa",
        "fixture",
        &std::env::current_exe().unwrap(),
        owned.0.take().unwrap(),
    );
    assert!(f.owner.chain.is_none());
    let command = request(&f.owner);
    f.owner.remove_profile_with(
        command,
        || Ok(Some(observed())),
        |_, _, _| panic!("live child blocks deletion"),
    );
    assert!(matches!(
        &f.owner
            .status
            .extension
            .as_ref()
            .unwrap()
            .events
            .last()
            .unwrap()
            .kind,
        EventKind::RemovalReceived {
            receipt: RemovalReceipt::Rejected {
                reason: Rejection::OwnedLive
            },
            ..
        }
    ));
    f.owner
        .processes
        .lock()
        .unwrap()
        .close_profile("qa")
        .unwrap();
    assert!(external.0.as_mut().unwrap().try_wait().unwrap().is_none());
    f.owner.publish();
    assert!(
        matches!(&f.owner.status.extension.as_ref().unwrap().ownership,Some(Ownership::Known{profiles,..}) if !profiles[0].owned_live)
    );
    let mut command = request(&f.owner);
    command.request = "e".repeat(32).try_into().unwrap();
    f.owner.remove_profile_with(
        command,
        || Ok(Some(observed())),
        |path, next, old| files::save_with_limit(path, next, Some(old), files::MAX_DOCUMENT),
    );
    assert!(f.owner.document.profiles.is_empty());
}
#[test]
fn a_concurrent_editor_conflicts_and_a_concurrent_start_cannot_pass_the_same_lease() {
    let mut f = fixture();
    let original = f.owner.bytes.clone();
    let command = request(&f.owner);
    f.owner.remove_profile_with(
        command,
        || Ok(Some(observed())),
        |path, next, old| {
            let path = path.to_owned();
            let other_path = path.clone();
            let external = old.to_vec();
            let (ready, changed) = std::sync::mpsc::channel();
            let worker = std::thread::spawn(move || {
                assert!(matches!(
                    vantare_launcher::chain::acquire_lease(&other_path),
                    Err(vantare_launcher::chain::StartError::Busy(_))
                ));
                let mut bytes = external;
                bytes.push(b'\n');
                fs::write(other_path, bytes).unwrap();
                ready.send(()).unwrap();
            });
            changed.recv().unwrap();
            worker.join().unwrap();
            files::save_with_limit(&path, next, Some(old), files::MAX_DOCUMENT)
        },
    );
    assert_eq!(f.owner.bytes, original);
    assert_eq!(f.owner.document.profiles.len(), 1);
    assert!(matches!(
        &f.owner
            .status
            .extension
            .as_ref()
            .unwrap()
            .events
            .last()
            .unwrap()
            .kind,
        EventKind::RemovalFinished {
            outcome: RemovalOutcome::Failed {
                reason: Rejection::WriteConflict
            },
            ..
        }
    ));
}

#[test]
fn authority_policy_chain_lease_and_poisoned_registry_never_allow_writes() {
    for case in 0..5 {
        let mut f = fixture();
        enable(&mut f.owner);
        let command = request(&f.owner);
        let lease =
            (case == 2).then(|| vantare_launcher::chain::acquire_lease(&f.owner.path).unwrap());
        if case == 3 {
            let registry = Arc::clone(&f.owner.processes);
            assert!(
                std::panic::catch_unwind(move || {
                    let _guard = registry.lock().unwrap();
                    panic!("injected registry failure")
                })
                .is_err()
            );
        }
        if case == 4 {
            let extension = f.owner.status.extension.as_mut().unwrap();
            extension
                .events
                .push(vantare_ipc::launcher::execution::ExecutionEvent {
                    seq: u64::MAX.to_string().try_into().unwrap(),
                    kind: EventKind::RemovalReceived {
                        request: "e".repeat(32).try_into().unwrap(),
                        receipt: RemovalReceipt::Rejected {
                            reason: Rejection::Busy,
                        },
                    },
                });
        }
        f.owner.remove_profile_with(
            command,
            || {
                if case == 0 {
                    return Err(std::io::ErrorKind::TimedOut.into());
                }
                let mut account = observed();
                if case == 1 {
                    account.policy.state = vantare_ipc::control::AccessState::Revoked;
                }
                Ok(Some(account))
            },
            |_, _, _| panic!("must not write"),
        );
        if case == 4 {
            assert!(f.owner.status.extension.is_none());
            continue;
        }
        let expected = match case {
            0 => Rejection::AuthorityUnavailable,
            1 => Rejection::Denied,
            2 => Rejection::Busy,
            _ => Rejection::OwnershipUnknown,
        };
        assert!(
            matches!(&f.owner.status.extension.as_ref().unwrap().events.last().unwrap().kind,EventKind::RemovalReceived{receipt:RemovalReceipt::Rejected{reason},..} if *reason==expected)
        );
        assert_eq!(f.owner.document.profiles.len(), 1);
        drop(lease);
    }
}
