use super::*;
use native::{
    control::OrderRejection,
    execution::{Capability, ChainFailure, ChainOutcome, EventKind, ExecutionStatus},
    results::{RunMode, RunResults, StepResult, StepState},
};
use std::{fs, path::PathBuf};
use vantare_ipc::control::{AccessState, Policy};
struct Fixture {
    root: PathBuf,
    path: PathBuf,
    status: native::Status,
    target: ResidentRetryTarget,
    document: vantare_launcher::Document,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "retry-host-{}",
        vantare_services::random_id().expect("id")
    ));
    fs::create_dir_all(&root).expect("directory");
    let path = root.join("launcher.json");
    let mut document = vantare_launcher::Document::default();
    let mut profile = vantare_launcher::Profile::new("qa".into(), "QA".into());
    profile.steps = ["lmu", "obs", "obs"]
        .iter()
        .map(|id| vantare_launcher::Step {
            app_id: (*id).into(),
            delay_seconds: 0,
            args_override: None,
        })
        .collect();
    document.profiles.push(profile);
    let bytes = serde_json::to_vec(&document).expect("document");
    fs::write(&path, &bytes).expect("document file");
    let revision = vantare_services::content_hash(&bytes);
    let mut extension = ExecutionStatus::new("b".repeat(64).try_into().expect("instance"));
    extension.capabilities.push(Capability::StepResultsRetry);
    let run = extension.begin().expect("run");
    let outcome = ChainOutcome::Failed {
        reason: ChainFailure::StepFailed,
    };
    extension
        .record(EventKind::Finished { run, outcome })
        .expect("terminal");
    extension.results = Some(RunResults {
        run,
        profile: "qa".into(),
        revision: revision.clone(),
        account: "a".repeat(64).try_into().expect("account"),
        mode: RunMode::Rehearsal,
        outcome: Some(outcome),
        retry_failed: true,
        steps: vec![
            StepResult {
                index: 0,
                state: StepState::NotSelected,
            },
            StepResult {
                index: 1,
                state: StepState::Ready,
            },
            StepResult {
                index: 2,
                state: StepState::Failed,
            },
        ],
    });
    Fixture {
        root,
        path,
        document,
        status: native::Status {
            version: native::VERSION,
            extension: Some(extension),
            ..Default::default()
        },
        target: ResidentRetryTarget {
            instance: "b".repeat(64),
            account_generation: "a".repeat(64),
            run: run.into(),
            profile: "qa".into(),
            revision,
            scope: ResidentRetryScope::Failed,
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
#[test]
fn queued_retry_has_exact_original_scope_and_never_accepts_indices_or_overwrites() {
    for scope in [ResidentRetryScope::Failed, ResidentRetryScope::All] {
        let mut f = fixture();
        f.target.scope = scope;
        f.save();
        let ResidentQueued::Queued { request } =
            retry(&f.path, Some(&observed()), &f.target).unwrap();
        let bytes = fs::read(native::request_path(&f.path)).unwrap();
        let native::Request::RetryChecked(payload) = serde_json::from_slice(&bytes).unwrap() else {
            panic!("retry-v1")
        };
        assert_eq!(String::from(payload.request), request);
        assert_eq!(String::from(payload.instance), f.target.instance);
        assert_eq!(String::from(payload.account), f.target.account_generation);
        assert_eq!(String::from(payload.run), f.target.run);
        assert_eq!(payload.profile, f.target.profile);
        assert_eq!(payload.revision, f.target.revision);
        assert_eq!(payload.scope, wire::RetryScope::from(scope));
        assert_eq!(
            retry(&f.path, Some(&observed()), &f.target),
            Err(HostError::Busy)
        );
        assert_eq!(fs::read(native::request_path(&f.path)).unwrap(), bytes);
    }
}
#[test]
fn unsupported_residents_precede_missing_denied_or_changed_accounts() {
    let mut f = fixture();
    let mut denied = observed();
    denied.policy.epoch = 0;
    let mut changed = observed();
    changed.generation = "f".repeat(64).try_into().unwrap();
    for current in [None, Some(&denied), Some(&changed)] {
        assert_eq!(
            retry(&f.path, current, &f.target),
            Err(HostError::Unsupported)
        );
    }
    f.status.extension.as_mut().unwrap().capabilities.clear();
    f.status.extension.as_mut().unwrap().results = None;
    f.save();
    assert_eq!(retry(&f.path, None, &f.target), Err(HostError::Unsupported));
    let mut f = fixture();
    f.save();
    assert_eq!(
        retry(&f.path, None, &f.target),
        Err(HostError::CoreUnavailable)
    );
    let mut live = observed();
    live.policy.live = true;
    assert_eq!(
        retry(&f.path, Some(&live), &f.target),
        Err(reject(OrderRejection::Denied))
    );
    assert_eq!(
        retry(&f.path, Some(&changed), &f.target),
        Err(reject(OrderRejection::AccountChanged))
    );
    assert!(!native::request_path(&f.path).exists());
}

#[test]
fn projection_distinguishes_unsupported_unknown_and_known_results() {
    let mut f = fixture();
    let extension = f.status.extension.as_mut().unwrap();
    let known = crate::launcher_resident::ResidentExecution::from(&*extension);
    assert!(
        matches!(known.results,ResidentResults::Known{value} if value.run=="1" && value.account_generation=="a".repeat(64))
    );
    extension.results = None;
    assert_eq!(
        crate::launcher_resident::ResidentExecution::from(&*extension).results,
        ResidentResults::Unknown
    );
    extension.capabilities.clear();
    assert_eq!(
        crate::launcher_resident::ResidentExecution::from(&*extension).results,
        ResidentResults::Unsupported
    );
}
#[test]
fn stale_scopes_busy_missing_terminal_and_no_failed_steps_are_closed_rejections() {
    for case in 0..10 {
        let mut f = fixture();
        let reason = match case {
            0 => {
                f.target.instance = "f".repeat(64);
                OrderRejection::WrongInstance
            }
            1 => {
                f.target.account_generation = "f".repeat(64);
                OrderRejection::AccountChanged
            }
            2 => {
                f.target.run = "999".into();
                OrderRejection::UnknownRun
            }
            3 => {
                f.target.revision = "f".repeat(64);
                OrderRejection::RevisionMismatch
            }
            4 => {
                f.status.running = true;
                OrderRejection::Busy
            }
            5 => {
                f.status.extension.as_mut().unwrap().results = None;
                OrderRejection::UnknownRun
            }
            6 => {
                f.status.extension.as_mut().unwrap().events.pop();
                OrderRejection::UnknownRun
            }
            7 => {
                f.status
                    .extension
                    .as_mut()
                    .unwrap()
                    .results
                    .as_mut()
                    .unwrap()
                    .retry_failed = false;
                f.status
                    .extension
                    .as_mut()
                    .unwrap()
                    .results
                    .as_mut()
                    .unwrap()
                    .steps[2]
                    .state = StepState::Cancelled;
                OrderRejection::NoFailedSteps
            }
            8 => {
                f.status.extension.as_mut().unwrap().begin().unwrap();
                OrderRejection::UnknownRun
            }
            _ => {
                f.status
                    .extension
                    .as_mut()
                    .unwrap()
                    .results
                    .as_mut()
                    .unwrap()
                    .account = "f".repeat(64).try_into().unwrap();
                OrderRejection::AccountChanged
            }
        };
        f.save();
        assert_eq!(
            retry(&f.path, Some(&observed()), &f.target),
            Err(reject(reason))
        );
        assert!(!native::request_path(&f.path).exists());
    }
}
#[test]
fn first_read_rejects_revisions_missing_empty_or_protected_profiles_without_writing() {
    for case in 0..5 {
        let mut f = fixture();
        match case {
            0 => {
                let mut bytes = fs::read(&f.path).unwrap();
                bytes.push(b'\n');
                fs::write(&f.path, bytes).unwrap();
            }
            1 | 2 => {
                if case == 1 {
                    f.document.profiles.clear();
                } else {
                    f.document.profiles[0].steps.clear();
                }
                let bytes = serde_json::to_vec(&f.document).unwrap();
                fs::write(&f.path, &bytes).unwrap();
                f.target.revision = vantare_services::content_hash(&bytes);
                f.status
                    .extension
                    .as_mut()
                    .unwrap()
                    .results
                    .as_mut()
                    .unwrap()
                    .revision = f.target.revision.clone();
            }
            3 => {
                fs::write(&f.path, br#"{"version":99,"future":"preserve"}"#).unwrap();
            }
            _ => {
                fs::remove_file(&f.path).unwrap();
            }
        }
        f.save();
        let bytes = fs::read(&f.path).ok();
        let result = retry(&f.path, Some(&observed()), &f.target);
        match case {
            0 => assert!(matches!(result, Err(HostError::LauncherConflict { .. }))),
            1 | 2 => assert_eq!(result, Err(reject(OrderRejection::DocumentUnavailable))),
            _ => assert_eq!(result, Err(HostError::Protected)),
        }
        assert_eq!(fs::read(&f.path).ok(), bytes);
        assert!(!native::request_path(&f.path).exists());
    }
}
