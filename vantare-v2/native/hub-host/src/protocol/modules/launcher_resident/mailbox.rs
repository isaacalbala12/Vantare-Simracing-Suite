//! One closed, non-overwriting mailbox writer for resident orders.
use super::ResidentQueued;
use crate::protocol::HostError;
use std::path::Path;
use vantare_ipc::{files, launcher as native};
pub(super) fn enqueue(path: &Path, build: impl FnOnce(native::RequestId) -> native::Request) -> Result<ResidentQueued, HostError> {
    let request: native::RequestId = vantare_services::random_id().map_err(|_| HostError::Io)?.chars().take(32).collect::<String>().try_into().map_err(|_| HostError::Io)?;
    let bytes = serde_json::to_vec(&build(request.clone())).map_err(|_| HostError::Io)?;
    files::save(&native::request_path(path), &bytes, files::Mode::Observed(None), &files::Options::default()).map_err(|error| {
        if error.kind().is_conflict() || error.kind() == files::Kind::Busy { HostError::Busy } else { HostError::Io }
    })?;
    Ok(ResidentQueued::Queued { request: request.into() })
}
