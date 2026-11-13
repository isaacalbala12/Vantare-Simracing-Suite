//! Consume-time read: one byte snapshot, no store recovery or cached-document fallback.
use crate::{Document, Profile};
use std::path::Path;
use vantare_ipc::launcher::checked::LaunchRejection;

pub fn read_checked(
    path: &Path,
    profile: &str,
    revision: &str,
) -> Result<(Document, Profile), LaunchRejection> {
    let (document, profile) = read_profile_checked(path, profile, revision)?;
    if profile.steps.is_empty() {
        return Err(LaunchRejection::DocumentUnavailable);
    }
    Ok((document, profile))
}
/// A valid empty profile is meaningful to rehearsal: its selection is NoSteps.
pub fn read_profile_checked(
    path: &Path,
    profile: &str,
    revision: &str,
) -> Result<(Document, Profile), LaunchRejection> {
    let bytes = vantare_ipc::files::read(path, vantare_ipc::files::MAX_DOCUMENT)
        .map_err(|_| LaunchRejection::DocumentUnavailable)?;
    if vantare_services::content_hash(&bytes) != revision {
        return Err(LaunchRejection::RevisionMismatch);
    }
    let document =
        Document::from_bytes(&bytes).map_err(|_| LaunchRejection::DocumentUnavailable)?;
    let profile = document
        .profiles
        .iter()
        .find(|candidate| candidate.id == profile)
        .cloned()
        .ok_or(LaunchRejection::DocumentUnavailable)?;
    Ok((document, profile))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    fn snapshot_hashes_all_bytes_and_never_falls_back_or_repairs_protected_documents() {
        let root = std::env::temp_dir().join(format!(
            "checked-snapshot-{}",
            vantare_services::random_id().unwrap()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("launcher.json");
        let mut document = Document::default();
        let mut profile = Profile::new("qa".into(), "QA".into());
        profile.steps.push(crate::Step {
            app_id: "obs".into(),
            delay_seconds: 0,
            args_override: Some(vec!["captured".into()]),
        });
        document.profiles.push(profile);
        let original = serde_json::to_vec(&document).unwrap();
        let revision = vantare_services::content_hash(&original);
        fs::write(&path, &original).unwrap();
        let (snapshot, profile) = read_checked(&path, "qa", &revision).unwrap();
        let mut whitespace_change = original.clone();
        whitespace_change.push(b'\n');
        fs::write(&path, &whitespace_change).unwrap();
        assert!(matches!(
            read_checked(&path, "qa", &revision),
            Err(LaunchRejection::RevisionMismatch)
        ));
        assert_eq!(serde_json::to_vec(&snapshot).unwrap(), original);
        assert_eq!(
            profile.steps[0].args_override.as_deref(),
            Some(["captured".to_owned()].as_slice())
        );
        for bytes in [
            br#"{"version":99,"future":"preserve"}"#.as_slice(),
            b"{broken",
        ] {
            fs::write(&path, bytes).unwrap();
            assert!(matches!(
                read_checked(&path, "qa", &vantare_services::content_hash(bytes)),
                Err(LaunchRejection::DocumentUnavailable)
            ));
            assert_eq!(fs::read(&path).unwrap(), bytes);
            assert!(!path.with_extension("json.invalid").exists());
        }
        document.profiles[0].steps.clear();
        for missing in [false, true] {
            if missing {
                document.profiles.clear();
            }
            let bytes = serde_json::to_vec(&document).unwrap();
            fs::write(&path, &bytes).unwrap();
            assert!(matches!(
                read_checked(&path, "qa", &vantare_services::content_hash(&bytes)),
                Err(LaunchRejection::DocumentUnavailable)
            ));
        }
        fs::remove_file(&path).unwrap();
        assert!(matches!(
            read_checked(&path, "qa", &revision),
            Err(LaunchRejection::DocumentUnavailable)
        ));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn sharing_denied_document_is_unavailable_and_preserved() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = std::env::temp_dir().join(format!(
            "checked-protected-{}",
            vantare_services::random_id().unwrap()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("launcher.json");
        let bytes = serde_json::to_vec(&Document::default()).unwrap();
        fs::write(&path, &bytes).unwrap();
        let held = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(matches!(
            read_checked(&path, "qa", &vantare_services::content_hash(&bytes)),
            Err(LaunchRejection::DocumentUnavailable)
        ));
        drop(held);
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_dir_all(root).unwrap();
    }
}
