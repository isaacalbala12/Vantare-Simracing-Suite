use super::super::{Chain, Document, launcher};
use super::*;
use std::{
    fs,
    path::PathBuf,
    sync::mpsc::{Receiver, RecvTimeoutError},
};
use vantare_ipc::{
    control::{AccessState, Policy},
    launcher::{CancelChecked, RehearseChecked, execution::Capability},
};
pub(super) struct Fixture {
    pub root: PathBuf,
    pub owner: Owner,
    pub account: AccountGeneration,
    pub revision: String,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        if let Some(chain) = &mut self.owner.chain {
            let _ = chain.shutdown();
        }
        self.owner.chain.take();
        let _ = fs::remove_dir_all(&self.root);
    }
}
pub(super) fn idle(steps: &[&str]) -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "resident-control-{}",
        vantare_services::random_id().expect("fixture id")
    ));
    fs::create_dir_all(&root).expect("fixture directory");
    let mut document = Document::default();
    for app in &mut document.apps {
        app.executable = Some(root.join("absent-fixture.exe"));
    }
    let mut profile = launcher::Profile::new("qa".into(), "QA".into());
    profile.set_policy(launcher::policy::Policy {
        failure: launcher::policy::Failure::Continue,
        cancel: launcher::policy::Close::Leave,
        max_retries: 0,
        ..Default::default()
    });
    profile.steps = steps
        .iter()
        .map(|id| launcher::Step {
            app_id: (*id).into(),
            delay_seconds: 0,
            args_override: Some(vec!["snapshot".into()]),
        })
        .collect();
    document.profiles.push(profile);
    let bytes = serde_json::to_vec(&document).expect("document");
    let mut owner = Owner::new(root.join("launcher.json"), false);
    fs::write(&owner.path, &bytes).expect("document file");
    owner.document = document;
    owner.bytes = Some(bytes.clone());
    owner
        .status
        .extension
        .as_mut()
        .expect("extension")
        .capabilities
        .push(Capability::CheckedControl);
    owner.publish();
    Fixture {
        root,
        owner,
        account: "a".repeat(64).try_into().expect("account"),
        revision: vantare_services::content_hash(&bytes),
    }
}
pub(super) fn active() -> Fixture {
    let mut f = idle(&["obs", "obs"]);
    f.owner = super::super::tests::failure_decision_owner(&f.root);
    let bytes = serde_json::to_vec(&f.owner.document).expect("snapshot bytes");
    fs::write(&f.owner.path, &bytes).expect("snapshot file");
    f.revision = vantare_services::content_hash(&bytes);
    f.owner.bytes = Some(bytes);
    let extension = f.owner.status.extension.as_mut().expect("extension");
    extension.capabilities.push(Capability::CheckedControl);
    f.owner.active_run = extension.begin();
    f.owner.active_scope = Some(super::super::ActiveScope {
        revision: f.revision.clone(),
        account: f.account.clone(),
    });
    f.owner.publish();
    f
}
impl Fixture {
    pub fn cancel(&self) -> CancelChecked {
        CancelChecked {
            request: "c".repeat(32).try_into().expect("request"),
            instance: self
                .owner
                .status
                .extension
                .as_ref()
                .expect("extension")
                .instance
                .clone(),
            account: self.account.clone(),
            run: self.owner.active_run.expect("run"),
            revision: self.revision.clone(),
        }
    }
    pub fn rehearse(&self) -> RehearseChecked {
        RehearseChecked {
            request: "e".repeat(32).try_into().expect("request"),
            instance: self
                .owner
                .status
                .extension
                .as_ref()
                .expect("extension")
                .instance
                .clone(),
            account: self.account.clone(),
            profile: "qa".into(),
            revision: self.revision.clone(),
        }
    }
}
pub(super) fn observed() -> AccountObservation {
    AccountObservation {
        generation: "a".repeat(64).try_into().expect("account"),
        policy: Policy {
            epoch: 1,
            revision: 1,
            checked_at_ms: vantare_ipc::control::wall_ms().expect("clock"),
            state: AccessState::Active,
            ..Default::default()
        },
    }
}
pub(super) fn receipt(owner: &Owner) -> OrderReceipt {
    match &owner
        .status
        .extension
        .as_ref()
        .expect("extension")
        .events
        .last()
        .expect("event")
        .kind
    {
        EventKind::OrderReceived { receipt, .. } => receipt.clone(),
        _ => panic!("order receipt expected"),
    }
}
/// The timeout is a deadlock watchdog, not a timed scheduling assertion.
pub(super) fn drain(receiver: &Receiver<launcher::chain::Progress>) {
    loop {
        match receiver.recv_timeout(Duration::from_secs(5)) {
            Ok(_) => {}
            Err(RecvTimeoutError::Disconnected) => return,
            Err(RecvTimeoutError::Timeout) => panic!("fixture worker did not close progress"),
        }
    }
}
pub(super) fn terminal(owner: &mut Owner) {
    let chain: &mut Chain = owner.chain.as_mut().expect("chain");
    drain(&chain.progress);
    chain.shutdown().expect("completed worker join");
    owner.progress();
}
