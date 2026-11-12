use super::*;
use std::{fs, path::PathBuf};
use vantare_ipc::{control, launcher::execution::ResidentInstance};
struct Fixture { root: PathBuf, owner: Owner, request: LaunchChecked }
impl Drop for Fixture {
    fn drop(&mut self) {
        if let Some(chain) = self.owner.chain.as_mut() { chain.shutdown().unwrap(); }
        self.owner.chain.take(); fs::remove_dir_all(&self.root).unwrap();
    }
}
fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!("checked-resident-{}", vantare_services::random_id().unwrap()));
    fs::create_dir_all(&root).unwrap(); let path = root.join("launcher.json");
    let mut document = Document::default();
    document.apps.iter_mut().find(|app| app.id == "obs").unwrap().executable = Some(root.join("absent.exe"));
    let mut profile = launcher::Profile::new("qa".into(), "QA".into());
    profile.steps.push(launcher::Step { app_id: "obs".into(), delay_seconds: 0,
        args_override: Some(vec!["snapshot".into()]) });
    document.profiles.push(profile); let bytes = serde_json::to_vec(&document).unwrap(); fs::write(&path, &bytes).unwrap();
    let owner = Owner::new(path, false);
    let request = LaunchChecked { request: "a".repeat(32).try_into().unwrap(),
        instance: owner.status.extension.as_ref().unwrap().instance.clone(), profile: "qa".into(),
        revision: vantare_services::content_hash(&bytes), account: "b".repeat(64).try_into().unwrap() };
    Fixture { root, owner, request }
}
fn observation(request: &LaunchChecked) -> AccountObservation {
    AccountObservation { generation: request.account.clone(), policy: control::Policy {
        version: control::VERSION, epoch: 1, revision: 1, checked_at_ms: control::wall_ms().unwrap(),
        state: control::AccessState::Active, ..Default::default()
    }}
}
fn receipt(owner: &Owner) -> LaunchReceipt {
    let EventKind::Received { receipt, .. } = &owner.status.extension.as_ref().unwrap().events.last().unwrap().kind
        else { panic!("receipt") }; receipt.clone()
}
#[test]
fn account_changes_missing_session_unavailable_authority_and_live_are_closed_rejections() {
    for mode in 0..5 {
        let mut f = fixture(); let request = f.request.clone(); let mut observed = observation(&request);
        if mode == 0 { observed.generation = "c".repeat(64).try_into().unwrap(); }
        if mode == 3 { observed.policy.live = true; }
        if mode == 4 { observed.policy.state = control::AccessState::NoCredential; }
        f.owner.launch_checked_with(request, || match mode {
            1 => Ok(None), 2 => Err(std::io::ErrorKind::TimedOut.into()), _ => Ok(Some(observed)),
        }, |_, _| panic!("rejected before starting"));
        assert_eq!(receipt(&f.owner), LaunchReceipt::Rejected { reason: match mode {
            0 | 1 => LaunchRejection::AccountChanged, 2 => LaunchRejection::AuthorityUnavailable,
            _ => LaunchRejection::Denied,
        }});
        assert!(f.owner.chain.is_none());
        assert!(vantare_ipc::launcher::read_status(&f.owner.path).is_some(), "Status remains fresh after authority failure");
    }
}
#[test]
fn wrong_instance_busy_and_typed_start_failures_do_not_consume_a_cached_document() {
    let mut f = fixture(); let mut request = f.request.clone();
    request.instance = "d".repeat(64).try_into().unwrap();
    f.owner.launch_checked_with(request, || panic!("instance first"), |_, _| panic!("not accepted"));
    assert_eq!(receipt(&f.owner), LaunchReceipt::Rejected { reason: LaunchRejection::WrongInstance });
    for error in [StartError::Busy("qa".into()), StartError::Invalid("qa".into()), StartError::Io("qa".into())] {
        let mut f = fixture(); let observed = observation(&f.request); let busy = matches!(&error, StartError::Busy(_));
        f.owner.launch_checked_with(f.request.clone(), || Ok(Some(observed)), |_, _| Err(error));
        assert_eq!(receipt(&f.owner), LaunchReceipt::Rejected { reason: if busy { LaunchRejection::Busy }
            else { LaunchRejection::StartFailed } });
    }
    let mut f = fixture(); let doc = Document::from_bytes(&fs::read(&f.owner.path).unwrap()).unwrap();
    let (release, waiting) = std::sync::mpsc::channel::<()>();
    f.owner.chain = Some(Chain::start_checked(doc.clone(), doc.profiles[0].clone(), move |_| {
        waiting.recv().unwrap(); Discovery::default()
    }, Arc::clone(&f.owner.processes), None, &f.owner.path).unwrap());
    f.owner.launch_checked_with(f.request.clone(), || panic!("Busy before authority"), |_, _| panic!("busy"));
    assert_eq!(receipt(&f.owner), LaunchReceipt::Rejected { reason: LaunchRejection::Busy });
    release.send(()).unwrap();
}
#[test]
fn accepted_snapshot_is_owned_even_if_the_document_changes_during_authority_read() {
    let mut f = fixture(); let observed = observation(&f.request); let path = f.owner.path.clone();
    // The Owner cache has no profiles. Falling back to it would fail this launch.
    assert!(f.owner.document.profiles.is_empty());
    f.owner.launch_checked_with(f.request.clone(), || {
        fs::write(&path, b"changed after snapshot").unwrap(); Ok(Some(observed))
    }, |document, profile| {
        assert_eq!(profile.id, "qa");
        assert_eq!(profile.steps[0].args_override.as_deref(), Some(["snapshot".to_owned()].as_slice()));
        assert_eq!(document.profiles.len(), 1);
        Err(StartError::Io("synthetic start rejection after observing snapshot".into()))
    });
    assert_eq!(receipt(&f.owner), LaunchReceipt::Rejected { reason: LaunchRejection::StartFailed });
}
#[test]
fn mailbox_accepts_once_finishes_once_and_rejects_requests_from_a_previous_resident() {
    use vantare_ipc::transport::{Event, Listener};
    let mut f = fixture(); let observed = observation(&f.request);
    let link = account_session::AuthorityLink { pipe: format!("checked-owner-{}", std::process::id()),
        image: std::env::current_exe().unwrap() };
    let stop = Arc::new(Event::new().unwrap());
    let mut listener = Listener::new(&link.pipe, stop, Duration::from_secs(2)).unwrap();
    let mut pipe = listener.instance().unwrap();
    let server = std::thread::spawn(move || {
        pipe.accept().unwrap(); let request = control::read_request(&mut pipe).unwrap();
        assert!(matches!(request.command, control::Command::ReadAccountSession {}));
        assert!(request.nonce.is_empty());
        control::write(&mut pipe, &account_session::ControlResponse { version: control::VERSION,
            sequence: request.sequence, observation: Some(observed) }).unwrap();
    });
    f.owner.authority = Some(link);
    let bytes = serde_json::to_vec(&Request::LaunchChecked(f.request.clone())).unwrap();
    fs::write(request_path(&f.owner.path), &bytes).unwrap(); f.owner.request(); server.join().unwrap();
    assert!(!request_path(&f.owner.path).exists());
    let LaunchReceipt::Accepted { run } = receipt(&f.owner) else { panic!("accepted snapshot") };
    let chain = f.owner.chain.as_mut().unwrap();
    while chain.progress.recv().unwrap().step.is_some() {}
    chain.shutdown().unwrap(); f.owner.progress();
    let events = &f.owner.status.extension.as_ref().unwrap().events;
    assert_eq!(events.len(), 2);
    assert!(matches!(events[1].kind, EventKind::Finished { run: actual,
        outcome: ChainOutcome::Failed { reason: ChainFailure::StepFailed } } if actual == run));
    fs::write(request_path(&f.owner.path), &bytes).unwrap(); f.owner.request();
    assert_eq!(f.owner.status.extension.as_ref().unwrap().events.len(), 2, "retained request is not dispatched twice");
    let old_instance: ResidentInstance = f.request.instance.clone();
    let mut restarted = Owner::new(f.owner.path.clone(), false);
    assert_ne!(restarted.status.extension.as_ref().unwrap().instance, old_instance);
    fs::write(request_path(&f.owner.path), bytes).unwrap(); restarted.request();
    assert_eq!(receipt(&restarted), LaunchReceipt::Rejected { reason: LaunchRejection::WrongInstance });
    assert!(restarted.chain.is_none());
}
