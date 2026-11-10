//! Ctrl L reuses the existing resident mailbox; Electron never sees a path or command.
use crate::protocol::{CoreStatus, HostError, LinkState};
use std::path::Path;
use vantare_ipc::{files, launcher};
use vantare_launcher::Document;
fn selected(document: &Document) -> Option<&str> {
    document
        .profiles
        .iter()
        .filter(|profile| profile.favorite)
        .min_by(|a, b| a.name.cmp(&b.name))
        .map(|profile| profile.id.as_str())
}
pub fn launch(path: &Path, core: &CoreStatus) -> Result<bool, HostError> {
    if core.rights != LinkState::Connected
        || !core.access.verified
        || core.access.blocked
        || core.live
    {
        return Err(HostError::Denied);
    }
    let Some(bytes) = files::read_optional(path, files::MAX_DOCUMENT).map_err(|_| HostError::Io)?
    else {
        return Ok(false);
    };
    let document = Document::from_bytes(&bytes).map_err(|_| HostError::Protected)?;
    let Some(id) = selected(&document) else {
        return Ok(false);
    };
    let status = launcher::read_status(path).ok_or(HostError::CoreUnavailable)?;
    if status.running {
        return Err(HostError::Busy);
    }
    let bytes = serde_json::to_vec(&launcher::Request::Launch { profile: id.into() })
        .map_err(|_| HostError::Io)?;
    files::save(
        &launcher::request_path(path),
        &bytes,
        files::Mode::Observed(None),
        &files::Options::default(),
    )
    .map_err(|error| {
        if error.kind().is_conflict() {
            HostError::Busy
        } else {
            HostError::Io
        }
    })?;
    Ok(true)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selects_only_favorites_in_the_same_name_order_as_the_frozen_hub() {
        let mut document = Document::default();
        for (id, name, favorite) in [
            ("other", "A", false),
            ("second", "Z", true),
            ("first", "B", true),
        ] {
            let mut profile = vantare_launcher::Profile::new(id.into(), name.into());
            profile.favorite = favorite;
            document.profiles.push(profile);
        }
        assert_eq!(selected(&document), Some("first"));
        for profile in &mut document.profiles {
            profile.favorite = false;
        }
        assert_eq!(selected(&document), None);
    }
    #[test]
    fn denies_unverified_access_before_reading_or_creating_any_file() {
        assert_eq!(
            launch(Path::new("missing-launcher.json"), &CoreStatus::default()),
            Err(HostError::Denied)
        );
    }
}
