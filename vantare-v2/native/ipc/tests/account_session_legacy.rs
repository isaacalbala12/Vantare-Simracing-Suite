//! Frozen affected response schemas from nightly 81bdefda5 (control v7/Services v20).
//! Do not replace with current DTO aliases: these decode the old consumer's bytes.
use serde::{Deserialize, Serialize};
use vantare_ipc::{control, services_protocol as services};
mod frozen {
    use super::*;
    #[derive(Serialize, Deserialize)]
    #[serde(tag = "command", deny_unknown_fields)]
    pub enum Command {
        Read,
        // Retained solely for control v7 compatibility. Services no longer emits
        // this command; do not wire it to disk credentials or legacy candidates.
        Install {
            credential: String,
        },
        /// Only the authenticated helper immediately after a verified HTTPS renewal.
        /// Never constructed from a persisted Candidate or binding.
        InstallOnline {
            credential: String,
        },
        Invalidate,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    pub struct Request {
        pub version: u32,
        pub sequence: u64,
        pub nonce: String,
        pub command: Command,
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    #[allow(clippy::struct_excessive_bools)] // Frozen independent capabilities.
    pub struct Policy {
        pub version: u32,
        pub epoch: u64,
        pub revision: u64,
        pub checked_at_ms: u64,
        pub state: AccessState,
        pub signed_until_ms: Option<u64>,
        pub grace_until_ms: Option<u64>,
        pub catalog: CatalogAccess,
        pub engineer: bool,
        pub strategy: bool,
        pub analysis: bool,
        pub calendar: bool,
        #[serde(default)]
        pub tester: bool,
        pub live: bool,
        /// Legacy diagnostic observation only; never used for access or scheduling.
        pub error: Option<String>,
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
    pub enum AccessState {
        NoCredential,
        Unconfigured,
        Active,
        Grace,
        Expired,
        RecoveryRequired,
        ClockBehind { until_ms: u64 },
        Revoked,
        Unavailable,
        UpdateRequired,
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "snake_case")]
    pub enum CatalogAccess {
        Free,
        LaunchV1,
        Pro,
        Founders,
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    pub struct Response {
        pub version: u32,
        pub sequence: u64,
        pub policy: Policy,
        pub error: Option<String>,
    }
    #[derive(Debug, Serialize, Deserialize)]
    pub enum Session {
        SignedOut,
        SignedIn,
        NeedsSignIn,
        Pending,
    }
    #[derive(Debug, Serialize, Deserialize)]
    pub enum RenewalOutcome {
        Verified,
        Definitive,
        Transient,
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(tag = "kind", deny_unknown_fields)]
    pub enum LicenseNotice {
        Failure {
            outcome: RenewalOutcome,
            message: String,
        },
        DeviceLimit {
            message: String,
        },
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    pub struct AccountProfile {
        pub name: String,
        pub image_url: Option<String>,
        pub image_jpeg: Option<String>,
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(tag = "result", deny_unknown_fields)]
    pub enum Reply {
        LicenseStatus {
            policy: Policy,
            session: Option<Session>,
            notice: Option<LicenseNotice>,
        },
        Account {
            session: Session,
            #[serde(default)]
            copy_link: bool,
            signed_in: bool,
            #[serde(default)]
            profile: Option<AccountProfile>,
            expires_at: Option<u64>,
            pending: bool,
            message: String,
            error: Option<String>,
        },
    }
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    pub struct ServicesResponse {
        pub version: u32,
        pub sequence: u64,
        pub reply: Reply,
    }
}
#[test]
fn old_control_response_bytes_decode_and_reserialize_identically() {
    assert_eq!(control::VERSION, 7);
    let response = control::Response {
        version: 7,
        sequence: 1,
        policy: control::Policy::denied(control::AccessState::Revoked),
        error: None,
    };
    let bytes = serde_json::to_vec(&response).unwrap();
    let old: frozen::Response = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(serde_json::to_vec(&old).unwrap(), bytes);
    let mut with_extension = serde_json::to_value(&response).unwrap();
    with_extension["observation"] = serde_json::Value::Null;
    assert!(serde_json::from_value::<frozen::Response>(with_extension).is_err());
}
#[test]
fn old_services_responses_are_unchanged_for_every_session_state() {
    assert_eq!(services::VERSION, 20);
    for session in [
        services::Session::SignedOut,
        services::Session::SignedIn,
        services::Session::NeedsSignIn,
        services::Session::Pending,
    ] {
        for reply in [
            services::Reply::LicenseStatus {
                policy: control::Policy::denied(control::AccessState::Revoked),
                session: Some(session),
                notice: Some(services::LicenseNotice::Failure {
                    outcome: services::RenewalOutcome::Transient,
                    message: String::new(),
                }),
            },
            services::Reply::Account {
                session,
                copy_link: false,
                signed_in: false,
                profile: Some(services::AccountProfile::default()),
                expires_at: None,
                pending: false,
                message: String::new(),
                error: None,
            },
        ] {
            let bytes = serde_json::to_vec(&services::Response {
                version: 20,
                sequence: 1,
                reply,
            })
            .unwrap();
            let old: frozen::ServicesResponse = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(serde_json::to_vec(&old).unwrap(), bytes);
        }
    }
}
#[test]
fn new_operations_are_opt_in_and_never_legacy_response_fields() {
    let mut bytes = Vec::new();
    control::write(
        &mut bytes,
        &control::Request {
            version: 7,
            sequence: 1,
            nonce: String::new(),
            command: control::Command::ReadAccountSession {},
        },
    )
    .unwrap();
    assert!(matches!(
        control::read_request(&mut bytes.as_slice())
            .unwrap()
            .command,
        control::Command::ReadAccountSession { .. }
    ));
}

#[test]
fn legacy_policy_continues_after_an_unknown_account_operation_closes() {
    use std::{
        sync::{Arc, mpsc},
        time::Duration,
    };
    use vantare_ipc::transport::{Event, Listener};
    let photo = format!("old-account-core-{}", std::process::id());
    let name = control::pipe_name(&photo);
    let stop = Arc::new(Event::new().unwrap());
    let mut listener = Listener::new(&name, Arc::clone(&stop), Duration::from_secs(5)).unwrap();
    let first = listener.instance().unwrap();
    let (closed_tx, closed_rx) = mpsc::sync_channel(0);
    let (legacy_tx, legacy_rx) = mpsc::sync_channel(0);
    let worker = std::thread::spawn(move || {
        let mut first = Some(first);
        let mut closed_tx = Some(closed_tx);
        let mut revision = 0;
        // The exact three-consecutive-failures cache is covered deterministically
        // by single_disconnect_recovers_and_only_consecutive_failures_disable_old_core.
        // Real I/O may invalidate the epoch
        // or interrupt that streak, so total probes are not a protocol guarantee.
        loop {
            let mut pipe = first.take().unwrap_or_else(|| listener.instance().unwrap());
            pipe.accept().unwrap();
            let request = control::read_request(&mut pipe).unwrap();
            if matches!(request.command, control::Command::ReadAccountSession { .. }) {
                assert!(
                    revision > 0,
                    "account probe requires an observed legacy epoch"
                );
                // Frozen core: unknown operation closes this connection without a reply.
                drop(pipe);
                if let Some(closed_tx) = closed_tx.take() {
                    // Rendezvous proves the close precedes the legacy continuation.
                    closed_tx.send(()).unwrap();
                }
                continue;
            }
            assert!(matches!(request.command, control::Command::Read));
            revision += 1;
            control::write(
                &mut pipe,
                &control::Response {
                    version: 7,
                    sequence: request.sequence,
                    error: None,
                    policy: control::Policy {
                        epoch: 1,
                        revision,
                        checked_at_ms: control::wall_ms().unwrap(),
                        ..control::Policy::denied(control::AccessState::NoCredential)
                    },
                },
            )
            .unwrap();
            if closed_tx.is_none() {
                legacy_tx.send(()).unwrap();
                break;
            }
        }
    });
    let feed = control::Feed::connect_account(&photo, std::env::current_exe().unwrap()).unwrap();
    // Deadlock guards only; channels establish the order, without sleeps or
    // assumptions about the relative polling rates of the two Feed threads.
    assert!(feed.wait_initial(Duration::from_secs(5)));
    closed_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    legacy_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    worker.join().unwrap();
    assert_eq!(feed.policy().epoch, 1);
    assert_eq!(feed.policy().state, control::AccessState::NoCredential);
    assert!(feed.account_observation().is_none());
    drop(feed);
}

#[test]
fn legacy_requests_are_byte_identical_and_old_decoder_rejects_new_operation() {
    for command in [
        control::Command::Read,
        control::Command::Invalidate,
        control::Command::Install {
            credential: "fixture-grant".into(),
        },
        control::Command::InstallOnline {
            credential: "fixture-grant".into(),
        },
    ] {
        let bytes = serde_json::to_vec(&control::Request {
            version: 7,
            sequence: 1,
            nonce: String::new(),
            command,
        })
        .unwrap();
        let old: frozen::Request = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(serde_json::to_vec(&old).unwrap(), bytes);
    }
    let new = control::Request {
        version: 7,
        sequence: 1,
        nonce: String::new(),
        command: control::Command::ReadAccountSession {},
    };
    let mut value = serde_json::to_value(new).unwrap();
    assert!(serde_json::from_value::<frozen::Request>(value.clone()).is_err());
    value["command"]["path"] = "not-allowed".into();
    assert!(serde_json::from_value::<control::Request>(value).is_err());
}
