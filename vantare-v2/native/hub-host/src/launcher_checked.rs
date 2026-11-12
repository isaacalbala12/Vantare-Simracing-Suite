//! Opt-in checked launch; no legacy fallback. The caller supplies the armed scope.
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{
    account_session::{AccountGeneration, AccountObservation},
    files, launcher as mailbox,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum LaunchQueued {
    Queued { request: String },
}

pub fn launch(
    path: &Path,
    observation: Option<&AccountObservation>,
    armed_generation: &AccountGeneration,
    profile: &str,
    revision: &str,
) -> Result<LaunchQueued, HostError> {
    let observation = observation.ok_or(HostError::CoreUnavailable)?;
    if observation.generation != *armed_generation
        || !vantare_ipc::control::wall_ms().is_ok_and(|now| observation.policy.permits_launch(now))
    {
        return Err(HostError::Denied);
    }
    if profile.is_empty() || profile.len() > super::ID_LIMIT || profile.contains('\0') {
        return Err(HostError::Denied);
    }
    let (bytes, document) = super::open(path)?.ok_or(HostError::Protected)?;
    if vantare_services::content_hash(&bytes) != revision {
        return Err(HostError::LauncherConflict {
            current: super::read(path),
        });
    }
    if !document
        .profiles
        .iter()
        .any(|p| p.id == profile && !p.steps.is_empty())
    {
        return Err(HostError::Denied);
    }
    let status = mailbox::read_status(path).ok_or(HostError::CoreUnavailable)?;
    let extension = status.extension.ok_or(HostError::Unsupported)?;
    if !extension
        .capabilities
        .contains(&mailbox::execution::Capability::RevisionCheckedLaunch)
    {
        return Err(HostError::Unsupported);
    }
    if status.running {
        return Err(HostError::Busy);
    }
    // IDs are generated here, never accepted as executable paths or commands.
    let random = vantare_services::random_id().map_err(|_| HostError::Io)?;
    let request: mailbox::RequestId = random
        .chars()
        .take(32)
        .collect::<String>()
        .try_into()
        .map_err(|_| HostError::Io)?;
    let payload = mailbox::LaunchChecked {
        request: request.clone(),
        instance: extension.instance,
        profile: profile.into(),
        revision: revision.into(),
        account: armed_generation.clone(),
    };
    let bytes =
        serde_json::to_vec(&mailbox::Request::LaunchChecked(payload)).map_err(|_| HostError::Io)?;
    files::save(
        &mailbox::request_path(path),
        &bytes,
        files::Mode::Observed(None),
        &files::Options::default(),
    )
    .map_err(|error| {
        if error.kind().is_conflict() || error.kind() == files::Kind::Busy {
            HostError::Busy
        } else {
            HostError::Io
        }
    })?;
    Ok(LaunchQueued::Queued {
        request: request.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_ipc::{
        account_session::AccountObservation,
        control::{AccessState, Policy},
        launcher::execution::{Capability, ExecutionStatus},
    };
    fn observation() -> AccountObservation {
        AccountObservation {
            generation: "a".repeat(64).try_into().unwrap(),
            policy: Policy {
                version: vantare_ipc::control::VERSION,
                epoch: 1,
                revision: 1,
                checked_at_ms: vantare_ipc::control::wall_ms().unwrap(),
                state: AccessState::Active,
                ..Default::default()
            },
        }
    }
    #[test]
    fn changed_account_and_denied_policy_never_touch_the_mailbox() {
        let armed = observation().generation;
        let path = Path::new("missing-checked-launcher.json");
        assert_eq!(
            launch(path, None, &armed, "qa", ""),
            Err(HostError::CoreUnavailable)
        );
        let mut current = observation();
        current.generation = "b".repeat(64).try_into().unwrap();
        assert_eq!(
            launch(path, Some(&current), &armed, "qa", ""),
            Err(HostError::Denied)
        );
        current.generation = armed.clone();
        current.policy.live = true;
        assert_eq!(
            launch(path, Some(&current), &armed, "qa", ""),
            Err(HostError::Denied)
        );
        current.policy.live = false;
        current.policy.state = AccessState::NoCredential;
        assert_eq!(
            launch(path, Some(&current), &armed, "qa", ""),
            Err(HostError::Denied)
        );
    }
    #[test]
    fn queues_exact_armed_values_only_with_fresh_checked_capability_and_cas() {
        let root = std::env::temp_dir().join(format!(
            "host-checked-{}",
            vantare_services::random_id().unwrap()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("launcher.json");
        let document = vantare_launcher::Document::fresh_install();
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let revision = vantare_services::content_hash(&bytes);
        let observed = observation();
        let armed = observed.generation.clone();
        let profile = &document.profiles[0].id;
        let mut status = mailbox::Status {
            version: mailbox::VERSION,
            updated_ms: mailbox::now_ms(),
            ..Default::default()
        };
        let save = |status: &mailbox::Status| {
            std::fs::write(
                mailbox::status_path(&path),
                serde_json::to_vec(status).unwrap(),
            )
            .unwrap();
        };
        save(&status);
        assert_eq!(
            launch(&path, Some(&observed), &armed, profile, &revision),
            Err(HostError::Unsupported)
        );
        status.extension = Some(ExecutionStatus::new("b".repeat(64).try_into().unwrap()));
        save(&status);
        assert_eq!(
            launch(&path, Some(&observed), &armed, profile, &revision),
            Err(HostError::Unsupported)
        );
        status
            .extension
            .as_mut()
            .unwrap()
            .capabilities
            .push(Capability::RevisionCheckedLaunch);
        status.updated_ms = 0;
        save(&status);
        assert_eq!(
            launch(&path, Some(&observed), &armed, profile, &revision),
            Err(HostError::CoreUnavailable)
        );
        status.updated_ms = mailbox::now_ms();
        status.running = true;
        save(&status);
        assert_eq!(
            launch(&path, Some(&observed), &armed, profile, &revision),
            Err(HostError::Busy)
        );
        assert!(!mailbox::request_path(&path).exists());
        status.running = false;
        save(&status);
        let LaunchQueued::Queued { request } =
            launch(&path, Some(&observed), &armed, profile, &revision).unwrap();
        assert_eq!(request.len(), 32);
        let wire: mailbox::Request =
            serde_json::from_slice(&std::fs::read(mailbox::request_path(&path)).unwrap()).unwrap();
        let mailbox::Request::LaunchChecked(payload) = wire else {
            panic!("no v1 fallback")
        };
        assert_eq!(String::from(payload.request), request);
        assert_eq!(payload.account, armed);
        assert_eq!(payload.profile, *profile);
        assert_eq!(payload.revision, revision);
        assert_eq!(payload.instance, status.extension.unwrap().instance);
        assert_eq!(
            launch(&path, Some(&observed), &armed, profile, &revision),
            Err(HostError::Busy)
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
