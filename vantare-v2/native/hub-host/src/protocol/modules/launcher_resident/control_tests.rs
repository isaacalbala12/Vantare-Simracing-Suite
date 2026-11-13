use super::*;
use std::{fs, path::PathBuf};
use vantare_ipc::{
    control::{AccessState, Policy},
    launcher::{Status, control::RunScope, execution::ExecutionStatus},
};
struct Fixture {
    root: PathBuf,
    path: PathBuf,
    document: vantare_launcher::Document,
    status: Status,
    cancel: ResidentCancelTarget,
    rehearse: ResidentRehearseTarget,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "host-control-{}",
        vantare_services::random_id().expect("fixture")
    ));
    fs::create_dir_all(&root).expect("fixture directory");
    let mut document = vantare_launcher::Document::default();
    let mut profile = vantare_launcher::Profile::new("qa".into(), "QA".into());
    profile.steps = ["lmu", "obs", "obs"]
        .iter()
        .map(|app_id| vantare_launcher::Step {
            app_id: (*app_id).into(),
            delay_seconds: 0,
            args_override: None,
        })
        .collect();
    document.profiles.push(profile);
    let bytes = serde_json::to_vec(&document).expect("document");
    let revision = vantare_services::content_hash(&bytes);
    let path = root.join("launcher.json");
    fs::write(&path, bytes).expect("document file");
    let mut extension = ExecutionStatus::new("b".repeat(64).try_into().expect("instance"));
    extension.capabilities.push(Capability::CheckedControl);
    let run = extension.begin().expect("run");
    extension.active = Some(RunScope {
        run,
        revision: revision.clone(),
        account: "a".repeat(64).try_into().expect("account"),
    });
    Fixture {
        root,
        path,
        document,
        status: Status {
            version: native::VERSION,
            running: true,
            extension: Some(extension),
            ..Default::default()
        },
        cancel: ResidentCancelTarget {
            instance: "b".repeat(64),
            account_generation: "a".repeat(64),
            run: run.into(),
            revision: revision.clone(),
        },
        rehearse: ResidentRehearseTarget {
            instance: "b".repeat(64),
            account_generation: "a".repeat(64),
            profile: "qa".into(),
            revision,
        },
    }
}
impl Fixture {
    fn save(&mut self) {
        self.status.updated_ms = native::now_ms();
        fs::write(
            native::status_path(&self.path),
            serde_json::to_vec(&self.status).expect("status"),
        )
        .expect("status file");
    }
    fn idle(&mut self) {
        self.status.running = false;
        self.status.extension.as_mut().expect("extension").active = None;
        self.save();
    }
    fn document(&mut self) {
        let bytes = serde_json::to_vec(&self.document).expect("document");
        fs::write(&self.path, &bytes).expect("document file");
        self.rehearse.revision = vantare_services::content_hash(&bytes);
    }
}
fn observed() -> AccountObservation {
    AccountObservation {
        generation: "a".repeat(64).try_into().expect("account"),
        policy: Policy {
            version: vantare_ipc::control::VERSION,
            epoch: 1,
            revision: 1,
            checked_at_ms: vantare_ipc::control::wall_ms().expect("clock"),
            state: AccessState::Active,
            ..Default::default()
        },
    }
}
fn reject(reason: OrderRejection) -> HostError {
    rejected(reason)
}
#[test]
fn cancel_queues_the_exact_active_scope_without_reading_an_edited_or_deleted_document() {
    for deleted in [false, true] {
        let mut f = fixture();
        f.save();
        if deleted {
            fs::remove_file(&f.path).unwrap();
        } else {
            fs::write(&f.path, b"{protected-after-start").unwrap();
        }
        let mut current = observed();
        current.policy.state = AccessState::Revoked;
        let ResidentQueued::Queued { request } =
            cancel(&f.path, Some(&current), &f.cancel).unwrap();
        let bytes = fs::read(native::request_path(&f.path)).unwrap();
        let native::Request::CancelChecked(payload) = serde_json::from_slice(&bytes).unwrap()
        else {
            panic!("cancel-v1")
        };
        assert_eq!(String::from(payload.request), request);
        assert_eq!(String::from(payload.instance), f.cancel.instance);
        assert_eq!(String::from(payload.account), f.cancel.account_generation);
        assert_eq!(String::from(payload.run), f.cancel.run);
        assert_eq!(payload.revision, f.cancel.revision);
        assert_eq!(
            cancel(&f.path, Some(&observed()), &f.cancel),
            Err(HostError::Busy)
        );
        assert_eq!(fs::read(native::request_path(&f.path)).unwrap(), bytes);
        if deleted {
            assert!(!f.path.exists());
        } else {
            assert_eq!(fs::read(&f.path).unwrap(), b"{protected-after-start");
        }
    }
}
#[test]
fn cancel_rejects_stale_instance_account_run_revision_or_unscoped_target_without_sending() {
    for case in 0..7 {
        let mut f = fixture();
        let reason = match case {
            0 => {
                f.cancel.instance = "f".repeat(64);
                OrderRejection::WrongInstance
            }
            1 => {
                f.cancel.account_generation = "f".repeat(64);
                OrderRejection::AccountChanged
            }
            2 => {
                f.cancel.run = "999".into();
                OrderRejection::WrongRun
            }
            3 => {
                f.cancel.revision = "f".repeat(64);
                OrderRejection::RevisionMismatch
            }
            4 => {
                f.status.extension.as_mut().unwrap().active = None;
                OrderRejection::UnscopedRun
            }
            5 => {
                f.status.running = false;
                f.status.extension.as_mut().unwrap().active = None;
                OrderRejection::WrongRun
            }
            _ => OrderRejection::AccountChanged,
        };
        f.save();
        let mut current = observed();
        if case == 6 {
            current.generation = "f".repeat(64).try_into().unwrap();
        }
        assert_eq!(
            cancel(&f.path, Some(&current), &f.cancel),
            Err(reject(reason))
        );
        assert!(!native::request_path(&f.path).exists());
    }
}
#[test]
fn old_absent_or_stale_residents_and_missing_authority_never_fall_back() {
    for resident in 0..4 {
        let mut f = fixture();
        match resident {
            0 => {} // No status file.
            1 => {
                f.status.extension = None;
                f.save();
            }
            2 => {
                f.status.extension = Some(ExecutionStatus::new("b".repeat(64).try_into().unwrap()));
                f.save();
            }
            _ => {
                f.status.updated_ms = 0;
                fs::write(
                    native::status_path(&f.path),
                    serde_json::to_vec(&f.status).unwrap(),
                )
                .unwrap();
            }
        }
        let mut denied = observed();
        denied.policy.epoch = 0; // Deterministic denial, independent of wall-clock expiry.
        let mut changed = observed();
        changed.generation = "f".repeat(64).try_into().unwrap();
        for current in [None, Some(&denied), Some(&changed)] {
            assert_eq!(
                cancel(&f.path, current, &f.cancel),
                Err(HostError::Unsupported)
            );
            assert_eq!(
                rehearse(&f.path, current, &f.rehearse),
                Err(HostError::Unsupported)
            );
        }
        assert!(!native::request_path(&f.path).exists());
    }
    let mut f = fixture();
    f.save();
    assert_eq!(
        cancel(&f.path, None, &f.cancel),
        Err(HostError::CoreUnavailable)
    );
    assert_eq!(
        rehearse(&f.path, None, &f.rehearse),
        Err(HostError::CoreUnavailable)
    );
    assert!(!native::request_path(&f.path).exists());
}
#[test]
fn rehearsal_queues_captured_values_without_sending_indices_and_does_not_overwrite() {
    let mut f = fixture();
    f.idle();
    let ResidentQueued::Queued { request } =
        rehearse(&f.path, Some(&observed()), &f.rehearse).unwrap();
    let bytes = fs::read(native::request_path(&f.path)).unwrap();
    let native::Request::RehearseChecked(payload) = serde_json::from_slice(&bytes).unwrap() else {
        panic!("rehearse-v1")
    };
    assert_eq!(String::from(payload.request), request);
    assert_eq!(String::from(payload.instance), f.rehearse.instance);
    assert_eq!(String::from(payload.account), f.rehearse.account_generation);
    assert_eq!(payload.profile, f.rehearse.profile);
    assert_eq!(payload.revision, f.rehearse.revision);
    assert_eq!(
        rehearse(&f.path, Some(&observed()), &f.rehearse),
        Err(HostError::Busy)
    );
    assert_eq!(fs::read(native::request_path(&f.path)).unwrap(), bytes);
    let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(value["rehearse-v1"].get("selected").is_none());
}
#[test]
fn rehearsal_preflight_preserves_revision_missing_profile_no_steps_and_protection_checks() {
    for case in 0..6 {
        let mut f = fixture();
        f.idle();
        match case {
            0 => f.rehearse.revision = "f".repeat(64),
            1 => f.rehearse.profile = "missing".into(),
            2 => {
                f.document.profiles[0].steps.clear();
                f.document();
            }
            3 => {
                f.document.profiles[0].steps.retain(|s| s.app_id == "lmu");
                f.document();
            }
            4 => {
                fs::write(&f.path, br#"{"version":99,"future":"preserve"}"#).unwrap();
            }
            _ => {
                fs::remove_file(&f.path).unwrap();
            }
        }
        let original = fs::read(&f.path).ok();
        let result = rehearse(&f.path, Some(&observed()), &f.rehearse);
        match case {
            0 => assert!(matches!(result, Err(HostError::LauncherConflict { .. }))),
            1 => assert_eq!(result, Err(reject(OrderRejection::DocumentUnavailable))),
            2 | 3 => assert_eq!(result, Err(reject(OrderRejection::NoSteps))),
            _ => assert_eq!(result, Err(HostError::Protected)),
        }
        assert_eq!(fs::read(&f.path).ok(), original);
        assert!(!native::request_path(&f.path).exists());
    }
}
#[test]
fn rehearsal_busy_or_denied_and_cancel_unobservable_are_closed_failures() {
    let mut f = fixture();
    f.save();
    assert_eq!(
        rehearse(&f.path, Some(&observed()), &f.rehearse),
        Err(reject(OrderRejection::Busy))
    );
    f.idle();
    let mut o = observed();
    o.policy.live = true;
    assert_eq!(
        rehearse(&f.path, Some(&o), &f.rehearse),
        Err(reject(OrderRejection::Denied))
    );
    f.status.running = true;
    f.status.extension.as_mut().unwrap().active = Some(RunScope {
        run: f.cancel.run.clone().try_into().unwrap(),
        revision: f.cancel.revision.clone(),
        account: o.generation.clone(),
    });
    f.save();
    o.policy.epoch = 0;
    assert_eq!(
        cancel(&f.path, Some(&o), &f.cancel),
        Err(reject(OrderRejection::Denied))
    );
    assert!(!native::request_path(&f.path).exists());
}
