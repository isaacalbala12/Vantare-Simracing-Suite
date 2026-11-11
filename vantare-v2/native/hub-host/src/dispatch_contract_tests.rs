//! Runs the production dispatch sources on every platform, with isolated files
//! and an unavailable service double. No application, browser or IPC is started.
use crate::{
    args::Args,
    frame,
    protocol::{self, CloseReason, Event, HostError, HostToUi, Reply, Request, Topic, UiToHost},
    settings::{SaveError, Settings},
};
use std::{
    io,
    path::PathBuf,
    time::{Duration, Instant},
};
type Pipe = io::Cursor<Vec<u8>>;
mod ready {
    pub struct Ready;
}
#[derive(Default)]
struct Core {
    requests: usize,
    sent: Vec<(u32, vantare_ipc::services_protocol::Command)>,
    policy: vantare_ipc::control::Policy,
    cancelled: Vec<u32>,
    available: bool,
    busy: bool,
}
impl Core {
    fn policy(&self) -> vantare_ipc::control::Policy {
        self.policy.clone()
    }
    fn request_background(
        &mut self,
        id: u32,
        command: vantare_ipc::services_protocol::Command,
    ) -> Result<(), HostError> {
        self.request(id, command)
    }

    fn cancel_queued(&mut self, id: u32) {
        self.cancelled.push(id);
    }
    fn request_at(
        &mut self,
        id: u32,
        command: vantare_ipc::services_protocol::Command,
        _now: Instant,
    ) -> Result<(), HostError> {
        self.request(id, command)
    }
    fn request_continuation(
        &mut self,
        id: u32,
        command: vantare_ipc::services_protocol::Command,
        _accepted: Instant,
    ) -> Result<(), HostError> {
        self.request(id, command)
    }
    #[allow(clippy::unused_self)] // Same method signature as production Core.
    fn home_status(&mut self, _active: bool) -> crate::home::HomeSim {
        crate::home::HomeSim::default()
    }
    fn request(
        &mut self,
        id: u32,
        command: vantare_ipc::services_protocol::Command,
    ) -> Result<(), HostError> {
        self.requests += 1;
        if self.busy {
            Err(HostError::Busy)
        } else if self.available {
            self.sent.push((id, command));
            Ok(())
        } else {
            Err(HostError::CoreUnavailable)
        }
    }
}
include!(concat!(env!("OUT_DIR"), "/session.rs"));
#[cfg_attr(
    test,
    allow(
        clippy::duplicate_mod,
        reason = "portable tests use the production session effects with in-memory IO"
    )
)]
#[path = "session_effects.rs"]
mod session_effects;
use session_effects::settings_response;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static SEQUENCE: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "vantare-dispatch-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).expect("exclusive QA directory");
        Self(path)
    }
    fn session(&self) -> Session {
        let args = Args {
            controlled: false,
            pipe: String::new(),
            data: self.0.join("hub"),
            layout: self.0.join("layout.json"),
            launcher: self.0.join("launcher.json"),
            engineer: self.0.join("engineer.json"),
        };
        Session::new(
            &args,
            Core::default(),
            Settings::load(&args),
            None,
            crate::privacy::State::isolated(&self.0),
        )
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).expect("remove isolated QA data");
    }
}
fn run_corpus(
    module: &str,
    corpus: &serde_json::Value,
    dispatch: fn(&mut Session, &mut Pipe, u32, &Request) -> io::Result<()>,
) {
    let mut requests = 0;
    for sample in corpus["ui"].as_array().expect("module UI corpus") {
        let message: UiToHost =
            serde_json::from_value(sample.clone()).expect("Rust serialized message");
        if let UiToHost::Request { id, request } = message {
            let fixture = Fixture::new();
            let mut session = fixture.session();
            let mut pipe = Pipe::new(Vec::new());
            let result = dispatch(&mut session, &mut pipe, id, &request);
            assert!(
                result.is_ok(),
                "{module}: real dispatch rejected {request:?}: {result:?}"
            );
            assert!(
                !pipe.get_ref().is_empty(),
                "handled or denied locally without real services"
            );
            // Also exercise the generated routing table, not just its predicate.
            let mut session = fixture.session();
            session
                .request(&mut pipe, id, &request)
                .expect("generated route reaches real handler");
            requests += 1;
        }
    }
    assert!(requests > 0, "{module} must have Request samples");
}
#[test]
fn generated_session_has_no_implicit_lifecycle_or_external_services() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    assert!(session.confirmation.is_none());
    assert!(session.last.is_none() && session.last_event.is_none());
    assert!(!session.handshaken && session.closing.is_none());
    assert_eq!(session.exit_code, 0);
    assert!(session.subscriptions.is_empty());
    assert!(!SCREEN_TICKS.is_empty() && !SCREEN_SUBSCRIPTIONS.is_empty());
    assert_eq!(
        session.service_reply(1, Err(HostError::CoreUnavailable)),
        Ok(None)
    );
    session.remotes.insert(2, RemoteKind::MailGet);
    assert_eq!(
        session.service_reply(2, Err(HostError::CoreUnavailable)),
        Err(HostError::CoreUnavailable)
    );
}
include!(concat!(env!("OUT_DIR"), "/dispatch_case_tests.rs"));

#[test]
fn local_report_dispatch_denies_unverified_and_blocked_accounts_without_services() {
    for (verified, blocked) in [(false, false), (true, true)] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        session.current.access.verified = verified;
        session.current.access.blocked = blocked;
        let mut pipe = Pipe::new(Vec::new());
        session
            .request(
                &mut pipe,
                7,
                &Request::ReportLocalPrepare {
                    fields: crate::testing::ReportFields {
                        module: "hub".into(),
                        ..Default::default()
                    },
                },
            )
            .expect("closed dispatch");
        pipe.set_position(0);
        let reply: HostToUi = frame::Reader::default().next(&mut pipe).unwrap().unwrap();
        assert_eq!(
            reply,
            HostToUi::Failure {
                id: 7,
                error: HostError::Denied
            }
        );
        assert_eq!(session.core.requests, 0);
    }
}

#[cfg(windows)]
#[path = "protocol/modules/launcher/read_tests.rs"]
mod launcher_read_tests;
#[path = "testing_deferred_tests.rs"]
mod testing_deferred_tests;

#[path = "protocol/modules/calendar/dispatch_tests.rs"]
mod calendar_dispatch_tests;

// The existing portable-dispatch Linux gate runs these all-target checks too.
#[path = "account/bridge_tests.rs"]
mod account_tests;
#[path = "../tests/architecture.rs"]
mod architecture;

#[cfg(windows)]
impl Core {
    fn catalog(&self) -> Option<vantare_ipc::control::CatalogAccess> {
        self.available
            .then_some(vantare_ipc::control::CatalogAccess::Pro)
    }
}

#[path = "protocol/modules/studio/dispatch_tests.rs"]
mod studio_tests;
